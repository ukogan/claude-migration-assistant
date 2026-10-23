/**
 * Parses the export manifest Claude now emails instead of a single ZIP.
 * The manifest lists one ZIP per data category (conversations, projects, memories, ...),
 * each with a short-lived download link.
 *
 * The manifest is untrusted input: only claude.ai export links and plain .zip
 * filenames are accepted, so a crafted manifest can't point the user elsewhere.
 */

const EXPORT_URL_RE = /^https:\/\/claude\.ai\/export\/[A-Za-z0-9-]{1,64}\/download\/[A-Za-z0-9]{1,128}$/;
const FILENAME_RE = /^[A-Za-z0-9_.-]{1,120}\.zip$/;
const MAX_FILES = 1000;
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function parseManifest(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not a valid manifest JSON file: ${e.message}`);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.data_files)) {
    throw new Error('This JSON file is not a Claude export manifest (missing "data_files").');
  }

  const warnings = [];
  const files = [];
  const seen = new Set();

  for (const entry of data.data_files.slice(0, MAX_FILES)) {
    if (!entry || typeof entry !== 'object') continue;
    const url = String(entry.export_url || '');
    const filename = String(entry.filename || '');
    if (!EXPORT_URL_RE.test(url)) {
      warnings.push(`Skipped manifest entry with an unexpected download link (${filename || 'unnamed'}).`);
      continue;
    }
    if (!FILENAME_RE.test(filename) || seen.has(filename.toLowerCase())) {
      warnings.push(`Skipped manifest entry with an invalid or duplicate filename.`);
      continue;
    }
    seen.add(filename.toLowerCase());
    files.push({
      filename,
      url,
      category: String(entry.category || filename.replace(/-\d+\.zip$/i, '')),
      part: Number.isInteger(entry.part) ? entry.part : 0
    });
  }

  if (files.length === 0) {
    throw new Error('The manifest does not list any downloadable export files.');
  }
  if (data.data_files.length > MAX_FILES) {
    warnings.push(`Manifest lists more than ${MAX_FILES} files; only the first ${MAX_FILES} are used.`);
  }

  const createdAt = typeof data.created_at === 'string' ? data.created_at : null;
  const created = createdAt ? new Date(createdAt) : null;
  const expiresAt = created && !isNaN(created) ? new Date(created.getTime() + LINK_LIFETIME_MS) : null;

  return { createdAt, expiresAt, files, warnings };
}

export function looksLikeManifest(file) {
  return /\.json$/i.test(file.name);
}
