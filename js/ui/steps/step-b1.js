import { updateStep } from '../../state.js';
import { createCopyableBlock } from '../components/copyable-block.js';
import { createDropzone } from '../components/dropzone.js';
import { PROMPTS } from '../../data/prompts.js';
import { icon } from '../components/icon.js';

export function render(container, stepState, globalState) {
  // memories.json is present in both admin and newer personal exports
  const adminMemory = globalState.exportData.userMemory;

  if (adminMemory) {
    renderAdminMode(container, stepState, adminMemory);
  } else {
    renderManualMode(container, stepState);
  }
}

function renderAdminMode(container, stepState, memoryText) {
  container.innerHTML = `
    <div class="info-box info-box--success" style="margin-bottom: var(--space-lg);">
      <span class="info-box__icon">${icon('check-circle', 16)}</span>
      <span>Memory was auto-populated from your export (memories.json). The manual prompt is optional -- use it to also capture memory edits.</span>
    </div>

    <div class="step-section">
      <div class="step-section__title">Claude's Memory for This User</div>
      <div class="step-section__description">
        This is what Claude remembered about this user. Review it and use the copy or download
        button to save it for the new account.
      </div>
      <div id="b1-memory-block"></div>
    </div>

    <div class="step-actions" style="gap: var(--space-sm);">
      <button class="btn" id="b1-download-mem">
        ${icon('download', 14)}
        Download as memory-capture.md
      </button>
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="b1-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">Memory reviewed</span>
      </label>
    </div>
  `;

  createCopyableBlock(container.querySelector('#b1-memory-block'), {
    text: typeof memoryText === 'string' ? memoryText : JSON.stringify(memoryText, null, 2),
    label: 'Memory content'
  });

  // Auto-set the memory capture content in step state
  if (!stepState.memoryCaptureContent) {
    updateStep('b1', { memoryCaptureUploaded: true, memoryCaptureContent: memoryText });
  }

  // Download button
  container.querySelector('#b1-download-mem').addEventListener('click', () => {
    const blob = new Blob([memoryText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memory-capture.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  const cb = container.querySelector('#b1-done');
  cb.addEventListener('change', () => {
    updateStep('b1', { completed: cb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderManualMode(container, stepState) {
  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">1. Send this prompt in your old account</div>
      <div class="step-section__description">
        Open a new conversation in your <strong>old Claude account</strong> and send the prompt below.
        Claude will generate a comprehensive memory dump.
      </div>
      <div id="b1-prompt"></div>
    </div>

    <div class="step-section">
      <div class="step-section__title">2. Download and upload the result</div>
      <div class="step-section__description">
        Download the <code>memory-capture.md</code> file that Claude generates, then upload it here
        for reference during later steps.
      </div>
      <div id="b1-upload"></div>
    </div>

    <div class="info-box info-box--info" style="margin-top: var(--space-md);">
      <span class="info-box__icon">${icon('info', 16)}</span>
      <span>This captures Claude's synthesized memory -- information that does NOT appear
      in the conversation export. It's critical for a complete migration.</span>
    </div>

    <div class="step-actions">
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="b1-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">Memory captured and uploaded</span>
      </label>
    </div>
  `;

  createCopyableBlock(container.querySelector('#b1-prompt'), {
    text: PROMPTS.memoryCapture,
    label: 'Prompt to send in old account'
  });

  createDropzone(container.querySelector('#b1-upload'), {
    accept: '.md,.txt,.markdown',
    label: 'Upload memory-capture.md',
    hint: 'Accepts .md or .txt files',
    onFiles: (files) => {
      updateStep('b1', { memoryCaptureUploaded: true });
      const reader = new FileReader();
      reader.onload = () => {
        updateStep('b1', { memoryCaptureContent: reader.result });
      };
      reader.readAsText(files[0]);
    }
  });

  const cb = container.querySelector('#b1-done');
  cb.addEventListener('change', () => {
    updateStep('b1', { completed: cb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function cleanup() {}
