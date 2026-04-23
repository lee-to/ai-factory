#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const SECTION_KEYS = {
  language: ['ui', 'artifacts', 'technical_terms'],
  paths: [
    'description',
    'architecture',
    'docs',
    'roadmap',
    'research',
    'rules_file',
    'plan',
    'plans',
    'fix_plan',
    'security',
    'references',
    'patches',
    'evolutions',
    'evolution',
    'specs',
    'rules',
    'qa',
  ],
  workflow: ['auto_create_dirs', 'plan_id_format', 'analyze_updates_architecture', 'architecture_updates_roadmap', 'verify_mode'],
  git: ['enabled', 'base_branch', 'create_branches', 'branch_prefix', 'skip_push_after_commit'],
  rules: ['base'],
};

const SECTION_ORDER = Object.keys(SECTION_KEYS);
const ALLOWED_PATHS = new Set(
  SECTION_ORDER.flatMap(section => SECTION_KEYS[section].map(key => `${section}.${key}`)),
);

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!flag.startsWith('--')) {
      fail(3, `Unknown argument: ${flag}`);
    }

    if (!value || value.startsWith('--')) {
      fail(3, `Missing value for ${flag}`);
    }

    if (flag === '--template') {
      args.template = value;
    } else if (flag === '--target') {
      args.target = value;
    } else if (flag === '--payload') {
      args.payload = value;
    } else {
      fail(3, `Unknown argument: ${flag}`);
    }

    index += 1;
  }

  if (!args.template || !args.target || !args.payload) {
    fail(3, 'Usage: update-config.mjs --template <path> --target <path> --payload <path>');
  }

  return args;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

function splitLines(text) {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function joinLines(lines) {
  return `${lines.join('\n')}\n`;
}

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function convertEol(text, eol) {
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}

function isBlank(line) {
  return line.trim() === '';
}

function isComment(line) {
  return /^\s*#/.test(line);
}

function isIndentedComment(line) {
  return /^  #/.test(line);
}

function matchTopLevelHeader(line) {
  if (/^\s/.test(line)) {
    return null;
  }

  return line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/);
}

function matchManagedKey(line) {
  return line.match(/^  ([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)$/);
}

function findBlockStart(lines, index) {
  let start = index;
  while (start > 0) {
    const previous = lines[start - 1];
    if (isBlank(previous)) {
      break;
    }
    if (!isComment(previous)) {
      break;
    }
    start -= 1;
  }
  return start;
}

function splitInlineComment(valuePart) {
  let quote = null;

  for (let index = 0; index < valuePart.length; index += 1) {
    const char = valuePart[index];
    const previous = index > 0 ? valuePart[index - 1] : '';

    if (quote) {
      if (char === quote && previous !== '\\') {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '#') {
      let start = index;
      while (start > 0 && /\s/.test(valuePart[start - 1])) {
        start -= 1;
      }
      return {
        value: valuePart.slice(0, start).trimEnd(),
        comment: valuePart.slice(start).replace(/\s+$/, ''),
      };
    }
  }

  return {
    value: valuePart.trimEnd(),
    comment: '',
  };
}

function isUnsafeScalar(value) {
  return (
    value === '|' ||
    value === '>' ||
    value === '|-' ||
    value === '>-' ||
    value === '|+' ||
    value === '>+' ||
    value.startsWith('{') ||
    value.startsWith('[')
  );
}

function isIncompleteScalar(value) {
  return value === '' || value === 'null' || value === 'Null' || value === 'NULL' || value === '~' || value === '""' || value === '\'\'';
}

function formatScalar(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

function parsePayload(rawText) {
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    fail(3, `Invalid payload JSON: ${error.message}`);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail(3, 'Payload must be a JSON object');
  }

  if (payload.mode !== 'create' && payload.mode !== 'merge') {
    fail(3, 'Payload mode must be "create" or "merge"');
  }

  return {
    mode: payload.mode,
    set: validateValueMap('set', payload.set ?? {}),
    fillMissing: validateValueMap('fillMissing', payload.fillMissing ?? {}),
  };
}

function validateValueMap(label, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(3, `${label} must be an object`);
  }

  const result = {};
  for (const [keyPath, entry] of Object.entries(value)) {
    if (!ALLOWED_PATHS.has(keyPath)) {
      fail(3, `Unknown managed key path: ${keyPath}`);
    }

    if (typeof entry !== 'string' && typeof entry !== 'boolean') {
      fail(3, `Unsupported value type for ${keyPath}; expected string or boolean`);
    }

    result[keyPath] = entry;
  }

  return result;
}

function collectTopLevelHeaders(lines) {
  const headers = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = matchTopLevelHeader(lines[index]);
    if (!match) {
      continue;
    }

    headers.push({
      name: match[1],
      lineIndex: index,
      valuePart: match[2].trim(),
      blockStart: findBlockStart(lines, index),
    });
  }

  for (let index = 0; index < headers.length; index += 1) {
    headers[index].blockEnd = index + 1 < headers.length ? headers[index + 1].blockStart : lines.length;
  }

  return headers;
}

