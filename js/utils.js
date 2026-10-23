export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Turns untrusted text (titles, filenames from the export) into a single safe
 * path segment for the output ZIP: no separators, no "..", no control chars.
 */
export function safePathSegment(name, fallback = 'untitled', maxLength = 80) {
  const cleaned = String(name ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.]+$/g, '')
    .slice(0, maxLength)
    .trim();
  return cleaned || fallback;
}

/**
 * Returns a filename unique within `used` (a Set), appending -2, -3... before the extension.
 */
export function uniqueName(name, used) {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (used.has(`${base}-${i}${ext}`.toLowerCase())) i++;
  const unique = `${base}-${i}${ext}`;
  used.add(unique.toLowerCase());
  return unique;
}
