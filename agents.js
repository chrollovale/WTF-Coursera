export function stripHtmlTags(text) {
  if (!text) return "";
  let clean = text.replace(/<[^>]*display:\s*none[^>]*>.*?<\/[^>]+>/gi, '');
  clean = clean.replace(/<[^>]*color:\s*(?:white|#ffffff|#fff)[^>]*>.*?<\/[^>]+>/gi, '');
  clean = clean.replace(/<[^>]*opacity:\s*0[^>]*>.*?<\/[^>]+>/gi, '');
  return clean.replace(/<[^>]*>?/gm, '').trim();
}

export function getReflectionPrompt(domainQuestions) {
  let hasAttempts = Object.values(domainQuestions).some(q => q.previous_attempts && q.previous_attempts.length > 0);
  if (hasAttempts) {
    return "\n\nREFLECTION SKILL ACTIVATED: One or more questions in this batch have previous incorrect attempts. Analyze the 'previous_attempts' array carefully. Understand why the previous answer failed based on the provided hint, and generate a distinctly different and correct answer.";
  }
  return "";
}

export class BaseAgent {
  constructor(domain, skillPrompt) {
    this.domain = domain;
    this.skillPrompt = skillPrompt;
  }


  // Common instructions for all agents
  getGlobalRules() {
    return (
      "Use the 'reasoning' field as a scratchpad: think step-by-step, eliminate wrong options, and verify your logic before committing to the final answer. Give it as much space as the question needs. Keep 'reasoning' plain text (no markdown). " +
      "Format the final 'answer' exactly as this task's rules below require — nothing more, nothing less.\n\n"
    );
  }

  // Combines global rules, skill-specific prompt, and reflection
  buildPrompt(domainQuestions, reflectionText = "") {
    const ids = Object.keys(domainQuestions || {});
    let basePrompt = (
      "Answer the provided questions. Be precise and concise.\n" +
      "The questions are in a dict format where each key represents the question id, and the value is a JSON dict containing:\n" +
      "- 'Question': the question text.\n" +
      "- 'Options': a list of options (if applicable) with option_id and value.\n" +
      "- 'Blanks': for MULTIPLE_FILLABLE_BLANKS, a list of blank_id values, each with its own 'Options' list.\n" +
      "- 'Type': the question type.\n" +
      "- 'previous_attempts': (optional) past attempt results. ALWAYS review these to avoid repeating mistakes.\n\n" +
      `COVERAGE: there are ${ids.length} question(s). Your 'responses' array MUST contain exactly ${ids.length} entries, one per question, ` +
      `each with 'question_id' set to the EXACT key from the input. Do not skip, merge, or invent questions. ` +
      `Answer these ids: ${JSON.stringify(ids)}\n\n`
    );

    return basePrompt + this.getGlobalRules() + this.skillPrompt + reflectionText;
  }

  // Optional overriding for specific agents to normalize outputs
  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    return { chosen, answer };
  }

  // Format the GraphQL payload strictly per schema
  formatPayload(partId, qType, chosen, answer) {
    throw new Error("formatPayload must be implemented by subclass.");
  }
}

export class LogicAgent extends BaseAgent {
  constructor() {
    super(
      "LOGIC",
      "You are the Logic Agent. Your skill is deductive reasoning and process of elimination.\n" +
      "Rules:\n" +
      "1. MULTIPLE_CHOICE: Single-choice question. Select exactly one option_id and place it in the 'chosen' list.\n" +
      "2. CHECKBOX: Multi-choice question. Select one or more option_ids and place them in the 'chosen' list. Use the 'reasoning' field to evaluate each option individually based on the question constraints.\n" +
      "3. MULTIPLE_FILLABLE_BLANKS: Set 'answer' to a JSON-encoded object mapping every exact blank_id to one of that blank's exact option_id values. Include every blank once, and no extra keys.\n\n" +
      "IMPORTANT for CHECKBOX:\n" +
      "If a question has 'previous_attempts', each entry records a prior submission of chosen option_ids:\n" +
      "- 'response' is the prior selection (a list for checkbox questions, or a blank_id-to-option_id map for fillable blanks).\n" +
      "- 'hint' states that Coursera graded that response INCORRECT.\n" +
      "Use the prior results to avoid repeating a known-wrong response and reason about the remaining options."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (["MULTIPLE_CHOICE", "CHECKBOX", "CHECKBOX_REFLECT"].includes(ansType)) {
      if (typeof chosen === "string") chosen = [chosen];
      if (!Array.isArray(chosen)) throw new Error(`Invalid option selection for ${qId}.`);

      const qOpts = domainQuestions?.[qId]?.Options || [];
      const normalized = chosen.map((value) => {
        const candidate = String(value).trim();
        const byId = qOpts.find((o) => o.option_id === candidate || o.original_id === candidate);
        const labelMatches = qOpts.filter((o) => String(o.value || "").trim().toLowerCase() === candidate.toLowerCase());
        if (labelMatches.length > 1 && !byId) throw new Error(`The answer for ${qId} matches multiple option labels.`);
        const byLabel = labelMatches[0];
        const option = byId || byLabel;
        if (!option) throw new Error(`The answer for ${qId} did not match a listed option.`);
        return option.original_id || option.option_id;
      });

      if (ansType === "MULTIPLE_CHOICE" && normalized.length !== 1) {
        throw new Error(`The answer for ${qId} must select exactly one option.`);
      }
      if (ansType !== "MULTIPLE_CHOICE" && new Set(normalized).size !== normalized.length) {
        throw new Error(`The answer for ${qId} contains a duplicate option.`);
      }
      return { chosen: normalized, answer };
    }

    if (ansType === "MULTIPLE_FILLABLE_BLANKS") {
      if (typeof answer === "string") {
        try { answer = JSON.parse(answer); }
        catch { throw new Error(`The fill-in-the-blanks answer for ${qId} was not valid JSON.`); }
      }
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        throw new Error(`The fill-in-the-blanks answer for ${qId} must map blank IDs to option IDs.`);
      }

      const blanks = domainQuestions?.[qId]?.Blanks || [];
      if (blanks.length === 0 || Object.keys(answer).length !== blanks.length) {
        throw new Error(`The fill-in-the-blanks answer for ${qId} must cover every blank exactly once.`);
      }
      const normalized = Object.create(null);
      for (const blank of blanks) {
        const blankId = String(blank.blank_id);
        const optionId = answer[blankId];
        const allowed = (blank.Options || []).some((option) => String(option.option_id) === String(optionId));
        if (typeof optionId !== "string" || !allowed) {
          throw new Error(`The answer for blank ${blankId} in ${qId} is missing or invalid.`);
        }
        normalized[blankId] = optionId;
      }
      return { chosen: [], answer: normalized };
    }

    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "MULTIPLE_CHOICE") {
      if (!Array.isArray(chosen) || chosen.length !== 1 || typeof chosen[0] !== "string" || !chosen[0]) {
        throw new Error("A multiple-choice response must contain one valid Coursera option ID.");
      }
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { multipleChoiceResponse: { chosen: chosen ? chosen[0] : null } }
      };
    } else if (qType === "CHECKBOX" || qType === "CHECKBOX_REFLECT") {
      if (!Array.isArray(chosen) || chosen.some((id) => typeof id !== "string" || !id)) {
        throw new Error("A checkbox response must contain valid Coursera option IDs.");
      }
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { checkboxResponse: { chosen: chosen || [] } }
      };
    } else if (qType === "MULTIPLE_FILLABLE_BLANKS") {
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        throw new Error("A complete blank-to-option answer map is required.");
      }
      const responses = Object.keys(answer).map(blankId => {
        const optionId = answer[blankId];
        if (typeof optionId !== "string" || !optionId) {
          throw new Error(`A valid option is required for blank ${blankId}.`);
        }
        return { multipleChoiceFillableBlankResponse: { id: blankId, optionId } };
      });
      if (responses.length === 0) throw new Error("A fill-in-the-blanks response cannot be empty.");
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { multipleFillableBlanksResponse: { responses } }
      };
    }
    throw new Error(`Unsupported logic question type: ${qType}`);
  }
}

