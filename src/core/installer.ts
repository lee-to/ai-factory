import path from 'path';
import fs from 'fs-extra';
import { copyDirectory, getSkillsDir, ensureDir, listDirectories } from '../utils/fs.js';
import type { AiFactoryConfig } from './config.js';
import { getAgentConfig } from './agents.js';
import { processSkillTemplates } from './template.js';

export interface InstallOptions {
  projectDir: string;
  skillsDir: string;
  skills: string[];
  stack: string | null;
  agentId: string;
}

// Skills that are action-oriented workflows (explicitly invoked by user)
const WORKFLOW_SKILLS = [
  'ai-factory',
  'feature',
  'task',
  'implement',
  'fix',
  'commit',
  'review',
  'deploy',
  'improve',
  'evolve',
  'skill-generator',
  'security-checklist',
];

export async function installSkills(options: InstallOptions): Promise<string[]> {
  const { projectDir, skillsDir, skills, stack, agentId } = options;
  const installedSkills: string[] = [];
  const agentConfig = getAgentConfig(agentId);

  const targetDir = path.join(projectDir, skillsDir);
  await ensureDir(targetDir);

  const packageSkillsDir = getSkillsDir();

  for (const skill of skills) {
    const sourceSkillDir = path.join(packageSkillsDir, skill);
    const targetSkillDir = path.join(targetDir, skill);

    try {
      await copyDirectory(sourceSkillDir, targetSkillDir);
      await processSkillTemplates(targetSkillDir, agentConfig);
      installedSkills.push(skill);
    } catch (error) {
      console.warn(`Warning: Could not install skill "${skill}": ${error}`);
    }
  }

  if (stack) {
    const templateDir = path.join(packageSkillsDir, '_templates', stack);
    try {
      const templateSkills = await listDirectories(templateDir);
      for (const templateSkill of templateSkills) {
        const sourceDir = path.join(templateDir, templateSkill);
        const targetSkillDir = path.join(targetDir, templateSkill);

        await copyDirectory(sourceDir, targetSkillDir);
        await processSkillTemplates(targetSkillDir, agentConfig);
        installedSkills.push(`${stack}/${templateSkill}`);
      }
    } catch {
      // Template not found, skip
    }
  }

  // Antigravity post-processing: reorganize into workflows/skills/rules
  if (agentId === 'antigravity') {
    await postProcessAntigravity(projectDir, targetDir, installedSkills);
  }

  return installedSkills;
}

export async function getAvailableSkills(): Promise<string[]> {
  const packageSkillsDir = getSkillsDir();
  const dirs = await listDirectories(packageSkillsDir);
  return dirs.filter(dir => !dir.startsWith('_'));
}

export async function getAvailableTemplates(): Promise<string[]> {
  const templatesDir = path.join(getSkillsDir(), '_templates');
  return listDirectories(templatesDir);
}

export async function updateSkills(config: AiFactoryConfig, projectDir: string): Promise<string[]> {
  // Get all available base skills from package
  const availableSkills = await getAvailableSkills();

  // Get custom skills (template-generated or external) to preserve in config
  const customSkills = config.installedSkills.filter(s => s.includes('/'));

  // Install all available base skills (new + existing)
  const installedBaseSkills = await installSkills({
    projectDir,
    skillsDir: config.skillsDir,
    skills: availableSkills,
    stack: null,
    agentId: config.agent,
  });

  // Return base skills + preserved custom skills
  return [...installedBaseSkills, ...customSkills];
}

/**
 * Post-process installed skills for Antigravity agent.
 * Reorganizes the flat skills directory into Antigravity's native structure:
 *   .agent/workflows/ — action-oriented skills (explicitly invoked)
 *   .agent/skills/    — knowledge skills (auto-discovered by relevance)
 *   .agent/rules/     — passive guardrails (always active)
 */
