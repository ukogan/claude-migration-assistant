/**
 * Extracts artifacts from conversations using two approaches:
 * 1. Structured content array (tool_use items)
 * 2. Regex on text field (fallback for older exports)
 */

import { uniqueName } from '../utils.js';

const TYPE_TO_EXT = {
  'application/vnd.ant.react': 'jsx',
  'application/vnd.ant.code': null,  // Use language field
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/x-python': 'py',
  'text/python': 'py',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'image/svg+xml': 'svg',
  'application/vnd.ant.mermaid': 'mmd',
  'application/json': 'json',
};

const LANG_TO_EXT = {
  'python': 'py',
  'javascript': 'js',
  'typescript': 'ts',
  'jsx': 'jsx',
  'tsx': 'tsx',
  'html': 'html',
  'css': 'css',
  'sql': 'sql',
  'bash': 'sh',
  'shell': 'sh',
  'ruby': 'rb',
  'go': 'go',
  'rust': 'rs',
  'java': 'java',
  'c': 'c',
  'cpp': 'cpp',
  'c++': 'cpp',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'xml': 'xml',
  'markdown': 'md',
  'swift': 'swift',
  'kotlin': 'kt',
};

export function extractArtifacts(conversations) {
  const artifactMap = new Map();

  for (const conv of conversations) {
    // Messages are already in chronological order, so commands apply in sequence
    for (const msg of conv.chat_messages) {
      if (msg.sender !== 'assistant') continue;

      // Path 1: Structured content array
      extractFromContent(msg, conv, artifactMap);

      // Path 2: Regex on text field
      extractFromText(msg, conv, artifactMap);
    }
  }

  const artifacts = Array.from(artifactMap.values());
  const usedNames = new Set();
  for (const art of artifacts) {
    art.extension = getExtension(art.type, art.language, art.path);
    art.fileName = uniqueName(buildFileName(art), usedNames);
  }
  return artifacts;
}

// Artifact identifiers are only unique within a conversation ("todo-app" is reused
// across many chats), so key by conversation + identifier.
function artifactKey(conv, id) {
  return `${conv.uuid}:${id}`;
}

function getOrCreate(artifactMap, conv, id, msg, method) {
  const key = artifactKey(conv, id);
  let art = artifactMap.get(key);
  if (!art) {
    art = {
      id: key,
      identifier: id,
      title: 'Untitled',
      type: 'text/plain',
      language: null,
      path: null,
      content: '',
      versions: [],
      incomplete: false,
      sourceConversationId: conv.uuid,
      sourceConversationName: conv.name,
      timestamp: msg.created_at,
      extractionMethod: method
    };
    artifactMap.set(key, art);
  }
  return art;
}

function recordVersion(art, msg, command) {
  art.timestamp = msg.created_at || art.timestamp;
  art.versions.push({ command, timestamp: msg.created_at, content: art.content });
}

function applyEdit(art, oldStr, newStr) {
  if (typeof oldStr === 'string' && oldStr && art.content.includes(oldStr)) {
    art.content = art.content.replace(oldStr, () => newStr ?? '');
  } else {
    // Base content is missing or diverged; keep what we have and flag it
    art.incomplete = true;
  }
}

