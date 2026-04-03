import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { upgradeCommand } from './commands/upgrade.js';
import { extensionAddCommand, extensionRemoveCommand, extensionListCommand, extensionUpdateCommand } from './commands/extension.js';
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
  .option('--agents <agents>', 'Comma-separated list of agents (e.g. claude,codex,cursor)')
  .option('--mcp <servers>', 'Comma-separated list of MCP servers (e.g. github,playwright,postgres,filesystem,chrome-devtools)')
  .option('--skills <skills>', 'Comma-separated list of skills or "all" for all skills (default: all)')
  .option('--no-skills', 'Skip installing base skills')
  .action(initCommand);

program
  .command('update')
  .description('Update installed skills to latest version')
  .option('--force', 'Force extension refresh and clean reinstall of currently installed base skills')
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

ext
  .command('update [name]')
  .description('Update extension(s) from their sources')
  .option('--force', 'Force refresh even if version unchanged')
  .action(extensionUpdateCommand);

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
