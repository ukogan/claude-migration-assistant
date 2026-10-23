/**
 * Parses and validates conversations from Claude's export JSON.
 * Handles format variations across different export versions.
 */

export function parseConversations(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('Expected conversations to be an array');
  }
  return raw
    .map(c => parseConversation(c))
    .filter(c => c !== null)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function parseConversation(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const conv = {
    uuid: obj.uuid || obj.id || '',
    name: obj.name || obj.title || 'Untitled',
    created_at: obj.created_at || obj.createdAt || '',
    updated_at: obj.updated_at || obj.updatedAt || obj.created_at || '',
    chat_messages: [],
    summary: obj.summary || '',
    account_uuid: obj.account?.uuid || null,
    project_uuid: obj.project_uuid || obj.project?.uuid || null,
    model: obj.model || null,
    is_starred: obj.is_starred || false
  };

  const messages = obj.chat_messages || obj.messages || obj.mapping || [];

  if (Array.isArray(messages)) {
    conv.chat_messages = messages
      .map(m => parseMessage(m))
      .filter(m => m !== null)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (typeof messages === 'object') {
    // Handle mapping-style format (tree of nodes)
    conv.chat_messages = flattenMapping(messages)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  return conv;
}

function parseMessage(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const msg = {
    uuid: obj.uuid || obj.id || '',
    sender: normalizeSender(obj.sender || obj.role || obj.author?.role || ''),
    text: obj.text || '',
    content: [],
    created_at: obj.created_at || obj.createdAt || '',
    updated_at: obj.updated_at || obj.updatedAt || '',
    parent_message_uuid: obj.parent_message_uuid || null,
    attachments: Array.isArray(obj.attachments) ? obj.attachments : [],
    files: Array.isArray(obj.files) ? obj.files : (Array.isArray(obj.files_v2) ? obj.files_v2 : [])
  };

  // Skip system messages
  if (msg.sender === 'system') return null;

  // Parse content array
  if (Array.isArray(obj.content)) {
    msg.content = obj.content.map(parseContentItem).filter(Boolean);
  } else if (typeof obj.content === 'string') {
    msg.content = [{ type: 'text', text: obj.content }];
  }

  // If no content array but text exists, create one
  if (msg.content.length === 0 && msg.text) {
    msg.content = [{ type: 'text', text: msg.text }];
  }

  // If content exists but no text, build text from content
  if (!msg.text && msg.content.length > 0) {
    msg.text = msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  return msg;
}

function parseContentItem(item) {
  if (!item || typeof item !== 'object') return null;

  // Spread first so fields we don't interpret (citations, timestamps, etc.) survive
  if (item.type === 'text') {
    return { ...item, type: 'text', text: item.text || '' };
  }

  if (item.type === 'thinking') {
    return { ...item, type: 'thinking', thinking: item.thinking || item.text || '' };
  }

  if (item.type === 'tool_use') {
    return {
      ...item,
      type: 'tool_use',
      name: item.name || '',
      id: item.id || '',
      input: item.input || {}
    };
  }

  if (item.type === 'tool_result') {
    return {
      ...item,
      type: 'tool_result',
      name: item.name || '',
      content: item.content ?? [],
      is_error: item.is_error || false
    };
  }

  // Unknown type - preserve it
  return item;
}

function normalizeSender(sender) {
  const s = sender.toLowerCase();
  if (s === 'human' || s === 'user') return 'human';
  if (s === 'assistant' || s === 'bot' || s === 'claude') return 'assistant';
  if (s === 'system' || s === 'tool') return 'system';
  return s || 'human';
}

function flattenMapping(mapping) {
  const messages = [];
  for (const [, node] of Object.entries(mapping)) {
    if (node?.message) {
      const msg = parseMessage(node.message);
      if (msg) messages.push(msg);
    }
  }
  return messages;
}

// --- Index and categorization ---

export function buildConversationIndex(conversations) {
  return conversations.map(conv => ({
    uuid: conv.uuid,
    name: conv.name,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    message_count: conv.chat_messages.length,
    has_artifacts: conv.chat_messages.some(m =>
      m.content.some(c => c.type === 'tool_use' && c.name === 'artifacts') ||
      (m.text && m.text.includes('<antArtifact'))
    ),
    has_attachments: conv.chat_messages.some(m => m.attachments.length > 0 || m.files.length > 0),
    project_uuid: conv.project_uuid,
    model: conv.model,
    is_starred: conv.is_starred,
    summary: conv.summary
  }));
}

export function categorizeByAge(conversations, recentDays = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recentDays);
  const cutoffStr = cutoff.toISOString();

  const recent = [];
  const archive = [];

  for (const conv of conversations) {
    const date = conv.updated_at || conv.created_at;
    if (date >= cutoffStr) {
      recent.push(conv);
    } else {
      archive.push(conv);
    }
  }

  return { recent, archive };
}

export function getMessageText(msg) {
  if (msg.content && msg.content.length > 0) {
    const texts = msg.content
      .filter(item => item.type === 'text')
      .map(item => item.text);
    if (texts.length > 0) return texts.join('\n');
  }
  return msg.text || '';
}

export function getDateRange(conversations) {
  if (conversations.length === 0) return { start: null, end: null };
  const dates = conversations.map(c => c.created_at).filter(Boolean).sort();
  return {
    start: dates[0],
    end: dates[dates.length - 1]
  };
}
