/**
 * Builds the output migration-package ZIP from processed data.
 *
 * Every path segment derived from export data (titles, filenames, ZIP entry names)
 * goes through safePathSegment so a crafted export can't produce "../" entries
 * (zip-slip) and names are de-duplicated so nothing silently overwrites anything.
 */

import { formatConversationAsMarkdown, formatSummary } from './markdown-formatter.js';
import { categorizeByAge, buildConversationIndex } from './conversation-parser.js';
import { buildArtifactIndex } from './artifact-extractor.js';
import { safePathSegment, uniqueName } from '../utils.js';

export async function buildMigrationPackage(state) {
  if (!window.JSZip) {
    throw new Error('JSZip not loaded');
  }

  const zip = new JSZip();
  const root = zip.folder('migration-package');
  const {
    conversations, artifacts, contextDocument, memoryScript,
    userMemory, userProjects, rawSource
  } = state.exportData;

  if (!conversations || conversations.length === 0) {
    throw new Error('No conversations to package');
  }

  // 1. Summary
  const summary = formatSummary(conversations, artifacts || [], contextDocument || '');
  root.file('summary.md', summary);

  // 2. Conversations
  const convsFolder = root.folder('conversations');
  const { recent, archive } = categorizeByAge(conversations);
  const fileByConv = new Map();

  for (const [folderName, list] of [['recent', recent], ['archive', archive]]) {
    const folder = convsFolder.folder(folderName);
    const used = new Set();
    for (const conv of list) {
      const date = (conv.created_at || '').slice(0, 10);
      const base = [date, safeFileName(conv.name)].filter(Boolean).join('-');
      const fileName = uniqueName(`${base}.md`, used);
      folder.file(fileName, formatConversationAsMarkdown(conv));
      fileByConv.set(conv, `${folderName}/${fileName}`);
    }
  }

  const convIndex = buildConversationIndex(conversations).map((entry, i) => ({
    ...entry,
    file: fileByConv.get(conversations[i]) || null
  }));
  convsFolder.file('index.json', JSON.stringify(convIndex, null, 2));

  // 3. Artifacts (latest version at top level, full history under versions/)
  if (artifacts && artifacts.length > 0) {
    const artFolder = root.folder('artifacts');
    const artIndex = buildArtifactIndex(artifacts);
    artFolder.file('index.json', JSON.stringify(artIndex, null, 2));

    for (const art of artifacts) {
      artFolder.file(art.fileName, art.content);

      if (art.versions && art.versions.length > 1) {
        const dot = art.fileName.lastIndexOf('.');
        const versionDir = artFolder.folder('versions').folder(art.fileName.slice(0, dot));
        art.versions.forEach((v, i) => {
          versionDir.file(`v${i + 1}-${safeFileName(v.command)}.${art.extension}`, v.content);
        });
      }
    }
  }

  // 4. Projects
  if (userProjects && userProjects.length > 0) {
    const projFolder = root.folder('projects');
    const usedDirs = new Set();
    const projIndex = [];

    for (const proj of userProjects) {
      const dirName = uniqueName(safeFileName(proj.name), usedDirs);
      const projDir = projFolder.folder(dirName);
      const docs = Array.isArray(proj.docs) ? proj.docs : [];

      // Write project metadata as a readable markdown file
      let readme = `# ${proj.name || 'Untitled Project'}\n\n`;
      const meta = [
        proj.uuid && `- **Project ID:** ${proj.uuid}`,
        proj.created_at && `- **Created:** ${proj.created_at}`,
        proj.updated_at && `- **Updated:** ${proj.updated_at}`,
        proj.creator?.full_name && `- **Creator:** ${proj.creator.full_name}`,
        typeof proj.is_private === 'boolean' && `- **Private:** ${proj.is_private ? 'yes' : 'no'}`
      ].filter(Boolean);
      if (meta.length) readme += meta.join('\n') + '\n\n';
      if (proj.description) readme += `## Description\n\n${proj.description}\n\n`;
      if (proj.prompt_template) readme += `## Custom Instructions\n\n${proj.prompt_template}\n\n`;
      if (proj.memory) readme += `## Project Memory\n\n${asText(proj.memory)}\n\n`;
      if (docs.length) {
        readme += `## Knowledge Documents\n\n${docs.map(d => `- ${d.filename || 'untitled'}`).join('\n')}\n`;
      }
      projDir.file('README.md', readme);
      if (proj.prompt_template) projDir.file('custom-instructions.md', proj.prompt_template);
      if (proj.memory) projDir.file('project-memory.md', asText(proj.memory));

      // Write project docs
      const usedDocs = new Set();
      const knowledgeDir = docs.length ? projDir.folder('knowledge') : null;
      for (const doc of docs) {
        const docName = uniqueName(safePathSegment(doc.filename, 'document.txt', 120), usedDocs);
        knowledgeDir.file(docName, doc.content ?? '');
      }

      projIndex.push({
        uuid: proj.uuid || null,
        name: proj.name,
        description: proj.description || '',
        folder: dirName,
        docsCount: docs.length,
        hasMemory: !!proj.memory
      });
    }
    projFolder.file('index.json', JSON.stringify(projIndex, null, 2));
  }

  // 5. Memory (from memories.json, when the export contains it)
  if (userMemory) {
    root.folder('memory').file('memory.md', asText(userMemory));
  }

  // 6. Context document
  if (contextDocument) {
    root.file('context-document.md', contextDocument);
  }

  // 7. Memory import script
  if (memoryScript) {
    root.file('memory-import-script.txt', memoryScript);
  }

  // 8. Raw export data -- lossless copy of everything we were given
  await addRawSource(root.folder('raw'), rawSource);

  // Generate ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return blob;
}

async function addRawSource(rawFolder, rawSource) {
  if (!rawSource) return;

  if (rawSource.kind === 'zips' && Array.isArray(rawSource.files)) {
    // Personal export: copy every entry of every original ZIP, one folder per ZIP
    const usedDirs = new Set();
    for (const file of rawSource.files) {
      const dirName = uniqueName(safePathSegment(file.name.replace(/\.zip$/i, ''), 'export'), usedDirs);
      const zipFolder = rawFolder.folder(dirName);
      const source = await JSZip.loadAsync(file);
      for (const [path, entry] of Object.entries(source.files)) {
        if (entry.dir) continue;
        const segments = path.split(/[\\/]+/).filter(s => s && s !== '.' && s !== '..');
        if (segments.length === 0) continue;
        let folder = zipFolder;
        for (const seg of segments.slice(0, -1)) folder = folder.folder(safePathSegment(seg));
        folder.file(safePathSegment(segments[segments.length - 1], 'file', 200), await entry.async('uint8array'));
      }
    }
  } else if (rawSource.kind === 'json' && rawSource.files) {
    // Admin export: only the selected user's records (never the whole team)
    for (const [name, data] of Object.entries(rawSource.files)) {
      if (data == null) continue;
      rawFolder.file(safePathSegment(name, 'data.json'), JSON.stringify(data, null, 2));
    }
  }
}

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function downloadBlob(blob, filename) {
  if (window.saveAs) {
    saveAs(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function safeFileName(name) {
  return (name || 'untitled')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60) || 'untitled';
}
