// quizSolver.js
import { fetchCoursera, delay, getModuleContext } from './courseraApi.js';
import { GET_STATE_QUERY, INITIATE_ATTEMPT_QUERY, SAVE_RESPONSES_QUERY, SUBMIT_DRAFT_QUERY, ASSIGNMENT_FEEDBACK_QUERY } from './queries.js';
import { callLLMProvider } from './llmProviders.js';
import { getAgentForType, getReflectionPrompt, stripHtmlTags } from './agents.js';

async function fetchGraphQL(opname, query, variables) {
  const res = await fetchCoursera("https://www.coursera.org/graphql-gateway", {
    method: "POST",
    headers: {
      "x-coursera-version": "123",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      operationName: opname,
      variables: variables,
      query: query
    })
  });
  if (!res.ok) {
     throw new Error(`Coursera GraphQL request failed (${res.status}).`);
  }
  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
     throw new Error(`Coursera returned an unexpected response type (${contentType || "unknown"}).`);
  }
  const data = await res.json();
  if (data.errors) throw new Error("Coursera rejected the GraphQL request.");
  return data;
}

const TEXT_ANSWER_TYPES = new Set(["TEXT_REFLECT", "NUMERIC", "PLAIN_TEXT", "TEXT_EXACT_MATCH", "REGEX", "URL", "CODE_EXPRESSION", "MATH", "RICH_TEXT", "WIDGET"]);

function requireMutationSuccess(data, operationName) {
  const result = data?.data?.[operationName];
  if (result?.__typename?.endsWith("Success")) return result;
  const codes = (result?.errors || []).map((error) => error?.errorCode).filter(Boolean);
  throw new Error(`${operationName} failed${codes.length ? ` (${codes.join(", ")})` : ""}.`);
}

function requireTextAnswer(value, questionType) {
  const answer = typeof value === "number" ? String(value) : value;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error(`The ${questionType} answer is empty or invalid; the assessment draft was left unsubmitted.`);
  }
  return answer;
}

async function callLLM(unsolvedQuestions, settings, systemPrompt, moduleContext = "") {
  const userPrompt = moduleContext 
    ? `Module Context (Use this to answer questions if relevant):\n${moduleContext}\n\nQuestions:\n${JSON.stringify(unsolvedQuestions, null, 2)}`
    : JSON.stringify(unsolvedQuestions, null, 2);
  const keys = (settings?.apiKey || "").split(",").map(k => k.trim()).filter(k => k);
  const provider = settings?.provider || "nvidia";
  
  return await callLLMProvider(provider, keys, settings?.modelName, systemPrompt, userPrompt);
}

function extractAnswerFromPayload(questionType, questionResponse) {
  switch (questionType) {
    case "TEXT_REFLECT": return questionResponse.textReflectResponse?.answer;
    case "NUMERIC": return questionResponse.numericResponse?.answer;
    case "PLAIN_TEXT": return questionResponse.plainTextResponse?.plainText;
    case "TEXT_EXACT_MATCH": return questionResponse.textExactMatchResponse?.answer;
    case "REGEX": return questionResponse.regexResponse?.answer;
    case "URL": return questionResponse.urlResponse?.url;
    case "CODE_EXPRESSION": return questionResponse.codeExpressionResponse?.answer?.code;
    case "MATH": return questionResponse.mathResponse?.answer;
    case "RICH_TEXT": return questionResponse.richTextResponse?.richText?.value;
    case "WIDGET": return questionResponse.widgetResponse?.answer;
    default: return undefined;
  }
}

import { updateDashboard } from './dashboardStore.js';

