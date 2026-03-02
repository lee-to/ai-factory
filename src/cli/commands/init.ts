import chalk from 'chalk';
import path from 'path';
import { runWizard } from '../wizard/prompts.js';
import { installSkills } from '../../core/installer.js';
import {
  saveConfig,
  configExists,
  loadConfig,
  getCurrentVersion,
  createDefaultSubagentsConfig,
  type AgentInstallation,
} from '../../core/config.js';
import { configureMcp, getMcpInstructions } from '../../core/mcp.js';
import { getAgentConfig } from '../../core/agents.js';
import { cleanupAgentSetup, getAgentOnboarding } from '../../core/transformer.js';
import { removeDirectory } from '../../utils/fs.js';
import { applyExtensionInjections } from '../../core/injections.js';

async function removeAgentSetup(projectDir: string, agent: AgentInstallation): Promise<void> {
  await removeDirectory(path.join(projectDir, agent.skillsDir));
  await cleanupAgentSetup(agent.id, projectDir, agent.skillsDir);
}

export async function initCommand(): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Project Setup\n'));

  const hasExistingConfig = await configExists(projectDir);
  const existingConfig = hasExistingConfig ? await loadConfig(projectDir) : null;

  if (hasExistingConfig) {
    console.log(chalk.yellow('Warning: .ai-factory.json already exists.'));
    console.log('Running init will reconfigure selected agents (add/remove) and reinstall base skills.\n');
  }

  try {
    const existingAgentIds = existingConfig?.agents.map(agent => agent.id) ?? [];
    const answers = await runWizard(existingAgentIds);

    const selectedAgentIds = new Set(answers.agents.map(agent => agent.id));
    const removedAgents = (existingConfig?.agents ?? []).filter(agent => !selectedAgentIds.has(agent.id));

    if (removedAgents.length > 0) {
      console.log(chalk.dim('\nRemoving deselected agent setups...\n'));
      for (const removedAgent of removedAgents) {
        await removeAgentSetup(projectDir, removedAgent);
        console.log(chalk.yellow(`  Removed: ${removedAgent.id}`));
      }
    }

    console.log(chalk.dim('\nInstalling skills...\n'));

    const installedAgents: AgentInstallation[] = [];
    const mcpSummary: Record<string, string[]> = {};

    for (const agentSelection of answers.agents) {
      const agentConfig = getAgentConfig(agentSelection.id);

      const installedSkills = await installSkills({
        projectDir,
        skillsDir: agentConfig.skillsDir,
        skills: answers.selectedSkills,
        agentId: agentSelection.id,
      });

      const configuredMcp = await configureMcp(projectDir, {
        github: agentSelection.mcpGithub,
        filesystem: agentSelection.mcpFilesystem,
        postgres: agentSelection.mcpPostgres,
        chromeDevtools: agentSelection.mcpChromeDevtools,
        playwright: agentSelection.mcpPlaywright,
      }, agentSelection.id);

      if (configuredMcp.length > 0) {
        mcpSummary[agentSelection.id] = configuredMcp;
      }

      installedAgents.push({
        id: agentSelection.id,
        skillsDir: agentConfig.skillsDir,
        installedSkills,
        mcp: {
          github: agentSelection.mcpGithub,
          filesystem: agentSelection.mcpFilesystem,
          postgres: agentSelection.mcpPostgres,
          chromeDevtools: agentSelection.mcpChromeDevtools,
          playwright: agentSelection.mcpPlaywright,
        },
      });
    }

    const existingExtensions = existingConfig?.extensions ?? [];

    await saveConfig(projectDir, {
      version: getCurrentVersion(),
      agents: installedAgents,
      extensions: existingExtensions,
      subagents: existingConfig?.subagents ?? createDefaultSubagentsConfig(),
    });

    // Re-apply extension injections after skill installation
    if (existingExtensions.length > 0) {
      let totalInjections = 0;
      for (const agent of installedAgents) {
        totalInjections += await applyExtensionInjections(projectDir, agent, existingExtensions);
      }
      if (totalInjections > 0) {
        console.log(chalk.green(`✓ Re-applied ${totalInjections} extension injection(s)`));
      }
    }

    console.log(chalk.green('✓ Configuration saved to .ai-factory.json'));

    console.log(chalk.bold.green('\n✅ Setup complete!\n'));

    for (const agent of installedAgents) {
      const agentConfig = getAgentConfig(agent.id);

      console.log(chalk.bold(`${agentConfig.displayName}:`));
      console.log(chalk.dim(`  Skills directory: ${path.join(projectDir, agent.skillsDir)}`));
      console.log(chalk.dim(`  Installed skills: ${agent.installedSkills.length}`));

      const configuredMcp = mcpSummary[agent.id];
      if (configuredMcp && configuredMcp.length > 0) {
        console.log(chalk.green(`  MCP servers configured: ${configuredMcp.join(', ')}`));
        const instructions = getMcpInstructions(configuredMcp);
        for (const instruction of instructions) {
          console.log(chalk.dim(`    ${instruction}`));
        }
      }
      console.log('');
    }

    console.log(chalk.bold('\nNext steps:'));
    const onboardingByAgent = installedAgents.map(agent => ({
      agent,
      onboarding: getAgentOnboarding(agent.id),
    }));

    for (const [index, { agent, onboarding }] of onboardingByAgent.entries()) {
      const agentConfig = getAgentConfig(agent.id);

      console.log(chalk.dim(`  ${index + 1}. ${agentConfig.displayName}`));
      for (const line of onboarding.welcomeMessage) {
        console.log(chalk.dim(`     ${line}`));
      }
    }

    const invocationHints = onboardingByAgent
      .map(({ onboarding }) => onboarding.invocationHint)
      .filter(Boolean)
      .join('; ');

    console.log(chalk.dim(`  ${installedAgents.length + 1}. Use /aif-plan and /aif-commit for daily workflow${invocationHints ? ` (${invocationHints})` : ''}`));
    console.log('');

  } catch (error) {
    if ((error as Error).message?.includes('User force closed')) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
    throw error;
  }
}
