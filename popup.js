const TYPE_LABELS = {
  lecture: 'Lecture (Video)',
  supplement: 'Supplement (Reading)',
  quiz: 'Quiz',
  programming: 'Programming',
  exam: 'Exam',
  assignment: 'Assignment',
  peer: 'Peer Review',
};

function showAlert(type, message) {
  const el = document.getElementById('result-alert');
  el.style.display = 'block';
  el.style.background = type === 'error' ? 'var(--error-bg)' : 'var(--success-bg)';
  el.style.borderColor = type === 'error' ? 'var(--error)' : 'var(--success)';
  el.style.color = type === 'error' ? 'var(--error)' : 'var(--success)';
  el.textContent = message;
}

function hideAlert() {
  const el = document.getElementById('result-alert');
  el.style.display = 'none';
  el.textContent = '';
}

function setLoading(btnId, loading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
  if (text) {
    btn.querySelector('.btn-text').textContent = text;
  }
}

async function getActiveCourseraTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let hostname = '';
  try { hostname = new URL(tab?.url || '').hostname; } catch (_) {}
  if (!tab || !tab.url?.startsWith('https://') || hostname !== 'www.coursera.org') {
    return null;
  }
  return tab;
}

async function loadContext() {
  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Not on Coursera');

    const context = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
    if (!context || context.error || !context.itemType) {
      throw new Error(context?.error || 'No context');
    }

    document.getElementById('page-status').style.display = 'block';
    document.getElementById('action-buttons').style.display = 'block';
    document.getElementById('ai-tools').style.display = 'block';
    document.getElementById('empty-msg').style.display = 'none';

    document.getElementById('lbl-type').textContent = TYPE_LABELS[context.itemType] || context.itemType;
    document.getElementById('lbl-item').textContent = context.itemId || '-';
    document.getElementById('lbl-course').textContent = context.courseSlug || '-';

    return context;
  } catch (_) {
    document.getElementById('page-status').style.display = 'none';
    document.getElementById('action-buttons').style.display = 'none';
    document.getElementById('ai-tools').style.display = 'none';
    document.getElementById('empty-msg').style.display = 'block';
    return null;
  }
}

async function markCompleted() {
  hideAlert();
  setLoading('btn-skip-current', true, 'Processing...');

  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Please open a Coursera lesson page first.');

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'markCompleted' });
    if (result && result.success) {
      showAlert('success', 'Lesson completed. Refreshing the page…');
      setTimeout(() => {
        chrome.tabs.reload(tab.id);
      }, 1500);
    } else {
      showAlert('error', result?.error || 'The lesson could not be completed.');
    }
  } catch (error) {
    showAlert('error', error.message);
  } finally {
    setLoading('btn-skip-current', false, 'Complete this lesson');
  }
}

document.getElementById('btn-skip-current').addEventListener('click', markCompleted);

document.getElementById('btn-skip-all').addEventListener('click', async () => {
  hideAlert();
  setLoading('btn-skip-all', true, 'Starting...');
  
  const progContainer = document.getElementById('bulk-progress-container');
  const progMsg = document.getElementById('bulk-progress-msg');
  const progBar = document.getElementById('bulk-progress-bar');
  const progPct = document.getElementById('bulk-progress-pct');
  
  progContainer.style.display = 'block';
  progMsg.textContent = 'Starting the process...';
  progBar.style.width = '0%';
  progPct.textContent = '0%';

  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Please open a Coursera lesson page first.');

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'markAllCompleted' });
    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error while starting.');
    }
  } catch (error) {
    showAlert('error', `Error: ${error.message}`);
    setLoading('btn-skip-all', false, 'Complete all course content');
    progContainer.style.display = 'none';
  }
});

document.getElementById('btn-skip-readings').addEventListener('click', async () => {
  hideAlert();
  setLoading('btn-skip-readings', true, 'Starting...');
  
  const progContainer = document.getElementById('bulk-progress-container');
  const progMsg = document.getElementById('bulk-progress-msg');
  const progBar = document.getElementById('bulk-progress-bar');
  const progPct = document.getElementById('bulk-progress-pct');
  
  progContainer.style.display = 'block';
  progMsg.textContent = 'Starting readings automation...';
  progBar.style.width = '0%';
  progPct.textContent = '0%';

  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Please open a Coursera lesson page first.');

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'markReadingsCompleted' });
    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error while starting.');
    }
  } catch (error) {
    showAlert('error', `Error: ${error.message}`);
    setLoading('btn-skip-readings', false, 'Complete readings in course');
    progContainer.style.display = 'none';
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'progressUpdate') {
    if (sender.id !== chrome.runtime.id || !sender.tab?.id) return;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (!activeTab || activeTab.id !== sender.tab.id) return;
    const msg = String(message.message || '');
    const progMsg = document.getElementById('bulk-progress-msg');
    const progBar = document.getElementById('bulk-progress-bar');
    const progPct = document.getElementById('bulk-progress-pct');
    
    progMsg.textContent = msg;

    const match = msg.match(/(?:Đang xử lý|Processing):\s*(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      if (total > 0) {
        const pct = Math.min(100, Math.round((current / total) * 100));
        progBar.style.width = `${pct}%`;
        progPct.textContent = `${pct}%`;
      }
    }
    
    const normalizedMessage = msg.toLowerCase();
    const finished = /all(?:\s+lessons)?\s+processed|all readings processed|hoàn thành toàn bộ/.test(normalizedMessage);
    const failed = /could not retrieve|course not found|no videos|no reading materials|error:/.test(normalizedMessage);
    if (finished || failed) {
      setLoading('btn-skip-all', false, 'Complete all course content');
      setLoading('btn-skip-readings', false, 'Complete readings in course');
      if (finished) {
        progBar.style.width = '100%';
        progPct.textContent = '100%';
        const failures = Number(normalizedMessage.match(/(\d+) failed/)?.[1] || 0);
        if (failures) showAlert('error', `Finished with ${failures} item(s) that Coursera did not confirm.`);
        else showAlert('success', 'Course progress updated. Refreshing the page…');
        setTimeout(async () => {
          const tab = await getActiveCourseraTab();
          if (tab) chrome.tabs.reload(tab.id);
        }, 2000);
      } else {
        showAlert('error', msg);
      }
    }
    });
  }
});

