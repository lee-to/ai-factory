import inquirer from 'inquirer';
import chalk from 'chalk';
import { getAvailableSkills } from '../../core/installer.js';
import { getAgentConfig, getAgentChoices } from '../../core/agents.js';
import { formatSkillChoiceName } from './skill-hints.js';

export interface AgentWizardSelection {
  id: string;
  mcpGithub: boolean;
  mcpFilesystem: boolean;
  mcpPostgres: boolean;
  mcpChromeDevtools: boolean;
  mcpPlaywright: boolean;
}

export interface WizardAnswers {
  selectedSkills: string[];
  agents: AgentWizardSelection[];
}

export async function runWizard(defaultAgentIds: string[] = []): Promise<WizardAnswers> {
  const availableSkills = await getAvailableSkills();
  const selectedByDefault = new Set(defaultAgentIds);

  console.log('\n💡 Run /aif after setup to analyze your project and generate relevant skills.\n');

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedAgents',
      message: 'Target AI agents:',
      choices: getAgentChoices().map(agent => ({
        ...agent,
        checked: selectedByDefault.has(agent.value),
      })),
      validate: (value: string[]) => {
        if (value.length === 0) {
          return 'Select at least one agent.';
        }
        return true;
      },
    },
    {
      type: 'checkbox',
      name: 'selectedSkills',
      message: 'Base skills to install:',
      choices: availableSkills.map(skill => ({
        name: formatSkillChoiceName(skill, hint => chalk.gray(hint)),
        short: skill,
        value: skill,
        checked: true, // All skills selected by default
      })),
    },
  ]);

  const selections: AgentWizardSelection[] = [];

  for (const agentId of answers.selectedAgents as string[]) {
    const agentConfig = getAgentConfig(agentId);
    let mcpAnswers = {
      mcpGithub: false,
      mcpFilesystem: false,
      mcpPostgres: false,
      mcpChromeDevtools: false,
      mcpPlaywright: false,
    };

    if (agentConfig.supportsMcp) {
      const { configureMcp } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configureMcp',
          message: `[${agentConfig.displayName}] Configure MCP servers?`,
          default: false,
        },
      ]);

      if (configureMcp) {
        mcpAnswers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'mcpGithub',
            message: `[${agentConfig.displayName}] GitHub MCP (PRs, issues, repo operations)?`,
            default: false,
          },
          {
            type: 'confirm',
            name: 'mcpPostgres',
            message: `[${agentConfig.displayName}] Postgres MCP (database queries)?`,
            default: false,
          },
          {
            type: 'confirm',
            name: 'mcpFilesystem',
            message: `[${agentConfig.displayName}] Filesystem MCP (advanced file operations)?`,
            default: false,
          },
          {
            type: 'confirm',
            name: 'mcpChromeDevtools',
            message: `[${agentConfig.displayName}] Chrome Devtools MCP (inspect, debug, performance insights, analyze network requests)?`,
            default: false,
          },
          {
            type: 'confirm',
            name: 'mcpPlaywright',
            message: `[${agentConfig.displayName}] Playwright MCP (browser automation, web testing, interaction via accessibility tree)?`,
            default: false,
          },
        ]);
      }
    }

    selections.push({
      id: agentId,
      ...mcpAnswers,
    });
  }

  return {
    selectedSkills: answers.selectedSkills,
    agents: selections,
  };
}
