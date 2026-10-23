import { updateStep, getState } from '../../state.js';
import { escapeHtml } from '../../utils.js';
import { createCopyableBlock } from '../components/copyable-block.js';
import { createDropzone } from '../components/dropzone.js';
import { PROMPTS } from '../../data/prompts.js';
import { icon } from '../components/icon.js';

let projectsAbort = null;

export function render(container, stepState, globalState) {
  // projects.json is present in both admin and personal exports
  const adminProjects = globalState.exportData.userProjects;

  if (adminProjects && adminProjects.length > 0) {
    renderAdminMode(container, stepState, adminProjects);
  } else {
    renderManualMode(container, stepState);
  }
}

// ─── Admin mode: auto-populated projects ─────────────────────────────────────

function renderAdminMode(container, stepState, adminProjects) {
  container.innerHTML = `
    <div class="info-box info-box--success" style="margin-bottom: var(--space-lg);">
      <span class="info-box__icon">${icon('check-circle', 16)}</span>
      <span>Projects were auto-populated from your export. ${adminProjects.length} project(s) found.</span>
    </div>

    <div class="step-section">
      <div class="step-section__title">Projects from Export</div>
      <div class="step-section__description">
        Review each project's details below. Custom instructions and knowledge documents can be
        copied individually for recreation in the new account.
      </div>
      <div id="b2-admin-projects"></div>
    </div>

    <div class="step-actions">
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="b2-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">All projects reviewed</span>
      </label>
    </div>
  `;

  const projectsEl = container.querySelector('#b2-admin-projects');
  renderAdminProjects(projectsEl, adminProjects);

  // Auto-store projects in step state
  if (!stepState.projects || stepState.projects.length === 0) {
    const stepProjects = adminProjects.map(p => ({
      name: p.name,
      blueprintUploaded: true,
      knowledgeFilesReady: true
    }));
    updateStep('b2', { projects: stepProjects });
  }

  const cb = container.querySelector('#b2-done');
  cb.addEventListener('change', () => {
    updateStep('b2', { completed: cb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAdminProjects(container, projects) {
  container.innerHTML = projects.map((proj, i) => {
    const hasInstructions = proj.prompt_template && proj.prompt_template.trim().length > 0;
    const docs = proj.docs || [];

    return `
      <div class="project-card" data-index="${i}">
        <div class="project-card__header">
          <span class="project-card__name">${escapeHtml(proj.name)}</span>
          ${proj.is_private ? `<span style="font-size: var(--font-size-xs); color: var(--color-text-muted);">Private</span>` : ''}
        </div>
        <div class="project-card__body">
          ${proj.description ? `<div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-sm);">${escapeHtml(proj.description)}</div>` : ''}

          ${hasInstructions ? `
            <div style="margin-top: var(--space-sm);">
              <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs);">Custom Instructions</div>
              <div id="b2-instructions-${i}"></div>
            </div>
          ` : ''}

          ${proj.memory ? `
            <div style="margin-top: var(--space-sm);">
              <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs);">Project Memory</div>
              <div id="b2-memory-${i}"></div>
            </div>
          ` : ''}

          ${docs.length > 0 ? `
            <div style="margin-top: var(--space-sm);">
              <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs);">Knowledge Documents (${docs.length})</div>
              <div id="b2-docs-${i}"></div>
            </div>
          ` : `
            <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-xs);">No knowledge documents</div>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Now mount copyable blocks for instructions and docs
  projects.forEach((proj, i) => {
    const hasInstructions = proj.prompt_template && proj.prompt_template.trim().length > 0;
    if (hasInstructions) {
      const el = container.querySelector(`#b2-instructions-${i}`);
      if (el) {
        createCopyableBlock(el, {
          text: proj.prompt_template,
          label: 'Project instructions'
        });
      }
    }

    const memEl = proj.memory && container.querySelector(`#b2-memory-${i}`);
    if (memEl) {
      createCopyableBlock(memEl, {
        text: typeof proj.memory === 'string' ? proj.memory : JSON.stringify(proj.memory, null, 2),
        label: 'Project memory'
      });
    }

    const docs = proj.docs || [];
    const docsEl = container.querySelector(`#b2-docs-${i}`);
    if (docsEl && docs.length > 0) {
      docsEl.innerHTML = docs.map((doc, di) => `
        <div style="margin-bottom: var(--space-sm);" id="b2-doc-${i}-${di}"></div>
      `).join('');

      docs.forEach((doc, di) => {
        const docSlot = docsEl.querySelector(`#b2-doc-${i}-${di}`);
        if (docSlot) {
          createCopyableBlock(docSlot, {
            text: doc.content || '(empty)',
            label: doc.filename || `Document ${di + 1}`
          });
        }
      });
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Manual mode (unchanged) ─────────────────────────────────────────────────

function renderManualMode(container, stepState) {
  const projects = stepState.projects || [];

  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">1. For each project, send this prompt</div>
      <div class="step-section__description">
        Open a conversation <strong>within each Project</strong> in your old account and send
        the prompt below. Download the generated blueprint file.
      </div>
      <div id="b2-prompt"></div>
    </div>

    <div class="step-section">
      <div class="step-section__title">2. Add your projects</div>
      <div class="step-section__description">
        Add each project below with its blueprint file. Also gather the original knowledge files
        from each project -- you'll need to re-upload them in step B4.
      </div>

      <div id="b2-projects"></div>

      <button class="btn" id="b2-add-project" style="margin-top: var(--space-sm);">
        ${icon('plus', 14)}
        Add Project
      </button>
    </div>

    <div class="step-actions">
      <label class="checkbox">
        <input type="checkbox" class="checkbox__input" id="b2-done" ${stepState.completed ? 'checked' : ''}>
        <span class="checkbox__label">All project blueprints captured</span>
      </label>
    </div>
  `;

  createCopyableBlock(container.querySelector('#b2-prompt'), {
    text: PROMPTS.projectBlueprint,
    label: 'Prompt to send within each project'
  });

  const projectsContainer = container.querySelector('#b2-projects');
  const addBtn = container.querySelector('#b2-add-project');

  renderProjects(projectsContainer, projects);

  addBtn.addEventListener('click', () => {
    const name = prompt('Project name:');
    if (!name) return;
    const current = getState().steps.b2.projects || [];
    current.push({
      name,
      blueprintUploaded: false,
      knowledgeFilesCount: 0
    });
    updateStep('b2', { projects: current });
    renderProjects(projectsContainer, current);
  });

  const cb = container.querySelector('#b2-done');
  cb.addEventListener('change', () => {
    updateStep('b2', { completed: cb.checked });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderProjects(container, projects) {
  if (projectsAbort) projectsAbort.abort();
  projectsAbort = new AbortController();
  const { signal } = projectsAbort;

  if (projects.length === 0) {
    container.innerHTML = `
      <div style="padding: var(--space-lg); text-align: center; color: var(--color-text-muted); font-size: var(--font-size-sm);">
        No projects added yet. Click "Add Project" to start.
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map((proj, i) => `
    <div class="project-card" data-index="${i}">
      <div class="project-card__header">
        <span class="project-card__name">${escapeHtml(proj.name)}</span>
        <button class="project-card__remove" data-action="remove" data-index="${i}" title="Remove project">
          ${icon('x', 16)}
        </button>
      </div>
      <div class="project-card__body">
        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
          <label class="checkbox">
            <input type="checkbox" class="checkbox__input" data-action="blueprint" data-index="${i}"
              ${proj.blueprintUploaded ? 'checked' : ''}>
            <span class="checkbox__label">Blueprint uploaded</span>
          </label>
          <label class="checkbox">
            <input type="checkbox" class="checkbox__input" data-action="knowledge" data-index="${i}"
              ${proj.knowledgeFilesReady ? 'checked' : ''}>
            <span class="checkbox__label">Knowledge files gathered</span>
          </label>
        </div>
      </div>
    </div>
  `).join('');

  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-action="remove"]');
    if (removeBtn) {
      const idx = parseInt(removeBtn.dataset.index);
      const current = getState().steps.b2.projects || [];
      current.splice(idx, 1);
      updateStep('b2', { projects: current });
      renderProjects(container, current);
    }
  }, { signal });

  container.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-action]');
    if (!cb) return;
    const idx = parseInt(cb.dataset.index);
    const current = getState().steps.b2.projects || [];
    if (cb.dataset.action === 'blueprint') {
      current[idx].blueprintUploaded = cb.checked;
    } else if (cb.dataset.action === 'knowledge') {
      current[idx].knowledgeFilesReady = cb.checked;
    }
    updateStep('b2', { projects: current });
  }, { signal });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function cleanup() {
  if (projectsAbort) {
    projectsAbort.abort();
    projectsAbort = null;
  }
}
