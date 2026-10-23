/**
 * Formats conversations as clean markdown files.
 */

export function formatConversationAsMarkdown(conversation) {
  const lines = [
    `# ${conversation.name || 'Untitled Conversation'}`,
    '',
    `**Created:** ${formatDate(conversation.created_at)}`,
    `**Updated:** ${formatDate(conversation.updated_at)}`,
    `**Messages:** ${conversation.chat_messages.length}`,
  ];
  if (conversation.uuid) lines.push(`**Conversation ID:** ${conversation.uuid}`);
  if (conversation.project_uuid) lines.push(`**Project ID:** ${conversation.project_uuid}`);
  if (conversation.model) lines.push(`**Model:** ${conversation.model}`);
  if (conversation.is_starred) lines.push('**Starred:** yes');
  lines.push('');
  if (conversation.summary) {
    lines.push('## Summary', '', conversation.summary, '');
  }
  lines.push('---', '');

  for (const msg of conversation.chat_messages) {
    const sender = msg.sender === 'human' ? 'Human' : 'Claude';
    lines.push(`## ${sender}${msg.created_at ? ` (${formatDateTime(msg.created_at)})` : ''}`);
    lines.push('');

    let hasContent = false;

    for (const item of (msg.content || [])) {
      const rendered = formatContentItem(item);
      if (rendered) {
        lines.push(rendered, '');
        hasContent = true;
      }
    }

    // Fallback to text field
    if (!hasContent && msg.text) {
      lines.push(stripArtifactTags(msg.text));
      lines.push('');
    }

    for (const att of (msg.attachments || [])) {
      const name = att.file_name || 'attachment';
      const meta = [att.file_type, att.file_size ? `${att.file_size} bytes` : ''].filter(Boolean).join(', ');
      lines.push(`**Attachment: ${name}**${meta ? ` (${meta})` : ''}`);
      if (att.extracted_content) {
        lines.push(fence(att.extracted_content));
      }
      lines.push('');
    }

    const fileNames = (msg.files || []).map(f => f.file_name || f.file_uuid || f.uuid).filter(Boolean);
    if (fileNames.length > 0) {
      lines.push(`**Files:** ${fileNames.join(', ')} *(binary contents are not included in Claude exports)*`, '');
    }

    lines.push('');
  }

  return lines.join('\n');
}

function formatContentItem(item) {
  if (!item || typeof item !== 'object') return '';

  if (item.type === 'text') {
    if (!item.text) return '';
    let out = stripArtifactTags(item.text);
    const sources = (item.citations || [])
      .map(c => c?.url || c?.details?.url || c?.source || null)
      .filter(Boolean);
    if (sources.length > 0) {
      out += '\n\n*Sources:* ' + [...new Set(sources)].map(u => `<${u}>`).join(', ');
    }
    return out;
  }

  if (item.type === 'thinking') {
    if (!item.thinking) return '';
    return `<details>\n<summary>Thinking</summary>\n\n${fence(item.thinking)}\n\n</details>`;
  }

  if (item.type === 'tool_use') {
    const input = item.input || {};
    if (item.name === 'artifacts') {
      const command = input.command || 'create';
      if (command === 'update') {
        return [
          `**Artifact update: ${input.title || input.id || 'Untitled'}**`,
          'Replace:', fence(input.old_str || ''),
          'With:', fence(input.new_str || '')
        ].join('\n');
      }
      return `**Artifact: ${input.title || 'Untitled'}**\n` + fence((input.content || '').trim(), input.language || '');
    }
    if (item.name === 'create_file' && typeof input.file_text === 'string') {
      return `**File created: ${input.path || 'untitled'}**\n` + fence(input.file_text);
    }
    return `**Tool call: ${item.name || 'unknown'}**\n` + fence(JSON.stringify(input, null, 2), 'json');
  }

  if (item.type === 'tool_result') {
    const text = toolResultText(item.content);
    const label = `Tool result: ${item.name || 'unknown'}${item.is_error ? ' (error)' : ''}`;
    return `<details>\n<summary>${label}</summary>\n\n${fence(text)}\n\n</details>`;
  }

  if (item.type === 'injected_prompt_block') {
    if (!item.prompt) return '';
    return `<details>\n<summary>Injected context${item.injection_source ? ` (${item.injection_source})` : ''}</summary>\n\n${fence(typeof item.prompt === 'string' ? item.prompt : JSON.stringify(item.prompt, null, 2))}\n\n</details>`;
  }

  // Unknown content type: preserve it verbatim rather than dropping it
  return `**[${item.type || 'unknown'} content]**\n` + fence(JSON.stringify(item, null, 2), 'json');
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content, null, 2);
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (c?.type === 'text' && typeof c.text === 'string') return c.text;
    if (c?.title || c?.url) {
      return [c.title, c.url, c.text].filter(Boolean).join('\n');
    }
    return JSON.stringify(c, null, 2);
  }).join('\n\n');
}