function hasNestedManagedValue(lines, keyLineIndex, sectionEnd) {
  for (let index = keyLineIndex + 1; index < sectionEnd; index += 1) {
    const line = lines[index];

    if (isBlank(line) || isComment(line)) {
      continue;
    }

    if (matchManagedKey(line)) {
      return false;
    }

    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line)) {
      return false;
    }

    if (/^\s/.test(line)) {
      return true;
    }

    return false;
  }

  return false;
}

function parseSection(lines, header, sectionName) {
  const sectionEnd = header.blockEnd;
  const keys = {};

  for (let index = header.lineIndex + 1; index < sectionEnd; index += 1) {
    const match = matchManagedKey(lines[index]);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (!SECTION_KEYS[sectionName].includes(key)) {
      continue;
    }

    if (keys[key]) {
      fail(1, `Unsupported target structure: duplicate managed key ${sectionName}.${key}`);
    }

    const commentSplit = splitInlineComment(match[2]);
    const value = commentSplit.value.trim();

    if (isUnsafeScalar(value) || hasNestedManagedValue(lines, index, sectionEnd)) {
      fail(1, `Unsupported target structure for managed key ${sectionName}.${key}`);
    }

    let blockStart = index;
    while (blockStart > header.lineIndex + 1 && isIndentedComment(lines[blockStart - 1])) {
      blockStart -= 1;
    }

    let blockEnd = index + 1;
    while (blockEnd < sectionEnd && isBlank(lines[blockEnd])) {
      blockEnd += 1;
    }

    keys[key] = {
      section: sectionName,
      key,
      lineIndex: index,
      blockStart,
      blockEnd,
      value,
      comment: commentSplit.comment,
      incomplete: isIncompleteScalar(value),
    };
  }

  return {
    name: sectionName,
    start: header.lineIndex,
    blockStart: header.blockStart,
    end: sectionEnd,
    keys,
  };
}

function parseDocument(rawText) {
  const lines = splitLines(rawText);
  const headers = collectTopLevelHeaders(lines);
  const sections = {};

  for (const header of headers) {
    if (!SECTION_ORDER.includes(header.name)) {
      continue;
    }

    if (sections[header.name]) {
      fail(1, `Unsupported target structure: duplicate managed section ${header.name}`);
    }

    if (header.valuePart !== '' && !header.valuePart.startsWith('#')) {
      fail(1, `Unsupported target structure for managed section ${header.name}`);
    }

    sections[header.name] = parseSection(lines, header, header.name);
  }

  return {
    lines,
    headers,
    sections,
  };
}

function parseTemplate(rawText) {
  const document = parseDocument(rawText);
  const sections = {};

  for (const sectionName of SECTION_ORDER) {
    const section = document.sections[sectionName];
    if (!section) {
      fail(3, `Template is missing managed section ${sectionName}`);
    }

    const keyEntries = {};
    for (const key of SECTION_KEYS[sectionName]) {
      const entry = section.keys[key];
      if (!entry) {
        fail(3, `Template is missing managed key ${sectionName}.${key}`);
      }

      keyEntries[key] = {
        ...entry,
        relativeLineIndex: entry.lineIndex - entry.blockStart,
        blockLines: document.lines.slice(entry.blockStart, entry.blockEnd),
      };
    }

    sections[sectionName] = {
      ...section,
      blockLines: document.lines.slice(section.blockStart, section.end),
      keys: keyEntries,
    };
  }

  return {
    lines: document.lines,
    sections,
  };
}

