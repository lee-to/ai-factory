import type { AgentTransformer, TransformResult } from '../transformer.js';
import { removeFrontmatter, replaceFrontmatterName } from '../transformer.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

import {
  writeTextFile,
  readTextFile,
  fileExists,
  removeFile,
  copyFile,
  listFilesRecursive,
  readFileBuffer,
  removeEmptyDirBottomUp,
  getSkillsDir,
} from '../../utils/fs.js';
const KNOWN_LEGACY_RULE_FILES = [
  'aif-guardrails.md',
  'aif-conventions.md',
] as const;

const KNOWN_LEGACY_WORKFLOW_FILES = new Set([
  // AI Factory v2 prefixed names
  'aif.md',
  'aif-architecture.md',
  'aif-archive.md',
  'aif-best-practices.md',
  'aif-build-automation.md',
  'aif-ci.md',
  'aif-commit.md',
  'aif-distillation.md',
  'aif-dockerize.md',
  'aif-docs.md',
  'aif-evolve.md',
  'aif-explore.md',
  'aif-fix.md',
  'aif-grounded.md',
  'aif-implement.md',
  'aif-improve.md',
  'aif-loop.md',
  'aif-plan.md',
  'aif-qa.md',
  'aif-qa-check.md',
  'aif-reference.md',
  'aif-review.md',
  'aif-roadmap.md',
  'aif-rules.md',
  'aif-rules-check.md',
  'aif-security-checklist.md',
  'aif-skill-generator.md',
  'aif-transfer.md',
  'aif-verify.md',
  'aif-warmup.md',
  // AI Factory v1 bare names
  'architecture.md',
  'archive.md',
  'best-practices.md',
  'build-automation.md',
  'ci.md',
  'commit.md',
  'distillation.md',
  'dockerize.md',
  'docs.md',
  'evolve.md',
  'explore.md',
  'feature.md',
  'fix.md',
  'grounded.md',
  'implement.md',
  'improve.md',
  'loop.md',
  'plan.md',
  'qa.md',
  'qa-check.md',
  'reference.md',
  'review.md',
  'roadmap.md',
  'rules.md',
  'rules-check.md',
  'security-checklist.md',
  'skill-generator.md',
  'task.md',
  'transfer.md',
  'verify.md',
  'warmup.md',
]);

