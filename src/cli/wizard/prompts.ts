import inquirer from 'inquirer';
import { detectStack, type DetectedStack } from './detector.js';
import { getAvailableSkills } from '../../core/installer.js';
import { getAgentConfig, getAgentChoices } from '../../core/agents.js';

export interface WizardAnswers {
  agent: string;
  skillsDir: string;
  selectedSkills: string[];
  mcpGithub: boolean;
  mcpFilesystem: boolean;
  mcpPostgres: boolean;
  mcpChromeDevtools: boolean;
  mcpSerena: boolean;
}

export async function runWizard(projectDir: string): Promise<WizardAnswers> {
  const detectedStack = await detectStack(projectDir);
  const availableSkills = await getAvailableSkills();

  // Base skills that are always recommended
  const baseSkills = [
    'ai-factory',
    'skill-generator',
    'feature',
    'task',
    'implement',
    'commit',
    'review',
  ];

  if (detectedStack) {
    console.log(`\n📦 Detected: ${detectedStack.name}`);
    if (detectedStack.frameworks.length > 0) {
      console.log(`   Frameworks: ${detectedStack.frameworks.join(', ')}`);
    }
    console.log(`\n💡 Run /ai-factory after setup to generate stack-specific skills.\n`);
  } else {
    console.log('\n📦 No existing project detected.');
    console.log('💡 Run /ai-factory after setup to analyze or describe your project.\n');
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'agent',
      message: 'Target AI agent:',
      choices: getAgentChoices(),
      default: 'claude',
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

  const agentConfig = getAgentConfig(answers.agent);

  let mcpAnswers = {
    mcpGithub: false,
    mcpFilesystem: false,
    mcpPostgres: false,
    mcpChromeDevtools: false,
    mcpSerena: false,
  };

  if (agentConfig.supportsMcp) {
    const { configureMcp } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureMcp',
        message: 'Configure MCP servers?',
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
          message: 'GitHub MCP (PRs, issues, repo operations)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'mcpPostgres',
          message: 'Postgres MCP (database queries)?',
          default: suggestPostgres,
        },
        {
          type: 'confirm',
          name: 'mcpFilesystem',
          message: 'Filesystem MCP (advanced file operations)?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'mcpChromeDevtools',
          message: 'Chrome Devtools MCP (inspect, debug, performance insights, analyze network requests)?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'mcpSerena',
          message: 'Serena MCP (IDE-like code navigation, symbol-level editing, project memory)?',
          default: true,
        },
      ]);
    }
  }

  const skillsDir = agentConfig.skillsDir;

  return {
    agent: answers.agent,
    skillsDir,
    selectedSkills: answers.selectedSkills,
    ...mcpAnswers,
  };
}
