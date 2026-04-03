import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { loadConfig, saveConfig, getCurrentVersion } from '../../core/config.js';
import { buildManagedSkillsState, buildManagedSubagentsState, installSkills, installSubagents, getAvailableSkills, partitionSkills } from '../../core/installer.js';
import { getAgentConfig } from '../../core/agents.js';
import { fileExists, removeDirectory, removeFile } from '../../utils/fs.js';

// Old v1 skill directory names that were renamed to aif-* in v2
const OLD_SKILL_NAMES = [
  'architecture',
  'best-practices',
  'build-automation',
  'ci',
  'commit',
  'dockerize',
  'docs',
  'evolve',
  'feature',
  'fix',
  'implement',
  'improve',
  'review',
  'security-checklist',
  'skill-generator',
  'task',
  'verify',
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

async function removeWorkflowFile(projectDir: string, configDir: string, skillName: string): Promise<boolean> {
  const flatFile = path.join(projectDir, configDir, 'workflows', `${skillName}.md`);
  if (await fileExists(flatFile)) {
    await removeFile(flatFile);
    return true;
  }
  return false;
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
    await removeDirectory(oldDir);
    console.log(chalk.yellow(`  [${agentId}] Removed skill: ${skillName}/`));
    removedCount++;
  }

  return removedCount;
}

export async function upgradeCommand(): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Upgrade to v2\n'));

  const config = await loadConfig(projectDir);

  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  if (config.agents.length === 0) {
    console.log(chalk.red('Error: No agents configured in .ai-factory.json.'));
    console.log(chalk.dim('Run "ai-factory init" to configure at least one agent.'));
    process.exit(1);
  }

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

  const availableSkills = await getAvailableSkills();

  for (const agent of config.agents) {
    const agentConfig = getAgentConfig(agent.id);
    const skillsDir = path.join(projectDir, agent.skillsDir);
    const isAntigravity = agent.id === 'antigravity';
    let removedCount = 0;

    console.log(chalk.dim(`Scanning for old-format skills [${agent.id}]...\n`));

    for (const oldName of OLD_SKILL_NAMES) {
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

    for (const oldSkill of obsoleteSkills) {
      removedCount += await removeLegacySkillArtifacts({
        projectDir,
        configDir: agentConfig.configDir,
        skillsDir,
        agentId: agent.id,
        skillName: oldSkill,
        removeWorkflow: isAntigravity,
      });
    }

    if (removedCount === 0) {
      console.log(chalk.dim(`  [${agent.id}] No old-format skills found.\n`));
    } else {
      console.log(chalk.dim(`\n  [${agent.id}] Removed ${removedCount} old-format skill(s).\n`));
    }

    console.log(chalk.dim(`Installing new-format skills [${agent.id}]...\n`));

    const { custom: customSkills } = partitionSkills(agent.installedSkills);
    const installedSkills = await installSkills({
      projectDir,
      skillsDir: agent.skillsDir,
      skills: availableSkills,
      agentId: agent.id,
    });
    const installedSubagents = agent.subagentsDir
      ? await installSubagents({
        projectDir,
        subagentsDir: agent.subagentsDir,
      })
      : [];

    agent.installedSkills = [...installedSkills, ...customSkills];
    if (agent.subagentsDir) {
      agent.installedSubagents = installedSubagents;
      agent.managedSubagents = await buildManagedSubagentsState(projectDir, agent, installedSubagents);
    }
    agent.managedSkills = await buildManagedSkillsState(projectDir, agent, installedSkills);
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