function extractFromContent(msg, conv, artifactMap) {
  if (!msg.content) return;

  for (const item of msg.content) {
    if (item.type !== 'tool_use' || !item.input || typeof item.input !== 'object') continue;
    const input = item.input;

    if (item.name === 'artifacts') {
      const id = input.id || input.version_uuid || item.id || `gen-${Math.random().toString(36).slice(2, 10)}`;
      const art = getOrCreate(artifactMap, conv, String(id), msg, 'structured');
      if (input.title) art.title = input.title;
      if (input.type) art.type = input.type;
      if (input.language) art.language = input.language;

      const command = input.command || 'create';
      if (command === 'update') {
        applyEdit(art, input.old_str, input.new_str);
      } else if (typeof input.content === 'string') {
        art.content = input.content;
      } else {
        continue;
      }
      recordVersion(art, msg, command);
    } else if (item.name === 'create_file' && input.path && typeof input.file_text === 'string') {
      // File-creation tool (computer use / "create files" feature)
      const art = getOrCreate(artifactMap, conv, String(input.path), msg, 'file');
      art.path = String(input.path);
      art.title = art.path.split('/').pop() || 'Untitled';
      art.content = input.file_text;
      recordVersion(art, msg, 'create_file');
    } else if (item.name === 'Write' && input.file_path && typeof input.content === 'string') {
      // Claude Code style file tool
      const art = getOrCreate(artifactMap, conv, String(input.file_path), msg, 'file');
      art.path = String(input.file_path);
      art.title = art.path.split('/').pop() || 'Untitled';
      art.content = input.content;
      recordVersion(art, msg, 'write');
    } else if (item.name === 'Edit' && input.file_path) {
      const art = artifactMap.get(artifactKey(conv, String(input.file_path)));
      if (!art) continue;
      applyEdit(art, input.old_string, input.new_string);
      recordVersion(art, msg, 'edit');
    } else if (item.name === 'visualize:show_widget' && typeof input.widget_code === 'string') {
      // Inline visual widgets
      const id = item.id || `widget-${Math.random().toString(36).slice(2, 10)}`;
      const art = getOrCreate(artifactMap, conv, String(id), msg, 'widget');
      art.title = input.title || 'Widget';
      art.type = 'text/html';
      art.content = input.widget_code;
      recordVersion(art, msg, 'create');
    } else if (item.name === 'str_replace' && input.path) {
      const key = artifactKey(conv, String(input.path));
      const art = artifactMap.get(key);
      if (!art) continue; // Edit of a file we never saw created (e.g. an uploaded file)
      applyEdit(art, input.old_str, input.new_str);
      recordVersion(art, msg, 'str_replace');
    }
  }
}

function extractFromText(msg, conv, artifactMap) {
  if (!msg.text || !msg.text.includes('<antArtifact')) return;

  // Regex with lookaheads for attribute-order independence
  const regex = /<antArtifact\s+([^>]*)>([\s\S]*?)<\/antArtifact>/g;
  let match;

  while ((match = regex.exec(msg.text)) !== null) {
    const attrString = match[1];
    const content = match[2];

    const identifier = extractAttr(attrString, 'identifier');
    const type = extractAttr(attrString, 'type');
    const title = extractAttr(attrString, 'title');
    const language = extractAttr(attrString, 'language');

    if (!identifier) continue;

    // Skip if this message already produced the artifact via the structured path
    const existing = artifactMap.get(artifactKey(conv, identifier));
    if (existing && existing.versions.some(v => v.timestamp === msg.created_at)) continue;

    const art = getOrCreate(artifactMap, conv, identifier, msg, 'regex');
    if (title) art.title = title;
    if (type) art.type = type;
    if (language) art.language = language;
    art.content = content.trim();
    recordVersion(art, msg, 'create');
  }
}

function extractAttr(attrString, name) {
  const regex = new RegExp(`${name}="([^"]*)"`, 'i');
  const match = attrString.match(regex);
  return match ? match[1] : null;
}

function getExtension(type, language, path) {
  // File-tool outputs carry their own extension
  if (path) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(path);
    if (m) return m[1].toLowerCase();
  }

  // Check type mapping first
  const fromType = TYPE_TO_EXT[type];
  if (fromType) return fromType;

  // Check language field
  if (language) {
    const lang = language.toLowerCase();
    if (LANG_TO_EXT[lang]) return LANG_TO_EXT[lang];
    // Language itself might be a valid extension
    if (lang.length <= 5 && /^[a-z]+$/.test(lang)) return lang;
  }

  return 'txt';
}

function buildFileName(artifact) {
  const slug = slugify(artifact.title.replace(/\.[a-z0-9]{1,8}$/i, ''));
  const hash = slugify(artifact.identifier).slice(0, 6) || 'x';
  return `${slug}-${hash}.${artifact.extension}`;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'untitled';
}

export function buildArtifactIndex(artifacts) {
  return artifacts.map(a => ({
    id: a.id,
    title: a.title,
    type: a.type,
    language: a.language,
    fileName: a.fileName,
    sourceConversationId: a.sourceConversationId,
    sourceConversationName: a.sourceConversationName,
    extractionMethod: a.extractionMethod,
    identifier: a.identifier,
    path: a.path,
    versionCount: a.versions.length,
    incomplete: a.incomplete,
    timestamp: a.timestamp,
    contentLength: a.content.length
  }));
}
