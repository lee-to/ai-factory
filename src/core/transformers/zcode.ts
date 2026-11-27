import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { DefaultTransformer } from './default.js';
import {
  listDirectories,
  readTextFile,
  writeTextFile,
  removeFile,
  fileExists,
} from '../../utils/fs.js';

const CONFIG_DIR = '.zcode';

// A command file belongs to AI Factory only when this marker appears on a line of
// its own. Every other file in .zcode/commands is user-authored and is never
// rewritten or removed.
const COMMAND_MARKER = '<!-- aif:zcode-command -->';
// ZCode drops a command whose name does not match this pattern after lowercasing.
const COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,63}$/;
// ZCode drops a skill whose description is longer than this.
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
const DEFAULT_ARGUMENT_HINT = '[arguments]';

// ZCode reads SKILL.md frontmatter with a flat parser: one `key: value` per line,
// indented lines ignored, `>` and `|` block scalars folded. Mirror it so a command
// stub shows the same values ZCode loaded for the skill. Returns null without frontmatter.
function parseFrontmatter(content: string): Record<string, string> | null {
  if (!content.startsWith('---')) return null;
  const lines = content.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end <= 0) return null;

  const values: Record<string, string> = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line)) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key in values) continue;

    if (!/^(>[+-]?|\|[+-]?)$/.test(value)) {
      values[key] = value;
      continue;
    }
    const block: string[] = [];
    let cursor = index + 1;
    while (cursor < end && (!lines[cursor].trim() || /^\s/.test(lines[cursor]))) {
      block.push(lines[cursor]);
      cursor += 1;
    }
    values[key] = toSingleLine(block.join(' '));
    index = cursor - 1;
  }
  return values;
}

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Removes YAML quoting from a single-line scalar.
function unquoteScalar(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not JSON-compatible; dropping the quotes is the closest faithful value.
    }
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function isManagedCommand(content: string | null): boolean {
  return content !== null && content.split(/\r?\n/).some(line => line.trim() === COMMAND_MARKER);
}

function skillNameFromCommandFile(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/i, '');
}

// Only top-level files: AI Factory never writes namespaced command directories.
async function listCommandFiles(commandsDir: string): Promise<string[]> {
  if (!(await fileExists(commandsDir))) return [];
  const entries = await fs.readdir(commandsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => path.join(commandsDir, entry.name))
    .sort();
}

// Returns null when ZCode cannot expose the skill as a command.
async function buildCommandStub(skillsDir: string, skillName: string): Promise<{ fileName: string; content: string } | null> {
  if (!COMMAND_NAME_PATTERN.test(skillName.toLowerCase())) return null;
  const skillMd = await readTextFile(path.join(skillsDir, skillName, 'SKILL.md'));
  if (skillMd === null) return null;

  const frontmatter = parseFrontmatter(skillMd);
  // Without frontmatter ZCode names a skill after its directory.
  const skillReference = frontmatter === null ? skillName : unquoteScalar(frontmatter.name ?? '');
  const description = frontmatter === null ? '' : toSingleLine(unquoteScalar(frontmatter.description ?? ''));
  // ZCode drops a skill whose frontmatter lacks a name or description, or whose
  // description is too long, so a command pointing at it could never load it.
  if (!skillReference || (frontmatter !== null && (!description || description.length > MAX_SKILL_DESCRIPTION_LENGTH))) {
    return null;
  }

  const argumentHint = toSingleLine(unquoteScalar(frontmatter?.['argument-hint'] ?? '')) || DEFAULT_ARGUMENT_HINT;
  return {
    fileName: `${skillName}.md`,
    content: [
      '---',
      // A bare single line: ZCode's command parser reads flat `key: value` lines only.
      `description: ${description || `Run the ${skillReference} skill`}`,
      // Quoted like ZCode's own plugins; ZCode strips the outer quotes.
      `argument-hint: "${argumentHint}"`,
      `skills: ${skillReference}`,
      '---',
      COMMAND_MARKER,
      '',
      `Execute the "${skillReference}" skill (loaded via the skills frontmatter above) with these arguments: $ARGUMENTS`,
      '',
    ].join('\n'),
  };
}