loadContext();

const settingsFields = ['provider', 'model-name', 'api-key', 'target-grade', 'skip-practice', 'auto-submit-discussions'];
document.getElementById('toggle-api-key').addEventListener('click', (event) => {
  const field = document.getElementById('api-key');
  const shouldShow = field.type === 'password';
  field.type = shouldShow ? 'text' : 'password';
  event.currentTarget.textContent = shouldShow ? 'HIDE' : 'SHOW';
  event.currentTarget.setAttribute('aria-pressed', String(shouldShow));
});

function readSolverSettings() {
  const grade = Number(document.getElementById('target-grade').value) / 100;
  return {
    provider: document.getElementById('provider').value,
    modelName: document.getElementById('model-name').value.trim(),
    apiKey: document.getElementById('api-key').value.trim(),
    targetGrade: grade,
    skipPractice: document.getElementById('skip-practice').checked,
    autoSubmitDiscussions: document.getElementById('auto-submit-discussions').checked
  };
}

function saveSolverSettings() {
  chrome.storage.local.set({ solverSettings: readSolverSettings() });
}

chrome.storage.local.get(['solverSettings'], ({ solverSettings = {} }) => {
  if (solverSettings.provider) document.getElementById('provider').value = solverSettings.provider;
  if (solverSettings.modelName) document.getElementById('model-name').value = solverSettings.modelName;
  if (solverSettings.apiKey) document.getElementById('api-key').value = solverSettings.apiKey;
  if (typeof solverSettings.targetGrade === 'number') {
    const grade = Math.round(solverSettings.targetGrade * 100);
    document.getElementById('target-grade').value = grade;
    document.getElementById('target-grade-label').textContent = `${grade}%`;
  }
  if (typeof solverSettings.skipPractice === 'boolean') document.getElementById('skip-practice').checked = solverSettings.skipPractice;
  if (typeof solverSettings.autoSubmitDiscussions === 'boolean') document.getElementById('auto-submit-discussions').checked = solverSettings.autoSubmitDiscussions;
});

settingsFields.forEach((id) => {
  const field = document.getElementById(id);
  field.addEventListener('input', () => {
    if (id === 'target-grade') document.getElementById('target-grade-label').textContent = `${field.value}%`;
    saveSolverSettings();
  });
  field.addEventListener('change', saveSolverSettings);
});

async function runSolver(action, extraSettings = {}) {
  hideAlert();
  const tab = await getActiveCourseraTab();
  if (!tab) throw new Error('Open a Coursera course page first.');
  const context = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
  if (!context || context.error || !context.courseSlug) throw new Error('Open a Coursera course lesson, quiz, or assignment first.');
  const settings = { ...readSolverSettings(), ...extraSettings };
  const requiresKey = !extraSettings.videosOnly && action !== 'START_VIDEOS_ONLY';
  if (requiresKey && !settings.apiKey) throw new Error('Add an API key for the selected provider first.');
  if (action === 'RUN_SINGLE_QUIZ' && !['quiz', 'exam', 'assignment', 'programming', 'peer'].includes(context.itemType)) {
    throw new Error('Navigate to a quiz, exam, or assignment page to solve the current assessment.');
  }
  saveSolverSettings();
  const progress = document.getElementById('solver-progress');
  progress.style.display = 'block';
  progress.textContent = action === 'RUN_SINGLE_QUIZ' ? 'Starting current assessment…' : 'Starting course run…';
  const response = await chrome.runtime.sendMessage({
    action,
    slug: context.courseSlug,
    itemId: context.itemId,
    settings,
    tabId: tab.id
  });
  if (response?.error || response?.errorMessage) throw new Error(response.error || response.errorMessage);
  showAlert('success', response?.status || 'Solver started. Progress will appear below.');
}

document.getElementById('btn-solve-quiz').addEventListener('click', () => {
  runSolver('RUN_SINGLE_QUIZ').catch((error) => showAlert('error', error.message));
});
document.getElementById('btn-run-ai-course').addEventListener('click', () => {
  runSolver('RUN_FULL_COURSE').catch((error) => showAlert('error', error.message));
});
document.getElementById('btn-run-graded').addEventListener('click', () => {
  runSolver('RUN_FULL_COURSE', { gradedOnly: true }).catch((error) => showAlert('error', error.message));
});
document.getElementById('btn-run-videos').addEventListener('click', () => {
  runSolver('RUN_FULL_COURSE', { videosOnly: true, apiKey: '' }).catch((error) => showAlert('error', error.message));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'DASHBOARD_UPDATE') return;
  const state = message.state;
  if (!state) return;
  const progress = document.getElementById('solver-progress');
  progress.style.display = 'block';
  progress.textContent = (state.logs || []).slice(-5).reverse().map((entry) => entry.msg).join('\n') || state.activeTask?.title || 'Working…';
});
