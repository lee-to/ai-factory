import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { upgradeCommand } from './commands/upgrade.js';
import { extensionAddCommand, extensionRemoveCommand, extensionListCommand } from './commands/extension.js';
import {
  subagentInitCommand,
  subagentListCommand,
  subagentRunImplementCommand,
  subagentRunPlanCommand,
  subagentStatusCommand,
} from './commands/subagent.js';
import { getCurrentVersion, loadConfig } from '../core/config.js';
import { loadAllExtensions } from '../core/extensions.js';

const program = new Command();

program
  .name('ai-factory')
  .description('CLI tool for automating AI agent context setup')
  .version(getCurrentVersion());

program
  .command('init')
  .description('Initialize ai-factory in current project')
  .action(initCommand);

program
  .command('update')
  .description('Update installed skills to latest version')
  .action(updateCommand);

program
  .command('upgrade')
  .description('Upgrade from v1 to v2 (removes old-format skills, installs new)')
  .action(upgradeCommand);

const ext = program
  .command('extension')
  .description('Manage extensions');

ext
  .command('add <source>')
  .description('Install extension from npm package, git URL, or local path')
  .action(extensionAddCommand);

ext
  .command('remove <name>')
  .description('Remove an installed extension')
  .action(extensionRemoveCommand);

ext
  .command('list')
  .description('List installed extensions')
  .action(extensionListCommand);

const subagent = program
  .command('subagent')
  .description('Manage subagent orchestration for plan and implement workflows');

subagent
  .command('init')
  .description('Initialize default subagent profiles and routing')
  .action(subagentInitCommand);

subagent
  .command('list')
  .description('List current subagent profiles and routing configuration')
  .action(subagentListCommand);

subagent
  .command('status')
  .description('Show recent subagent runs and artifacts status')
  .action(subagentStatusCommand);

subagent
  .command('run-plan <focus>')
  .description('Run plan scouting subagent to return condensed planning data')
  .action(subagentRunPlanCommand);

subagent
  .command('run-implement')
  .description('Run implement orchestration for independent plan tasks')
  .action(subagentRunImplementCommand);

async function loadExtensionCommands(): Promise<void> {
  try {
    const projectDir = process.cwd();
    const config = await loadConfig(projectDir);
    if (!config?.extensions?.length) return;

    const registeredNames = config.extensions.map(e => e.name);
    const extensions = await loadAllExtensions(projectDir, registeredNames);
    for (const { dir, manifest } of extensions) {
      if (!manifest.commands?.length) continue;
      for (const cmd of manifest.commands) {
        try {
          const modulePath = new URL(`file://${dir}/${cmd.module}`).href;
          const mod = await import(modulePath);
          if (typeof mod.register === 'function') {
            mod.register(program);
          }
        } catch (err) {
          console.error(`Warning: Failed to load command "${cmd.name}" from extension "${manifest.name}": ${(err as Error).message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Warning: Failed to load extension commands: ${(err as Error).message}`);
  }
}

await loadExtensionCommands();
program.parse();