export class CodeExpressionAgent extends BaseAgent {
  constructor() {
    super(
      "CODE_EXPRESSION",
      "You are the Code Agent. Your skill is writing flawless, raw code snippets.\n" +
      "Rules:\n" +
      "1. CODE_EXPRESSION: Put ONLY the raw code in the 'answer' field. No markdown fences, no ``` backticks, no prose — just code. Preserve newlines and indentation as real characters in the JSON string.\n" +
      "2. Assume Python unless the question says otherwise. Include any imports the code needs.\n" +
      "3. Use the 'reasoning' field to plan the logic, edge cases, and complexity before writing the code."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (ansType !== "MULTIPLE_FILLABLE_BLANKS" && typeof answer === 'object' && answer !== null) {
      const keys = Object.keys(answer);
      if (keys.length > 0) {
        answer = String(answer[keys[0]]);
      } else {
        answer = "";
      }
    }
    if (ansType === "CODE_EXPRESSION" && typeof answer === 'string') {
      answer = answer.replace(/^```[a-zA-Z]*\n/, '');
      answer = answer.replace(/\n```$/, '');
      answer = answer.replace(/^```\n?/, '');
      answer = answer.replace(/\n?```$/, '');
      answer = answer.trim();
    }
    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "CODE_EXPRESSION") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { codeExpressionResponse: { answer: { code: answer || "" } } }
      };
    }
    throw new Error(`Unsupported code question type: ${qType}`);
  }
}

