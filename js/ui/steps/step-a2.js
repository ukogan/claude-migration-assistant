import { updateStep, setExportData, getState } from '../../state.js';
import { escapeHtml } from '../../utils.js';
import { createDropzone } from '../components/dropzone.js';
import { createProgressIndicator } from '../components/progress-indicator.js';
import { icon } from '../components/icon.js';
import { readExportZips } from '../../processing/zip-reader.js';
import { parseManifest } from '../../processing/manifest.js';
import { parseConversations, buildConversationIndex, categorizeByAge } from '../../processing/conversation-parser.js';
import { extractArtifacts, buildArtifactIndex } from '../../processing/artifact-extractor.js';
import { generateContextDocument } from '../../processing/context-generator.js';
import { generateMemoryScript } from '../../processing/memory-generator.js';
import { buildMigrationPackage, downloadBlob } from '../../processing/zip-writer.js';
import { readAdminExport, buildUserList, filterByUser, resolvePersonalData } from '../../processing/admin-reader.js';

// Module-scoped: holds raw admin data so it doesn't bloat reactive state / localStorage
let adminRawData = null;

export function render(container, stepState, globalState) {
  const mode = globalState.exportData.exportMode;

  if (mode === 'admin') {
    renderAdminMode(container, stepState, globalState);
  } else {
    renderPersonalMode(container, stepState, globalState);
  }
}

// ─── Personal mode ────────────────────────────────────────────────────────────
//
// Claude exports arrive as a manifest JSON listing one ZIP per data category, each
// with a short-lived, possibly single-use download link. Those links can't be
// fetched from this page (claude.ai sends no CORS headers and the CSP blocks all
// connections), so the user opens each link, then drops the ZIPs here. A legacy
// single-ZIP export works the same way, just without a manifest.

// Module-scoped so the selection survives navigating between steps
const pending = { manifest: null, files: new Map() };

