import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { loadConfig, saveConfig, getCurrentVersion, type AiFactoryConfig as Config } from '../../core/config.js';
import {
  buildManagedConfigFilesState,
  buildManagedSkillsState,
  buildManagedSubagentsState,
  installConfigFiles,
  installSkills,
  installSubagents,
  renderSkillFiles,
  getAvailableSkills,
  partitionSkills,
} from '../../core/installer.js';
import { getAgentConfig, hydrateProjectAgentRegistry } from '../../core/agents.js';
import {
  fileExists,
  removeDirectory,
  removeFile,
  copyFile,
  ensureDir,
  listFilesRecursive,
  readTextFile,
  readFileBuffer,
  removeEmptyDirBottomUp,
  getSkillsDir,
} from '../../utils/fs.js';
import {
  isAiFactoryWorkflowArtifact,
  isUnmodifiedPackageWorkflow,
  isUnmodifiedPackageReference,
  getPackageReferencePath,
  matchesRuleTemplate,
  getGuardrailsRuleContent,
  getConventionsRuleContent,
  LEGACY_GUARDRAILS_CONTENT,
} from '../../core/transformers/antigravity.js';
import { resolveSkillTargets, createSkillRenderContext } from '../../core/skill-targets.js';
import { prepareSkillTargets, recoverSkillMigration, withSkillProjectLock } from '../../core/skills-migration.js';
import { collectReplacedSkills, composeInstalledExtensionSkills } from '../../core/extension-ops.js';

// Old v1 skill directory names that were renamed to aif-* in v2
// Canonical 30 package skills in v2
const CANONICAL_V2_SKILL_NAMES = [
  'aif',
  'aif-architecture',
  'aif-archive',
  'aif-best-practices',
  'aif-build-automation',
  'aif-ci',
  'aif-commit',
  'aif-distillation',
  'aif-dockerize',
  'aif-docs',
  'aif-evolve',
  'aif-explore',
  'aif-fix',
  'aif-grounded',
  'aif-implement',
  'aif-improve',
  'aif-loop',
  'aif-plan',
  'aif-qa',
  'aif-qa-check',
  'aif-reference',
  'aif-review',
  'aif-roadmap',
  'aif-rules',
  'aif-rules-check',
  'aif-security-checklist',
  'aif-skill-generator',
  'aif-transfer',
  'aif-verify',
  'aif-warmup',
];

// Old v1 skill directory names that were renamed to aif-* in v2
const OLD_SKILL_NAMES = [
  'architecture',
  'archive',
  'best-practices',
  'build-automation',
  'ci',
  'commit',
  'distillation',
  'dockerize',
  'docs',
  'evolve',
  'explore',
  'feature',
  'fix',
  'grounded',
  'implement',
  'improve',
  'loop',
  'plan',
  'qa',
  'qa-check',
  'reference',
  'review',
  'roadmap',
  'rules',
  'rules-check',
  'security-checklist',
  'skill-generator',
  'task',
  'transfer',
  'verify',
  'warmup',
];

// Old v2 skill directory names before aif-* migration
const OLD_AIF_PREFIX_SKILL_NAMES = [
  'ai-factory',
  'ai-factory-architecture',
  'ai-factory-best-practices',
  'ai-factory-build-automation',
  'ai-factory-ci',
  'ai-factory-commit',
  'ai-factory-dockerize',
  'ai-factory-docs',
  'ai-factory-evolve',
  'ai-factory-fix',
  'ai-factory-implement',
  'ai-factory-improve',
  'ai-factory-plan',
  'ai-factory-review',
  'ai-factory-roadmap',
  'ai-factory-rules',
  'ai-factory-security-checklist',
  'ai-factory-skill-generator',
  'ai-factory-verify',
  // Transitional names that were removed earlier
  'ai-factory-task',
  'ai-factory-feature',
];

// Old workflow skills stored as flat .md files by Antigravity transformer
const OLD_WORKFLOW_SKILLS = new Set([
  'commit',
  'feature',
  'fix',
  'implement',
  'improve',
  'task',
  'verify',
]);

const LEGACY_RULE_FILES = new Set([
  'aif-guardrails.md',
  'aif-conventions.md',
]);

const KNOWN_LEGACY_WORKFLOW_FILES = new Set([
  ...CANONICAL_V2_SKILL_NAMES.map(name => `${name}.md`),
  ...OLD_SKILL_NAMES.map(name => `${name}.md`),
  ...OLD_AIF_PREFIX_SKILL_NAMES.map(name => `${name}.md`),
]);

