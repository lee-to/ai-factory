import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { upgradeCommand } from './commands/upgrade.js';
import { auditArtifactsCommand } from './commands/audit-artifacts.js';
import { dispatchCommand } from './commands/dispatch.js';
import { registerInstructionCommands } from './commands/instructions.js';
import { commandsCommand } from './commands/commands.js';
import { registerCompletionHookCommands } from './commands/completion-hook.js';
import { worktreeCheckCommand } from './commands/worktree-check.js';
import { extensionAddCommand, extensionRemoveCommand, extensionListCommand, extensionUpdateCommand } from './commands/extension.js';
import { getCurrentVersion, loadConfig } from '../core/config.js';
import { loadAllExtensions } from '../core/extensions.js';

const program = new Command();

program
  .name('ai-factory')
  .description('CLI tool for automating AI agent context setup')
  .version(getCurrentVersion());

program
  .command('dispatch <phase>')
  .description('Resolve the agent/model for a loop phase and switch or spawn it')
  .option('--prompt <text>', 'Instruction passed to the target agent (fills {prompt})')
  .option('--print', 'Force manual mode: print instructions, never spawn')
  .option('--json', 'Emit one dispatcher result on stdout; send child output to stderr')
  .action(dispatchCommand);

program
  .command('init')
  .description('Initialize ai-factory in current project')
  .option('--agents <agents>', 'Comma-separated list of agents (e.g. claude,codex,codex-app,cursor,chatgpt,openrouter)')
  .option('--mcp <servers>', 'Comma-separated list of MCP servers (e.g. github,playwright,postgres,filesystem,chrome-devtools)')
  .option('--skills <skills>', 'Comma-separated list of skills or "all" for all skills (default: all)')
  .option('--no-skills', 'Skip installing base skills')
  .option('--symlinks', 'Share identical skills in .agents/skills using symlinks')
  .option('--no-symlinks', 'Install independent skill copies')
  .option('--config', 'Create default .ai-factory/config.yaml from template')
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

program
  .command('audit-artifacts [paths...]')
  .description('Audit artifact frontmatter links and traceability metadata')
  .option('--json', 'Print machine-readable JSON')
  .option('--strict', 'Treat warnings as failures')
  .action(auditArtifactsCommand);

const ext = program
  .command('extension')
  .description('Manage extensions');

registerInstructionCommands(program);
registerCompletionHookCommands(program);

program.command('commands [directories...]')
  .description('Catalog declared project commands without executing project code')
  .option('--json', 'Print the same catalog as machine-readable JSON')
  .option('--mapping <file>', 'Read explicit commands from an existing project-owned JSON file')
  .allowExcessArguments(false)
  .action(commandsCommand);

program.command('worktree-check [checkouts...]')
  .description('Diagnose static runtime-resource conflicts between existing checkouts without launching environments')
  .option('--json', 'Print the same diagnostic as machine-readable JSON')
  .option('--mapping <file>', 'Read runtimeResources from this existing project-relative JSON file in each checkout')
  .addHelpText('after', '\nIncomplete coverage is expected for full stacks; isolation is always unverified.')
  .allowExcessArguments(false)
  .action(worktreeCheckCommand);

ext
  .command('add <source>')
  .allowExcessArguments(false)
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

// Discovery and completion hooks must not import unapproved project extension modules.
if (!['commands', 'worktree-check', 'completion-hook'].includes(process.argv.slice(2).find(argument => !argument.startsWith('-')) ?? '')) await loadExtensionCommands();
program.parse();
