/**
 * Reads Claude export ZIPs. Claude now exports one ZIP per data category
 * (conversations-000.zip, projects-000.zip, memories-000.zip, ...); older exports
 * are a single ZIP with everything. Both are handled the same way: each ZIP is
 * read on its own, every JSON file in it is classified, and the results merged.
 */

const KNOWN_FILES = ['conversations', 'users', 'projects', 'memories'];

function emptyResult() {
  return { conversations: [], users: [], projects: [], memories: [], warnings: [] };
}

/**
 * Reads several export ZIPs one at a time and merges them.
 * @param {File[]} files
 * @param {function} onProgress - (phase, pct)
 */
export async function readExportZips(files, onProgress = () => {}) {
  if (!window.JSZip) {
    throw new Error('JSZip not loaded. Check CDN link.');
  }

  const merged = emptyResult();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const base = Math.round((i / files.length) * 100);
    const span = 100 / files.length;
    onProgress(`Reading ${file.name} (${i + 1} of ${files.length})...`, base);

    let part;
    try {
      part = await readExportZip(file, (phase, pct) =>
        onProgress(`${file.name}: ${phase}`, base + Math.round((pct / 100) * span)));
    } catch (e) {
      merged.warnings.push(`${file.name}: ${e.message}`);
      continue;
    }

    mergeByUuid(merged.conversations, part.conversations, (a, b) =>
      (b.chat_messages?.length || 0) > (a.chat_messages?.length || 0));
    mergeByUuid(merged.users, part.users);
    mergeByUuid(merged.projects, part.projects, (a, b) =>
      (b.docs?.length || 0) > (a.docs?.length || 0));
    merged.memories.push(...part.memories);
    merged.warnings.push(...part.warnings.map(w => `${file.name}: ${w}`));
  }

  if (merged.conversations.length === 0) {
    throw new Error(
      'No conversations were found in the files provided. ' +
      'Make sure you added the conversations ZIP from your Claude data export.'
    );
  }
  for (const key of ['projects', 'memories']) {
    if (merged[key].length === 0) merged.warnings.push(`No ${key} found in the export files provided.`);
  }

  onProgress('Done reading export files.', 100);
  return merged;
}

/**
 * Reads a single export ZIP. Does not require conversations -- a category ZIP
 * may hold only projects or memories.
 */
export async function readExportZip(file, onProgress = () => {}) {
  onProgress('Opening ZIP...', 5);

  const zip = await JSZip.loadAsync(file);
  const result = emptyResult();
  const jsonEntries = Object.entries(zip.files)
    .filter(([path, entry]) => !entry.dir && /\.json$/i.test(path));

  let step = 0;
  let recognized = 0;
  for (const [path, entry] of jsonEntries) {
    step++;
    const name = path.split('/').pop();
    onProgress(`Parsing ${name}...`, 10 + Math.round((step / jsonEntries.length) * 85));

    let parsed;
    try {
      parsed = JSON.parse(await entry.async('string'));
    } catch (e) {
      result.warnings.push(`Failed to parse ${name}: ${e.message}`);
      continue;
    }
    // Some files hold a single object rather than an array
    const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);

    const key = classify(name, items);
    if (!key) continue; // Unrecognized data (feedback, frames, ...) is preserved in raw/ only
    result[key].push(...items.filter(it => it && typeof it === 'object'));
    recognized++;
  }

  if (recognized === 0) {
    result.warnings.push('No conversation, project, or memory data recognized (contents kept in raw/).');
  }

  onProgress('Done.', 100);
  return result;
}

// Known filenames win; otherwise sniff the shape of the first object
// (e.g. design_chats.json holds conversation-shaped records).
function classify(fileName, items) {
  const key = fileName.toLowerCase().replace(/\.json$/, '');
  if (KNOWN_FILES.includes(key)) return key;

  const sample = items.find(it => it && typeof it === 'object');
  if (!sample) return null;
  if (Array.isArray(sample.chat_messages)) return 'conversations';
  if ('conversations_memory' in sample || 'project_memories' in sample) return 'memories';
  if ('prompt_template' in sample || (Array.isArray(sample.docs) && 'name' in sample)) return 'projects';
  return null;
}

function mergeByUuid(target, incoming, preferIncoming = () => false) {
  const index = new Map(target.map((item, i) => [item.uuid, i]));
  for (const item of incoming) {
    if (!item.uuid || !index.has(item.uuid)) {
      if (item.uuid) index.set(item.uuid, target.length);
      target.push(item);
    } else if (preferIncoming(target[index.get(item.uuid)], item)) {
      target[index.get(item.uuid)] = item;
    }
  }
}

/**
 * List all files in a ZIP for debugging.
 */
export async function listZipContents(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      entries.push({
        path,
        size: entry._data ? entry._data.uncompressedSize : 0
      });
    }
  }
  return entries;
}