function isLegacyWorkflowFile(fileName: string): boolean {
  if (!fileName.endsWith('.md')) {
    return false;
  }
  return KNOWN_LEGACY_WORKFLOW_FILES.has(fileName);
}

async function removeWorkflowFile(projectDir: string, configDir: string, skillName: string): Promise<boolean> {
  const isBare = !skillName.startsWith('aif-') && !skillName.startsWith('ai-factory-') && skillName !== 'aif';
  const fileName = `${skillName}.md`;
  const flatFile = path.join(projectDir, configDir, 'workflows', fileName);
  if (await fileExists(flatFile)) {
    const content = await readTextFile(flatFile);
    if (!content) {
      return false;
    }
    if (isBare && !isAiFactoryWorkflowArtifact(content, skillName)) {
      return false;
    }
    if (!(await isUnmodifiedPackageWorkflow(content, fileName))) {
      return false;
    }
    await removeFile(flatFile);
    return true;
  }
  if (configDir !== '.agent') {
    const legacyFlatFile = path.join(projectDir, '.agent', 'workflows', fileName);
    if (await fileExists(legacyFlatFile)) {
      const content = await readTextFile(legacyFlatFile);
      if (!content) {
        return false;
      }
      if (isBare && !isAiFactoryWorkflowArtifact(content, skillName)) {
        return false;
      }
      if (!(await isUnmodifiedPackageWorkflow(content, fileName))) {
        return false;
      }
      await removeFile(legacyFlatFile);
      return true;
    }
  }
  return false;
}

const SKILL_INTERNAL_TOP_LEVEL_DIRS = new Set(['tests']);

function isSkillInternalDir(skillRootDir: string, candidate: string): boolean {
  const rel = path.relative(skillRootDir, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return false;
  }
  const top = rel.split(/[\\/]/)[0];
  return SKILL_INTERNAL_TOP_LEVEL_DIRS.has(top);
}

export async function isUnmodifiedLegacySkillDir(oldDir: string, skillName: string): Promise<boolean> {
  const stat = await fs.stat(oldDir).catch(() => null);
  if (!stat || !stat.isDirectory()) return false;

  // If no SKILL.md exists, this is not a standard AI Factory skill directory — preserve it
  const skillFile = path.join(oldDir, 'SKILL.md');
  if (!(await fileExists(skillFile))) return false;

  // Map legacy bare names to canonical aif-* skill names
  let canonicalSkill = skillName;
  if (canonicalSkill === 'aif' || canonicalSkill === 'ai-factory') {
    canonicalSkill = 'aif';
  } else if (
    canonicalSkill === 'feature' ||
    canonicalSkill === 'ai-factory-feature' ||
    canonicalSkill === 'aif-feature'
  ) {
    canonicalSkill = 'aif-plan';
  } else if (
    canonicalSkill === 'task' ||
    canonicalSkill === 'ai-factory-task' ||
    canonicalSkill === 'aif-task'
  ) {
    canonicalSkill = 'aif-implement';
  } else if (canonicalSkill.startsWith('ai-factory-')) {
    canonicalSkill = canonicalSkill.replace(/^ai-factory-/, 'aif-');
  } else if (!canonicalSkill.startsWith('aif-')) {
    canonicalSkill = `aif-${canonicalSkill}`;
  }

  const pkgSkillDir = path.join(getSkillsDir(), canonicalSkill);
  if (!(await fileExists(pkgSkillDir))) return false;

  // Compare every local file against its package counterpart
  const localFiles = await listFilesRecursive(oldDir);
  for (const absLocal of localFiles) {
    const relFile = path.relative(oldDir, absLocal).replaceAll('\\', '/');
    if (isSkillInternalDir(oldDir, absLocal)) {
      // User created files in tests/ or other non-distributed directories -> preserve
      return false;
    }
    const pkgFile = path.join(pkgSkillDir, relFile);
    if (!(await fileExists(pkgFile))) {
      // Untracked or extra user file inside skill directory -> preserve
      return false;
    }
    const localContent = await readTextFile(absLocal);
    const pkgContent = await readTextFile(pkgFile);
    if (localContent === null || pkgContent === null) return false;
    if (localContent.replace(/\r\n/g, '\n').trim() !== pkgContent.replace(/\r\n/g, '\n').trim()) {
      return false;
    }
  }

  // Symmetric check: verify all package files exist in oldDir (skipping internal test dirs)
  const pkgFiles = await listFilesRecursive(pkgSkillDir, {
    skipDirectory: absPath => isSkillInternalDir(pkgSkillDir, absPath),
  });
  for (const absPkg of pkgFiles) {
    const relFile = path.relative(pkgSkillDir, absPkg).replaceAll('\\', '/');
    const localFile = path.join(oldDir, relFile);
    if (!(await fileExists(localFile))) {
      // Missing a package file inside legacy skill directory -> customized/partial -> preserve
      return false;
    }
  }

  return true;
}