function renderPersonalMode(container, stepState, globalState) {
  const hasData = !!globalState.exportData.conversations;

  container.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Upload Export Files</div>
      <div class="step-section__description">
        Claude's export email links to a <strong>manifest</strong> file (<code>manifest-....json</code>)
        listing several ZIP files (conversations, projects, memories, ...). Drop the manifest here to get
        a download link for each ZIP, then drop the downloaded ZIPs. Each ZIP is processed separately and the
        results are merged. Everything is processed locally in your browser -- no data leaves your machine.
      </div>
      <div id="a2-dropzone"></div>
    </div>
    <div id="a2-files"></div>
    <div id="a2-progress-area"></div>
    <div id="a2-results"></div>
  `;

  const dzContainer = container.querySelector('#a2-dropzone');
  const filesArea = container.querySelector('#a2-files');
  const progressArea = container.querySelector('#a2-progress-area');
  const resultsArea = container.querySelector('#a2-results');

  const rerender = () => renderExportFiles(filesArea, progressArea, resultsArea);

  createDropzone(dzContainer, {
    accept: '.zip,.json',
    multiple: true,
    label: 'Drop the export manifest (.json) and/or the downloaded ZIP files here',
    hint: 'or click to browse -- you can add files in several batches',
    onFiles: (files) => addExportFiles(files, progressArea).then(() => {
      rerender();
      if (allManifestFilesPresent()) processExportFiles(progressArea, resultsArea);
    })
  });

  rerender();

  if (hasData) {
    showResults(resultsArea, globalState);
  }
}

async function addExportFiles(files, progressArea) {
  for (const file of files) {
    if (/\.json$/i.test(file.name)) {
      try {
        const manifest = parseManifest(await file.text());
        pending.manifest = manifest;
        showWarnings(progressArea, manifest.warnings);
      } catch (e) {
        showWarnings(progressArea, [`${file.name}: ${e.message}`]);
      }
    } else if (/\.zip$/i.test(file.name)) {
      pending.files.set(normalizeZipName(file.name), file);
    } else {
      showWarnings(progressArea, [`${file.name}: not a .zip or manifest .json file -- ignored.`]);
    }
  }
}

// Browsers rename repeat downloads to "name (1).zip"; match them to the manifest anyway
function normalizeZipName(name) {
  return name.toLowerCase().replace(/\s*\(\d+\)(?=\.zip$)/, '');
}

function missingManifestFiles() {
  if (!pending.manifest) return [];
  return pending.manifest.files.filter(f => !pending.files.has(f.filename.toLowerCase()));
}

function allManifestFilesPresent() {
  return !!pending.manifest && missingManifestFiles().length === 0;
}

function renderExportFiles(area, progressArea, resultsArea) {
  const { manifest } = pending;
  if (!manifest && pending.files.size === 0) {
    area.innerHTML = '';
    return;
  }

  const manifestNames = new Set((manifest?.files || []).map(f => f.filename.toLowerCase()));
  const extraFiles = [...pending.files.entries()].filter(([name]) => !manifestNames.has(name));
  const missing = missingManifestFiles();
  const expired = manifest?.expiresAt && manifest.expiresAt < new Date();

  const manifestRows = (manifest?.files || []).map(f => {
    const added = pending.files.has(f.filename.toLowerCase());
    return `
      <tr>
        <td>${escapeHtml(f.category)}${f.part ? ` (part ${f.part + 1})` : ''}</td>
        <td><code>${escapeHtml(f.filename)}</code></td>
        <td>${added
          ? `<span style="color: var(--color-success);">${icon('check-circle', 14)} Added</span>`
          : `<span style="color: var(--color-text-muted);">Missing</span>`}</td>
        <td>${added ? '' : `
          <a class="btn btn--small" href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">
            ${icon('download', 12)} Download
          </a>`}</td>
      </tr>`;
  }).join('');

  const extraRows = extraFiles.map(([, file]) => `
    <tr>
      <td>${manifest ? 'not in manifest' : 'export file'}</td>
      <td><code>${escapeHtml(file.name)}</code></td>
      <td><span style="color: var(--color-success);">${icon('check-circle', 14)} Added</span></td>
      <td></td>
    </tr>`).join('');

  area.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Export Files</div>
      ${manifest ? `
        <div class="info-box ${expired ? 'info-box--warning' : 'info-box--info'}" style="margin-bottom: var(--space-md);">
          <span class="info-box__icon">${icon(expired ? 'alert-triangle' : 'info', 16)}</span>
          <span>
            ${expired
              ? 'These download links have expired (they last 24 hours). Request a new export if you have not downloaded every file yet.'
              : `Download links expire ${manifest.expiresAt ? escapeHtml(manifest.expiresAt.toLocaleString()) : 'within 24 hours'}
                 and may only work once -- download each file completely and keep it.`}
            Each link opens in a new tab using your claude.ai login.
          </span>
        </div>` : ''}
      <table class="user-picker-table">
        <thead><tr><th>Category</th><th>File</th><th>Status</th><th></th></tr></thead>
        <tbody>${manifestRows}${extraRows}</tbody>
      </table>
      <div class="step-actions" style="gap: var(--space-sm);">
        ${missing.length > 0 && !expired ? `
          <button class="btn" id="a2-open-all">${icon('external-link', 14)} Open ${missing.length} download link${missing.length === 1 ? '' : 's'}</button>` : ''}
        <button class="btn btn--primary" id="a2-process" ${pending.files.size === 0 ? 'disabled' : ''}>
          ${icon('play', 14)} Process ${pending.files.size} file${pending.files.size === 1 ? '' : 's'}
        </button>
        <button class="btn btn--ghost" id="a2-clear">Clear</button>
      </div>
      <div id="a2-popup-note"></div>
    </div>
  `;

  area.querySelector('#a2-open-all')?.addEventListener('click', () => {
    let blocked = 0;
    for (const f of missing) {
      const win = window.open(f.url, '_blank');
      if (win) win.opener = null;
      else blocked++;
    }
    if (blocked > 0) {
      area.querySelector('#a2-popup-note').innerHTML = `
        <div class="info-box info-box--warning" style="margin-top: var(--space-sm);">
          <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
          <span>Your browser blocked ${blocked} pop-up${blocked === 1 ? '' : 's'}. Allow pop-ups for this page,
          or use the individual Download buttons above.</span>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });

  area.querySelector('#a2-process').addEventListener('click', () => {
    if (missing.length > 0 && !confirm(
      `${missing.length} file(s) from the manifest have not been added (${missing.map(f => f.category).join(', ')}). ` +
      'That data will be missing from the migration package. Process anyway?'
    )) return;
    processExportFiles(progressArea, resultsArea);
  });

  area.querySelector('#a2-clear').addEventListener('click', () => {
    pending.manifest = null;
    pending.files.clear();
    renderExportFiles(area, progressArea, resultsArea);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function processExportFiles(progressArea, resultsArea) {
  const files = [...pending.files.values()];
  if (files.length === 0) return;

  const progressIndicator = createProgressIndicator(progressArea);
  resultsArea.innerHTML = '';

  try {
    const exportFiles = await readExportZips(files, (phase, pct) => {
      progressIndicator.update(phase, Math.round(pct * 0.6));
    });

    progressIndicator.update('Parsing conversations...', 65);
    await tick();
    const conversations = parseConversations(exportFiles.conversations);
    const { memory, projects } = resolvePersonalData(exportFiles);

    progressIndicator.update('Extracting artifacts...', 75);
    await tick();
    const artifacts = extractArtifacts(conversations);

    progressIndicator.update('Generating context document...', 85);
    await tick();
    const contextDocument = generateContextDocument(conversations);

    progressIndicator.update('Generating memory import script...', 92);
    await tick();
    const memoryScript = generateMemoryScript(conversations);

    setExportData('conversations', conversations);
    setExportData('conversationIndex', buildConversationIndex(conversations));
    setExportData('artifacts', artifacts);
    setExportData('artifactIndex', buildArtifactIndex(artifacts));
    setExportData('contextDocument', contextDocument);
    setExportData('memoryScript', memoryScript);
    setExportData('userMemory', memory);
    setExportData('userProjects', projects);
    setExportData('rawSource', { kind: 'zips', files });

    const stats = {
      conversationCount: conversations.length,
      messageCount: conversations.reduce((n, c) => n + c.chat_messages.length, 0),
      artifactCount: artifacts.length,
      projectCount: projects.length,
      hasMemory: !!memory,
      sourceFiles: files.map(f => f.name)
    };
    updateStep('a2', { completed: true, stats });

    progressIndicator.complete(`Processing complete (${files.length} file${files.length === 1 ? '' : 's'})`);
    showWarnings(progressArea, exportFiles.warnings);
    showResults(resultsArea, getState());

  } catch (err) {
    progressIndicator.update('Error: ' + err.message, 0);
    resultsArea.innerHTML = `
      <div class="info-box info-box--warning" style="margin-top: var(--space-md);">
        <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
        <span>${escapeHtml(err.message)}</span>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ─── Admin mode ───────────────────────────────────────────────────────────────

function renderAdminMode(container, stepState, globalState) {
  const hasData = !!globalState.exportData.conversations;
  const hasUsers = !!globalState.exportData.adminUsers;

  container.innerHTML = `
    <div id="a2-admin-upload"></div>
    <div id="a2-progress-area"></div>
    <div id="a2-user-picker"></div>
    <div id="a2-results"></div>
  `;

  const uploadArea = container.querySelector('#a2-admin-upload');
  const progressArea = container.querySelector('#a2-progress-area');
  const userPickerArea = container.querySelector('#a2-user-picker');
  const resultsArea = container.querySelector('#a2-results');

  if (hasData) {
    // Already processed a user -- show results
    showResults(resultsArea, globalState);
    // Also show a "change user" option
    uploadArea.innerHTML = `
      <div class="info-box info-box--success" style="margin-bottom: var(--space-lg);">
        <span class="info-box__icon">${icon('check-circle', 16)}</span>
        <span>Processing complete for selected user. You can re-upload admin files to start over.</span>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (hasUsers && adminRawData) {
    // Have parsed data and user list -- show user picker
    uploadArea.innerHTML = `
      <div class="info-box info-box--success" style="margin-bottom: var(--space-lg);">
        <span class="info-box__icon">${icon('check-circle', 16)}</span>
        <span>Admin export loaded. Select a team member below to process their data.</span>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    renderUserPicker(userPickerArea, progressArea, resultsArea, globalState);
    return;
  }

  // Show upload dropzone
  uploadArea.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Upload Admin Export Files</div>
      <div class="step-section__description">
        Select all JSON files from your admin export folder. At minimum,
        <strong>conversations.json</strong> is required.
        Everything is processed locally in your browser.
      </div>
      <div id="a2-admin-dz"></div>
    </div>
  `;

  createDropzone(uploadArea.querySelector('#a2-admin-dz'), {
    accept: '.json',
    multiple: true,
    label: 'Drop admin export JSON files here',
    hint: 'or click to browse (select all 4 JSON files)',
    onFiles: (files) => processAdminUpload(files, progressArea, userPickerArea, resultsArea)
  });
}

async function processAdminUpload(files, progressArea, userPickerArea, resultsArea) {
  const progressIndicator = createProgressIndicator(progressArea);

  try {
    const data = await readAdminExport(files, (phase, pct) => {
      progressIndicator.update(phase, pct);
    });

    // Store raw data in module scope (not in state)
    adminRawData = data;

    // Build user list and store in state
    const userList = buildUserList(data.users, data.conversations);
    setExportData('adminUsers', userList);

    progressIndicator.complete(`Loaded ${data.conversations.length} conversations across ${userList.length} users`);

    showWarnings(progressArea, data.warnings);

    renderUserPicker(userPickerArea, progressArea, resultsArea, getState());

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    progressIndicator.update('Error: ' + err.message, 0);
    progressArea.insertAdjacentHTML('beforeend', `
      <div class="info-box info-box--warning" style="margin-top: var(--space-md);">
        <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
        <span>${escapeHtml(err.message)}</span>
      </div>
    `);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function renderUserPicker(pickerArea, progressArea, resultsArea, state) {
  const users = state.exportData.adminUsers || [];

  pickerArea.innerHTML = `
    <div class="step-section">
      <div class="step-section__title">Select Team Member</div>
      <div class="step-section__description">
        Choose which user's data to process for migration.
      </div>
      <table class="user-picker-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Conversations</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr class="user-picker-row ${u.full_name === '[Departed User]' ? 'user-picker-row--departed' : ''}" data-uuid="${escapeHtml(u.uuid)}">
              <td>${escapeHtml(u.full_name)}</td>
              <td>${escapeHtml(u.email_address || '--')}</td>
              <td>${u.conversationCount}</td>
              <td>
                <button class="btn btn--small" data-action="select-user" data-uuid="${escapeHtml(u.uuid)}">
                  ${icon('arrow-right', 12)} Select
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  pickerArea.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="select-user"]');
    if (!btn) return;
    const uuid = btn.dataset.uuid;
    processSelectedUser(uuid, pickerArea, progressArea, resultsArea);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function processSelectedUser(userUuid, pickerArea, progressArea, resultsArea) {
  if (!adminRawData) return;

  // Disable picker while processing
  pickerArea.querySelectorAll('button').forEach(b => b.disabled = true);

  const progressIndicator = createProgressIndicator(progressArea);

  try {
    progressIndicator.update('Filtering user data...', 20);
    await tick();

    const { conversations: rawConvos, memory, projects, memoryEntry } = filterByUser(adminRawData, userUuid);

    progressIndicator.update('Parsing conversations...', 40);
    await tick();
    const conversations = parseConversations(rawConvos);

    progressIndicator.update('Extracting artifacts...', 55);
    await tick();
    const artifacts = extractArtifacts(conversations);

    progressIndicator.update('Generating context document...', 70);
    await tick();
    const contextDocument = generateContextDocument(conversations);

    progressIndicator.update('Generating memory import script...', 85);
    await tick();
    const memoryScript = generateMemoryScript(conversations);

    // Store in state
    setExportData('selectedUserUuid', userUuid);
    setExportData('conversations', conversations);
    setExportData('conversationIndex', buildConversationIndex(conversations));
    setExportData('artifacts', artifacts);
    setExportData('artifactIndex', buildArtifactIndex(artifacts));
    setExportData('contextDocument', contextDocument);
    setExportData('memoryScript', memoryScript);
    setExportData('userMemory', memory);
    setExportData('userProjects', projects);
    setExportData('rawSource', {
      kind: 'json',
      files: {
        'conversations.json': rawConvos,
        'projects.json': projects,
        'memories.json': memoryEntry ? [memoryEntry] : [],
        'user.json': adminRawData.users.find(u => u.uuid === userUuid) || { uuid: userUuid }
      }
    });

    const stats = {
      conversationCount: conversations.length,
      messageCount: conversations.reduce((n, c) => n + c.chat_messages.length, 0),
      artifactCount: artifacts.length,
      projectCount: projects.length,
      hasMemory: !!memory
    };
    updateStep('a2', { completed: true, stats });

    progressIndicator.complete('Processing complete');

    // Hide the picker
    pickerArea.innerHTML = '';

    showResults(resultsArea, getState());

  } catch (err) {
    progressIndicator.update('Error: ' + err.message, 0);
    resultsArea.innerHTML = `
      <div class="info-box info-box--warning" style="margin-top: var(--space-md);">
        <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
        <span>${escapeHtml(err.message)}</span>
      </div>
    `;
    // Re-enable picker
    pickerArea.querySelectorAll('button').forEach(b => b.disabled = false);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ─── Shared results display ───────────────────────────────────────────────────

function showResults(resultsArea, state) {
  const { conversations, artifacts, userMemory, userProjects } = state.exportData;
  if (!conversations) return;

  const { recent, archive } = categorizeByAge(conversations);
  const stats = state.steps.a2.stats || {};

  // Show selected user info if admin mode
  const isAdmin = state.exportData.exportMode === 'admin';
  const selectedUser = isAdmin && state.exportData.adminUsers
    ? state.exportData.adminUsers.find(u => u.uuid === state.exportData.selectedUserUuid)
    : null;

  const userBanner = selectedUser ? `
    <div class="info-box info-box--info" style="margin-bottom: var(--space-md);">
      <span class="info-box__icon">${icon('user', 16)}</span>
      <span>Showing data for <strong>${escapeHtml(selectedUser.full_name)}</strong>${selectedUser.email_address ? ` (${escapeHtml(selectedUser.email_address)})` : ''}</span>
    </div>
  ` : '';

  resultsArea.innerHTML = `
    ${userBanner}
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card__value">${conversations.length}</div>
        <div class="stat-card__label">Conversations</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${stats.messageCount || 0}</div>
        <div class="stat-card__label">Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${(artifacts || []).length}</div>
        <div class="stat-card__label">Artifacts</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${(userProjects || []).length}</div>
        <div class="stat-card__label">Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${recent.length}</div>
        <div class="stat-card__label">Recent (90d)</div>
      </div>
    </div>

    <div class="step-section" style="margin-top: var(--space-lg);">
      <div class="step-section__title">Output Preview</div>
      <div class="output-tree">
        <div class="output-tree__item output-tree__item--folder">
          ${icon('folder', 14)} migration-package/
        </div>
        <div class="output-tree__item output-tree__item--file" style="--depth:1">
          ${icon('file-text', 14)} summary.md
        </div>
        <div class="output-tree__item output-tree__item--folder" style="--depth:1">
          ${icon('folder', 14)} conversations/
          <span class="output-tree__count">${conversations.length} files</span>
        </div>
        <div class="output-tree__item output-tree__item--file" style="--depth:2">
          ${icon('file-text', 14)} index.json
        </div>
        <div class="output-tree__item output-tree__item--folder" style="--depth:2">
          ${icon('folder', 14)} recent/
          <span class="output-tree__count">${recent.length} files</span>
        </div>
        <div class="output-tree__item output-tree__item--folder" style="--depth:2">
          ${icon('folder', 14)} archive/
          <span class="output-tree__count">${archive.length} files</span>
        </div>
        <div class="output-tree__item output-tree__item--folder" style="--depth:1">
          ${icon('folder', 14)} artifacts/
          <span class="output-tree__count">${(artifacts || []).length} files</span>
        </div>
        ${userMemory ? `
        <div class="output-tree__item output-tree__item--folder" style="--depth:1">
          ${icon('folder', 14)} memory/
        </div>
        ` : ''}
        ${(userProjects || []).length > 0 ? `
        <div class="output-tree__item output-tree__item--folder" style="--depth:1">
          ${icon('folder', 14)} projects/
          <span class="output-tree__count">${userProjects.length} projects</span>
        </div>
        ` : ''}
        <div class="output-tree__item output-tree__item--file" style="--depth:1">
          ${icon('file-text', 14)} context-document.md
        </div>
        <div class="output-tree__item output-tree__item--file" style="--depth:1">
          ${icon('file-text', 14)} memory-import-script.txt
        </div>
        <div class="output-tree__item output-tree__item--folder" style="--depth:1">
          ${icon('folder', 14)} raw/
          <span class="output-tree__count">original export data</span>
        </div>
      </div>
    </div>

    <div class="step-actions">
      <button class="btn btn--primary" id="a2-download">
        ${icon('download', 14)}
        Download Migration Package
      </button>
    </div>
  `;

  const dlBtn = resultsArea.querySelector('#a2-download');
  dlBtn.addEventListener('click', async () => {
    dlBtn.disabled = true;
    dlBtn.textContent = 'Building ZIP...';
    try {
      const blob = await buildMigrationPackage(state);
      downloadBlob(blob, 'migration-package.zip');
    } catch (e) {
      alert('Failed to build ZIP: ' + e.message);
    }
    dlBtn.disabled = false;
    dlBtn.innerHTML = `${icon('download', 14)} Download Migration Package`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showWarnings(area, warnings) {
  if (!warnings || warnings.length === 0) return;
  const warningHtml = warnings.map(w =>
    `<div class="info-box info-box--warning" style="margin-top: var(--space-sm);">
      <span class="info-box__icon">${icon('alert-triangle', 16)}</span>
      <span>${escapeHtml(w)}</span>
    </div>`
  ).join('');
  area.insertAdjacentHTML('beforeend', warningHtml);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

export function cleanup() {
  // Don't clear adminRawData on step cleanup -- user may navigate back
}
