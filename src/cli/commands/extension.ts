import chalk from 'chalk';
import path from 'path';
import { createDefaultSubagentsConfig, loadConfig, saveConfig, type SubagentProfile } from '../../core/config.js';
import {
  resolveExtension,
  commitExtensionInstall,
  removeExtensionFiles,
  getExtensionsDir,
  loadExtensionManifest,
  type ExtensionManifest,
} from '../../core/extensions.js';
import {
  applySingleExtensionInjections,
} from '../../core/injections.js';
import { configureExtensionMcpServers, removeExtensionMcpServers, validateMcpTemplate, type McpServerConfig } from '../../core/mcp.js';
import { installExtensionSkills } from '../../core/installer.js';
import { readJsonFile } from '../../utils/fs.js';
import { getAgentConfig } from '../../core/agents.js';
import {
  removeSkillsForAllAgents,
  installExtensionSkillsForAllAgents,
  collectReplacedSkills,
  restoreBaseSkills,
  stripInjectionsForAllAgents,
  removeCustomSkillsForAllAgents,
} from '../../core/extension-ops.js';

const KNOWN_SUBAGENT_ROLES = new Set(['planner-scout', 'implementer', 'reviewer', 'verifier', 'custom']);

function applyExtensionSubagentsToConfig(
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  manifest: ExtensionManifest,
): { installedIds: string[]; backups: Record<string, SubagentProfile | null> } {
  if (!manifest.subagents?.length) {
    return { installedIds: [], backups: {} };
  }

  const subagents = config.subagents ?? createDefaultSubagentsConfig();
  const installedIds: string[] = [];
  const backups: Record<string, SubagentProfile | null> = {};

  for (const extProfile of manifest.subagents) {
    const existingIndex = subagents.profiles.findIndex(profile => profile.id === extProfile.id);
    const mappedRole = KNOWN_SUBAGENT_ROLES.has(extProfile.role)
      ? extProfile.role as typeof subagents.profiles[number]['role']
      : 'custom';

    const normalizedProfile = {
      id: extProfile.id,
      role: mappedRole,
      description: extProfile.description ?? `Installed from extension profile ${extProfile.id}`,
      maxContextChars: extProfile.maxContextChars ?? 12000,
      outputFormat: extProfile.outputFormat ?? 'markdown',
      enabled: true,
      sourceExtension: manifest.name,
    };

    if (existingIndex >= 0) {
      const existing = subagents.profiles[existingIndex];
      if (existing.sourceExtension !== manifest.name) {
        backups[extProfile.id] = existing;
      }
      subagents.profiles[existingIndex] = normalizedProfile;
    } else {
      backups[extProfile.id] = null;
      subagents.profiles.push(normalizedProfile);
    }

    installedIds.push(extProfile.id);
  }

  config.subagents = subagents;
  return { installedIds, backups };
}

function removeExtensionSubagentsFromConfig(
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  profileIds: string[] | undefined,
  extensionName: string,
  backups?: Record<string, SubagentProfile | null>,
): string[] {
  if (!profileIds?.length || !config.subagents) {
    return [];
  }

  const profileSet = new Set(profileIds);
  const removedIds = new Set<string>();

  config.subagents.profiles = config.subagents.profiles.filter(profile => {
    if (!profileSet.has(profile.id)) return true;
    const shouldRemove = profile.sourceExtension === extensionName;
    if (shouldRemove) {
      removedIds.add(profile.id);
    }
    return !shouldRemove;
  });

  const restoredIds = new Set<string>();
  if (backups) {
    for (const [profileId, backup] of Object.entries(backups)) {
      if (!backup) continue;
      const idx = config.subagents.profiles.findIndex(profile => profile.id === profileId);
      if (idx >= 0) {
        config.subagents.profiles[idx] = backup;
      } else {
        config.subagents.profiles.push(backup);
      }
      restoredIds.add(profileId);
    }
  }

  const removedOnlyIds = [...removedIds].filter(id => !restoredIds.has(id));
  if (removedOnlyIds.length > 0) {
    const removedSet = new Set(removedOnlyIds);
    config.subagents.routing.plan = config.subagents.routing.plan.filter(id => !removedSet.has(id));
    config.subagents.routing.implement = config.subagents.routing.implement.filter(id => !removedSet.has(id));
  }

  if (config.subagents.profiles.length === 0) {
    config.subagents.enabled = false;
    config.subagents.mode = 'off';
  }

  return removedOnlyIds;
}