export async function triggerQuizSolver(courseId, itemId, settings, tabId, courseSlug = "default", runContext = null, materials = null) {
  const safeSlug = courseSlug || "default";
  const updateProgress = (msg, overrideType) => {
    let type = overrideType || "info";
    if (!overrideType) {
      if (msg.includes("ERROR") || msg.includes("Failed") || msg.includes("Error")) type = "error";
      else if (msg.includes("Complete") || msg.includes("successfully") || msg.includes("Passed")) type = "complete";
      else if (msg.includes("Starting") || msg.includes("Processing") || msg.includes("Triggering")) type = "active";
    }
    updateDashboard(msg, type, safeSlug);
  };
  
  updateProgress(`Starting quiz solver for courseId: ${courseId}, itemId: ${itemId}`);
  
  try {
  
  let targetGrade = (typeof settings?.targetGrade === "number" && settings.targetGrade > 0) ? settings.targetGrade : 0.8;
  let maxAttempts = 3;
  let attemptsMade = 0;
  let attemptStarts = 0;
  
  // Local cache for correctness
  let questionsData = Object.create(null);

  while (attemptsMade < maxAttempts) {
    if (runContext?.isCancelled) {
      updateProgress("Quiz solver cancelled (tab closed).", "error");
      return;
    }
    // 1. Get State
    const stateRes = await fetchGraphQL("QueryState", GET_STATE_QUERY, { courseId, itemId });
    const submissionState = stateRes.data.SubmissionState.queryState;
    
    if (submissionState.outcome?.isPassed && submissionState.outcome.earnedGrade >= targetGrade) {
      updateProgress(`Already passed! Current grade: ${(submissionState.outcome.earnedGrade * 100).toFixed(1)}% (Target: ${(targetGrade * 100).toFixed(1)}%)`);
      return;
    } else if (submissionState.outcome?.isPassed) {
      updateProgress(`Passed, but grade ${(submissionState.outcome.earnedGrade * 100).toFixed(1)}% is below target ${(targetGrade * 100).toFixed(1)}%. Retrying...`);
    }
    
    const allowed = submissionState.allowedAction;
    if (allowed === "START_NEW_ATTEMPT") {
      attemptStarts++;
      if (attemptStarts > maxAttempts) {
        throw new Error(`Coursera did not open an assessment draft after ${maxAttempts} start attempts.`);
      }
      const startData = await fetchGraphQL("Submission_StartAttempt", INITIATE_ATTEMPT_QUERY, { courseId, itemId });
      requireMutationSuccess(startData, "Submission_StartAttempt");
      continue;
    } else if (allowed === "RESUME_DRAFT") {
      updateProgress("Resuming draft.");
    } else if (allowed === null) {
      if (submissionState.outcome?.isPassed && submissionState.outcome.earnedGrade >= targetGrade) return;
      if (submissionState.outcome?.isPassed) {
        throw new Error(`The assessment is passed, but the target grade of ${(targetGrade * 100).toFixed(1)}% was not reached and no attempts remain.`);
      }
      throw new Error("No more attempts remaining.");
    }

    // 2. Retrieve Questions
    const draft = submissionState.attempts.inProgressAttempt;
    const attemptId = draft.id;
    const draftId = draft.draft.id;
    const parts = draft.draft.parts;
    if (!Array.isArray(parts) || !parts.some((part) => part.__typename !== "Submission_TextBlock")) {
      throw new Error("Coursera returned an empty assessment draft; nothing was submitted.");
    }
    
    let answerResponses = [];
    let unsolvedQuestions = Object.create(null);

    const QTYPE_MAP = {
      "Submission_MultipleChoiceQuestion": "MULTIPLE_CHOICE",
      "Submission_CheckboxQuestion": "CHECKBOX",
      "Submission_CheckboxReflectQuestion": "CHECKBOX_REFLECT",
      "Submission_TextReflectQuestion": "TEXT_REFLECT",
      "Submission_NumericQuestion": "NUMERIC",
      "Submission_PlainTextQuestion": "PLAIN_TEXT",
      "Submission_TextExactMatchQuestion": "TEXT_EXACT_MATCH",
      "Submission_RegexQuestion": "REGEX",
      "Submission_FileUploadQuestion": "FILE_UPLOAD",
      "Submission_UrlQuestion": "URL",
      "Submission_CodeExpressionQuestion": "CODE_EXPRESSION",
      "Submission_MathQuestion": "MATH",
      "Submission_RichTextQuestion": "RICH_TEXT",
      "Submission_WidgetQuestion": "WIDGET",
      "Submission_MultipleFillableBlanksQuestion": "MULTIPLE_FILLABLE_BLANKS"
    };
    
    for (const part of parts) {
      if (part.__typename === "Submission_TextBlock") {
        continue;
      }
      if (typeof part.partId !== "string" || !part.partId) {
        throw new Error("Coursera returned an assessment question without an ID; the draft was left unsubmitted.");
      }

      const qTypeStr = QTYPE_MAP[part.__typename];
      if (!qTypeStr) {
        throw new Error(`Unsupported question type encountered: ${part.__typename}`);
      }

      const partId = part.partId;
      if (!questionsData[partId]) questionsData[partId] = { Options: [] };
      const qd = questionsData[partId];
      
      const prompt = part.questionSchema.prompt?.cmlValue || "";
      const schemaOptions = part.questionSchema.options || [];
      const options = schemaOptions.map((opt, idx) => {
        const val = opt.display?.cmlValue ?? opt.display?.value ?? "";
        const displayValue = stripHtmlTags(val);
        if (!opt.optionId) throw new Error(`Question ${partId} has an option without a Coursera ID.`);
        const existing = qd.Options.find(o => o.original_id === opt.optionId || o.value === displayValue);
        return {
          original_id: opt.optionId,
          option_id: `opt_${idx + 1}`,
          value: displayValue,
          correct: existing ? existing.correct : null
        };
      });
      qd.Options = options;
      qd.Type = qTypeStr;
      qd.Question = stripHtmlTags(prompt);

      if (qTypeStr === "FILE_UPLOAD") {
        throw new Error("This assessment contains a file upload question. Add the required file manually; the solver stopped before submitting the attempt.");
      }

      if (TEXT_ANSWER_TYPES.has(qTypeStr)) {
        if (qd.correct_answer !== undefined && qd.correct_answer !== null) {
          const agent = getAgentForType(qTypeStr);
          const processed = agent.postProcess(qTypeStr, null, qd.correct_answer, { [partId]: qd }, partId);
          const cachedAnswer = requireTextAnswer(processed.answer, qTypeStr);
          answerResponses.push(agent.formatPayload(partId, qTypeStr, null, cachedAnswer));
        } else {
          unsolvedQuestions[partId] = { Question: qd.Question, Options: [], Type: qTypeStr };
          if (qd.wrong_attempts) unsolvedQuestions[partId].previous_attempts = qd.wrong_attempts;
        }
      } else if (qTypeStr === "MULTIPLE_CHOICE") {
        const knownCorrect = options.find(o => o.correct === true);
        if (knownCorrect) {
          const agent = getAgentForType(qTypeStr);
          answerResponses.push(agent.formatPayload(partId, qTypeStr, [knownCorrect.original_id || knownCorrect.option_id]));
          continue;
        }
        const filtered = options.filter(o => o.correct !== false);
        if (filtered.length === 1) {
          const agent = getAgentForType(qTypeStr);
          answerResponses.push(agent.formatPayload(partId, qTypeStr, [filtered[0].original_id || filtered[0].option_id]));
          continue;
        }
        unsolvedQuestions[partId] = { Question: qd.Question, Options: filtered, Type: qTypeStr };
      } else if (qTypeStr === "CHECKBOX" || qTypeStr === "CHECKBOX_REFLECT") {
        const allResolved = options.every(o => o.correct !== null);
        if (allResolved) {
          const correctIds = options.filter(o => o.correct === true).map(o => o.original_id || o.option_id);
          const agent = getAgentForType(qTypeStr);
          answerResponses.push(agent.formatPayload(partId, qTypeStr, correctIds));
          continue;
        }
        const filtered = options.filter(o => o.correct !== false);
        unsolvedQuestions[partId] = { Question: qd.Question, Options: filtered, Type: qTypeStr };
      } else if (qTypeStr === "MULTIPLE_FILLABLE_BLANKS") {
        const blanks = part.questionSchema.fillableBlanks || [];
        if (blanks.length === 0) throw new Error(`Question ${partId} has no fillable blank options in the Coursera response.`);
        qd.Blanks = blanks.map((blank) => ({
          blank_id: String(blank.fillableBlankId),
          Options: (blank.answerOptions || []).map((option) => ({
            option_id: String(option.optionId),
            value: stripHtmlTags(option.display?.cmlValue ?? option.display?.value ?? "")
          }))
        }));
        if (qd.Blanks.some((blank) => blank.blank_id === "undefined" || blank.Options.length === 0 || blank.Options.some((option) => option.option_id === "undefined"))) {
          throw new Error(`Question ${partId} has incomplete blank or option IDs in the Coursera response.`);
        }
        if (qd.correct_answer) {
          const agent = getAgentForType(qTypeStr);
          answerResponses.push(agent.formatPayload(partId, qTypeStr, null, qd.correct_answer));
        } else {
          unsolvedQuestions[partId] = { Question: qd.Question, Blanks: qd.Blanks, Type: qTypeStr };
          if (qd.wrong_attempts) unsolvedQuestions[partId].previous_attempts = qd.wrong_attempts;
        }
      }
    }

    let moduleContext = "";
    if (Object.keys(unsolvedQuestions).length > 0) {
      updateProgress("Calling LLM for unsolved questions...");

      moduleContext = materials ? await getModuleContext(courseId, itemId, materials) : "";

      let domainGroups = Object.create(null);
      for (const [qid, q] of Object.entries(unsolvedQuestions)) {
        const agent = getAgentForType(q.Type);
        const domain = agent.domain;
        if (!domainGroups[domain]) {
          domainGroups[domain] = { agent: agent, questions: Object.create(null) };
        }
        domainGroups[domain].questions[qid] = q;
      }

function resolveQuestionId(ansQId, domainQuestions) {
  if (!domainQuestions || typeof domainQuestions !== "object") return null;
  const questionKeys = Object.keys(domainQuestions);
  if (questionKeys.length === 0) return null;

  // Only accept IDs from the prompt. Guessing from a response's position can
  // silently attach an answer to the wrong question and consume an attempt.
  if (ansQId && domainQuestions[ansQId]) {
    return ansQId;
  }

  if (ansQId) {
    const cleanId = String(ansQId).trim().toLowerCase();
    const matches = questionKeys.filter(k => k.trim().toLowerCase() === cleanId);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

      const domainPromises = Object.entries(domainGroups).map(async ([domain, groupData]) => {
        const domainQuestions = groupData.questions;
        const reflection = getReflectionPrompt(domainQuestions);
        const domainResponses = [];
        const covered = new Set();

        // Turn an LLM result's responses[] into formatted payloads, tracking coverage.
        const ingest = (llmResult, questionSubset) => {
          for (let i = 0; i < (llmResult?.responses?.length || 0); i++) {
            const ans = llmResult.responses[i];
            const matchedQId = resolveQuestionId(ans.question_id, questionSubset);
            if (!matchedQId || !questionSubset[matchedQId] || covered.has(matchedQId)) {
              console.warn(`[Skipera Solver] Unresolvable/dup question id '${ans.question_id}' in domain ${domain}`);
              continue;
            }
            const ansType = questionSubset[matchedQId].Type;
            const agent = getAgentForType(ansType);
            const processed = agent.postProcess(ansType, ans.chosen, ans.answer, questionSubset, matchedQId);
            const chosen = processed.chosen;
            let answer = processed.answer;
            if (TEXT_ANSWER_TYPES.has(ansType)) answer = requireTextAnswer(answer, ansType);
            domainResponses.push(agent.formatPayload(matchedQId, ansType, chosen, answer));
            covered.add(matchedQId);
          }
        };

        ingest(await callLLM(domainQuestions, settings, groupData.agent.buildPrompt(domainQuestions, reflection), moduleContext), domainQuestions);

        // Re-ask ONCE for anything the model skipped / truncated / mis-labelled.
        const missingIds = Object.keys(domainQuestions).filter(id => !covered.has(id));
        if (missingIds.length > 0) {
          console.warn(`[Skipera Solver] Domain ${domain}: ${missingIds.length}/${Object.keys(domainQuestions).length} unanswered, re-asking.`);
          const subset = Object.create(null);
          for (const id of missingIds) subset[id] = domainQuestions[id];
          ingest(await callLLM(subset, settings, groupData.agent.buildPrompt(subset, reflection), moduleContext), subset);
        }
        return domainResponses;
      });

      const allDomainResults = await Promise.allSettled(domainPromises);
      for (const r of allDomainResults) {
        if (r.status === "fulfilled") answerResponses.push(...r.value);
        else console.error(`[Skipera Solver] Domain solve rejected:`, r.reason?.message || r.reason);
      }
    } else {
      updateProgress("All questions answered via local cache.");
    }

    // Never submit an incomplete draft. A blank fallback can consume a real
    // assessment attempt and mask model/API failures as a completed run.
    const answeredIds = new Set(answerResponses.map(r => r.questionId));
    for (const part of parts) {
      if (part.__typename === "Submission_TextBlock" || !part.partId) continue;
      const partId = part.partId;
      const qTypeStr = QTYPE_MAP[part.__typename];
      if (qTypeStr && !answeredIds.has(partId)) {
        throw new Error(`No valid answer was produced for a ${qTypeStr} question. The assessment draft was left unsubmitted.`);
      }
    }
    if (answerResponses.length === 0) {
      throw new Error("The assessment draft contains no answerable questions; it was left unsubmitted.");
    }

    // Keep diagnostics useful without logging course prompts or learner responses.
    for (const r of answerResponses) {
      console.log(`[Quiz solver] Prepared answer for item ${r.questionId} (${r.questionType}).`);
    }

    // 3. Save Responses
    console.log(`[Quiz solver] Saving ${answerResponses.length} answer response(s).`);
    const saveData = await fetchGraphQL("Submission_SaveResponses", SAVE_RESPONSES_QUERY, {
      input: { courseId, itemId, attemptId, questionResponses: answerResponses }
    });
    requireMutationSuccess(saveData, "Submission_SaveResponses");

    // 4. Submit Draft
    const submitData = await fetchGraphQL("Submission_SubmitLatestDraft", SUBMIT_DRAFT_QUERY, {
      input: { courseId, itemId, submissionId: draftId }
    });
    requireMutationSuccess(submitData, "Submission_SubmitLatestDraft");

    // 5. Wait & Get Feedback. Coursera's grader lags the submit; a fixed 5s wait
    // read an ungraded response ("2-3%") and poisoned questionsData with all-WRONG
    // feedback. Poll until per-question feedback (parts) shows up. Ramp the delays:
    // auto-graded MCQ is usually ready in 2-4s, so check fast first (~28s ceiling).
    const POLL_DELAYS = [2000, 2000, 3000, 4000, 5000, 6000, 6000];
    let feedbackData = null;
    for (const d of POLL_DELAYS) {
      await delay(d);
      const fbRes = await fetchGraphQL("AssignmentFeedback", ASSIGNMENT_FEEDBACK_QUERY, { courseId, itemId });
      feedbackData = fbRes?.data?.SubmissionState?.queryState?.feedback || feedbackData;
      if (feedbackData?.parts?.length > 0) break; // per-question feedback present -> graded
    }
    if (feedbackData) {
      const outcome = feedbackData.outcome || {};
      const latestScore = outcome.latestScore || 0;
      const maxScore = outcome.maxScore || 1;
      const earnedGrade = latestScore / maxScore;
      
      updateProgress(`Received feedback. Earned grade: ${(earnedGrade * 100).toFixed(1)}% | Target grade: ${(targetGrade * 100).toFixed(1)}%`);
      
      if (earnedGrade >= targetGrade) {
        updateProgress("Passed with target grade!");
        return;
      }
      
      if (feedbackData.parts) {
        for (const fPart of feedbackData.parts) {
        const partId = fPart.partId;
        const qd = questionsData[partId];
        if (!qd) continue;

        const isCorrect = fPart.feedback?.correctness === "CORRECT";
        const submitted = answerResponses.find(r => r.questionId === partId);
        console.log(`[Q] attempt=${attemptsMade + 1} id=${partId} ${isCorrect ? "CORRECT" : "WRONG"} type=${qd.Type} ctxChars=${moduleContext.length}`);
        
        if (!isCorrect && submitted) {
          qd.wrong_attempts = qd.wrong_attempts || [];
          if (qd.Type === "MULTIPLE_FILLABLE_BLANKS") {
            const responses = submitted.questionResponse.multipleFillableBlanksResponse?.responses || [];
            const priorResponse = Object.fromEntries(responses.map((response) => {
              const value = response.multipleChoiceFillableBlankResponse || {};
              return [value.id, value.optionId];
            }));
            qd.wrong_attempts.push({ response: priorResponse, hint: "Coursera graded this response incorrect." });
            continue;
          }
          let chosen = null;
          if (qd.Type === "CHECKBOX" || qd.Type === "CHECKBOX_REFLECT") {
            chosen = submitted.questionResponse.checkboxResponse?.chosen || [];
          } else if (qd.Type === "MULTIPLE_CHOICE") {
            const mChosen = submitted.questionResponse.multipleChoiceResponse?.chosen;
            chosen = mChosen ? [mChosen] : [];
          } else {
            chosen = extractAnswerFromPayload(qd.Type, submitted.questionResponse);
          }
          
          let mappedChosen = chosen;
          if (Array.isArray(chosen) && ["MULTIPLE_CHOICE", "CHECKBOX", "CHECKBOX_REFLECT"].includes(qd.Type)) {
            mappedChosen = [];
            for (let c of chosen) {
              const wrongOpt = qd.Options.find(o => o.option_id === c || o.original_id === c);
              if (wrongOpt) {
                mappedChosen.push(wrongOpt.option_id);
                // For multiple choice, mark the single chosen option as definitely wrong
                if (qd.Type === "MULTIPLE_CHOICE" && chosen.length === 1) {
                  wrongOpt.correct = false;
                }
              } else {
                mappedChosen.push(c);
              }
            }
          }
          if (mappedChosen !== null && mappedChosen !== undefined) {
            qd.wrong_attempts.push({ response: mappedChosen, hint: "Coursera graded this response incorrect." });
          }
        } else if (isCorrect && submitted) {
          // If the question is correct, cache the correct answer in case we need to retry the whole quiz
          if (qd.Type === "MULTIPLE_FILLABLE_BLANKS") {
             const responses = submitted.questionResponse.multipleFillableBlanksResponse?.responses || [];
             qd.correct_answer = Object.fromEntries(responses.map((response) => {
               const value = response.multipleChoiceFillableBlankResponse || {};
               return [value.id, value.optionId];
             }));
          } else if (qd.Type === "CHECKBOX" || qd.Type === "CHECKBOX_REFLECT") {
             const chosen = submitted.questionResponse.checkboxResponse?.chosen || [];
             for (const opt of qd.Options) opt.correct = chosen.includes(opt.option_id) || chosen.includes(opt.original_id);
          } else if (qd.Type === "MULTIPLE_CHOICE") {
             const mChosen = submitted.questionResponse.multipleChoiceResponse?.chosen;
             for (const opt of qd.Options) opt.correct = (opt.option_id === mChosen || opt.original_id === mChosen);
          } else {
             qd.correct_answer = extractAnswerFromPayload(qd.Type, submitted.questionResponse);
          }
        }
      }
    }
    }
    
    attemptsMade++;
  }
  
  // If we exit the loop without passing
  throw new Error(`Failed to pass after ${maxAttempts} attempts.`);
  
  } catch (err) {
    updateProgress(`ERROR: ${err.message}`);
    throw err;
  }
}