export async function migrateLegacyAntigravityFlatWorkflows(
  projectDir: string,
  config: Config,
): Promise<boolean> {
  const agAgent = config.agents.find(a => a.id === 'antigravity');
  if (!agAgent || agAgent.skillsDir.replaceAll('\\', '/').replace(/\/$/, '') !== '.agent/skills') return false;

  const workflowsDir = path.join(projectDir, '.agent', 'workflows');
  if (!(await fileExists(workflowsDir))) return false;

  let modifiedConfig = false;
  agAgent.managedSkills ??= {};

  for (const skillName of [...agAgent.installedSkills]) {
    const targetDir = path.join(projectDir, agAgent.skillsDir, skillName);
    if (await fileExists(targetDir)) continue;

    // Search for flat workflow file in .agent/workflows/ with all historical naming variants
    const candidateFiles = [
      `${skillName}.md`,                                       // aif-plan.md
      `ai-factory.${skillName}.md`,                            // ai-factory.aif-plan.md
      `${skillName.replace(/^aif-/, '')}.md`,                  // plan.md
      `ai-factory.${skillName.replace(/^aif-/, '')}.md`,       // ai-factory.plan.md
      `ai-factory-${skillName.replace(/^aif-/, '')}.md`,       // ai-factory-plan.md
    ];
    if (skillName === 'aif') {
      candidateFiles.push('ai-factory.md');
    }

    let matchedFile: string | null = null;

    for (const cand of candidateFiles) {
      const p = path.join(workflowsDir, cand);
      if (await fileExists(p)) {
        const c = await readTextFile(p);
        if (c !== null && (await isUnmodifiedPackageWorkflow(c, cand))) {
          matchedFile = p;
          break;
        }
      }
    }

    if (matchedFile) {
      // Stage the canonical package skill into .agent/skills/<name>/ so prepareSkillTargets
      // finds a valid baseline directory with provable managed state
      const pkgDir = path.join(getSkillsDir(), skillName);
      if (await fileExists(pkgDir)) {
        await ensureDir(targetDir);
        const context = createSkillRenderContext(agAgent.id, agAgent.skillsDir);
        const rendered = await renderSkillFiles(pkgDir, skillName, agAgent.id, context);
        for (const [relPath, bytes] of rendered) {
          const destPath = path.join(targetDir, relPath);
          await ensureDir(path.dirname(destPath));
          await fs.writeFile(destPath, bytes);
        }
        const state = (await buildManagedSkillsState(projectDir, agAgent, [skillName]))[skillName];
        if (state) {
          agAgent.managedSkills[skillName] = state;
          modifiedConfig = true;
        }
        await removeFile(matchedFile);
        console.log(chalk.dim(`  [antigravity] Staged legacy workflow ${path.basename(matchedFile)} → .agent/skills/${skillName}/ for migration`));
      }
    } else {
      // No unmodified flat workflow exists for this skill — the user may have deleted or
      // heavily customized it. Remove from installedSkills so preflight does not abort,
      // but preserve any user files in .agent/workflows/
      agAgent.installedSkills = agAgent.installedSkills.filter(s => s !== skillName);
      modifiedConfig = true;
      console.log(chalk.yellow(`  [antigravity] Skill "${skillName}" has no verifiable baseline; removed from installed list`));
    }
  }

  if (modifiedConfig) {
    await saveConfig(projectDir, config);
  }
  return modifiedConfig;
}

interface LegacySkillRemovalOptions {
  projectDir: string;
  configDir: string;
  skillsDir: string;
  agentId: string;
  skillName: string;
  removeWorkflow: boolean;
}

