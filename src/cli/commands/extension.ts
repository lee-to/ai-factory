import chalk from 'chalk';
import path from 'path';
import { loadConfig, saveConfig } from '../../core/config.js';
import {
  resolveExtension,
  removeExtensionFiles,
  getExtensionsDir,
  loadExtensionManifest,
} from '../../core/extensions.js';
import { removeExtensionMcpServers } from '../../core/mcp.js';
import {
  removeSkillsForAllAgents,
  collectReplacedSkills,
  restoreBaseSkills,
  stripInjectionsForAllAgents,
  removeCustomSkillsForAllAgents,
  commitResolvedExtension,
  refreshExtensions,
} from '../../core/extension-ops.js';

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
    const resolved = await resolveExtension(projectDir, source);

    try {
      const { manifest } = await commitResolvedExtension(projectDir, {
        config,
        source,
        resolved,
        log: (level, message) => {
          if (level === 'warn') {
            console.log(chalk.yellow(`⚠ ${message}`));
          } else {
            console.log(chalk.green(`✓ ${message}`));
          }
        },
      });
      await saveConfig(projectDir, config);

      console.log(chalk.green(`✓ Extension "${manifest.name}" v${manifest.version} installed`));
      if (manifest.agents?.length) {
        console.log(chalk.dim(`  Agents provided: ${manifest.agents.map(agent => agent.displayName).join(', ')}`));
      }
      if (manifest.commands?.length) {
        console.log(chalk.dim(`  Commands provided: ${manifest.commands.map(command => command.name).join(', ')}`));
      }
      if (manifest.skills?.length) {
        console.log(chalk.dim(`  Skills provided: ${manifest.skills.join(', ')}`));
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
      if (features.length > 0) {
        console.log(chalk.dim(`    Provides: ${features.join(', ')}`));
      }
    }
  }
  console.log('');
}

export async function extensionUpdateCommand(name?: string, options?: { force?: boolean }): Promise<void> {
  const projectDir = process.cwd();
  const force = options?.force ?? false;

  console.log(chalk.bold.blue('\n🏭 AI Factory - Update Extensions\n'));

  if (force) {
    console.log(chalk.dim('Force mode: refreshing all extensions regardless of version\n'));
  }

  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  const extensions = config.extensions ?? [];

  if (extensions.length === 0) {
    console.log(chalk.dim('No extensions installed.\n'));
    return;
  }

  if (name && !extensions.find((e) => e.name === name)) {
    console.log(chalk.red(`Extension "${name}" is not installed.`));
    console.log(chalk.dim(`Installed extensions: ${extensions.map((e) => e.name).join(', ')}`));
    process.exit(1);
  }

  const targetNames = name ? [name] : undefined;

  const summary = await refreshExtensions(projectDir, config, {
    targetNames,
    force,
    log: (level, message) => {
      if (level === 'warn') {
        console.log(chalk.yellow(message));
      } else {
        console.log(chalk.dim(message));
      }
    },
  });

  if (summary.updated.length > 0) {
    for (const r of summary.updated) {
      console.log(chalk.green(`  ✓ ${r.name}: v${r.oldVersion} → v${r.newVersion}`));
    }
  }

  for (const r of summary.unchanged) {
    console.log(chalk.dim(`  - ${r.name}: v${r.oldVersion} (unchanged)`));
  }

  for (const r of summary.skipped) {
    if (r.failureReason === 'rate-limited') {
      console.log(chalk.yellow(`  ⚠ ${r.name}: GitHub API rate limited, skipping`));
    } else if (r.failureReason === 'lookup-failed') {
      console.log(chalk.yellow(`  ⚠ ${r.name}: version check failed, retry or use --force`));
    } else if (r.failureReason === 'source-type-requires-force') {
      console.log(
        chalk.yellow(`  ⚠ ${r.name}: source type requires --force to refresh`),
      );
    } else {
      console.log(chalk.dim(`  - ${r.name}: ${r.failureReason}`));
    }
  }

  for (const r of summary.failed) {
    console.log(chalk.red(`  ✗ ${r.name}: ${r.failureReason}`));
  }

  await saveConfig(projectDir, config);

  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(chalk.green(`  Updated: ${summary.updated.length}`));
  console.log(chalk.dim(`  Unchanged: ${summary.unchanged.length}`));
  console.log(chalk.dim(`  Skipped: ${summary.skipped.length}`));
  if (summary.failed.length > 0) {
    console.log(chalk.red(`  Failed: ${summary.failed.length}`));
  }
  console.log('');

  if (summary.failed.length > 0) {
    process.exit(1);
  }
}