// Creates the stub, refreshes it when AI Factory owns the file, and otherwise
// preserves the user's command and reports the conflict.
async function writeManagedCommand(projectDir: string, filePath: string, content: string): Promise<void> {
  const existing = await readTextFile(filePath);
  if (existing === content) return;

  const displayPath = path.relative(projectDir, filePath);
  if (existing === null) {
    if (!(await fileExists(filePath))) {
      await writeTextFile(filePath, content);
      return;
    }
    // Present but unreadable as a file, for example a directory of the same name.
    console.log(chalk.yellow(`  [zcode] Preserved existing path: ${displayPath}`));
    return;
  }

  if (!isManagedCommand(existing)) {
    console.log(chalk.yellow(`  [zcode] Preserved user command: ${displayPath} (delete it to let AI Factory generate this command)`));
    return;
  }
  await writeTextFile(filePath, content);
}

// Removes the directory only when nothing is left in it. User subdirectories,
// even empty ones, keep it in place.
async function removeEmptyCommandsDir(commandsDir: string): Promise<void> {
  await fs.rmdir(commandsDir).catch(() => undefined);
}

async function removeManagedCommands(projectDir: string, skillNames: string[]): Promise<void> {
  const commandsDir = path.join(projectDir, CONFIG_DIR, 'commands');
  for (const skillName of skillNames) {
    const filePath = path.join(commandsDir, `${skillName}.md`);
    if (isManagedCommand(await readTextFile(filePath))) {
      await removeFile(filePath);
    }
  }
  await removeEmptyCommandsDir(commandsDir);
}

export class ZCodeTransformer extends DefaultTransformer {
  async postInstall(projectDir: string): Promise<void> {
    const skillsDir = path.join(projectDir, CONFIG_DIR, 'skills');
    if (!(await fileExists(skillsDir))) {
      return;
    }

    const commandsDir = path.join(projectDir, CONFIG_DIR, 'commands');
    const installedSkills = await listDirectories(skillsDir);
    const exposedSkills = new Set<string>();
    for (const skillName of installedSkills) {
      const stub = await buildCommandStub(skillsDir, skillName);
      if (stub) {
        await writeManagedCommand(projectDir, path.join(commandsDir, stub.fileName), stub.content);
        exposedSkills.add(skillName);
      }
    }

    // Prune managed stubs whose skill no longer exists or can no longer be loaded.
    for (const filePath of await listCommandFiles(commandsDir)) {
      if (exposedSkills.has(skillNameFromCommandFile(filePath))) continue;
      if (isManagedCommand(await readTextFile(filePath))) {
        await removeFile(filePath);
      }
    }
  }

  // Called for every removal path, including updates that install nothing afterwards.
  async postRemove(projectDir: string, removedSkills: string[]): Promise<void> {
    await removeManagedCommands(projectDir, removedSkills);
  }

  async cleanup(projectDir: string): Promise<void> {
    const commandsDir = path.join(projectDir, CONFIG_DIR, 'commands');
    for (const filePath of await listCommandFiles(commandsDir)) {
      if (isManagedCommand(await readTextFile(filePath))) {
        await removeFile(filePath);
      }
    }
    await removeEmptyCommandsDir(commandsDir);
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open ZCode in this directory',
      '2. Skills installed to .zcode/skills/ and exposed as /aif-* commands via .zcode/commands/',
      '3. MCP servers configured in .zcode/config.json under mcp.servers (if selected); trust them once in Settings > MCP before ZCode connects them',
      '4. Run /aif to analyze project and use /aif-plan, /aif-commit for daily workflow',
    ];
  }

  getInvocationHint(): string {
    return 'ZCode: /aif, /aif-plan, /aif-commit';
  }
}
