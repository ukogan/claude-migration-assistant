/**
 * Reads and processes admin team export files (loose JSON, not ZIP).
 * Admin exports contain: users.json, conversations.json, memories.json, projects.json
 */

const EXPECTED_FILES = {
  'conversations.json': { required: true },
  'users.json': { required: false },
  'memories.json': { required: false },
  'projects.json': { required: false }
};

/**
 * Reads a set of admin export JSON files.
 * @param {File[]} files - Array of File objects dropped/selected by user
 * @param {function} onProgress - Optional progress callback (phase, pct)
 * @returns {{ users, conversations, memories, projects, warnings }}
 */
export async function readAdminExport(files, onProgress = () => {}) {
  const result = { users: [], conversations: [], memories: [], projects: [], warnings: [] };
  const fileMap = new Map();

  for (const file of files) {
    const name = file.name.toLowerCase();
    if (Object.hasOwn(EXPECTED_FILES, name)) {
      fileMap.set(name, file);
    }
  }

  if (!fileMap.has('conversations.json')) {
    throw new Error('conversations.json is required. Make sure you dropped the admin export files.');
  }

  const missing = Object.entries(EXPECTED_FILES)
    .filter(([name, cfg]) => !cfg.required && !fileMap.has(name))
    .map(([name]) => name);
  if (missing.length > 0) {
    result.warnings.push(`Optional files not found: ${missing.join(', ')}. Some features will be unavailable.`);
  }

  // Parse each file
  let step = 0;
  const total = fileMap.size;

  for (const [name, file] of fileMap) {
    onProgress(`Reading ${name}...`, Math.round((step / total) * 60));
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse ${name}: ${e.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${name} should contain a JSON array, got ${typeof parsed}`);
    }

    const key = name.replace('.json', '');
    result[key] = parsed;
    step++;
  }

  onProgress('Validating data...', 70);

  // Validate conversations have account.uuid
  const validConvos = result.conversations.filter(c => c.account && c.account.uuid);
  if (validConvos.length === 0) {
    throw new Error('No conversations with account.uuid found. Is this an admin export?');
  }
  if (validConvos.length < result.conversations.length) {
    const dropped = result.conversations.length - validConvos.length;
    result.warnings.push(`${dropped} conversation(s) missing account.uuid were skipped.`);
    result.conversations = validConvos;
  }

  onProgress('Done', 100);
  return result;
}

/**
 * Builds a user list cross-referenced with conversation counts.
 * Creates [Departed User] entries for UUIDs found in conversations but not in users.json.
 */
export function buildUserList(users, conversations) {
  const countByUuid = new Map();
  for (const c of conversations) {
    const uuid = c.account.uuid;
    countByUuid.set(uuid, (countByUuid.get(uuid) || 0) + 1);
  }

  const knownUuids = new Set(users.map(u => u.uuid));
  const result = [];

  // Add known users
  for (const u of users) {
    result.push({
      uuid: u.uuid,
      full_name: u.full_name || 'Unknown',
      email_address: u.email_address || '',
      conversationCount: countByUuid.get(u.uuid) || 0
    });
  }

  // Add departed users (UUID in conversations but not in users.json)
  for (const uuid of countByUuid.keys()) {
    if (!knownUuids.has(uuid)) {
      result.push({
        uuid,
        full_name: '[Departed User]',
        email_address: '',
        conversationCount: countByUuid.get(uuid)
      });
    }
  }

  // Sort by conversation count descending
  result.sort((a, b) => b.conversationCount - a.conversationCount);
  return result;
}

/**
 * Filters admin export data for a specific user UUID.
 * Returns conversations, memory text, project memories, and projects for that user.
 * Projects include those the user created AND those their conversations belong to.
 */
export function filterByUser(adminData, userUuid) {
  const conversations = adminData.conversations.filter(
    c => c.account.uuid === userUuid
  );

  const memoryEntry = adminData.memories.find(
    m => m.account_uuid === userUuid
  );
  const { memory, projectMemories } = readMemoryEntry(memoryEntry);

  const usedProjectUuids = new Set(
    conversations.map(c => c.project_uuid || c.project?.uuid).filter(Boolean)
  );
  const projects = attachProjectMemories(
    adminData.projects.filter(p =>
      (p.creator && p.creator.uuid === userUuid) || usedProjectUuids.has(p.uuid)
    ),
    projectMemories
  );

  return { conversations, memory, projectMemories, projects, memoryEntry: memoryEntry || null };
}

/**
 * Resolves memory and projects from a personal (single-account) export.
 */
export function resolvePersonalData({ users = [], memories = [], projects = [] }) {
  const accountUuid = users.length === 1 ? users[0].uuid : null;
  const memoryEntry = (accountUuid && memories.find(m => m.account_uuid === accountUuid))
    || (memories.length === 1 ? memories[0] : null);
  const { memory, projectMemories } = readMemoryEntry(memoryEntry);
  return {
    memory,
    projectMemories,
    projects: attachProjectMemories(projects, projectMemories),
    memoryEntry: memoryEntry || null
  };
}

function readMemoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return { memory: null, projectMemories: {} };
  const memory = typeof entry.conversations_memory === 'string' && entry.conversations_memory.trim()
    ? entry.conversations_memory
    : null;
  const projectMemories = entry.project_memories && typeof entry.project_memories === 'object'
    ? entry.project_memories
    : {};
  return { memory, projectMemories };
}

function attachProjectMemories(projects, projectMemories) {
  return projects
    .filter(p => p && typeof p === 'object')
    .map(p => {
      const mem = Object.hasOwn(projectMemories, p.uuid) ? projectMemories[p.uuid] : null;
      return mem ? { ...p, memory: mem } : p;
    });
}