export function isAiFactoryWorkflowArtifact(content: string, fileName?: string): boolean {
  const lower = content.toLowerCase();
  if (
    lower.includes('ai-factory') ||
    lower.includes('.ai-factory') ||
    lower.includes('/aif-') ||
    lower.includes('aif:') ||
    lower.includes('legacy workflow')
  ) {
    return true;
  }
  if (fileName) {
    const rawSkill = fileName.replace(/\.md$/, '');
    if (
      lower.includes(`name: ${rawSkill}`) ||
      lower.includes(`name: aif-${rawSkill}`) ||
      lower.includes(`name: ai-factory-${rawSkill}`) ||
      lower.includes(`name: "${rawSkill}"`) ||
      lower.includes(`name: '${rawSkill}'`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Reproduces the exact historical Antigravity 1.0 frontmatter simplification.
 * Keeps only the `description:` field. Used exclusively for legacy provenance matching.
 */
export function simplifyFrontmatter(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[1];
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (!descMatch) return content;

  const newFrontmatter = `---\ndescription: ${descMatch[1].trim()}\n---`;
  return content.replace(/^---\n[\s\S]*?\n---/, newFrontmatter);
}

export async function isUnmodifiedPackageWorkflow(content: string, fileName: string): Promise<boolean> {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();
  const baseName = path.basename(fileName).replace(/\.md$/, '');
  let canonicalSkill: string;
  if (baseName === 'aif') {
    canonicalSkill = 'aif';
  } else if (baseName === 'feature' || baseName === 'ai-factory-feature' || baseName === 'aif-feature') {
    canonicalSkill = 'aif-plan';
  } else if (baseName === 'task' || baseName === 'ai-factory-task' || baseName === 'aif-task') {
    canonicalSkill = 'aif-implement';
  } else if (baseName.startsWith('aif-')) {
    canonicalSkill = baseName;
  } else if (baseName.startsWith('ai-factory-')) {
    canonicalSkill = baseName.replace(/^ai-factory-/, 'aif-');
  } else {
    canonicalSkill = `aif-${baseName}`;
  }

  const skillPath = path.join(getSkillsDir(), canonicalSkill, 'SKILL.md');
  if (!(await fileExists(skillPath))) {
    return false;
  }

  const templateContent = await readTextFile(skillPath);
  if (templateContent === null) {
    return false;
  }

  const normalizedTemplate = templateContent.replace(/\r\n/g, '\n').trim();

  // Variant 1: Exact match with full package template
  if (normalizedContent === normalizedTemplate) {
    return true;
  }

  // Variant 2: Historical simplified frontmatter (Antigravity 1.0 transformer output)
  const simplifiedTemplate = simplifyFrontmatter(normalizedTemplate).replace(/\r\n/g, '\n').trim();
  if (normalizedContent === simplifiedTemplate) {
    return true;
  }

  // Variant 3: Frontmatter stripped completely (documented legacy headless variant)
  const strippedTemplate = removeFrontmatter(normalizedTemplate).replace(/\r\n/g, '\n').trim();
  if (strippedTemplate.length > 0 && normalizedContent === strippedTemplate) {
    return true;
  }

  // Variant 4: Historical name-replaced variant (e.g. name: plan instead of name: aif-plan)
  const replacedNameTemplate = replaceFrontmatterName(normalizedTemplate, baseName).replace(/\r\n/g, '\n').trim();
  if (normalizedContent === replacedNameTemplate) {
    return true;
  }

  // Variant 5: Simplified frontmatter + name-replaced combination
  const replacedSimplified = simplifyFrontmatter(replacedNameTemplate).replace(/\r\n/g, '\n').trim();
  if (normalizedContent === replacedSimplified) {
    return true;
  }

  return false;
}

export async function getPackageReferencePath(fileName: string): Promise<string | null> {
  if (fileName === 'README.md') {
    return null;
  }
  const candidatePaths = [
    path.join(getSkillsDir(), 'aif', 'references', fileName),
    path.join(getSkillsDir(), 'aif-rules-check', 'references', fileName),
  ];
  for (const p of candidatePaths) {
    if (await fileExists(p)) {
      return p;
    }
  }
  return null;
}

export async function isUnmodifiedPackageReference(content: string, fileName: string): Promise<boolean> {
  const templatePath = await getPackageReferencePath(fileName);
  if (!templatePath) {
    return false;
  }
  const templateContent = await readTextFile(templatePath);
  if (templateContent === null) {
    return false;
  }
  return content.replace(/\r\n/g, '\n').trim() === templateContent.replace(/\r\n/g, '\n').trim();
}

export const LEGACY_GUARDRAILS_CONTENT = `---
trigger: always_on
---

# AI Factory Guardrails

## Project Conventions

- Follow existing code style and patterns in the project
- Use conventional commits format for all commit messages
- Always check for existing implementations before creating new ones
- Prefer editing existing files over creating new ones
- Run tests after making changes when test infrastructure exists

## Language Conventions

- Write implementation plans (\`PLAN.md\`), architectural specifications, code, variables, and code comments in English.
- Follow configured project language preferences for user communication and task logs.

## Skill Usage

- Use \`/aif-explore\` to think through ideas before planning — no implementation, just exploration
- Use \`/aif-warmup\` to load project context at session start or before a fork
- Use \`/aif-plan\` for new features — creates branch, plan, and tasks
- Use \`/aif-fix\` for bug fixes — analyzes, fixes, suggests tests
- Use \`/aif-implement\` to execute plans step by step
- Use \`/aif-verify\` to verify implementation against plan
- Use \`/aif-rules-check\` for a standalone project rules gate
- Use \`/aif-review\` before merging — checks code quality
- Use \`/aif-commit\` for commits — follows conventional commits

## Safety

- Never commit secrets, tokens, or credentials
- Never force-push to main/master branches
- Always create feature branches for new work
`;

export function matchesRuleTemplate(existing: string, template: string): boolean {
  return existing.replace(/\r\n/g, '\n').trim() === template.replace(/\r\n/g, '\n').trim();
}

export function getGuardrailsRuleContent(_projectDir?: string): string {
  return `---
trigger: always_on
---

# AI Factory Guardrails

## Project Conventions

- Follow existing code style and patterns in the project
- Use conventional commits format for all commit messages
- Always check for existing implementations before creating new ones
- Prefer editing existing files over creating new ones
- Run tests after making changes when test infrastructure exists

## Language Conventions

- Write implementation plans (\`PLAN.md\`), architectural specifications, and generated artifacts in the language configured by \`language.artifacts\` in \`.ai-factory/config.yaml\` (defaulting to English if unspecified). Keep code, variable names, identifiers, and technical syntax in English.
- Follow configured project language preferences (\`language.ui\` in \`.ai-factory/config.yaml\`) for user communication and task logs.

## Skill Usage

- Use \`/aif-explore\` to think through ideas before planning — no implementation, just exploration
- Use \`/aif-warmup\` to load project context at session start or before a fork
- Use \`/aif-plan\` for new features — creates branch, plan, and tasks
- Use \`/aif-fix\` for bug fixes — analyzes, fixes, suggests tests
- Use \`/aif-implement\` to execute plans step by step
- Use \`/aif-verify\` to verify implementation against plan
- Use \`/aif-rules-check\` for a standalone project rules gate
- Use \`/aif-review\` before merging — checks code quality
- Use \`/aif-commit\` for commits — follows conventional commits

## Safety

- Never commit secrets, tokens, or credentials
- Never force-push to main/master branches
- Always create feature branches for new work
`;
}

export function getConventionsRuleContent(): string {
  return `---
trigger: model_decision
---

# AI Factory Conventions

## Workflow Structure

AI Factory organizes tools and customizations for Antigravity 2.0:

### Skills (.agents/skills/)
Modular Agent Skills with multi-file support and metadata:
- \`aif-explore/\` — Think through ideas, investigate problems
- \`aif-plan/\` — Plan and develop new features
- \`aif-fix/\` — Fix bugs with structured approach
- \`aif-implement/\` — Execute plans step by step
- \`aif-verify/\` — Verify implementation against plan
- \`aif-commit/\` — Create conventional commits
- \`aif-rules-check/\` — Run a standalone rules compliance gate
- \`aif-warmup/\` — Load startup context for a session or fork
- \`aif-review/\` — Code review checklist
- \`aif-ci/\` — CI/CD pipeline setup
- \`aif-best-practices/\` — Code quality standards
- \`aif-architecture/\` — Architecture decision records
- \`aif-roadmap/\` — Strategic project roadmap
- \`aif-rules/\` — Project rules and conventions
- \`aif-loop/\` — Iterative reflex loop
- \`aif-qa/\` — QA test generation

### Agents (.agents/agents/)
Native autonomous agents for parallel execution and quality sidecars:
- \`implement-coordinator.md\` — Parallel execution coordinator
- \`implement-worker.md\` — Bounded implementation worker
- \`plan-coordinator.md\` — Planning and polish coordinator
- \`plan-polisher.md\` — Plan refinement worker
- \`review-sidecar.md\` — Read-only code review auditor
- \`security-sidecar.md\` — Read-only security auditor
- \`best-practices-sidecar.md\` — Read-only best practices auditor
- \`rules-sidecar.md\` — Standalone rules compliance auditor
- \`commit-preparer.md\` — Conventional commit inspection sidecar
- \`docs-auditor.md\` — Documentation audit sidecar

### Rules (.agents/rules/)
Project rules with YAML frontmatter triggers:
- \`aif-guardrails.md\` (\`trigger: always_on\`) — Always-active guardrails and conventions
- \`aif-conventions.md\` (\`trigger: model_decision\`) — Contextual conventions

### MCP Servers (.agents/mcp_config.json)
Standard Model Context Protocol configuration with workspace scope.
`;
}

export class AntigravityTransformer implements AgentTransformer {
  transform(skillName: string, content: string): TransformResult {
    return {
      targetDir: skillName,
      targetName: 'SKILL.md',
      content,
      flat: false,
    };
  }

  async postInstall(projectDir: string): Promise<void> {
    const rulesDir = path.join(projectDir, '.agents', 'rules');

    const guardrailsContent = getGuardrailsRuleContent(projectDir);
    const conventionsContent = getConventionsRuleContent();

    const guardrailsPath = path.join(rulesDir, 'aif-guardrails.md');
    const conventionsPath = path.join(rulesDir, 'aif-conventions.md');

    if (await fileExists(guardrailsPath)) {
      const existing = await readTextFile(guardrailsPath);
      if (existing && !matchesRuleTemplate(existing, guardrailsContent) && !matchesRuleTemplate(existing, LEGACY_GUARDRAILS_CONTENT)) {
        console.log(chalk.yellow('  [antigravity] Preserved modified rule: aif-guardrails.md'));
      } else {
        await writeTextFile(guardrailsPath, guardrailsContent);
      }
    } else {
      await writeTextFile(guardrailsPath, guardrailsContent);
    }

    if (await fileExists(conventionsPath)) {
      const existing = await readTextFile(conventionsPath);
      if (existing && !matchesRuleTemplate(existing, conventionsContent)) {
        console.log(chalk.yellow('  [antigravity] Preserved modified rule: aif-conventions.md'));
      } else {
        await writeTextFile(conventionsPath, conventionsContent);
      }
    } else {
      await writeTextFile(conventionsPath, conventionsContent);
    }
  }

  async cleanup(projectDir: string, skillsDir: string): Promise<void> {
    return this.cleanupTargetSkills(projectDir, skillsDir);
  }

  async cleanupTargetSkills(projectDir: string, skillsDir?: string): Promise<void> {
    const configDir = skillsDir ? path.dirname(skillsDir) : '.agents';
    const modernRulesDir = path.join(projectDir, configDir, 'rules');
    const modernGuardrailsPath = path.join(modernRulesDir, 'aif-guardrails.md');
    const modernConventionsPath = path.join(modernRulesDir, 'aif-conventions.md');

    if (await fileExists(modernGuardrailsPath)) {
      const content = await readTextFile(modernGuardrailsPath);
      if (
        content !== null &&
        (matchesRuleTemplate(content, getGuardrailsRuleContent(projectDir)) ||
          matchesRuleTemplate(content, LEGACY_GUARDRAILS_CONTENT))
      ) {
        await removeFile(modernGuardrailsPath);
      } else {
        console.log(chalk.yellow(`  [antigravity] Preserving modified rule: ${path.join(configDir, 'rules', 'aif-guardrails.md')}`));
      }
    }

    if (await fileExists(modernConventionsPath)) {
      const content = await readTextFile(modernConventionsPath);
      if (content !== null && matchesRuleTemplate(content, getConventionsRuleContent())) {
        await removeFile(modernConventionsPath);
      } else {
        console.log(chalk.yellow(`  [antigravity] Preserving modified rule: ${path.join(configDir, 'rules', 'aif-conventions.md')}`));
      }
    }
    await removeEmptyDirBottomUp(modernRulesDir);

    // Ownership-aware cleanup of legacy .agents/subagents
    const legacySubagentsDir = path.join(projectDir, '.agents', 'subagents');
    const targetAgentsDir = path.join(projectDir, '.agents', 'agents');
    if (await fileExists(legacySubagentsDir)) {
      const files = await listFilesRecursive(legacySubagentsDir);
      for (const file of files) {
        const relPath = path.relative(legacySubagentsDir, file).replaceAll('\\', '/');
        const destPath = path.join(targetAgentsDir, relPath);
        const collision = await fileExists(destPath);
        if (!collision) {
          await copyFile(file, destPath);
          await removeFile(file);
        } else {
          const [srcBuf, destBuf] = await Promise.all([
            readFileBuffer(file),
            readFileBuffer(destPath),
          ]);
          if (srcBuf && destBuf && srcBuf.equals(destBuf)) {
            await removeFile(file);
          } else {
            console.log(chalk.yellow(`  [antigravity] Preserved conflicting subagent in: ${relPath}`));
          }
        }
      }
      await removeEmptyDirBottomUp(legacySubagentsDir);
    }

    // Ownership-aware cleanup of legacy v1 .agent workflows
    const legacyWorkflowsDir = path.join(projectDir, '.agent', 'workflows');
    if (await fileExists(legacyWorkflowsDir)) {
      const legacyReferencesDir = path.join(legacyWorkflowsDir, 'references');
      if (await fileExists(legacyReferencesDir)) {
        const refEntries = await fs.readdir(legacyReferencesDir, { withFileTypes: true });
        for (const entry of refEntries) {
          if (!entry.isFile()) continue;
          const refPath = path.join(legacyReferencesDir, entry.name);
          const content = await readTextFile(refPath);
          const templatePath = await getPackageReferencePath(entry.name);
          if (templatePath !== null && content !== null && (await isUnmodifiedPackageReference(content, entry.name))) {
            await removeFile(refPath);
          } else if (!templatePath || entry.name === 'README.md') {
            console.log(chalk.yellow(`  [antigravity] Preserving legacy reference: .agent/workflows/references/${entry.name}`));
          } else {
            console.log(chalk.yellow(`  [antigravity] Preserving user-modified legacy reference: .agent/workflows/references/${entry.name}`));
          }
        }
        await removeEmptyDirBottomUp(legacyReferencesDir);
      }

      const workflowEntries = await fs.readdir(legacyWorkflowsDir, { withFileTypes: true });
      for (const entry of workflowEntries) {
        if (!entry.isFile()) continue;
        if (KNOWN_LEGACY_WORKFLOW_FILES.has(entry.name)) {
          const workflowPath = path.join(legacyWorkflowsDir, entry.name);
          const content = await readTextFile(workflowPath);
          if (content !== null && (await isUnmodifiedPackageWorkflow(content, entry.name))) {
            await removeFile(workflowPath);
            console.log(chalk.yellow(`  [antigravity] Removed legacy Antigravity 1.0 workflow: .agent/workflows/${entry.name}`));
          } else {
            console.log(chalk.yellow(`  [antigravity] Preserving user-modified legacy workflow: .agent/workflows/${entry.name}`));
          }
        }
      }
      await removeEmptyDirBottomUp(legacyWorkflowsDir);
    }

    // Ownership-aware cleanup of legacy v1 .agent rules
    const legacyRulesDir = path.join(projectDir, '.agent', 'rules');
    if (await fileExists(legacyRulesDir)) {
      for (const ruleFile of KNOWN_LEGACY_RULE_FILES) {
        const rulePath = path.join(legacyRulesDir, ruleFile);
        if (await fileExists(rulePath)) {
          const content = await readTextFile(rulePath);
          let matches = false;
          if (content !== null) {
            if (ruleFile === 'aif-guardrails.md') {
              matches =
                matchesRuleTemplate(content, getGuardrailsRuleContent(projectDir)) ||
                matchesRuleTemplate(content, LEGACY_GUARDRAILS_CONTENT);
            } else if (ruleFile === 'aif-conventions.md') {
              matches = matchesRuleTemplate(content, getConventionsRuleContent());
            }
          }
          if (matches) {
            await removeFile(rulePath);
          } else {
            console.log(chalk.yellow(`  [antigravity] Preserving modified legacy rule: .agent/rules/${ruleFile}`));
          }
        }
      }

      await removeEmptyDirBottomUp(legacyRulesDir);
    }

    // Only remove .agent/ if it has become completely empty
    const legacyAgentDir = path.join(projectDir, '.agent');
    if (await fileExists(legacyAgentDir)) {
      await removeEmptyDirBottomUp(legacyAgentDir);
    }
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open Antigravity 2.0 in this directory',
      '2. Skills installed in .agents/skills/ (standard multi-file SKILL.md format)',
      '3. Agents installed in .agents/agents/ (parallel workers and sidecars)',
      '4. Rules installed in .agents/rules/ (triggered guardrails and conventions)',
      '5. MCP servers configured in .agents/mcp_config.json',
      '6. Run /aif to analyze project and generate project-relevant skills',
    ];
  }

  getInvocationHint(): string {
    return 'Antigravity: /aif-plan, /aif-commit, agy --agent implement-coordinator';
  }
}
