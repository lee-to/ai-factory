import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = '<!-- aif:plan-mode:ultra -->';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function isUltraIndex(content) {
  return content.split(/\r?\n/).filter(line => line.trim() === marker).length === 1;
}

function hasCanonicalUltraHeader(content) {
  const lines = content.split(/\r?\n/);
  return lines[0] === marker
    || (/^<!-- handoff:task:[^>]+ -->$/.test(lines[0]) && lines[1] === marker);
}

function nextSequentialId(fullFiles, directoryIndexes) {
  const prefixes = [];

  for (const filename of fullFiles) {
    const match = filename.match(/^(\d{4})_.+\.md$/);
    if (match) prefixes.push(Number(match[1]));
  }

  for (const [directory, indexContent] of Object.entries(directoryIndexes)) {
    if (!isUltraIndex(indexContent)) continue;
    const match = directory.match(/^(\d{4})_.+$/);
    if (match) prefixes.push(Number(match[1]));
  }

  const max = prefixes.length === 0 ? 0 : Math.max(...prefixes);
  if (max >= 9999) throw new Error('sequential cap reached');
  return String(max + 1).padStart(4, '0');
}

function extractIndexTemplate(reference) {
  const section = reference.match(/## `index\.md` Template[\s\S]*?```markdown\n([\s\S]*?)\n```/);
  assert(section, 'ULTRA-FORMAT must contain an index.md markdown template');
  return section[1];
}

function checklistTasks(indexContent) {
  const result = new Map();
  const pattern = /^- \[[ x]\] Task (\d+):.*?\]\(([^)#]+)#[^)]+\)/gm;
  for (const match of indexContent.matchAll(pattern)) {
    result.set(Number(match[1]), match[2]);
  }
  return result;
}

function phaseRanges(indexContent) {
  const result = new Map();
  const pattern = /^\d+\. \[[^\]]+\]\(([^)]+)\) — Tasks? (\d+)(?:-(\d+))?$/gm;
  for (const match of indexContent.matchAll(pattern)) {
    const start = Number(match[2]);
    const end = Number(match[3] ?? match[2]);
    result.set(match[1], Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
  }
  return result;
}

function validateBundle(indexContent, phaseFiles) {
  const tasks = checklistTasks(indexContent);
  const ranges = phaseRanges(indexContent);
  const rangedTasks = new Set([...ranges.values()].flat());

  assert.deepEqual([...rangedTasks].sort((a, b) => a - b), [...tasks.keys()].sort((a, b) => a - b));

  const phaseTaskOwners = new Map();
  for (const [filename, content] of Object.entries(phaseFiles)) {
    for (const match of content.matchAll(/^## Task (\d+):/gm)) {
      const taskId = Number(match[1]);
      assert(!phaseTaskOwners.has(taskId), `Task ${taskId} appears in more than one phase`);
      phaseTaskOwners.set(taskId, filename);
    }
  }

  for (const [taskId, linkedFile] of tasks) {
    assert.equal(phaseTaskOwners.get(taskId), linkedFile, `Task ${taskId} details link and phase section differ`);
    assert(ranges.get(linkedFile)?.includes(taskId), `Task ${taskId} is outside its Phase Index range`);
  }
}

function filesToChange(phaseContent) {
  const section = phaseContent.match(/## Files to Change\n([\s\S]*?)(?=\n## )/);
  assert(section, 'phase file must contain Files to Change');
  return new Set([...section[1].matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]));
}

function taskBlock(phaseContent, taskId) {
  const startPattern = new RegExp(`^## Task ${taskId}:`, 'm');
  const start = phaseContent.search(startPattern);
  assert(start >= 0, `phase file must contain Task ${taskId}`);
  const remainder = phaseContent.slice(start);
  const nextTask = remainder.slice(1).search(/\n## Task \d+:/);
  return nextTask >= 0 ? remainder.slice(0, nextTask + 1) : remainder;
}

function commitGroupFiles(indexContent, phaseFiles, taskIds) {
  const tasks = checklistTasks(indexContent);
  const result = new Set();

  for (const taskId of taskIds) {
    const phaseName = tasks.get(taskId);
    assert(phaseName, `index must link Task ${taskId}`);
    const phase = phaseFiles[phaseName];
    assert(phase, `missing phase file ${phaseName}`);
    const allowedPaths = filesToChange(phase);
    const mentionedPaths = [...taskBlock(phase, taskId).matchAll(/`([^`/]+\/[^`]+|[^`]+\.[a-z0-9]+)`/gi)]
      .map(match => match[1]);
    const mapped = mentionedPaths.filter(candidate => allowedPaths.has(candidate));
    assert(mapped.length > 0, `Task ${taskId} must map to a path from Files to Change`);
    mapped.forEach(candidate => result.add(candidate));
  }

  return [...result].sort();
}

const localizedIndex = `${marker}
# Ультра-план
Режим: ultra
`;
assert.equal(isUltraIndex(localizedIndex), true);
assert.equal(isUltraIndex('# План\nРежим: ultra\n'), false);
assert.equal(isUltraIndex(`${marker}\n${marker}\n# Plan\n`), false);
console.log('pass: localized ultra discovery uses the stable marker');

assert.equal(hasCanonicalUltraHeader(`${marker}\n<!-- aif:archived:2026-07-31 -->\n# Plan\n`), true);
assert.equal(hasCanonicalUltraHeader(`<!-- handoff:task:abc -->\n${marker}\n<!-- aif:archived:2026-07-31 -->\n# Plan\n`), true);
assert.equal(hasCanonicalUltraHeader(`---\narchived: 2026-07-31\n---\n${marker}\n# Plan\n`), false);
console.log('pass: archive metadata preserves the canonical ultra header');

assert.equal(
  nextSequentialId(
    ['0002_existing.md'],
    {
      '0004_real-ultra': `${marker}\n# Ultra`,
      '9999_notes': '# Notes\nThis is not a plan.',
    },
  ),
  '0005',
);
console.log('pass: sequential allocation ignores numbered non-ultra directories');

const ultraReference = read('skills/aif-plan/references/ULTRA-FORMAT.md');
const canonicalIndex = extractIndexTemplate(ultraReference);
assert.equal(isUltraIndex(canonicalIndex), true, 'canonical ultra index must contain the marker exactly once');
validateBundle(canonicalIndex, {
  'phase-01-foundation.md': '# Phase 1\n## Task 1: One\n## Task 2: Two\n',
  'phase-02-integration.md': '# Phase 2\n## Task 3: Three\n',
});
console.log('pass: canonical Phase Index, checklist, and phase task mapping are consistent');

const commitIndex = `${marker}
## Tasks
- [ ] Task 2: Update auth ([details](phase-01-auth.md#task-2-update-auth))
- [ ] Task 3: Add API ([details](phase-02-api.md#task-3-add-api))
`;
const commitPhases = {
  'phase-01-auth.md': `# Phase 1
## Files to Change
| Path | Action | Required change |
|------|--------|-----------------|
| \`src/auth/service.ts\` | modify | Update auth |

## Task 2: Update auth
Modify \`src/auth/service.ts\`.
`,
  'phase-02-api.md': `# Phase 2
## Files to Change
| Path | Action | Required change |
|------|--------|-----------------|
| \`src/api/routes.ts\` | modify | Add route |

## Task 3: Add API
Modify \`src/api/routes.ts\`.
`,
};
assert.deepEqual(
  commitGroupFiles(commitIndex, commitPhases, [2, 3]),
  ['src/api/routes.ts', 'src/auth/service.ts'],
);
console.log('pass: commit grouping maps task ranges through phase file specifications');

const markerConsumers = [
  'skills/aif-plan/SKILL.md',
  'skills/aif-implement/SKILL.md',
  'skills/aif-improve/SKILL.md',
  'skills/aif-verify/SKILL.md',
  'skills/aif-commit/SKILL.md',
  'skills/aif-rules-check/SKILL.md',
  'skills/aif-explore/SKILL.md',
  'skills/aif-archive/SKILL.md',
  'subagents/claude/agents/plan-polisher.md',
  'subagents/claude/agents/implement-coordinator.md',
  'subagents/codex/agents/plan-coordinator.toml',
  'subagents/codex/agents/plan-polisher.toml',
  'subagents/codex/agents/implement-coordinator.toml',
];
for (const consumer of markerConsumers) {
  assert(read(consumer).includes(marker), `${consumer} must use the stable ultra marker`);
}

const commitSkill = read('skills/aif-commit/SKILL.md');
assert(commitSkill.includes('`## Files to Change` table'));
assert(commitSkill.includes('`## Task N` specifications'));
console.log('pass: producer, consumers, runtime agents, and commit mapping share the ultra contract');

const archiveSkill = read('skills/aif-archive/SKILL.md');
assert(archiveSkill.includes('<!-- aif:archived:YYYY-MM-DD -->'));
assert(archiveSkill.includes('Never prepend YAML or move the ultra marker'));

const codexPolisher = read('subagents/codex/agents/plan-polisher.toml');
assert(codexPolisher.includes('Omitting it is a contract violation'));

for (const coordinator of [
  'subagents/codex/agents/plan-coordinator.toml',
  'subagents/codex/agents/implement-coordinator.toml',
]) {
  assert(read(coordinator).includes('Handoff MCP sync is required'));
}
console.log('pass: archive and Codex Handoff contracts remain explicit');
