import { updateStep, getState } from '../../state.js';
import { escapeHtml } from '../../utils.js';
import { icon } from '../components/icon.js';

export function render(container, stepState, globalState) {
  const artifacts = globalState.exportData.artifacts || [];

  if (artifacts.length === 0) {
    container.innerHTML = `
      <div class="info-box info-box--warning">
        <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
        <span>No artifacts found. Complete step A2 first, or your export may not contain any artifacts.</span>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const importantMap = stepState.importantArtifacts || {};
  const importantCount = Object.values(importantMap).filter(Boolean).length;

  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Review Extracted Artifacts</div>
      <div class="step-section__description">
        ${artifacts.length} artifacts were extracted from your conversations.
        Toggle "Important" on the ones you want to prioritize for migration to your new account.
        These will appear in step B5.
      </div>
      <div style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-md);">
        ${importantCount} of ${artifacts.length} marked as important
      </div>
    </div>

    <div style="border: 1px solid var(--color-border); border-radius: var(--border-radius); overflow: hidden;">
      <div style="display: flex; align-items: center; padding: var(--space-sm) var(--space-md); background: var(--color-surface-alt); border-bottom: 1px solid var(--color-border); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
        <span style="flex: 1;">Artifact</span>
        <span style="width: 80px; text-align: center;">Type</span>
        <span style="width: 80px; text-align: center;">Important</span>
      </div>
      <div id="a4-list" style="max-height: 500px; overflow-y: auto;"></div>
    </div>

    <div class="step-actions">
      <button class="btn" id="a4-select-all">Select All</button>
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="a4-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">Artifacts reviewed</span>
      </label>
    </div>
  `;

  const listEl = container.querySelector('#a4-list');

  for (const art of artifacts) {
    const isImportant = !!importantMap[art.id];
    const item = document.createElement('div');
    item.className = 'artifact-list-item';
    item.innerHTML = `
      <span class="artifact-list-item__title">${escapeHtml(art.title)}</span>
      <span class="artifact-list-item__type">${escapeHtml(art.extension)}</span>
      <label class="toggle" style="width: 80px; justify-content: center;">
        <input type="checkbox" class="toggle__input" data-artifact-id="${escapeHtml(art.id)}" ${isImportant ? 'checked' : ''}>
        <span class="toggle__track"></span>
      </label>
    `;
    listEl.appendChild(item);
  }

  // Handle toggle changes
  listEl.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-artifact-id]');
    if (!cb) return;
    const current = getState().steps.a4.importantArtifacts || {};
    current[cb.dataset.artifactId] = cb.checked;
    updateStep('a4', { importantArtifacts: current });
    updateCount();
  });

  // Select all
  const selectAllBtn = container.querySelector('#a4-select-all');
  selectAllBtn.addEventListener('click', () => {
    const allImportant = {};
    const checkboxes = listEl.querySelectorAll('[data-artifact-id]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
      allImportant[cb.dataset.artifactId] = !allChecked;
    });
    updateStep('a4', { importantArtifacts: allImportant });
    updateCount();
    selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
  });

  function updateCount() {
    const current = getState().steps.a4.importantArtifacts || {};
    const count = Object.values(current).filter(Boolean).length;
    const countEl = container.querySelector('.step-section__description + div');
    if (countEl) countEl.textContent = `${count} of ${artifacts.length} marked as important`;
  }

  // Done checkbox
  const doneCb = container.querySelector('#a4-done');
  doneCb.addEventListener('change', () => {
    updateStep('a4', { completed: doneCb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function cleanup() {}
