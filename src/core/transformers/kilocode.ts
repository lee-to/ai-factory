import path from 'path';
import type { AgentTransformer, TransformResult } from '../transformer.js';
import {
  WORKFLOW_SKILLS,
  sanitizeName,
  extractFrontmatterName,
  replaceFrontmatterName,
  rewriteInvocationPrefix,
  removeFrontmatter,
} from '../transformer.js';
import { fileExists, removeDirectory, removeFile } from '../../utils/fs.js';

function toKiloWorkflowInvocation(invocation: string): string {
  if (invocation === 'aif') {
    return '/aif';
  }

  return `/aif:${invocation.slice('aif-'.length)}`;
}

function toKiloWorkflowContent(content: string): string {
  return rewriteInvocationPrefix(removeFrontmatter(content), toKiloWorkflowInvocation);
}

export class KiloCodeTransformer implements AgentTransformer {
  transform(skillName: string, content: string): TransformResult {
    if (WORKFLOW_SKILLS.has(skillName)) {
      return {
        targetDir: 'workflows',
        targetName: `${skillName}.md`,
        content: toKiloWorkflowContent(content),
        flat: true,
      };
    }

    const name = extractFrontmatterName(content);
    const sanitized = name ? sanitizeName(name) : skillName;
    const newContent = name ? replaceFrontmatterName(content, sanitized) : content;

    return {
      targetDir: sanitized,
      targetName: 'SKILL.md',
      content: newContent,
      flat: false,
    };
  }

  async postInstall(projectDir: string): Promise<void> {
    const skillsDir = path.join(projectDir, '.kilocode', 'skills');
    for (const skillName of WORKFLOW_SKILLS) {
      const legacySkillDir = path.join(skillsDir, skillName);
      if (await fileExists(legacySkillDir)) {
        await removeDirectory(legacySkillDir);
      }
    }
  }

  async cleanup(projectDir: string): Promise<void> {
    const workflowsDir = path.join(projectDir, '.kilocode', 'workflows');
    for (const skillName of WORKFLOW_SKILLS) {
      const workflowFile = path.join(workflowsDir, `${skillName}.md`);
      if (await fileExists(workflowFile)) {
        await removeFile(workflowFile);
      }
    }
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open Kilo Code in this directory',
      '2. Workflow skills installed to .kilocode/workflows/ and display as Kilo commands',
      '3. Knowledge skills installed to .kilocode/skills/ (directory names use hyphens, not dots)',
      '4. MCP servers configured in .kilocode/mcp.json (if selected)',
      '5. Run /aif to analyze project and use /aif:plan, /aif:commit for daily workflow',
    ];
  }

  getInvocationHint(): string {
    return 'Kilo Code: /aif, /aif:plan, /aif:commit';
  }
}
