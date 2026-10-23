import { updateStep, getExportData, setExportData } from '../../state.js';
import { icon } from '../components/icon.js';

export function render(container, stepState, globalState) {
  const currentMode = globalState.exportData.exportMode;
  const checked = stepState.completed;

  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Export Type</div>
      <div class="step-section__description">
        Choose how you exported your Claude data.
      </div>
      <div class="mode-picker">
        <button class="mode-picker__option ${currentMode === 'personal' ? 'mode-picker__option--selected' : ''}" data-mode="personal">
          <span class="mode-picker__icon">${icon('user', 24)}</span>
          <span class="mode-picker__label">Personal Export</span>
          <span class="mode-picker__desc">Manifest + ZIP files from Settings > Privacy > Export Data</span>
        </button>
        <button class="mode-picker__option ${currentMode === 'admin' ? 'mode-picker__option--selected' : ''}" data-mode="admin">
          <span class="mode-picker__icon">${icon('users', 24)}</span>
          <span class="mode-picker__label">Admin Team Export</span>
          <span class="mode-picker__desc">Multi-user folder of JSON files from team admin panel</span>
        </button>
      </div>
    </div>

    <div id="a1-instructions"></div>

    <div class="step-actions">
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="a1-done" ${checked ? 'checked' : ''}>
        <span class="checkbox__label" id="a1-label">I have my export ready</span>
      </label>
    </div>
  `;

  const instructionsEl = container.querySelector('#a1-instructions');
  const labelEl = container.querySelector('#a1-label');

  function renderInstructions(mode) {
    if (mode === 'admin') {
      labelEl.textContent = 'I have the admin export folder ready';
      instructionsEl.innerHTML = `
        <div class="step-section">
          <div class="step-section__title">Instructions</div>
          <div class="step-section__description">
            Export all team data from the Claude admin panel. This produces a folder of JSON files.
          </div>
          <ol style="padding-left: var(--space-xl); margin-bottom: var(--space-lg); line-height: 2;">
            <li>Open your <strong>Claude team admin panel</strong></li>
            <li>Go to <strong>Settings</strong></li>
            <li>Click <strong>Export All Data</strong></li>
            <li>Wait for the export to complete (may take a while)</li>
            <li>Download and unzip the export folder</li>
          </ol>

          <div class="info-box info-box--info">
            <span class="info-box__icon">${icon('info', 16)}</span>
            <span>The admin export should contain these files:
            <strong>conversations.json</strong> (required),
            <strong>users.json</strong>,
            <strong>memories.json</strong>, and
            <strong>projects.json</strong>.
            You'll select all 4 files in the next step.</span>
          </div>
        </div>
      `;
    } else {
      labelEl.textContent = 'I have my export email (manifest and/or ZIP files)';
      instructionsEl.innerHTML = `
        <div class="step-section">
          <div class="step-section__title">Instructions</div>
          <div class="step-section__description">
            Export your data from the old Claude account. Claude's native export produces a
            <strong>manifest</strong> JSON file that links to several ZIP files -- one per data category
            (conversations, projects, memories, and more).
          </div>
          <ol style="padding-left: var(--space-xl); margin-bottom: var(--space-lg); line-height: 2;">
            <li>Open your <strong>old Claude account</strong></li>
            <li>Go to <strong>Settings</strong> (gear icon, bottom left)</li>
            <li>Navigate to <strong>Privacy</strong> section</li>
            <li>Click <strong>Export Data</strong></li>
            <li>Wait for the confirmation email (minutes to hours)</li>
            <li>Download the <strong>manifest</strong> JSON from the email (you'll get links to each ZIP in the next step)</li>
          </ol>
          <a href="https://claude.ai/settings" target="_blank" rel="noopener" class="btn" style="margin-bottom: var(--space-lg);">
            ${icon('external-link', 14)}
            Open Claude Settings
          </a>
          <div class="info-box info-box--info">
            <span class="info-box__icon">${icon('info', 16)}</span>
            <span>Download links expire after 24 hours and may only work once, so download every ZIP
            completely and keep the files. The export is all-or-nothing, and deleted conversations are not included.</span>
          </div>
        </div>
      `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Render initial instructions
  renderInstructions(currentMode || 'personal');

  // Mode picker clicks
  container.querySelectorAll('.mode-picker__option').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const prevMode = getExportData('exportMode');

      // If switching mode after processing, clear admin-specific state
      if (prevMode && prevMode !== mode && globalState.exportData.conversations) {
        if (!confirm('Switching export mode will clear your processed data. Continue?')) return;
        setExportData('conversations', null);
        setExportData('conversationIndex', null);
        setExportData('artifacts', null);
        setExportData('artifactIndex', null);
        setExportData('contextDocument', null);
        setExportData('memoryScript', null);
        setExportData('adminUsers', null);
        setExportData('selectedUserUuid', null);
        setExportData('userMemory', null);
        setExportData('userProjects', null);
        setExportData('rawSource', null);
        updateStep('a2', { completed: false, processing: false, progress: 0, stats: null });
      }

      setExportData('exportMode', mode);

      // Update selected state visually
      container.querySelectorAll('.mode-picker__option').forEach(el => {
        el.classList.toggle('mode-picker__option--selected', el.dataset.mode === mode);
      });
      renderInstructions(mode);
    });
  });

  const cb = container.querySelector('#a1-done');
  cb.addEventListener('change', () => {
    // Auto-set mode to personal if none selected when checking done
    if (!getExportData('exportMode') && cb.checked) {
      setExportData('exportMode', 'personal');
      container.querySelectorAll('.mode-picker__option').forEach(el => {
        el.classList.toggle('mode-picker__option--selected', el.dataset.mode === 'personal');
      });
    }
    updateStep('a1', { completed: cb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function cleanup() {}