export class RegexAgent extends BaseAgent {
  constructor() {
    super(
      "REGEX",
      "You are the Regex Agent. Your skill is writing flawless regular expressions.\n" +
      "Rules:\n" +
      "1. REGEX: Answer with the exact matching regular expression text ONLY, no wrapping quotes or slashes, in the 'answer' field.\n" +
      "2. Use the 'reasoning' field to construct the regex step-by-step, explaining how it matches the required patterns and avoids false positives."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (ansType !== "MULTIPLE_FILLABLE_BLANKS" && typeof answer === 'object' && answer !== null) {
      const keys = Object.keys(answer);
      if (keys.length > 0) {
        answer = String(answer[keys[0]]);
      } else {
        answer = "";
      }
    }

    if (ansType === "REGEX" && typeof answer === 'string') {
      if ((answer.startsWith('"') && answer.endsWith('"')) || (answer.startsWith("'") && answer.endsWith("'"))) {
        answer = answer.substring(1, answer.length - 1);
      }
      answer = answer.replace(/^r['"]|['"]$/g, '').replace(/^\/|\/$/g, '');
    }
    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "REGEX") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { regexResponse: { answer: answer || "" } }
      };
    }
    throw new Error(`Unsupported regex question type: ${qType}`);
  }
}

export class MathAgent extends BaseAgent {
  constructor() {
    super(
      "MATH",
      "You are the Math Agent. Your skill is precise mathematical calculation.\n" +
      "Rules:\n" +
      "1. NUMERIC: Answer with the exact number ONLY, no quotes (e.g., 42), in the 'answer' field.\n" +
      "2. MATH: Provide the exact math expression required in the 'answer' field.\n" +
      "3. If complex computation is implied, utilize your knowledge of libraries like numpy, scipy, sympy, or math to derive the correct numerical answer.\n" +
      "4. Use the 'reasoning' field to show your mathematical work step-by-step, including formulas, intermediate calculations, and final derivation."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (ansType !== "MULTIPLE_FILLABLE_BLANKS" && typeof answer === 'object' && answer !== null) {
      const keys = Object.keys(answer);
      if (keys.length > 0) {
        answer = String(answer[keys[0]]);
      } else {
        answer = "";
      }
    }

    if (ansType === "NUMERIC" && typeof answer === 'string') {
      if ((answer.startsWith('"') && answer.endsWith('"')) || (answer.startsWith("'") && answer.endsWith("'"))) {
        answer = answer.substring(1, answer.length - 1);
      }
      const parsed = parseFloat(answer);
      if (!isNaN(parsed)) {
        answer = parsed.toString(); // Canonicalize numeric string
      }
    }
    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "NUMERIC") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { numericResponse: { answer: answer || "" } } // Explicit handling
      };
    } else if (qType === "MATH") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { mathResponse: { answer: answer || "" } }
      };
    }
    throw new Error(`Unsupported math question type: ${qType}`);
  }
}

