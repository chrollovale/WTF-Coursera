export const dashboardStates = Object.create(null);
const MAX_DASHBOARD_COURSES = 20;

export function getOrCreateState(slug = "default") {
  const safeSlug = slug || "default";
  if (!dashboardStates[safeSlug]) {
    const existingSlugs = Object.keys(dashboardStates);
    if (existingSlugs.length >= MAX_DASHBOARD_COURSES) {
      const oldestSlug = existingSlugs.reduce((oldest, candidate) => {
        const candidateTime = dashboardStates[candidate]?.lastUpdatedAt || dashboardStates[candidate]?.startTime || 0;
        const oldestTime = dashboardStates[oldest]?.lastUpdatedAt || dashboardStates[oldest]?.startTime || 0;
        return candidateTime < oldestTime ? candidate : oldest;
      });
      delete dashboardStates[oldestSlug];
    }
    dashboardStates[safeSlug] = {
      courseSlug: safeSlug,
      completionRate: 0,
      activeTask: { title: "Idle", timeElapsed: "00:00" },
      completedTasks: [],
      skippedTasks: [],
      errors: [],
      logs: [],
      startTime: Date.now()
    };
  }
  return dashboardStates[safeSlug];
}

// Load states from chrome.storage.local on initialization
chrome.storage.local.get(["dashboardStates"], (res) => {
  if (res.dashboardStates && typeof res.dashboardStates === "object" && !Array.isArray(res.dashboardStates)) {
    for (const [slug, storedState] of Object.entries(res.dashboardStates)) {
      if (!storedState || typeof storedState !== "object" || Array.isArray(storedState)) continue;
      const current = dashboardStates[slug];
      const storedTime = storedState?.lastUpdatedAt || storedState?.startTime || 0;
      const currentTime = current?.lastUpdatedAt || current?.startTime || 0;
      if (!current || storedTime > currentTime) dashboardStates[slug] = storedState;
    }
    const slugsByRecency = Object.keys(dashboardStates).sort((a, b) => {
      const aTime = dashboardStates[a]?.lastUpdatedAt || dashboardStates[a]?.startTime || 0;
      const bTime = dashboardStates[b]?.lastUpdatedAt || dashboardStates[b]?.startTime || 0;
      return bTime - aTime;
    });
    for (const slug of slugsByRecency.slice(MAX_DASHBOARD_COURSES)) delete dashboardStates[slug];
  }
});

export function broadcastState(slug = "default") {
  const safeSlug = slug || "default";
  const state = getOrCreateState(safeSlug);
  state.lastUpdatedAt = Date.now();
  const elapsed = Math.floor((Date.now() - (state.startTime || Date.now())) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  state.activeTask.timeElapsed = `${m}:${s}`;
  
  chrome.storage.local.set({ dashboardStates });
  chrome.runtime.sendMessage({ 
    action: "DASHBOARD_UPDATE", 
    slug: safeSlug, 
    state: state 
  }).catch(() => {});
}

export function updateDashboard(msg, type = "info", slug = "default") {
  const safeSlug = slug || "default";
  console.log(`[Dashboard:${safeSlug}] ${msg}`);
  const state = getOrCreateState(safeSlug);
  
  if (type === "active") {
    state.activeTask.title = msg;
    state.startTime = Date.now();
  } else if (type === "error") {
    state.errors.unshift({ time: Date.now(), msg });
  } else if (type === "skip") {
    state.skippedTasks.unshift({ time: Date.now(), msg });
  } else if (type === "complete") {
    state.completedTasks.unshift({ time: Date.now(), msg });
  } else if (type === "completionRate") {
    state.completionRate = msg; // msg is number
  }
  
  // Keep arrays bounded so storage stays lean
  if (state.errors.length > 50) state.errors.pop();
  if (state.skippedTasks.length > 50) state.skippedTasks.pop();
  if (state.completedTasks.length > 50) state.completedTasks.pop();
  
  if (type !== "completionRate") {
    state.logs.push({ time: Date.now(), msg: String(msg), type });
    if (state.logs.length > 100) state.logs.shift();
  }
  
  broadcastState(safeSlug);
}
