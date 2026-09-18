import chalk from 'chalk';
import path from 'path';
import { runWizard, type WizardAnswers } from '../wizard/prompts.js';
import {
  buildBundledAgentFileSources,
  buildExtensionAgentFileSources,
  buildManagedConfigFilesState,
  buildManagedSkillsState,
  installConfigFiles,
  installSkills,
  installSubagents,
  getAvailableSkills,
  rebuildManagedAgentFilesForAgents,
  resolveManagedConfigFilePaths,
  resolveInstalledAgentFileTargetPath,
  removeOwnedSkills,
} from '../../core/installer.js';
import { saveConfig, configExists, loadConfig, getCurrentVersion, type AgentInstallation } from '../../core/config.js';
import { configureMcp, getMcpInstructions } from '../../core/mcp.js';
import { getAgentConfig, getAvailableAgentIds, hydrateProjectAgentRegistry } from '../../core/agents.js';
import { cleanupAgentSetup, getAgentOnboarding } from '../../core/transformer.js';
import { removeFile, copyFile, fileExists, getSkillsDir } from '../../utils/fs.js';
import { hasSurvivingConfigConsumer, resolveSkillTargets } from '../../core/skill-targets.js';
import { prepareSkillTargets, recoverSkillMigration, withSkillProjectLock } from '../../core/skills-migration.js';
import {
  assertNoAgentFileConflicts,
  collectReplacedSkills,
  installExtensionAgentFilesForAllAgents,
  mergeAgentFileSources,
  mergeInstalledAgentFiles,
  composeInstalledExtensionSkills,
} from '../../core/extension-ops.js';
import { loadAllExtensions, type ExtensionManifest } from '../../core/extensions.js';

export interface InitOptions {
  agents?: string;
  mcp?: string;
  skills?: string | boolean;
  config?: boolean;
}

const VALID_MCP_KEYS: Record<string, string> = {
  github: 'mcpGithub',
  postgres: 'mcpPostgres',
  filesystem: 'mcpFilesystem',
  'chrome-devtools': 'mcpChromeDevtools',
  playwright: 'mcpPlaywright',
};

function buildAnswersFromFlags(options: InitOptions, availableSkills: string[]): WizardAnswers {
  const availableAgentIds = getAvailableAgentIds();

  // Parse agents
  const agentIds = options.agents!.split(',').map(s => s.trim()).filter(Boolean);
  const unknownAgents = agentIds.filter(id => !availableAgentIds.includes(id));
  if (unknownAgents.length > 0) {
    throw new Error(`Unknown agent(s): ${unknownAgents.join(', ')}. Available: ${availableAgentIds.join(', ')}`);
  }
  if (agentIds.length === 0) {
    throw new Error(`At least one agent is required. Available: ${availableAgentIds.join(', ')}`);
  }

  // Parse MCP servers
  const mcpKeys = options.mcp
    ? options.mcp.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const unknownMcp = mcpKeys.filter(k => !(k in VALID_MCP_KEYS));
  if (unknownMcp.length > 0) {
    throw new Error(`Unknown MCP server(s): ${unknownMcp.join(', ')}. Available: ${Object.keys(VALID_MCP_KEYS).join(', ')}`);
  }

  // Parse skills
  let selectedSkills: string[];
  if (options.skills === false) {
    selectedSkills = [];
  } else if (typeof options.skills === 'string' && options.skills !== 'all') {
    const skillIds = options.skills.split(',').map(s => s.trim()).filter(Boolean);
    const unknownSkills = skillIds.filter(s => !availableSkills.includes(s));
    if (unknownSkills.length > 0) {
      const available = availableSkills.length > 0 ? availableSkills.join(', ') : '(none found — run without --skills to use all)';
      throw new Error(`Unknown skill(s): ${unknownSkills.join(', ')}. Available: ${available}`);
    }
    selectedSkills = skillIds;
  } else {
    selectedSkills = availableSkills;
  }

  // Build agent selections with MCP flags
  const mcpSet = new Set(mcpKeys);
  const agents = agentIds.map(id => ({
    id,
    mcpGithub: mcpSet.has('github'),
    mcpFilesystem: mcpSet.has('filesystem'),
    mcpPostgres: mcpSet.has('postgres'),
    mcpChromeDevtools: mcpSet.has('chrome-devtools'),
    mcpPlaywright: mcpSet.has('playwright'),
  }));

  return { selectedSkills, agents };
}

