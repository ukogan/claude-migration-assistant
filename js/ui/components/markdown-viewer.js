import { escapeHtml } from '../../utils.js';

export function createMarkdownViewer(container, options = {}) {
  const {
    markdown = '',
    editable = false,
    onChange = null
  } = options;

  let currentMode = 'preview';
  let currentMarkdown = markdown;

  function renderTabs() {
    if (!editable) return '';
    return `
      <div class="md-tabs">
        <button class="md-tabs__tab ${currentMode === 'preview' ? 'md-tabs__tab--active' : ''}" data-mode="preview">Preview</button>
        <button class="md-tabs__tab ${currentMode === 'edit' ? 'md-tabs__tab--active' : ''}" data-mode="edit">Edit</button>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      ${renderTabs()}
      <div id="md-content"></div>
    `;

    const contentEl = container.querySelector('#md-content');

    if (currentMode === 'preview') {
      contentEl.innerHTML = `<div class="md-preview">${renderMarkdown(currentMarkdown)}</div>`;
    } else {
      contentEl.innerHTML = `<textarea class="md-editor">${escapeHtml(currentMarkdown)}</textarea>`;
      const textarea = contentEl.querySelector('.md-editor');
      textarea.addEventListener('input', () => {
        currentMarkdown = textarea.value;
        if (onChange) onChange(currentMarkdown);
      });
    }

    // Wire tab clicks
    if (editable) {
      container.querySelectorAll('.md-tabs__tab').forEach(tab => {
        tab.addEventListener('click', () => {
          currentMode = tab.dataset.mode;
          render();
        });
      });
    }
  }

  render();

  return {
    getContent() { return currentMarkdown; },
    setContent(md) {
      currentMarkdown = md;
      render();
    }
  };
}

function renderMarkdown(md) {
  // Markdown here is built from untrusted export content (conversation titles, message
  // excerpts), so only render HTML when a real sanitizer is available. Fail closed.
  if (typeof marked !== 'undefined' && marked.parse && typeof DOMPurify !== 'undefined') {
    try {
      installLinkHook();
      const raw = marked.parse(md);
      return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['style']
      });
    } catch (e) {
      console.warn('Markdown parse error:', e);
    }
  }
  // Fallback: simple whitespace preservation
  return `<pre style="white-space: pre-wrap;">${escapeHtml(md)}</pre>`;
}

let linkHookInstalled = false;
function installLinkHook() {
  if (linkHookInstalled) return;
  linkHookInstalled = true;
  // Links must never navigate this tab away (processed data lives only in memory)
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

