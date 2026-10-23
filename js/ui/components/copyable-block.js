import { escapeHtml } from '../../utils.js';
import { icon } from './icon.js';

export function createCopyableBlock(container, options = {}) {
  const { text = '', label = 'Prompt' } = options;

  const id = 'cb-' + Math.random().toString(36).slice(2, 8);

  container.innerHTML = `
    <div class="copyable-block" id="${id}">
      <div class="copyable-block__header">
        <span class="copyable-block__label">${escapeHtml(label)}</span>
        <button class="copyable-block__copy-btn" id="${id}-btn">
          ${icon('clipboard', 14)}
          <span>Copy</span>
        </button>
      </div>
      <div class="copyable-block__content">${escapeHtml(text)}</div>
    </div>
  `;

  const btn = container.querySelector(`#${id}-btn`);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copyable-block__copy-btn--copied');
      btn.innerHTML = `${icon('check', 14)} <span>Copied</span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      setTimeout(() => {
        btn.classList.remove('copyable-block__copy-btn--copied');
        btn.innerHTML = `${icon('clipboard', 14)} <span>Copy</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }, 2000);
    } catch (e) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      btn.innerHTML = `${icon('check', 14)} <span>Copied</span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = `${icon('clipboard', 14)} <span>Copy</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }, 2000);
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