export class TextAgent extends BaseAgent {
  constructor() {
    super(
      "TEXT",
      "You are the Text Agent. Your skill is reading comprehension and concise free-text generation.\n" +
      "Rules:\n" +
      "1. TEXT_REFLECT, PLAIN_TEXT, RICH_TEXT: Free-text answer in the 'answer' field. Be thoughtful and highly relevant.\n" +
      "2. TEXT_EXACT_MATCH: Answer with the exact matching text ONLY, no wrapping quotes, in the 'answer' field."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (ansType !== "MULTIPLE_FILLABLE_BLANKS" && typeof answer === 'object' && answer !== null) {
      const keys = Object.keys(answer);
      if (keys.length > 0) {
        answer = String(answer[keys[0]]);
      } else {
        answer = "";
      }
    }

    if (ansType === "TEXT_EXACT_MATCH" && typeof answer === 'string') {
      if ((answer.startsWith('"') && answer.endsWith('"')) || (answer.startsWith("'") && answer.endsWith("'"))) {
        answer = answer.substring(1, answer.length - 1);
      }
    }
    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "TEXT_REFLECT") {
      return {
        questionId: partId,
        questionType: qType,
        // Fixed 400 error: explicitly providing string answer instead of relying on generic map
        questionResponse: { textReflectResponse: { answer: answer || "" } }
      };
    } else if (qType === "PLAIN_TEXT") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { plainTextResponse: { plainText: answer || "" } }
      };
    } else if (qType === "TEXT_EXACT_MATCH") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { textExactMatchResponse: { answer: answer || "" } }
      };
    } else if (qType === "RICH_TEXT") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { richTextResponse: { richText: { value: answer || "" } } }
      };
    }
    throw new Error(`Unsupported text question type: ${qType}`);
  }
}

export class ResourceAgent extends BaseAgent {
  constructor() {
    super(
      "RESOURCE",
      "You are the Resource Agent. Your skill is providing URLs or specific file inputs.\n" +
      "Rules:\n" +
      "1. URL: Provide a complete HTTPS URL in the 'answer' field.\n" +
      "2. WIDGET: Provide the required JSON or text in the 'answer' field."
    );
  }

  postProcess(ansType, chosen, answer, domainQuestions, qId) {
    if (ansType !== "MULTIPLE_FILLABLE_BLANKS" && typeof answer === 'object' && answer !== null) {
      const keys = Object.keys(answer);
      if (keys.length > 0) {
        answer = String(answer[keys[0]]);
      } else {
        answer = "";
      }
    }
    return { chosen, answer };
  }

  formatPayload(partId, qType, chosen, answer) {
    if (qType === "FILE_UPLOAD") {
      throw new Error("File upload questions require a real user-provided file and are not supported by the AI solver.");
    } else if (qType === "URL") {
      let parsedUrl;
      try { parsedUrl = new URL(String(answer || "").trim()); }
      catch { throw new Error("The URL answer must be a complete HTTPS URL."); }
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
        throw new Error("The URL answer must be a complete HTTPS URL without embedded credentials.");
      }
      const urlVal = parsedUrl.href;
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { urlResponse: { title: "Project Submission", caption: answer || "Submission URL", url: urlVal } }
      };
    } else if (qType === "WIDGET") {
      return {
        questionId: partId,
        questionType: qType,
        questionResponse: { widgetResponse: { answer: answer || "" } }
      };
    }
    throw new Error(`Unsupported resource question type: ${qType}`);
  }
}


// The Router that returns the appropriate agent for a question type
export function getAgentForType(qType) {
  switch (qType) {
    case "MULTIPLE_CHOICE":
    case "CHECKBOX":
    case "CHECKBOX_REFLECT":
    case "MULTIPLE_FILLABLE_BLANKS":
      return new LogicAgent();
    case "CODE_EXPRESSION":
      return new CodeExpressionAgent();
    case "REGEX":
      return new RegexAgent();
    case "MATH":
    case "NUMERIC":
      return new MathAgent();
    case "TEXT_REFLECT":
    case "PLAIN_TEXT":
    case "RICH_TEXT":
    case "TEXT_EXACT_MATCH":
      return new TextAgent();
    case "FILE_UPLOAD":
    case "URL":
    case "WIDGET":
      return new ResourceAgent();
    default:
      return new TextAgent(); // fallback
  }
}
