import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { readTextFile } from '../../utils/fs.js';

type RelationField = 'depends_on' | 'affects' | 'implements' | 'verifies' | 'documents' | 'supersedes';

interface ArtifactRecord {
  id: string;
  file: string;
  type?: string;
  status?: string;
  owners: string[];
  relations: Record<RelationField, string[]>;
}

interface Finding {
  level: 'fail' | 'warn';
  file?: string;
  id?: string;
  message: string;
}

interface AuditOptions {
  json?: boolean;
  strict?: boolean;
}

interface CollectResult {
  files: string[];
  findings: Finding[];
}

const RELATION_FIELDS: RelationField[] = [
  'depends_on',
  'affects',
  'implements',
  'verifies',
  'documents',
  'supersedes',
];

const DEFAULT_TARGETS = ['.ai-factory', 'docs', 'README.md', 'AGENTS.md'];
const DEFAULT_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'docs-html',
  'evolution',
  'evolutions',
  'qa',
]);

function emptyRelations(): Record<RelationField, string[]> {
  return {
    depends_on: [],
    affects: [],
    implements: [],
    verifies: [],
    documents: [],
    supersedes: [],
  };
}

function normalizeRelPath(projectDir: string, filePath: string): string {
  return path.relative(projectDir, filePath).replaceAll('\\', '/');
}

function isInsideProject(canonicalProjectDir: string, candidate: string): boolean {
  const relative = path.relative(canonicalProjectDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stripInlineComment(value: string): string {
  const hashIndex = value.indexOf(' #');
  return hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value.trim();
}

function stripQuotes(value: string): string {
  const trimmed = stripInlineComment(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseArrayValue(value: string): string[] {
  const trimmed = stripInlineComment(value).trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(item => stripQuotes(item))
      .filter(Boolean);
  }

  return [stripQuotes(trimmed)].filter(Boolean);
}

function parseFrontmatter(content: string): Record<string, string[]> | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return null;
  }

  const endMatch = content.match(/\r?\n---\r?\n/);
  if (!endMatch || typeof endMatch.index !== 'number') {
    return null;
  }

  const block = content.slice(content.indexOf('\n') + 1, endMatch.index);
  const fields: Record<string, string[]> = {};
  let currentListKey: string | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentListKey) {
      fields[currentListKey] = [...(fields[currentListKey] ?? []), ...parseArrayValue(listMatch[1])];
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!fieldMatch) {
      currentListKey = null;
      continue;
    }

    const key = fieldMatch[1];
    const value = fieldMatch[2] ?? '';
    currentListKey = value.trim() === '' ? key : null;
    fields[key] = parseArrayValue(value);
  }

  return fields;
}

function first(fields: Record<string, string[]>, key: string): string | undefined {
  return fields[key]?.[0];
}

function getOwners(fields: Record<string, string[]>): string[] {
  return [...(fields.owners ?? []), ...(fields.owner ?? [])].filter(Boolean);
}

function toArtifact(projectDir: string, absPath: string, fields: Record<string, string[]>): ArtifactRecord | null {
  const id = first(fields, 'id');
  if (!id) return null;

  const relations = emptyRelations();
  for (const field of RELATION_FIELDS) {
    relations[field] = fields[field] ?? [];
  }

  return {
    id,
    file: normalizeRelPath(projectDir, absPath),
    type: first(fields, 'type'),
    status: first(fields, 'status'),
    owners: getOwners(fields),
    relations,
  };
}

function targetFindingLevel(isExplicit: boolean): 'fail' | 'warn' {
  return isExplicit ? 'fail' : 'warn';
}

async function realpathOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

