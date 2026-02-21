import inquirer from 'inquirer';
import { detectStack, type DetectedStack } from './detector.js';
import { getAvailableSkills } from '../../core/installer.js';
import { getAgentConfig, getAgentChoices } from '../../core/agents.js';

export interface AgentWizardSelection {
  id: string;
  mcpGithub: boolean;
  mcpFilesystem: boolean;
  mcpPostgres: boolean;
  mcpChromeDevtools: boolean;
}

export interface WizardAnswers {
  selectedSkills: string[];
  agents: AgentWizardSelection[];
}

export async function runWizard(projectDir: string, defaultAgentIds: string[] = []): Promise<WizardAnswers> {
  const detectedStack = await detectStack(projectDir);
  const availableSkills = await getAvailableSkills();
  const selectedByDefault = new Set(defaultAgentIds.length > 0 ? defaultAgentIds : ['claude']);

  if (detectedStack) {
    console.log(`\n📦 Detected: ${detectedStack.name}`);
    if (detectedStack.frameworks.length > 0) {
      console.log(`   Frameworks: ${detectedStack.frameworks.join(', ')}`);
    }
    console.log(`\n💡 Run /aif after setup to generate stack-specific skills.\n`);
  } else {
    console.log('\n📦 No existing project detected.');
    console.log('💡 Run /aif after setup to analyze or describe your project.\n');
  }

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
        name: skill,
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
    };

    if (agentConfig.supportsMcp) {
      const { configureMcp } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configureMcp',
          message: `[${agentConfig.displayName}] Configure MCP servers?`,
          default: detectedStack !== null,
        },
      ]);

      if (configureMcp) {
        const suggestPostgres = detectedStack?.name &&
          ['laravel', 'symfony', 'django', 'fastapi', 'nextjs', 'node-api'].includes(detectedStack.name);

        mcpAnswers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'mcpGithub',
            message: `[${agentConfig.displayName}] GitHub MCP (PRs, issues, repo operations)?`,
            default: true,
          },
          {
            type: 'confirm',
            name: 'mcpPostgres',
            message: `[${agentConfig.displayName}] Postgres MCP (database queries)?`,
            default: suggestPostgres,
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
