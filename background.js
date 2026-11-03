import { runFullCourse, stopRunForTab } from './solverOrchestrator.js';
import { triggerQuizSolver } from './quizSolver.js';
import { getCourseMaterials } from './courseraApi.js';
import { updateDashboard } from './dashboardStore.js';

if (chrome.storage.local.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => stopRunForTab(tabId));

const EXTENSION_PREFIX = chrome.runtime.getURL('');
const PROVIDERS = new Set(['nvidia', 'openai', 'anthropic', 'gemini']);

function validatePopupRequest(message, sender) {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(EXTENSION_PREFIX)) {
    throw new Error('This action must be started from the extension popup.');
  }
  if (!Number.isInteger(message.tabId) || message.tabId < 0) throw new Error('No active Coursera tab was selected.');
  if (typeof message.slug !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(message.slug)) {
    throw new Error('The course address is not valid.');
  }
  const settings = message.settings || {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Solver settings are invalid.');
  if (!PROVIDERS.has(settings.provider || 'nvidia')) throw new Error('Choose a supported AI provider.');
  if (typeof (settings.apiKey || '') !== 'string' || (settings.apiKey || '').length > 5000) {
    throw new Error('The API key is too long.');
  }
  if (typeof (settings.modelName || '') !== 'string' || (settings.modelName || '').length > 160) {
    throw new Error('The model name is too long.');
  }
}

async function getAllowedTab(tabId, expectedSlug, expectedItemId = null) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url || '');
  if (url.protocol !== 'https:' || url.hostname !== 'www.coursera.org') {
    throw new Error('The selected tab is not a secure Coursera page.');
  }
  const courseMatch = url.pathname.match(/^\/learn\/([^/]+)(?:\/|$)/);
  if (!courseMatch || courseMatch[1] !== expectedSlug) {
    throw new Error('The selected tab and course address do not match.');
  }
  if (expectedItemId) {
    const itemMatch = url.pathname.match(/^\/learn\/[^/]+\/(?:lecture|supplement|quiz|exam|assignment|programming|peer)\/([^/]+)/);
    if (!itemMatch || itemMatch[1] !== expectedItemId) {
      throw new Error('The selected tab and assessment address do not match.');
    }
  }
  return tab;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!message || typeof message !== 'object') return;

  if (message.action === 'RUN_FULL_COURSE') {
    (async () => {
      validatePopupRequest(message, sender);
      await getAllowedTab(message.tabId, message.slug);
      runFullCourse(message.slug, message.settings || {}, message.tabId)
        .catch((error) => updateDashboard(`Run failed: ${error.message}`, 'error', message.slug));
      sendResponse({ status: 'Course run started.' });
    })().catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.action === 'RUN_SINGLE_QUIZ') {
    (async () => {
      validatePopupRequest(message, sender);
      await getAllowedTab(message.tabId, message.slug, message.itemId);
      if (typeof message.itemId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(message.itemId)) {
        throw new Error('The assessment address is not valid.');
      }
      const materials = await getCourseMaterials(message.slug);
      const courseId = materials?.elements?.[0]?.id;
      if (!courseId) throw new Error('Could not find the Coursera course ID.');
      sendResponse({ status: 'Assessment run started.' });
      triggerQuizSolver(courseId, message.itemId, message.settings || {}, message.tabId, message.slug, null, materials)
        .catch((error) => updateDashboard(`Assessment solver failed: ${error.message}`, 'error', message.slug));
    })().catch((error) => {
      updateDashboard(`Assessment solver failed: ${error.message}`, 'error', message.slug || 'default');
      sendResponse({ error: error.message });
    });
    return true;
  }
});