async function removeLegacySkillArtifacts(options: LegacySkillRemovalOptions): Promise<number> {
  const { projectDir, configDir, skillsDir, agentId, skillName, removeWorkflow } = options;
  let removedCount = 0;

  if (removeWorkflow && await removeWorkflowFile(projectDir, configDir, skillName)) {
    console.log(chalk.yellow(`  [${agentId}] Removed workflow: ${skillName}.md`));
    removedCount++;
  }

  const oldDir = path.join(skillsDir, skillName);
  if (await fileExists(oldDir)) {
    if (await isUnmodifiedLegacySkillDir(oldDir, skillName)) {
      await removeDirectory(oldDir);
      console.log(chalk.yellow(`  [${agentId}] Removed legacy skill: ${skillName}/`));
      removedCount++;
    } else {
      console.log(chalk.yellow(`  [${agentId}] Preserved custom skill: ${path.relative(projectDir, oldDir).replaceAll('\\', '/')}/`));
    }
  }

  return removedCount;
}

export async function upgradeCommand(): Promise<void> {
  return withSkillProjectLock(process.cwd(), () => upgradeLocked());
}

async function upgradeLocked(): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Upgrade to v2\n'));

  let config = await loadConfig(projectDir);

  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    throw new Error('No .ai-factory.json found');
  }

  if (config.agents.length === 0) {
    console.log(chalk.red('Error: No agents configured in .ai-factory.json.'));
    console.log(chalk.dim('Run "ai-factory init" to configure at least one agent.'));
    throw new Error('No agents configured in .ai-factory.json');
  }

  await hydrateProjectAgentRegistry(projectDir, {
    extensionNames: config.extensions?.map(extension => extension.name) ?? [],
  });
  await recoverSkillMigration(projectDir);
  config = (await loadConfig(projectDir))!;

  // Stage flat legacy Antigravity 1.0 workflows into skill directories
  // so prepareSkillTargets() finds a valid baseline. Must run BEFORE resolveSkillTargets().
  await migrateLegacyAntigravityFlatWorkflows(projectDir, config);
  config = (await loadConfig(projectDir))!;

  const oldSkillRoots = new Map(config.agents.map(agent => [agent.id, agent.skillsDir]));
  const groups = await resolveSkillTargets(projectDir, config.agents);
  const availableSkills = await getAvailableSkills();
  // v1 names are handled by the explicit upgrade cleanup below. Only installed v2
  // skills with verifiable receipts participate in the skills-only transaction.
  const migrationConfig = structuredClone(config);
  for (const agent of migrationConfig.agents) agent.installedSkills = agent.installedSkills.filter(skill => availableSkills.includes(skill));
  await prepareSkillTargets(projectDir, migrationConfig, groups);
  config = (await loadConfig(projectDir))!;

  // Step 1: Migrate legacy plan directories to .ai-factory/plans/
  // Also ensure newer v2 working directories exist.
  const aiFactoryDir = path.join(projectDir, '.ai-factory');
  const featuresDir = path.join(projectDir, '.ai-factory', 'features');
  const changesDir = path.join(projectDir, '.ai-factory', 'changes');
  const plansDir = path.join(projectDir, '.ai-factory', 'plans');
  const evolutionsDir = path.join(aiFactoryDir, 'evolutions');
  const skillContextDir = path.join(aiFactoryDir, 'skill-context');

  if (await fileExists(changesDir) && !(await fileExists(plansDir))) {
    await fs.move(changesDir, plansDir);
    console.log(chalk.green('✓ Renamed .ai-factory/changes/ → .ai-factory/plans/\n'));
  }

  if (await fileExists(featuresDir) && !(await fileExists(plansDir))) {
    await fs.move(featuresDir, plansDir);
    console.log(chalk.green('✓ Renamed .ai-factory/features/ → .ai-factory/plans/\n'));
  }

  // Newer v2 structure used by /aif-evolve for incremental patch processing.
  await fs.ensureDir(evolutionsDir);
  await fs.ensureDir(skillContextDir);

  const legacyCursorPath = path.join(aiFactoryDir, 'patch-cursor.json');
  const cursorPath = path.join(evolutionsDir, 'patch-cursor.json');
  if (await fileExists(legacyCursorPath)) {
    if (!(await fileExists(cursorPath))) {
      await fs.move(legacyCursorPath, cursorPath);
      console.log(chalk.green('✓ Moved .ai-factory/patch-cursor.json → .ai-factory/evolutions/patch-cursor.json\n'));
    } else {
      await removeFile(legacyCursorPath);
      console.log(chalk.yellow('  WARN: Both cursor files existed; removed .ai-factory/patch-cursor.json and kept .ai-factory/evolutions/patch-cursor.json as source of truth\n'));
    }
  }

  const installedByTarget = new Map<string, string[]>();
  const cleanedRoots = new Set<string>();

  for (const agent of config.agents) {
    const agentConfig = getAgentConfig(agent.id);
    const skillsDir = path.join(projectDir, oldSkillRoots.get(agent.id) ?? agent.skillsDir);
    const group = groups.find(group => group.targets.some(target => target.id === agent.id))!;
    const isAntigravity = agent.id === 'antigravity';
    let removedCount = 0;

    console.log(chalk.dim(`Scanning for old-format skills [${agent.id}]...\n`));

    for (const oldName of cleanedRoots.has(skillsDir) ? [] : OLD_SKILL_NAMES) {
      removedCount += await removeLegacySkillArtifacts({
        projectDir,
        configDir: agentConfig.configDir,
        skillsDir,
        agentId: agent.id,
        skillName: oldName,
        removeWorkflow: isAntigravity && OLD_WORKFLOW_SKILLS.has(oldName),
      });
    }

    // Remove old aif-task, aif-feature, and ai-factory-* skills
    const obsoleteSkills = Array.from(new Set([
      'aif-task', 'aif-feature',
      ...OLD_SKILL_NAMES.map(n => `ai-factory-${n}`),
      ...OLD_AIF_PREFIX_SKILL_NAMES,
    ]));

    for (const oldSkill of cleanedRoots.has(skillsDir) ? [] : obsoleteSkills) {
      removedCount += await removeLegacySkillArtifacts({
        projectDir,
        configDir: agentConfig.configDir,
        skillsDir,
        agentId: agent.id,
        skillName: oldSkill,
        removeWorkflow: isAntigravity,
      });
    }
    cleanedRoots.add(skillsDir);

    if (isAntigravity) {
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

        const entries = await fs.readdir(legacyWorkflowsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && isLegacyWorkflowFile(entry.name)) {
            const filePath = path.join(legacyWorkflowsDir, entry.name);
            const content = await readTextFile(filePath);
            if (content !== null && (await isUnmodifiedPackageWorkflow(content, entry.name))) {
              await removeFile(filePath);
              console.log(chalk.yellow(`  [antigravity] Removed legacy Antigravity 1.0 workflow: .agent/workflows/${entry.name}`));
              removedCount++;
            } else {
              console.log(chalk.yellow(`  [antigravity] Preserving user-modified legacy workflow: .agent/workflows/${entry.name}`));
            }
          }
        }
        await removeEmptyDirBottomUp(legacyWorkflowsDir);
      }
      const legacyRulesDir = path.join(projectDir, '.agent', 'rules');
      if (await fileExists(legacyRulesDir)) {
        const entries = await fs.readdir(legacyRulesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && LEGACY_RULE_FILES.has(entry.name)) {
            const rulePath = path.join(legacyRulesDir, entry.name);
            const content = await readTextFile(rulePath);
            let matches = false;
            if (content !== null) {
              if (entry.name === 'aif-guardrails.md') {
                matches =
                  matchesRuleTemplate(content, getGuardrailsRuleContent(projectDir)) ||
                  matchesRuleTemplate(content, LEGACY_GUARDRAILS_CONTENT);
              } else if (entry.name === 'aif-conventions.md') {
                matches = matchesRuleTemplate(content, getConventionsRuleContent());
              }
            }
            if (matches) {
              await removeFile(rulePath);
              console.log(chalk.yellow(`  [antigravity] Removed legacy Antigravity 1.0 rule: .agent/rules/${entry.name}`));
              removedCount++;
            } else {
              console.log(chalk.yellow(`  [antigravity] Preserving modified legacy rule: .agent/rules/${entry.name}`));
            }
          }
        }
        await removeEmptyDirBottomUp(legacyRulesDir);
      }
      const legacyAgentDir = path.join(projectDir, '.agent');
      if (await fileExists(legacyAgentDir)) {
        await removeEmptyDirBottomUp(legacyAgentDir);
      }
      if (agent.skillsDir === '.agent/skills') {
        agent.skillsDir = agentConfig.skillsDir;
      }
      const oldSubagentsDir = path.join(projectDir, '.agents', 'subagents');
      if (!agent.agentsDir || agent.agentsDir === '.agents/subagents') {
        agent.agentsDir = agentConfig.agentsDir;
      }

      // Migrate legacy .agents/subagents to .agents/agents for Antigravity
      const newAgentsDir = path.join(projectDir, '.agents', 'agents');
      if (await fileExists(oldSubagentsDir)) {
        if (!await fileExists(newAgentsDir)) {
          await ensureDir(newAgentsDir);
        }
        const files = await listFilesRecursive(oldSubagentsDir);
        for (const file of files) {
          const relPath = path.relative(oldSubagentsDir, file).replaceAll('\\', '/');
          const newPath = path.join(newAgentsDir, relPath);
          const targetExists = await fileExists(newPath);
          if (!targetExists) {
            await copyFile(file, newPath);
            await removeFile(file);
          } else {
            const [srcBuf, destBuf] = await Promise.all([
              readFileBuffer(file),
              readFileBuffer(newPath),
            ]);
            if (srcBuf && destBuf && srcBuf.equals(destBuf)) {
              await removeFile(file);
            } else {
              console.log(chalk.yellow(`  [antigravity] Preserved conflicting subagent in: ${relPath}`));
            }
          }
        }
        await removeEmptyDirBottomUp(oldSubagentsDir);
        agent.agentsDir = '.agents/agents';
      }
    }

    if (removedCount === 0) {
      console.log(chalk.dim(`  [${agent.id}] No old-format skills found.\n`));
    } else {
      console.log(chalk.dim(`\n  [${agent.id}] Removed ${removedCount} old-format skill(s).\n`));
    }

    console.log(chalk.dim(`Installing new-format skills [${agent.id}]...\n`));

    const { custom: customSkills } = partitionSkills(agent.installedSkills);
    const installedSkills = installedByTarget.get(group.physicalPath) ?? await installSkills({
      projectDir,
      skillsDir: agent.skillsDir,
      skills: availableSkills,
      agentId: agent.id,
      renderContext: group.context,
    });
    installedByTarget.set(group.physicalPath, installedSkills);
    const installedAgentFiles = agent.agentsDir
      ? await installSubagents({
        projectDir,
        installedSkills,
        previousInstallation: agent,
        agentId: agent.id,
        agentsDir: agent.agentsDir,
        installedAgentFiles: agent.installedAgentFiles,
        managedAgentFiles: agent.managedAgentFiles,
      })
      : [];
    const effectiveConfigFiles = agent.configFiles ?? agentConfig.configFiles ?? [];
    const installedConfigFiles = effectiveConfigFiles.length > 0
      ? await installConfigFiles({
        projectDir,
        agentId: agent.id,
        configFiles: effectiveConfigFiles,
        installedConfigFiles: agent.installedConfigFiles,
        managedConfigFiles: agent.managedConfigFiles,
      })
      : [];

    agent.installedSkills = [...installedSkills, ...customSkills];
    if (agent.agentsDir) {
      agent.installedAgentFiles = installedAgentFiles;
      agent.managedAgentFiles = await buildManagedSubagentsState(projectDir, agent, installedAgentFiles);
    }
    if (effectiveConfigFiles.length > 0) {
      agent.configFiles = effectiveConfigFiles;
      agent.installedConfigFiles = installedConfigFiles;
      agent.managedConfigFiles = await buildManagedConfigFilesState(projectDir, agent, installedConfigFiles);
    }
  }

  await composeInstalledExtensionSkills(projectDir, config);
  const replaced = collectReplacedSkills(config.extensions ?? []);
  for (const agent of config.agents) {
    agent.managedSkills = await buildManagedSkillsState(projectDir, agent,
      agent.installedSkills.filter(skill => availableSkills.includes(skill) && !replaced.has(skill)),
      groups.find(group => group.targets.some(target => target.id === agent.id))!.context, config.extensions ?? []);
  }

  // Step 3: Update config to latest version and multi-agent schema
  const currentVersion = getCurrentVersion();
  config.version = currentVersion;
  await saveConfig(projectDir, config);

  // Step 4: Summary
  console.log(chalk.green('✓ Upgrade to v2 complete!\n'));

  for (const agent of config.agents) {
    const { base: baseSkills, custom: customSkills } = partitionSkills(agent.installedSkills);

    console.log(chalk.bold(`[${agent.id}] Installed skills:`));
    for (const skill of baseSkills) {
      console.log(chalk.dim(`  - ${skill}`));
    }

    if (customSkills.length > 0) {
      console.log(chalk.bold(`[${agent.id}] Custom skills (preserved):`));
      for (const skill of customSkills) {
        console.log(chalk.dim(`  - ${skill}`));
      }
    }
    console.log('');
  }
}
