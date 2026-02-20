import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { upgradeCommand } from './commands/upgrade.js';
import { getCurrentVersion } from '../core/config.js';

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

program.parse();