async function removeAgentSetup(
  projectDir: string,
  agent: AgentInstallation,
  installedExtensionManifests: ExtensionManifest[] = [],
  survivingAgents: AgentInstallation[] = [],
): Promise<void> {
  const agentConfig = getAgentConfig(agent.id);
  await removeOwnedSkills(projectDir, agent, survivingAgents);

  // Remove only AI Factory-managed agent files, not the entire directory.
  // The directory may contain user-created custom agents unrelated to AI Factory.
  const agentsDir = agent.agentsDir ?? agentConfig.agentsDir;
  if (agentsDir) {
    const managedFiles = new Set(agent.installedAgentFiles ?? []);
    for (const manifest of installedExtensionManifests) {
      for (const agentFile of manifest.agentFiles ?? []) {
        if (agentFile.runtime === agent.id) {
          managedFiles.add(agentFile.target);
        }
      }
    }

    for (const relPath of managedFiles) {
      try {
        await removeFile(resolveInstalledAgentFileTargetPath(projectDir, agentsDir, relPath));
      } catch (error) {
        console.log(
          chalk.yellow(
            `Warning: Skipping unsafe managed agent file path "${relPath}" while removing ${agent.id}: ${(error as Error).message}`,
          ),
        );
      }
    }
  }

  const configFiles = agent.installedConfigFiles ?? [];
  for (const relPath of configFiles) {
    try {
      const { targetFile } = resolveManagedConfigFilePaths(projectDir, agent.id, relPath);
      if (await hasSurvivingConfigConsumer(projectDir, path.relative(projectDir, targetFile), survivingAgents)) continue;
      await removeFile(targetFile);
    } catch (error) {
      console.log(
        chalk.yellow(
          `Warning: Skipping unsafe managed config file path "${relPath}" while removing ${agent.id}: ${(error as Error).message}`,
        ),
      );
    }
  }

  await cleanupAgentSetup(agent.id, projectDir, agent.skillsDir);
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  return withSkillProjectLock(process.cwd(), () => initLocked(options));
}

