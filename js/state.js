const STORAGE_KEY = 'claude-migration-state';

function createInitialState() {
  return {
    currentStep: 'a1',
    steps: {
      a1: { completed: false },
      a2: { completed: false, processing: false, progress: 0, stats: null },
      a3: { completed: false, contextDocEdited: null },
      a4: { completed: false, importantArtifacts: {} },
      b1: { completed: false, memoryCaptureUploaded: false },
      b2: { completed: false, projects: [] },
      b3: { completed: false, memoryEditsProcessed: {} },
      b4: { completed: false, projectsRecreated: {} },
      b5: { completed: false, artifactsUploaded: {} },
      b6: { completed: false, passed: null }
    },
    exportData: {
      exportMode: null,          // 'personal' | 'admin'
      adminUsers: null,          // parsed user list with conversation counts
      selectedUserUuid: null,
      userMemory: null,          // string from memories.json for selected user
      userProjects: null,        // filtered projects array for selected user
      rawSource: null,           // original export (ZIP File or per-user JSON) for raw/ in the package
      conversations: null,
      conversationIndex: null,
      artifacts: null,
      artifactIndex: null,
      contextDocument: null,
      memoryScript: null,
      summary: null
    }
  };
}

let state = createInitialState();
const listeners = new Set();
let persistTimer = null;

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error('State listener error:', e); }
  }
}

function debouncedPersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistToStorage(), 300);
}

// --- Public API ---

export function getState() {
  return state;
}

export function getCurrentStep() {
  return state.currentStep;
}

export function setCurrentStep(stepId) {
  state.currentStep = stepId;
  notify();
  debouncedPersist();
}

export function getStepState(stepId) {
  return state.steps[stepId];
}

export function updateStep(stepId, patch) {
  state.steps[stepId] = { ...state.steps[stepId], ...patch };
  notify();
  debouncedPersist();
}

export function getExportData(key) {
  return state.exportData[key];
}

export function setExportData(key, value) {
  state.exportData[key] = value;
  notify();
  debouncedPersist();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCompletedCount() {
  return Object.values(state.steps).filter(s => s.completed).length;
}

export function getTotalSteps() {
  return Object.keys(state.steps).length;
}

// --- Persistence ---

export function persistToStorage() {
  try {
    const serializable = {
      currentStep: state.currentStep,
      steps: state.steps,
      // Don't persist large exportData to localStorage - only metadata
      hasExportData: {
        conversations: !!state.exportData.conversations,
        artifacts: !!state.exportData.artifacts,
        contextDocument: !!state.exportData.contextDocument,
        memoryScript: !!state.exportData.memoryScript
      },
      // Persist small admin-mode strings
      exportMode: state.exportData.exportMode,
      selectedUserUuid: state.exportData.selectedUserUuid
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('Failed to persist state:', e);
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    applySavedSteps(saved);
    if (saved.exportMode === 'personal' || saved.exportMode === 'admin') {
      state.exportData.exportMode = saved.exportMode;
    }
    if (typeof saved.selectedUserUuid === 'string') state.exportData.selectedUserUuid = saved.selectedUserUuid;
    return true;
  } catch (e) {
    console.warn('Failed to load state:', e);
    return false;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Saved/imported sessions are untrusted input: only accept known step ids and
// plain-object step data, never touching prototype keys like __proto__.
function applySavedSteps(saved) {
  if (!isPlainObject(saved)) return;
  if (typeof saved.currentStep === 'string' && Object.hasOwn(state.steps, saved.currentStep)) {
    state.currentStep = saved.currentStep;
  }
  if (!isPlainObject(saved.steps)) return;
  for (const id of Object.keys(state.steps)) {
    if (!Object.hasOwn(saved.steps, id) || !isPlainObject(saved.steps[id])) continue;
    const clean = {};
    for (const [key, value] of Object.entries(saved.steps[id])) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      clean[key] = value;
    }
    state.steps[id] = { ...state.steps[id], ...clean };
  }
}

export function exportSessionJSON() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    currentStep: state.currentStep,
    steps: state.steps
  }, null, 2);
}

export function importSessionJSON(json) {
  try {
    const data = JSON.parse(json);
    if (data.version !== 1) throw new Error('Unsupported session version');
    applySavedSteps(data);
    notify();
    persistToStorage();
    return true;
  } catch (e) {
    console.error('Failed to import session:', e);
    return false;
  }
}

export function resetState() {
  state = createInitialState();
  localStorage.removeItem(STORAGE_KEY);
  notify();
}
