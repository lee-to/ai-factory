import path from 'path';
import { DefaultTransformer } from './default.js';
import { extractFrontmatterName } from '../transformer.js';
import { ensureDir, listDirectories, listFilesRecursive, readTextFile, writeTextFile, removeFile, fileExists } from '../../utils/fs.js';

const COMMAND_MARKER = '<!-- aif:zcode-command -->';

function extractFrontmatterDescription(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m);
  return descMatch ? descMatch[1].trim() : null;
}

function buildCommandStub(skillName: string, description: string | null): string {
  const desc = description ?? `AI Factory ${skillName} skill`;
  return [
    '---',
    `description: ${desc}`,
    `skills: ${skillName}`,
    'argument-hint: [arguments]',
    '---',
    COMMAND_MARKER,
    '',
    `Execute the "${skillName}" skill (loaded via the skills frontmatter above) with these arguments: $ARGUMENTS`,
    '',
  ].join('\n');
}

export class ZCodeTransformer extends DefaultTransformer {
  async postInstall(projectDir: string): Promise<void> {
    const skillsDir = path.join(projectDir, '.zcode', 'skills');
    const commandsDir = path.join(projectDir, '.zcode', 'commands');

    if (!(await fileExists(skillsDir))) {
      return;
    }

    await ensureDir(commandsDir);
    const installedSkills = await listDirectories(skillsDir);

    for (const skillName of installedSkills) {
      const skillMd = await readTextFile(path.join(skillsDir, skillName, 'SKILL.md'));
      if (!skillMd) {
        continue;
      }

      // ZCode command files must be named after the command; the skill name
      // in frontmatter may differ from the directory after sanitization.
      const frontmatterName = extractFrontmatterName(skillMd) ?? skillName;
      const description = extractFrontmatterDescription(skillMd);
      await writeTextFile(
        path.join(commandsDir, `${skillName}.md`),
        buildCommandStub(frontmatterName, description),
      );
    }

    // Prune managed stubs whose skill no longer exists (e.g. package-removed skills).
    const installedSet = new Set(installedSkills);
    for (const filePath of await listFilesRecursive(commandsDir)) {
      if (!filePath.endsWith('.md')) continue;
      const content = await readTextFile(filePath);
      if (!content?.includes(COMMAND_MARKER)) continue;
      const skillName = path.basename(filePath).replace(/\.md$/, '');
      if (!installedSet.has(skillName)) {
        await removeFile(filePath);
      }
    }
  }

  async cleanup(projectDir: string): Promise<void> {
    const commandsDir = path.join(projectDir, '.zcode', 'commands');
    if (!(await fileExists(commandsDir))) {
      return;
    }

    for (const filePath of await listFilesRecursive(commandsDir)) {
      if (!filePath.endsWith('.md')) continue;
      const content = await readTextFile(filePath);
      if (content?.includes(COMMAND_MARKER)) {
        await removeFile(filePath);
      }
    }
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open ZCode in this directory',
      '2. Skills installed to .zcode/skills/ and exposed as /aif-* commands via .zcode/commands/',
      '3. MCP servers configured in .zcode/config.json under mcp.servers (if selected)',
      '4. Run /aif to analyze project and use /aif-plan, /aif-commit for daily workflow',
    ];
  }

  getInvocationHint(): string {
    return 'ZCode: /aif, /aif-plan, /aif-commit';
  }
}