async function initLocked(options: InitOptions): Promise<void> {
  const projectDir = process.cwd();
  const nonInteractive = !!options.agents;

  console.log(chalk.bold.blue('\n🏭 AI Factory - Project Setup\n'));

  const hasExistingConfig = await configExists(projectDir);
  let existingConfig = hasExistingConfig ? await loadConfig(projectDir) : null;
  await hydrateProjectAgentRegistry(projectDir, {
    extensionNames: existingConfig?.extensions?.map(extension => extension.name) ?? [],
  });
  await recoverSkillMigration(projectDir);
  existingConfig = await loadConfig(projectDir);

  if (hasExistingConfig) {
    console.log(chalk.yellow('Warning: .ai-factory.json already exists.'));
    console.log('Running init will reconfigure selected agents (add/remove) and reinstall base skills.\n');
  }

  try {
    const existingAgentIds = existingConfig?.agents.map(agent => agent.id) ?? [];
    const availableSkills = await getAvailableSkills();
    const availableSkillSet = new Set(availableSkills);

    let answers: WizardAnswers;
    if (nonInteractive) {
      answers = buildAnswersFromFlags(options, availableSkills);
    } else {
      answers = await runWizard(existingAgentIds);
    }

    const groups = await resolveSkillTargets(projectDir,
      answers.agents.map(agent => ({
        id: agent.id,
        skillsDir: existingConfig?.agents.find(previous => previous.id === agent.id)?.skillsDir ?? getAgentConfig(agent.id).skillsDir,
      })),
    );
    if (existingConfig) await prepareSkillTargets(projectDir, existingConfig, groups);

    const selectedAgentIds = new Set(answers.agents.map(agent => agent.id));
    const removedAgents = (existingConfig?.agents ?? []).filter(agent => !selectedAgentIds.has(agent.id));
    const existingExtensions = existingConfig?.extensions ?? [];
    const survivingAgents: AgentInstallation[] = answers.agents.map(selection => ({
      ...(existingConfig?.agents.find(agent => agent.id === selection.id) ?? { mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false } }),
      id: selection.id,
      skillsDir: groups.find(group => group.targets.some(target => target.id === selection.id))!.skillsDir,
      installedSkills: answers.selectedSkills,
    }));
    const replacedSkills = collectReplacedSkills(existingExtensions);
    const selectedSkillSet = new Set(answers.selectedSkills);

    if (removedAgents.length > 0) {
      console.log(chalk.dim('\nRemoving deselected agent setups...\n'));
      const installedExtensions = existingExtensions.length > 0
        ? await loadAllExtensions(projectDir, existingExtensions.map(extension => extension.name))
        : [];
      const installedExtensionManifests = installedExtensions.map(({ manifest }) => manifest);

      for (const removedAgent of removedAgents) {
        await removeAgentSetup(projectDir, removedAgent, installedExtensionManifests, survivingAgents);
        console.log(chalk.yellow(`  Removed: ${removedAgent.id}`));
      }
    }

    console.log(chalk.dim('\nInstalling skills...\n'));

    const installedAgents: AgentInstallation[] = [];
    const mcpSummary: Record<string, string[]> = {};
    const skillsByTarget = new Map<string, string[]>();

    for (const agentSelection of answers.agents) {
      const agentConfig = getAgentConfig(agentSelection.id);
      const group = groups.find(group => group.targets.some(target => target.id === agentSelection.id))!;
      const existingAgent = existingConfig?.agents.find(agent => agent.id === agentSelection.id);
      const retainedSkills = existingAgent?.installedSkills.filter(
        skill => !availableSkillSet.has(skill) || replacedSkills.has(skill),
      ) ?? [];

      if (existingAgent) {
        const deselectedSkills = existingAgent.installedSkills.filter(
          skill => availableSkillSet.has(skill) && !selectedSkillSet.has(skill) && !replacedSkills.has(skill),
        );
        const removedSkills = await removeOwnedSkills(
          projectDir,
          { ...existingAgent, installedSkills: deselectedSkills },
          survivingAgents,
        );
        for (const skill of removedSkills) {
          console.log(chalk.dim(`  [${agentConfig.displayName}] Removed deselected skill: ${skill}`));
        }
      }

      const installedSkills = skillsByTarget.get(group.physicalPath) ?? await installSkills({
        projectDir,
        skillsDir: group.skillsDir,
        skills: answers.selectedSkills,
        agentId: agentSelection.id,
        renderContext: group.context,
      });
      skillsByTarget.set(group.physicalPath, installedSkills);
      const installedAgentFiles = agentConfig.agentsDir
        ? await installSubagents({
          projectDir,
          installedSkills: [...installedSkills, ...retainedSkills],
          previousInstallation: existingAgent,
          agentId: agentSelection.id,
          agentsDir: agentConfig.agentsDir,
        })
        : [];
      const installedConfigFiles = agentConfig.configFiles?.length
        ? await installConfigFiles({
          projectDir,
          agentId: agentSelection.id,
          configFiles: agentConfig.configFiles,
          installedConfigFiles: existingAgent?.installedConfigFiles,
          managedConfigFiles: existingAgent?.managedConfigFiles,
        })
        : [];

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
        skillsDir: group.skillsDir,
        installedSkills: [...new Set([...installedSkills, ...retainedSkills])],
        ...(agentConfig.agentsDir ? {
          agentsDir: agentConfig.agentsDir,
          installedAgentFiles,
          agentFileSources: buildBundledAgentFileSources(installedAgentFiles),
        } : {}),
        ...(agentConfig.configFiles?.length ? {
          configFiles: agentConfig.configFiles,
          installedConfigFiles,
        } : {}),
        mcp: {
          github: agentSelection.mcpGithub,
          filesystem: agentSelection.mcpFilesystem,
          postgres: agentSelection.mcpPostgres,
          chromeDevtools: agentSelection.mcpChromeDevtools,
          playwright: agentSelection.mcpPlaywright,
        },
      });
    }

    // Re-apply extension injections after skill installation
    if (existingExtensions.length > 0) {
      const loadedExtensions = await loadAllExtensions(projectDir, existingExtensions.map(extension => extension.name));
      const conflictCheckConfig = existingConfig ?? {
        version: getCurrentVersion(),
        agents: installedAgents,
        extensions: existingExtensions,
      };
      for (const { dir, manifest } of loadedExtensions) {
        await assertNoAgentFileConflicts(projectDir, {
          ...conflictCheckConfig,
          extensions: existingExtensions,
          agents: installedAgents,
        }, manifest);
        const agentFileResults = await installExtensionAgentFilesForAllAgents(projectDir, installedAgents, dir, manifest);
        mergeInstalledAgentFiles(installedAgents, agentFileResults);
        mergeAgentFileSources(installedAgents, buildExtensionAgentFileSources(manifest));
      }

      const totalInjections = await composeInstalledExtensionSkills(projectDir, {
        version: getCurrentVersion(), agents: installedAgents, extensions: existingExtensions,
      });
      if (totalInjections > 0) {
        console.log(chalk.green(`✓ Re-applied ${totalInjections} extension injection(s)`));
      }
    }

    for (const agent of installedAgents) {
      const managedBaseSkills = agent.installedSkills.filter(skill => !replacedSkills.has(skill));
      agent.managedSkills = await buildManagedSkillsState(projectDir, agent, managedBaseSkills,
        groups.find(group => group.targets.some(target => target.id === agent.id))!.context, existingExtensions);
      if ((agent.configFiles ?? []).length > 0) {
        agent.managedConfigFiles = await buildManagedConfigFilesState(projectDir, agent, agent.installedConfigFiles ?? []);
      }
    }
    await rebuildManagedAgentFilesForAgents(projectDir, installedAgents);

    await saveConfig(projectDir, {
      version: getCurrentVersion(),
      agents: installedAgents,
      extensions: existingExtensions,
    });

    console.log(chalk.green('✓ Configuration saved to .ai-factory.json'));

    if (options.config) {
      const configDest = path.join(projectDir, '.ai-factory', 'config.yaml');
      const configAlreadyExists = await fileExists(configDest);
      if (configAlreadyExists) {
        console.log(chalk.yellow('⚠ .ai-factory/config.yaml already exists, skipping (use --force to overwrite)'));
      } else {
        const templateSrc = path.join(getSkillsDir(), 'aif', 'references', 'config-template.yaml');
        await copyFile(templateSrc, configDest);
        console.log(chalk.green('✓ Default config.yaml created in .ai-factory/'));
      }
    }

    console.log(chalk.bold.green('\n✅ Setup complete!\n'));

    for (const agent of installedAgents) {
      const agentConfig = getAgentConfig(agent.id);

      console.log(chalk.bold(`${agentConfig.displayName}:`));
      console.log(chalk.dim(`  Skills directory: ${path.join(projectDir, agent.skillsDir)}`));
      console.log(chalk.dim(`  Installed skills: ${agent.installedSkills.length}`));
      if (agent.agentsDir) {
        console.log(chalk.dim(`  Agent files directory: ${path.join(projectDir, agent.agentsDir)}`));
        console.log(chalk.dim(`  Installed agent files: ${agent.installedAgentFiles?.length ?? 0}`));
      }
      if ((agent.configFiles ?? []).length > 0) {
        console.log(chalk.dim(`  Managed config files: ${agent.installedConfigFiles?.length ?? 0}`));
      }

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

    const dailyWorkflowStep = invocationHints
      ? `Use daily workflow skills (${invocationHints})`
      : 'Use /aif-plan and /aif-commit for daily workflow';
    console.log(chalk.dim(`  ${installedAgents.length + 1}. ${dailyWorkflowStep}`));
    console.log('');

  } catch (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('User force closed')) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
    if (message.startsWith('Incompatible agent skill targets:')) {
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
    if (nonInteractive && (
      message.startsWith('Unknown ')
      || message.startsWith('At least one ')
    )) {
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
    throw error;
  }
}