function stripArtifactTags(text) {
  // Strip antArtifact tags, show as code blocks
  return text.replace(
    /<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/g,
    (_, content) => '\n' + fence(content.trim()) + '\n'
  );
}

// Fence that can't be closed early by backticks inside the content
function fence(content, lang = '') {
  const runs = String(content).match(/`{3,}/g) || [];
  const len = Math.max(3, ...runs.map(r => r.length + 1));
  const ticks = '`'.repeat(len);
  return `${ticks}${lang}\n${content}\n${ticks}`;
}

export function formatSummary(conversations, artifacts, contextDoc) {
  const totalMessages = conversations.reduce((n, c) => n + c.chat_messages.length, 0);
  const dates = conversations.map(c => c.created_at).filter(Boolean).sort();
  const dateStart = dates[0] ? formatDate(dates[0]) : 'Unknown';
  const dateEnd = dates[dates.length - 1] ? formatDate(dates[dates.length - 1]) : 'Unknown';

  const convsWithArtifacts = conversations.filter(c =>
    c.chat_messages.some(m =>
      m.content.some(ci => ci.type === 'tool_use' && ci.name === 'artifacts') ||
      (m.text && m.text.includes('<antArtifact'))
    )
  );

  const lines = [
    '# Migration Summary',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Statistics',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total conversations | ${conversations.length} |`,
    `| Total messages | ${totalMessages} |`,
    `| Conversations with artifacts | ${convsWithArtifacts.length} |`,
    `| Extracted artifacts | ${artifacts.length} |`,
    `| Date range | ${dateStart} to ${dateEnd} |`,
    '',
    '## Top Conversations (by message count)',
    '',
  ];

  const topConvs = [...conversations]
    .sort((a, b) => b.chat_messages.length - a.chat_messages.length)
    .slice(0, 10);

  for (const conv of topConvs) {
    lines.push(`- **${conv.name}** (${conv.chat_messages.length} messages, ${formatDate(conv.updated_at)})`);
  }

  lines.push('');
  lines.push('## What Transferred');
  lines.push('');
  lines.push('- Conversation text: Exact copy as markdown files (incl. thinking, tool calls/results, attachment text)');
  lines.push('- Artifact source code: Extracted as individual files, with every version');
  lines.push('- Projects: Instructions, knowledge documents and project memory (when present in the export)');
  lines.push('- Memory: Claude\'s stored memory (when present in the export)');
  lines.push('- Raw export data: Original JSON preserved under raw/');
  lines.push('- Context document: Auto-generated from keyword analysis');
  lines.push('- Memory import script: Suggested memory edits');
  lines.push('');
  lines.push('## What Did NOT Transfer');
  lines.push('');
  lines.push('- Interactive artifact rendering (must re-create in new account)');
  lines.push('- Binary uploads (images, PDFs) -- Claude exports only include extracted text');
  lines.push('- Project structure (must recreate manually from projects/)');
  lines.push('- Style preferences and feature toggles');
  lines.push('');
  lines.push('## Next Steps');
  lines.push('');
  lines.push('1. Review the context document and edit for accuracy');
  lines.push('2. Mark important artifacts for migration');
  lines.push('3. Complete Track B manual steps in the webapp');

  return lines.join('\n');
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return isNaN(d) ? isoString : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatDate(isoString) {
  if (!isoString) return 'Unknown';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return isoString;
  }
}
