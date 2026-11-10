#!/usr/bin/env node
// Package Markdown footprint, not observed agent reads or tokenizer usage.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const routes = {
  aif: {
    'existing-minimal': ['SETUP-CONFIG.md', 'SETUP-EXISTING.md', 'SETUP-AGENTS.md', 'SETUP-COMPLETION.md'],
    'existing-skills-mcp': ['SETUP-CONFIG.md', 'SETUP-EXISTING.md', 'SETUP-SECURITY.md', 'SETUP-MCP.md', 'SETUP-AGENTS.md', 'SETUP-COMPLETION.md'],
    'new-minimal': ['SETUP-CONFIG.md', 'SETUP-NEW.md', 'SETUP-AGENTS.md', 'SETUP-COMPLETION.md'],
    'empty-minimal': ['SETUP-CONFIG.md', 'SETUP-EMPTY.md', 'SETUP-NEW.md', 'SETUP-AGENTS.md', 'SETUP-COMPLETION.md'],
  },
  'aif-implement': {
    list: ['IMPLEMENT-LIST.md'],
    status: ['IMPLEMENT-DISCOVERY.md'],
    inline: ['IMPLEMENT-INLINE.md', 'LOGGING-GUIDE.md'],
    task: ['IMPLEMENT-COMMITS.md', 'IMPLEMENT-CONTEXT.md', 'IMPLEMENT-DISCOVERY.md', 'IMPLEMENT-TASK.md', 'LOGGING-GUIDE.md'],
    recovery: ['IMPLEMENT-COMMITS.md', 'IMPLEMENT-RECOVERY.md', 'IMPLEMENT-CONTEXT.md', 'IMPLEMENT-DISCOVERY.md', 'IMPLEMENT-TASK.md', 'LOGGING-GUIDE.md'],
    completion: ['IMPLEMENT-COMPLETION.md'],
  },
  'aif-verify': {
    normal: ['CONTEXT-GATES-AND-OWNERSHIP.md', 'GATE-RESULT-CONTRACT.md', 'VERIFY-DISCOVERY.md', 'VERIFY-AUDIT.md', 'VERIFY-CONSISTENCY.md', 'VERIFY-REPORT.md'],
    strict: ['CONTEXT-GATES-AND-OWNERSHIP.md', 'GATE-RESULT-CONTRACT.md', 'VERIFY-DISCOVERY.md', 'VERIFY-AUDIT.md', 'VERIFY-CONSISTENCY.md', 'VERIFY-REPORT.md'],
  },
  'aif-fix': {
    'plan-first': ['FIX-PLAN.md', 'FIX-INVESTIGATION.md'],
    'fix-now': ['FIX-INVESTIGATION.md', 'FIX-IMPLEMENTATION.md', 'FIX-LOGGING.md', 'FIX-COMPLETION.md', 'FIX-OUTPUT.md', 'FIX-PATCH.md'],
    'existing-plan': ['FIX-INVESTIGATION.md', 'FIX-IMPLEMENTATION.md', 'FIX-LOGGING.md', 'FIX-COMPLETION.md', 'FIX-OUTPUT.md', 'FIX-PATCH.md'],
  },
};

// Existing mandatory reference inputs on the pre-extraction baseline. Bodies
// moved by #253 are already included in its SKILL.md; never count them twice.
const baselineReferences = {
  'aif-implement': { list: ['IMPLEMENTATION-GUIDE.md'], inline: ['LOGGING-GUIDE.md'],
    task: ['LOGGING-GUIDE.md'], recovery: ['LOGGING-GUIDE.md'] },
  'aif-verify': { normal: ['CONTEXT-GATES-AND-OWNERSHIP.md', 'GATE-RESULT-CONTRACT.md'],
    strict: ['CONTEXT-GATES-AND-OWNERSHIP.md', 'GATE-RESULT-CONTRACT.md'] },
};

function size(text) {
  return { lines: text ? text.trimEnd().split(/\r?\n/).length : 0, bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex') };
}

export function measure({ baseline, directory = root } = {}) {
  const read = file => fs.readFileSync(path.join(directory, file), 'utf8');
  const baselineSha = baseline ? execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${baseline}^{commit}`],
    { cwd: directory, encoding: 'utf8', windowsHide: true }).trim() : null;
  const before = file => execFileSync('git', ['show', `${baselineSha}:${file}`],
    { cwd: directory, encoding: 'utf8', windowsHide: true });
  const entries = [];
  const selections = [];
  function footprint(skill, names, reader) {
    const files = [`skills/${skill}/SKILL.md`, ...new Set(names.map(name => `skills/${skill}/references/${name}`))];
    const sizes = files.map(file => ({ file, ...size(reader(file)) }));
    return { files: sizes, lines: sizes.reduce((sum, entry) => sum + entry.lines, 0),
      bytes: sizes.reduce((sum, entry) => sum + entry.bytes, 0) };
  }
  for (const [skill, selectionsByName] of Object.entries(routes)) {
    const file = `skills/${skill}/SKILL.md`;
    entries.push({ skill, current: size(read(file)), ...(baselineSha ? { baseline: size(before(file)) } : {}) });
    for (const [name, references] of Object.entries(selectionsByName)) {
      const current = footprint(skill, references, read);
      const prior = baselineSha ? footprint(skill, baselineReferences[skill]?.[name] ?? [], before) : null;
      selections.push({ skill, route: name, current, ...(prior ? { baseline: prior,
        saved_bytes: prior.bytes - current.bytes,
        saved_percent: Number((100 * (prior.bytes - current.bytes) / prior.bytes).toFixed(2)) } : {}) });
    }
  }
  return { schema_version: 1, baseline_sha: baselineSha,
    method: 'UTF-8 package Markdown bytes and lines; entrypoint plus the full declared route reference set, deduplicated by path. Excludes injections, project context, source code, executable helpers, tokenization and live agent behavior. A full session may combine routes; negative savings are reported unchanged.',
    entries, routes: selections };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const baselineAt = args.indexOf('--baseline');
  if (baselineAt >= 0 && !args[baselineAt + 1]) throw new Error('--baseline requires a Git revision');
  const result = measure({ baseline: baselineAt >= 0 ? args[baselineAt + 1] : undefined });
  if (args.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    console.log('| Skill / route | Current lines | Current bytes | Baseline bytes | Saved % |');
    console.log('| --- | ---: | ---: | ---: | ---: |');
    for (const entry of result.entries) console.log(`| ${entry.skill} entrypoint | ${entry.current.lines} | ${entry.current.bytes} | ${entry.baseline?.bytes ?? '—'} | — |`);
    for (const entry of result.routes) console.log(`| ${entry.skill} / ${entry.route} | ${entry.current.lines} | ${entry.current.bytes} | ${entry.baseline?.bytes ?? '—'} | ${entry.saved_percent ?? '—'} |`);
    console.log('\n' + result.method);
  }
}