export async function extensionAddCommand(source: string): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Install Extension\n'));

  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  console.log(chalk.dim(`Installing from: ${source}\n`));

  try {
    const extensions = config.extensions ?? [];

    // Phase 1: Resolve source — download/clone and validate manifest WITHOUT writing to project
    const resolved = await resolveExtension(projectDir, source);
    const manifest = resolved.manifest;

    try {
      const existIdx = extensions.findIndex(e => e.name === manifest.name);
      const oldRecord = existIdx >= 0 ? { ...extensions[existIdx] } : null;

      // Load old manifest from installed dir (still intact — we haven't overwritten yet)
      const oldManifest = existIdx >= 0
        ? await loadExtensionManifest(path.join(getExtensionsDir(projectDir), manifest.name))
        : null;

      // Block conflicting replacements BEFORE copying any files
      if (manifest.replaces) {
        for (const [, baseSkillName] of Object.entries(manifest.replaces)) {
          for (const other of extensions) {
            if (other.name === manifest.name) continue;
            if (other.replacedSkills?.includes(baseSkillName)) {
              throw new Error(`Conflict: skill "${baseSkillName}" is already replaced by extension "${other.name}". Remove it first.`);
            }
          }
        }
      }

      // Phase 2: Commit — copy resolved files to .ai-factory/extensions/<name>/
      await commitExtensionInstall(projectDir, resolved);

      // Clean up old state on re-install
      if (existIdx >= 0) {
        await stripInjectionsForAllAgents(projectDir, config.agents, manifest.name);

        if (oldRecord?.subagentProfileIds?.length) {
          removeExtensionSubagentsFromConfig(config, oldRecord.subagentProfileIds, manifest.name, oldRecord.subagentProfileBackups);
        }

        // Remove old replacement skills (installed under base names)
        if (oldRecord?.replacedSkills?.length) {
          await removeSkillsForAllAgents(projectDir, config.agents, oldRecord.replacedSkills);
          await restoreBaseSkills(projectDir, config.agents, oldRecord.replacedSkills, new Set());
        }

        // Remove old extension custom skills using the OLD manifest (not the new one)
        if (oldManifest) {
          await removeCustomSkillsForAllAgents(projectDir, config.agents, oldManifest);
        }
      }

      console.log(chalk.green(`✓ Extension "${manifest.name}" v${manifest.version} installed`));

      const extensionDir = path.join(getExtensionsDir(projectDir), manifest.name);

      // Install replacement skills — only track successfully installed ones
      const replacedSkills: string[] = [];
      const replacesPaths = new Set<string>();
      if (manifest.replaces && Object.keys(manifest.replaces).length > 0) {
        const nameOverrides: Record<string, string> = { ...manifest.replaces };
        const replacePaths = Object.keys(manifest.replaces);

        // Track per-agent success: only count as replaced if installed on ALL agents
        const perAgentResults = new Map<string, number>(); // baseName → success count
        for (const agent of config.agents) {
          const installed = await installExtensionSkills(projectDir, agent, extensionDir, replacePaths, nameOverrides);
          for (const name of installed) {
            perAgentResults.set(name, (perAgentResults.get(name) ?? 0) + 1);
          }
        }

        const agentCount = config.agents.length;
        for (const [extSkillPath, baseSkillName] of Object.entries(manifest.replaces)) {
          replacesPaths.add(extSkillPath);
          const successCount = perAgentResults.get(baseSkillName) ?? 0;
          if (successCount === agentCount) {
            replacedSkills.push(baseSkillName);
            console.log(chalk.green(`✓ Replaced skill "${baseSkillName}" with "${path.basename(extSkillPath)}"`));
          } else if (successCount > 0) {
            // Rollback: remove the replacement from agents where it did install, restore base skill
            await removeSkillsForAllAgents(projectDir, config.agents, [baseSkillName]);
            await restoreBaseSkills(projectDir, config.agents, [baseSkillName], new Set());
            console.log(chalk.yellow(`⚠ Replacement "${baseSkillName}" only installed on ${successCount}/${agentCount} agents — rolled back, base skill restored`));
          } else {
            console.log(chalk.yellow(`⚠ Failed to replace skill "${baseSkillName}" — base skill preserved`));
          }
        }
      }

      // Install extension custom skills (excluding replacements)
      if (manifest.skills?.length) {
        const nonReplacementSkills = manifest.skills.filter(s => !replacesPaths.has(s));
        if (nonReplacementSkills.length > 0) {
          const results = await installExtensionSkillsForAllAgents(projectDir, config.agents, extensionDir, nonReplacementSkills);
          for (const [agentId, installed] of results) {
            if (installed.length > 0) {
              console.log(chalk.green(`✓ Skills installed for ${agentId}: ${installed.join(', ')}`));
            }
          }
        }
      }

      // Save config AFTER all installations succeed
      const { installedIds: subagentProfileIds, backups: subagentProfileBackups } = applyExtensionSubagentsToConfig(config, manifest);
      const record = {
        name: manifest.name,
        source,
        version: manifest.version,
        replacedSkills: replacedSkills.length > 0 ? replacedSkills : undefined,
        subagentProfileIds: subagentProfileIds.length > 0 ? subagentProfileIds : undefined,
        subagentProfileBackups: Object.keys(subagentProfileBackups).length > 0 ? subagentProfileBackups : undefined,
      };
      if (existIdx >= 0) {
        extensions[existIdx] = record;
      } else {
        extensions.push(record);
      }
      config.extensions = extensions;
      await saveConfig(projectDir, config);

      // Apply injections for all agents
      if (manifest.injections?.length) {
        let totalInjections = 0;

        for (const agent of config.agents) {
          const count = await applySingleExtensionInjections(projectDir, agent, extensionDir, manifest);
          totalInjections += count;
        }

        if (totalInjections > 0) {
          console.log(chalk.green(`✓ Applied ${totalInjections} injection(s)`));
        }
      }

      // Configure MCP servers for all agents that support it
      if (manifest.mcpServers?.length) {
        const mcpConfigured = await applyExtensionMcp(projectDir, config.agents.map(a => a.id), extensionDir, manifest);
        if (mcpConfigured.length > 0) {
          console.log(chalk.green(`✓ MCP servers configured: ${mcpConfigured.join(', ')}`));
          for (const srv of manifest.mcpServers) {
            if (srv.instruction) {
              console.log(chalk.dim(`    ${srv.instruction}`));
            }
          }
        }
      }

      if (manifest.agents?.length) {
        console.log(chalk.dim(`  Agents provided: ${manifest.agents.map(a => a.displayName).join(', ')}`));
      }
      if (manifest.commands?.length) {
        console.log(chalk.dim(`  Commands provided: ${manifest.commands.map(c => c.name).join(', ')}`));
      }
      if (manifest.skills?.length) {
        console.log(chalk.dim(`  Skills provided: ${manifest.skills.join(', ')}`));
      }
      if (manifest.subagents?.length) {
        console.log(chalk.dim(`  Subagent profiles provided: ${manifest.subagents.map(s => s.id).join(', ')}`));
      }

      console.log('');
    } finally {
      await resolved.cleanup();
    }
  } catch (error) {
    console.log(chalk.red(`Error installing extension: ${(error as Error).message}`));
    process.exit(1);
  }
}