function buildKeyBlock(templateMeta, keyPath, value) {
  const [sectionName, keyName] = keyPath.split('.');
  const templateKey = templateMeta.sections[sectionName].keys[keyName];
  const blockLines = [...templateKey.blockLines];
  blockLines[templateKey.relativeLineIndex] = `  ${keyName}: ${formatScalar(value)}`;
  return blockLines;
}

function buildSectionBlock(templateMeta, sectionName, overrides) {
  const section = templateMeta.sections[sectionName];
  const blockLines = [...section.blockLines];

  for (const [keyPath, value] of Object.entries(overrides)) {
    const [, keyName] = keyPath.split('.');
    const templateKey = section.keys[keyName];
    blockLines[templateKey.lineIndex - section.blockStart] = `  ${keyName}: ${formatScalar(value)}`;
  }

  return blockLines;
}

function normalizeInsertedBlock(blockLines, previousLine, nextLine) {
  const normalized = [...blockLines];

  while (
    normalized.length > 0 &&
    isBlank(normalized[0]) &&
    (!previousLine || isBlank(previousLine))
  ) {
    normalized.shift();
  }

  while (
    normalized.length > 0 &&
    isBlank(normalized[normalized.length - 1]) &&
    (!nextLine || isBlank(nextLine))
  ) {
    normalized.pop();
  }

  if (
    normalized.length > 0 &&
    previousLine &&
    !isBlank(previousLine) &&
    !isBlank(normalized[0])
  ) {
    normalized.unshift('');
  }

  if (
    normalized.length > 0 &&
    nextLine &&
    !isBlank(nextLine) &&
    !isBlank(normalized[normalized.length - 1])
  ) {
    normalized.push('');
  }

  return normalized;
}

function insertLines(lines, index, blockLines) {
  const previousLine = index > 0 ? lines[index - 1] : null;
  const nextLine = index < lines.length ? lines[index] : null;
  const normalizedBlock = normalizeInsertedBlock(blockLines, previousLine, nextLine);
  lines.splice(index, 0, ...normalizedBlock);
}

function updateExistingKeyLine(lines, entry, value) {
  const commentSuffix = entry.comment ? entry.comment : '';
  lines[entry.lineIndex] = `  ${entry.key}: ${formatScalar(value)}${commentSuffix}`;
}

function findSectionInsertIndex(parsed, sectionName) {
  const targetIndex = SECTION_ORDER.indexOf(sectionName);

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const previous = parsed.sections[SECTION_ORDER[index]];
    if (previous) {
      return previous.end;
    }
  }

  for (let index = targetIndex + 1; index < SECTION_ORDER.length; index += 1) {
    const next = parsed.sections[SECTION_ORDER[index]];
    if (next) {
      return next.blockStart;
    }
  }

  return parsed.lines.length;
}

function findInitialSectionInsertIndex(section, lines) {
  let index = section.start + 1;
  while (index < section.end && (isIndentedComment(lines[index]) || isBlank(lines[index]))) {
    index += 1;
  }
  return index;
}

function findKeyInsertIndex(parsed, templateMeta, sectionName, keyName) {
  const section = parsed.sections[sectionName];
  const keyOrder = SECTION_KEYS[sectionName];
  const targetIndex = keyOrder.indexOf(keyName);

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const previousKey = section.keys[keyOrder[index]];
    if (previousKey) {
      return previousKey.blockEnd;
    }
  }

  for (let index = targetIndex + 1; index < keyOrder.length; index += 1) {
    const nextKey = section.keys[keyOrder[index]];
    if (nextKey) {
      return nextKey.blockStart;
    }
  }

  return findInitialSectionInsertIndex(section, parsed.lines) || templateMeta.sections[sectionName].start + 1;
}

