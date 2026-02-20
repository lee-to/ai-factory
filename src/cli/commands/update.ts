import chalk from 'chalk';
import { loadConfig, saveConfig, getCurrentVersion } from '../../core/config.js';
import { updateSkills, getAvailableSkills } from '../../core/installer.js';

export async function updateCommand(): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Update Skills\n'));

  const config = await loadConfig(projectDir);

  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();

  console.log(chalk.dim(`Config version: ${config.version}`));
  console.log(chalk.dim(`Package version: ${currentVersion}\n`));

  console.log(chalk.dim('Updating skills...\n'));

  try {
    const availableSkills = await getAvailableSkills();
    const previousBaseSkillsByAgent = new Map<string, string[]>();

    for (const agent of config.agents) {
      const previousBaseSkills = agent.installedSkills.filter(s => !s.includes('/'));
      previousBaseSkillsByAgent.set(agent.id, previousBaseSkills);
      const newSkills = availableSkills.filter(s => !previousBaseSkills.includes(s));

      if (newSkills.length > 0) {
        console.log(chalk.cyan(`📦 [${agent.id}] New skills available: ${newSkills.join(', ')}`));
      }
    }
    if (config.agents.length > 0) {
      console.log('');
    }

    for (const agent of config.agents) {
      const updatedSkills = await updateSkills(agent, projectDir);
      agent.installedSkills = updatedSkills;
    }
    config.version = currentVersion;
    await saveConfig(projectDir, config);

    console.log(chalk.green('✓ Skills updated successfully'));
    console.log(chalk.green('✓ Configuration updated'));

    for (const agent of config.agents) {
      const previousBaseSkills = previousBaseSkillsByAgent.get(agent.id) ?? [];
      const newSkills = availableSkills.filter(s => !previousBaseSkills.includes(s));
      const baseSkills = agent.installedSkills.filter(s => !s.includes('/'));
      const customSkills = agent.installedSkills.filter(s => s.includes('/'));

      console.log(chalk.bold(`\n[${agent.id}] Base skills:`));
      for (const skill of baseSkills) {
        const isNew = newSkills.includes(skill);
        console.log(chalk.dim(`  - ${skill}`) + (isNew ? chalk.green(' (new)') : ''));
      }

      if (customSkills.length > 0) {
        console.log(chalk.bold(`[${agent.id}] Custom skills (preserved):`));
        for (const skill of customSkills) {
          console.log(chalk.dim(`  - ${skill}`));
        }
      }
    }
    console.log('');

  } catch (error) {
    console.log(chalk.red(`Error updating skills: ${(error as Error).message}`));
    process.exit(1);
  }
}
