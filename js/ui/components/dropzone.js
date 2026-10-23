import { icon } from './icon.js';
import { escapeHtml } from '../../utils.js';

export function createDropzone(container, options = {}) {
  const {
    accept = '*',
    multiple = false,
    label = 'Drop file here or click to browse',
    hint = '',
    onFiles = () => {}
  } = options;

  const id = 'dz-' + Math.random().toString(36).slice(2, 8);

  container.innerHTML = `
    <div class="dropzone" id="${id}">
      <input type="file" id="${id}-input" accept="${accept}" ${multiple ? 'multiple' : ''} style="display:none;">
      <div class="dropzone__icon">${icon('upload', 32)}</div>
      <div class="dropzone__label">${label}</div>
      ${hint ? `<div class="dropzone__hint">${hint}</div>` : ''}
    </div>
  `;

  const zoneEl = container.querySelector(`#${id}`);
  const inputEl = container.querySelector(`#${id}-input`);

  // Click to browse
  zoneEl.addEventListener('click', (e) => {
    if (e.target === inputEl) return;
    inputEl.click();
  });

  inputEl.addEventListener('change', () => {
    const files = Array.from(inputEl.files);
    if (files.length > 0) {
      showFileInfo(zoneEl, files, inputEl);
      onFiles(files);
    }
    inputEl.value = '';
  });

  // Drag events
  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    zoneEl.classList.add('dropzone--dragover');
  });

  zoneEl.addEventListener('dragleave', () => {
    zoneEl.classList.remove('dropzone--dragover');
  });

  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    zoneEl.classList.remove('dropzone--dragover');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      showFileInfo(zoneEl, files, inputEl);
      onFiles(files);
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();

  return {
    element: zoneEl,
    reset() {
      zoneEl.classList.remove('dropzone--has-file');
      zoneEl.innerHTML = `
        <input type="file" id="${id}-input" accept="${accept}" ${multiple ? 'multiple' : ''} style="display:none;">
        <div class="dropzone__icon">${icon('upload', 32)}</div>
        <div class="dropzone__label">${label}</div>
        ${hint ? `<div class="dropzone__hint">${hint}</div>` : ''}
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  };
}

function showFileInfo(zoneEl, files, inputEl) {
  zoneEl.classList.add('dropzone--has-file');
  const names = files.map(f => f.name).join(', ');
  const size = files.reduce((s, f) => s + f.size, 0);
  const sizeStr = formatSize(size);
  zoneEl.innerHTML = `
    <div class="dropzone__file-info">
      ${icon('check-circle', 20)}
      <span>${escapeHtml(names)}</span>
      <span style="color: var(--color-text-muted);">(${sizeStr})</span>
    </div>
  `;
  // Keep the file input in the DOM so more files can be added afterwards
  zoneEl.prepend(inputEl);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