async function collectMarkdownFiles(projectDir: string, targets: string[], isExplicit: boolean): Promise<CollectResult> {
  const canonicalProjectDir = await fs.realpath(projectDir);
  const files = new Set<string>();
  const findings: Finding[] = [];
  const visitedDirectories = new Set<string>();

  async function walk(currentPath: string, requestedPath: string, isRootTarget = false): Promise<void> {
    const canonicalPath = await realpathOrNull(currentPath);
    if (!canonicalPath) {
      findings.push({
        level: targetFindingLevel(isExplicit),
        file: requestedPath,
        message: `Requested audit target does not exist: ${requestedPath}`,
      });
      return;
    }

    if (!isInsideProject(canonicalProjectDir, canonicalPath)) {
      findings.push({
        level: targetFindingLevel(isExplicit),
        file: requestedPath,
        message: `Requested audit target is outside the project boundary: ${requestedPath}`,
      });
      return;
    }

    const stats = await fs.lstat(currentPath);
    const statTarget = stats.isSymbolicLink() ? canonicalPath : currentPath;
    const targetStats = stats.isSymbolicLink() ? await fs.stat(canonicalPath) : stats;

    if (targetStats.isFile()) {
      if (statTarget.endsWith('.md')) {
        files.add(statTarget);
      }
      return;
    }

    if (!targetStats.isDirectory()) {
      return;
    }

    if (visitedDirectories.has(canonicalPath)) {
      return;
    }
    visitedDirectories.add(canonicalPath);

    const directoryName = path.basename(currentPath);
    if (!isRootTarget && DEFAULT_SKIP_DIRS.has(directoryName)) {
      return;
    }

    const entries = await fs.readdir(canonicalPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(canonicalPath, entry.name);
      const entryRequestedPath = path.join(requestedPath, entry.name).replaceAll('\\', '/');
      await walk(entryPath, entryRequestedPath);
    }
  }

  for (const target of targets) {
    const absTarget = path.resolve(projectDir, target);
    if (!isInsideProject(canonicalProjectDir, absTarget)) {
      findings.push({
        level: targetFindingLevel(isExplicit),
        file: target,
        message: `Requested audit target is outside the project boundary: ${target}`,
      });
      continue;
    }

    if (!await fs.pathExists(absTarget)) {
      if (isExplicit) {
        findings.push({
          level: 'fail',
          file: target,
          message: `Requested audit target does not exist: ${target}`,
        });
      }
      continue;
    }

    await walk(absTarget, target, true);
  }

  return {
    files: [...files].sort((a, b) => a.localeCompare(b)),
    findings,
  };
}

function relationTargets(artifact: ArtifactRecord): string[] {
  return RELATION_FIELDS.flatMap(field => artifact.relations[field]);
}

function hasIncomingRelation(artifactId: string, artifacts: ArtifactRecord[], fields: RelationField[]): boolean {
  return artifacts.some(artifact =>
    fields.some(field => artifact.relations[field].includes(artifactId)),
  );
}

function detectDependencyCycles(artifacts: ArtifactRecord[]): string[][] {
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): void {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      if (start >= 0) {
        cycles.push([...stack.slice(start), id]);
      }
      return;
    }

    if (visited.has(id)) return;

    const artifact = byId.get(id);
    if (!artifact) return;

    visiting.add(id);
    stack.push(id);
    for (const targetId of artifact.relations.depends_on) {
      visit(targetId);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  for (const artifact of artifacts) {
    visit(artifact.id);
  }

  return cycles;
}

function auditRecords(artifacts: ArtifactRecord[], markdownWithoutMetadata: number): Finding[] {
  const findings: Finding[] = [];
  const ids = new Map<string, ArtifactRecord[]>();

  for (const artifact of artifacts) {
    ids.set(artifact.id, [...(ids.get(artifact.id) ?? []), artifact]);
  }

  for (const [id, matches] of ids) {
    if (matches.length > 1) {
      findings.push({
        level: 'fail',
        id,
        message: `Duplicate artifact id is used by ${matches.map(match => match.file).join(', ')}`,
      });
    }
  }

  const knownIds = new Set(ids.keys());
  for (const artifact of artifacts) {
    if (!artifact.type) {
      findings.push({ level: 'warn', file: artifact.file, id: artifact.id, message: 'Missing type.' });
    }
    if (!artifact.status) {
      findings.push({ level: 'warn', file: artifact.file, id: artifact.id, message: 'Missing status.' });
    }
    if (artifact.owners.length === 0) {
      findings.push({ level: 'warn', file: artifact.file, id: artifact.id, message: 'Missing owner/owners.' });
    }

    for (const field of RELATION_FIELDS) {
      for (const targetId of artifact.relations[field]) {
        if (targetId === artifact.id) {
          findings.push({
            level: 'fail',
            file: artifact.file,
            id: artifact.id,
            message: `Self-reference in ${field}.`,
          });
        } else if (!knownIds.has(targetId)) {
          findings.push({
            level: 'fail',
            file: artifact.file,
            id: artifact.id,
            message: `${field} references unknown artifact "${targetId}".`,
          });
        }
      }
    }

    const type = artifact.type?.toLowerCase();
    const status = artifact.status?.toLowerCase();
    if ((type === 'spec' || type === 'requirement' || type === 'requirements') && relationTargets(artifact).length === 0) {
      findings.push({
        level: 'warn',
        file: artifact.file,
        id: artifact.id,
        message: 'Spec has no explicit dependency/impact links.',
      });
    }
    if (
      (type === 'spec' || type === 'requirement' || type === 'requirements') &&
      !hasIncomingRelation(artifact.id, artifacts, ['implements', 'verifies', 'documents'])
    ) {
      findings.push({
        level: 'warn',
        file: artifact.file,
        id: artifact.id,
        message: 'Spec is not referenced by code/tests/docs metadata.',
      });
    }
    if (type === 'adr' && status === 'accepted' && artifact.relations.affects.length === 0) {
      findings.push({
        level: 'warn',
        file: artifact.file,
        id: artifact.id,
        message: 'Accepted ADR has no affects links.',
      });
    }
  }

  for (const cycle of detectDependencyCycles(artifacts)) {
    findings.push({
      level: 'fail',
      message: `Dependency cycle: ${cycle.join(' -> ')}`,
    });
  }

  if (markdownWithoutMetadata > 0 && artifacts.length === 0) {
    findings.push({
      level: 'warn',
      message: `${markdownWithoutMetadata} markdown file(s) were found, but none had artifact frontmatter with an id.`,
    });
  }

  return findings;
}