function ensureSection(parsed, templateMeta, sectionName, payload) {
  if (parsed.sections[sectionName]) {
    return parsed;
  }

  const targetedOverrides = {};
  for (const keyName of SECTION_KEYS[sectionName]) {
    const keyPath = `${sectionName}.${keyName}`;
    if (Object.hasOwn(payload.set, keyPath)) {
      targetedOverrides[keyPath] = payload.set[keyPath];
    } else if (Object.hasOwn(payload.fillMissing, keyPath)) {
      targetedOverrides[keyPath] = payload.fillMissing[keyPath];
    }
  }

  if (Object.keys(targetedOverrides).length === 0) {
    return parsed;
  }

  const insertIndex = findSectionInsertIndex(parsed, sectionName);
  const sectionBlock = buildSectionBlock(templateMeta, sectionName, targetedOverrides);
  insertLines(parsed.lines, insertIndex, sectionBlock);
  return parseDocument(joinLines(parsed.lines));
}

function upsertManagedKey(parsed, templateMeta, keyPath, value, mode) {
  const [sectionName, keyName] = keyPath.split('.');
  const section = parsed.sections[sectionName];
  const entry = section.keys[keyName];

  if (entry) {
    if (mode === 'fillMissing' && !entry.incomplete) {
      return parsed;
    }

    updateExistingKeyLine(parsed.lines, entry, value);
    return parseDocument(joinLines(parsed.lines));
  }

  const insertIndex = findKeyInsertIndex(parsed, templateMeta, sectionName, keyName);
  const blockLines = buildKeyBlock(templateMeta, keyPath, value);
  insertLines(parsed.lines, insertIndex, blockLines);
  return parseDocument(joinLines(parsed.lines));
}

function applyUpdates(baseText, templateMeta, payload) {
  let parsed = parseDocument(baseText);

  for (const sectionName of SECTION_ORDER) {
    parsed = ensureSection(parsed, templateMeta, sectionName, payload);
  }

  for (const sectionName of SECTION_ORDER) {
    for (const keyName of SECTION_KEYS[sectionName]) {
      const keyPath = `${sectionName}.${keyName}`;

      if (Object.hasOwn(payload.set, keyPath)) {
        parsed = upsertManagedKey(parsed, templateMeta, keyPath, payload.set[keyPath], 'set');
      }

      if (Object.hasOwn(payload.fillMissing, keyPath)) {
        parsed = upsertManagedKey(parsed, templateMeta, keyPath, payload.fillMissing[keyPath], 'fillMissing');
      }
    }
  }

  return joinLines(parsed.lines);
}

async function readText(filePath, label) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    fail(2, `Unable to read ${label}: ${error.message}`);
  }
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    fail(2, `Unable to read target: ${error.message}`);
  }
}

async function writeIfChanged(targetPath, nextTextLf, existingRawText, eol) {
  const currentLf = existingRawText === null ? null : normalizeNewlines(existingRawText);

  if (currentLf === nextTextLf) {
    return false;
  }

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, convertEol(nextTextLf, eol), 'utf8');
  } catch (error) {
    fail(2, `Unable to write target: ${error.message}`);
  }

  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const templateRawText = await readText(args.template, 'template');
  const payloadRawText = await readText(args.payload, 'payload');
  const payload = parsePayload(payloadRawText);
  const templateMeta = parseTemplate(templateRawText);

  if (payload.mode === 'create') {
    const existingRawText = await readOptionalText(args.target);
    const targetEol = existingRawText ? detectEol(existingRawText) : detectEol(templateRawText);
    const nextTextLf = applyUpdates(joinLines(templateMeta.lines), templateMeta, {
      mode: 'create',
      set: payload.set,
      fillMissing: {},
    });
    await writeIfChanged(args.target, nextTextLf, existingRawText, targetEol);
    return;
  }

  const existingRawText = await readOptionalText(args.target);
  if (existingRawText === null) {
    fail(2, `Unable to read target: ${args.target} does not exist`);
  }

  const targetEol = detectEol(existingRawText);
  const nextTextLf = applyUpdates(existingRawText, templateMeta, payload);
  await writeIfChanged(args.target, nextTextLf, existingRawText, targetEol);
}

await main();
