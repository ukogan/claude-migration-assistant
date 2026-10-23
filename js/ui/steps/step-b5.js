import { updateStep, getState } from '../../state.js';
import { escapeHtml } from '../../utils.js';
import { icon } from '../components/icon.js';

export function render(container, stepState, globalState) {
  const allArtifacts = globalState.exportData.artifacts || [];
  const importantMap = globalState.steps.a4.importantArtifacts || {};
  const importantArtifacts = allArtifacts.filter(a => importantMap[a.id]);
  const uploaded = stepState.artifactsUploaded || {};

  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Upload Important Artifacts</div>
      <div class="step-section__description">
        These are the artifacts you marked as important in step A4. Upload them to the relevant
        Project's knowledge base in your new account, or reference them in conversation as needed.
      </div>

      <div class="info-box info-box--info" style="margin-bottom: var(--space-md);">
        <span class="info-box__icon">${icon('info', 16)}</span>
        <span>Artifacts will exist as static files. They will not be interactive or rendered until
        re-created in a new conversation.</span>
      </div>
    </div>

    <div id="b5-list"></div>

    <div class="step-actions">
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="b5-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">Artifacts uploaded</span>
      </label>
    </div>
  `;

  const listEl = container.querySelector('#b5-list');

  if (importantArtifacts.length === 0) {
    listEl.innerHTML = `
      <div style="padding: var(--space-lg); text-align: center; color: var(--color-text-muted); font-size: var(--font-size-sm);">
        ${allArtifacts.length === 0
          ? 'No artifacts available. Complete step A2 first.'
          : 'No artifacts marked as important. Go to step A4 to mark artifacts, or skip this step.'}
      </div>
    `;
  } else {
    listEl.innerHTML = `
      <div style="border: 1px solid var(--color-border); border-radius: var(--border-radius); overflow: hidden;">
        ${importantArtifacts.map(art => `
          <div class="artifact-list-item">
            <label class="checkbox" style="padding: 0;">
              <input type="checkbox" class="checkbox__input" data-artifact="${escapeHtml(art.id)}"
                ${uploaded[art.id] ? 'checked' : ''}>
            </label>
            <span class="artifact-list-item__title">${escapeHtml(art.title)}</span>
            <span class="artifact-list-item__type">${escapeHtml(art.extension)}</span>
            <span class="artifact-list-item__meta">${escapeHtml(art.sourceConversationName)}</span>
          </div>
        `).join('')}
      </div>
      <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-sm);">
        ${Object.values(uploaded).filter(Boolean).length} of ${importantArtifacts.length} uploaded
      </div>
    `;

    listEl.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-artifact]');
      if (!cb) return;
      const current = getState().steps.b5.artifactsUploaded || {};
      current[cb.dataset.artifact] = cb.checked;
      updateStep('b5', { artifactsUploaded: current });
    });
  }

  const doneCb = container.querySelector('#b5-done');
  doneCb.addEventListener('change', () => {
    updateStep('b5', { completed: doneCb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function cleanup() {}