async function postProcessAntigravity(
  projectDir: string,
  skillsDir: string,
  installedSkills: string[],
): Promise<void> {
  const workflowsDir = path.join(projectDir, '.agent', 'workflows');
  const rulesDir = path.join(projectDir, '.agent', 'rules');
  await ensureDir(workflowsDir);
  await ensureDir(rulesDir);

  // Move workflow skills: copy SKILL.md → .agent/workflows/<name>.md, remove original dir
  for (const skill of installedSkills) {
    const baseName = skill.includes('/') ? skill.split('/').pop()! : skill;
    if (!WORKFLOW_SKILLS.includes(baseName)) continue;

    const skillDir = path.join(skillsDir, baseName);
    const skillMd = path.join(skillDir, 'SKILL.md');

    try {
      const exists = await fs.pathExists(skillMd);
      if (!exists) continue;

      const content = await fs.readFile(skillMd, 'utf-8');
      const converted = convertToAntigravityWorkflow(content, baseName);

      // Workflow name uses dot notation: ai-factory.feature → /ai-factory.feature
      const workflowFileName = baseName === 'ai-factory'
        ? 'ai-factory.md'
        : `ai-factory.${baseName}.md`;

      await fs.writeFile(path.join(workflowsDir, workflowFileName), converted, 'utf-8');

      // Copy supporting files (scripts/, etc.) if they exist
      const entries = await fs.readdir(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const srcDir = path.join(skillDir, entry.name);
          const destDir = path.join(workflowsDir, `${baseName}-${entry.name}`);
          await fs.copy(srcDir, destDir, { overwrite: true });
        }
      }

      // Remove the workflow skill from .agent/skills/ (it's now in workflows)
      await fs.remove(skillDir);
    } catch {
      // Skill processing failed, keep original
    }
  }

  // Create default rules
  await createAntigravityRules(rulesDir);
}

/**
 * Convert iFactory SKILL.md frontmatter to Antigravity workflow format.
 * Strips Claude-specific fields (allowed-tools, disable-model-invocation)
 * and keeps only Antigravity-compatible frontmatter.
 */
function convertToAntigravityWorkflow(content: string, skillName: string): string {
  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return content;

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Extract description from frontmatter
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const description = descMatch ? descMatch[1].trim() : `AI Factory ${skillName} workflow`;

  // Build Antigravity-compatible workflow format
  return `---
description: ${description}
---
${body}`;
}

/**
 * Create default Antigravity rules files.
 */
async function createAntigravityRules(rulesDir: string): Promise<void> {
  const guardrails = `# AI Factory Guardrails

These rules are always active when working in this project.

## Core Principles

1. **Spec-driven development** — Always follow the plan in \`.ai-factory/PLAN.md\` or \`.ai-factory/features/*.md\`. Do not improvise beyond the defined tasks.
2. **No scope creep** — Implement exactly what is specified, nothing more.
3. **Read context first** — Before any work, read \`.ai-factory/DESCRIPTION.md\` for project context.
4. **Learn from patches** — Before implementing or fixing, read \`.ai-factory/patches/\` to avoid repeating past mistakes.

## Code Quality

- Always use configurable logging (LOG_LEVEL environment variable)
- Follow the project's existing code style and conventions
- Never commit secrets, credentials, or tokens
- Prefer explicit error handling over silent failures

## Commit Discipline

- Use Conventional Commits format: \`type(scope): description\`
- Commit at logical checkpoints (every 3-5 tasks for large features)
- Keep commits focused — one logical change per commit
`;

  const conventions = `# AI Factory Conventions

Coding conventions enforced by AI Factory.

## File Organization

- Project specification: \`.ai-factory/DESCRIPTION.md\`
- Implementation plans: \`.ai-factory/PLAN.md\` or \`.ai-factory/features/feature-*.md\`
- Bug fix patches: \`.ai-factory/patches/YYYY-MM-DD-HH.mm.md\`
- Evolution logs: \`.ai-factory/evolutions/\`
- Security audit: \`.ai-factory/SECURITY.md\`

## Testing Policy

- Never add tests unless explicitly requested
- When tests are requested, follow the project's testing framework
- Suggest test coverage after every bug fix

## Logging Standards

- Prefix fix-related logs with \`[FIX]\`
- Use log levels: DEBUG, INFO, WARN, ERROR
- Make logging configurable via \`LOG_LEVEL\` environment variable
- Implement log rotation for file-based logs
`;

  await fs.writeFile(path.join(rulesDir, 'ai-factory-guardrails.md'), guardrails, 'utf-8');
  await fs.writeFile(path.join(rulesDir, 'ai-factory-conventions.md'), conventions, 'utf-8');
}