export async function extensionRemoveCommand(name: string): Promise<void> {
  const projectDir = process.cwd();

  console.log(chalk.bold.blue('\n🏭 AI Factory - Remove Extension\n'));

  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    process.exit(1);
  }

  const extensions = config.extensions ?? [];
  const index = extensions.findIndex(e => e.name === name);

  if (index < 0) {
    console.log(chalk.red(`Extension "${name}" is not installed.`));
    process.exit(1);
  }

  try {
    const extensionDir = path.join(getExtensionsDir(projectDir), name);
    const manifest = await loadExtensionManifest(extensionDir);

    // Strip injections before removing files
    await stripInjectionsForAllAgents(projectDir, config.agents, name, manifest);

    // Remove replacement skills (installed under base names)
    const extRecord = extensions[index];
    if (extRecord.replacedSkills?.length) {
      const removed = await removeSkillsForAllAgents(projectDir, config.agents, extRecord.replacedSkills);
      for (const [agentId, skills] of removed) {
        if (skills.length > 0) {
          console.log(chalk.green(`✓ Replacement skills removed for ${agentId}: ${skills.join(', ')}`));
        }
      }
    }

    // Remove extension custom skills
    if (manifest) {
      const removed = await removeCustomSkillsForAllAgents(projectDir, config.agents, manifest);
      for (const [agentId, skills] of removed) {
        if (skills.length > 0) {
          console.log(chalk.green(`✓ Skills removed for ${agentId}: ${skills.join(', ')}`));
        }
      }
    }

    const removedProfiles = removeExtensionSubagentsFromConfig(config, extRecord.subagentProfileIds, name, extRecord.subagentProfileBackups);
    if (removedProfiles.length > 0) {
      console.log(chalk.green(`✓ Subagent profiles removed: ${removedProfiles.join(', ')}`));
    }

    // Restore base skills if no other extension replaces them
    if (extRecord.replacedSkills?.length) {
      const stillReplaced = collectReplacedSkills(extensions, name);
      const restored = await restoreBaseSkills(projectDir, config.agents, extRecord.replacedSkills, stillReplaced);
      if (restored.length > 0) {
        console.log(chalk.green(`✓ Restored base skills: ${restored.join(', ')}`));
      }
    }

    // Remove MCP servers
    if (manifest?.mcpServers?.length) {
      const mcpKeys = manifest.mcpServers.map(s => s.key);
      for (const agent of config.agents) {
        await removeExtensionMcpServers(projectDir, agent.id, mcpKeys);
      }
    }

    await removeExtensionFiles(projectDir, name);

    extensions.splice(index, 1);
    config.extensions = extensions;
    await saveConfig(projectDir, config);

    console.log(chalk.green(`✓ Extension "${name}" removed`));
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error removing extension: ${(error as Error).message}`));
    process.exit(1);
  }
}

export async function extensionListCommand(): Promise<void> {
  const projectDir = process.cwd();

  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    process.exit(1);
  }

  const extensions = config.extensions ?? [];

  if (extensions.length === 0) {
    console.log(chalk.dim('\nNo extensions installed.\n'));
    return;
  }

  console.log(chalk.bold('\nInstalled extensions:\n'));

  for (const ext of extensions) {
    console.log(`  ${chalk.bold(ext.name)} ${chalk.dim(`v${ext.version}`)}`);
    console.log(chalk.dim(`    Source: ${ext.source}`));

    const extensionDir = path.join(getExtensionsDir(projectDir), ext.name);
    const manifest = await loadExtensionManifest(extensionDir);
    if (manifest) {
      if (manifest.description) {
        console.log(chalk.dim(`    ${manifest.description}`));
      }
      const features: string[] = [];
      if (manifest.commands?.length) features.push(`${manifest.commands.length} command(s)`);
      if (manifest.agents?.length) features.push(`${manifest.agents.length} agent(s)`);
      if (manifest.injections?.length) features.push(`${manifest.injections.length} injection(s)`);
      if (manifest.skills?.length) features.push(`${manifest.skills.length} skill(s)`);
      if (manifest.mcpServers?.length) features.push(`${manifest.mcpServers.length} MCP server(s)`);
      if (manifest.subagents?.length) features.push(`${manifest.subagents.length} subagent profile(s)`);
      if (features.length > 0) {
        console.log(chalk.dim(`    Provides: ${features.join(', ')}`));
      }
    }
  }
  console.log('');
}

async function applyExtensionMcp(
  projectDir: string,
  agentIds: string[],
  extensionDir: string,
  manifest: ExtensionManifest,
): Promise<string[]> {
  if (!manifest.mcpServers?.length) return [];

  const allConfigured: string[] = [];

  for (const srv of manifest.mcpServers) {
    let template: unknown;
    if (typeof srv.template === 'string') {
      const templatePath = path.join(extensionDir, srv.template);
      template = await readJsonFile<McpServerConfig>(templatePath);
    } else {
      template = srv.template;
    }
    if (!template) continue;
    validateMcpTemplate(template, srv.key);

    for (const agentId of agentIds) {
      const agentConfig = getAgentConfig(agentId);
      if (!agentConfig.supportsMcp) continue;

      const configured = await configureExtensionMcpServers(projectDir, agentId, [
        { key: srv.key, template },
      ]);
      if (configured.length > 0 && !allConfigured.includes(srv.key)) {
        allConfigured.push(srv.key);
      }
    }
  }

  return allConfigured;
}