function printHumanReport(artifacts: ArtifactRecord[], findings: Finding[], markdownWithoutMetadata: number, strict: boolean): void {
  const failCount = findings.filter(finding => finding.level === 'fail').length;
  const warnCount = findings.filter(finding => finding.level === 'warn').length;
  const effectiveFailCount = strict ? failCount + warnCount : failCount;

  console.log(chalk.bold('Artifact Audit'));
  console.log(`Artifacts indexed: ${artifacts.length}`);
  console.log(`Markdown without artifact metadata: ${markdownWithoutMetadata}`);
  console.log(`Findings: ${failCount} fail, ${warnCount} warn${strict ? ' (strict treats warnings as failures)' : ''}`);
  console.log('');

  if (findings.length === 0) {
    console.log(chalk.green('PASS No artifact graph issues found.'));
    return;
  }

  for (const finding of findings) {
    const label = finding.level === 'fail' ? chalk.red('FAIL') : chalk.yellow('WARN');
    const location = [finding.file, finding.id].filter(Boolean).join(' ');
    console.log(`${label} ${location ? `${location}: ` : ''}${finding.message}`);
  }

  console.log('');
  if (effectiveFailCount > 0) {
    console.log(chalk.red('Result: FAIL'));
  } else {
    console.log(chalk.yellow('Result: WARN'));
  }
}

export async function auditArtifactsCommand(paths: string[] = [], options: AuditOptions = {}): Promise<void> {
  const projectDir = process.cwd();
  const targets = paths.length > 0 ? paths : DEFAULT_TARGETS;
  const explicitTargets = paths.length > 0;
  const { files: markdownFiles, findings: collectionFindings } = await collectMarkdownFiles(projectDir, targets, explicitTargets);
  const artifacts: ArtifactRecord[] = [];
  let markdownWithoutMetadata = 0;

  for (const file of markdownFiles) {
    const content = await readTextFile(file);
    if (!content) continue;

    const fields = parseFrontmatter(content);
    if (!fields) {
      markdownWithoutMetadata += 1;
      continue;
    }

    const artifact = toArtifact(projectDir, file, fields);
    if (artifact) {
      artifacts.push(artifact);
    } else {
      markdownWithoutMetadata += 1;
    }
  }

  const findings = [...collectionFindings, ...auditRecords(artifacts, markdownWithoutMetadata)];
  const failCount = findings.filter(finding => finding.level === 'fail').length;
  const warnCount = findings.filter(finding => finding.level === 'warn').length;
  const shouldFail = options.strict ? failCount + warnCount > 0 : failCount > 0;

  if (options.json) {
    console.log(JSON.stringify({
      status: shouldFail ? 'fail' : warnCount > 0 ? 'warn' : 'pass',
      artifacts: artifacts.length,
      markdown_without_metadata: markdownWithoutMetadata,
      findings,
    }, null, 2));
  } else {
    printHumanReport(artifacts, findings, markdownWithoutMetadata, options.strict ?? false);
  }

  if (shouldFail) {
    process.exitCode = 1;
  }
}
