import chalk from 'chalk';
import path from 'path';
import {realpathSync} from 'fs';
import {execSync} from 'child_process';
import inquirer from 'inquirer';
import {getCurrentVersion, loadConfig, saveConfig} from '../../core/config.js';
import {compareExtensionVersions, getExtensionsDir, getNpmVersionCheckResult, loadExtensionManifest} from '../../core/extensions.js';
import {
  buildManagedSkillsState,
  buildManagedSubagentsState,
  getAvailableSkills,
  partitionSkills,
  type SkillUpdateEntry,
  type SubagentUpdateEntry,
  updateSkills,
  updateSubagents,
} from '../../core/installer.js';
import {applyExtensionInjections} from '../../core/injections.js';
import {
  installExtensionSkillsForAllAgents,
  installSkillsForAllAgents,
  collectReplacedSkills,
  refreshExtensions,
} from '../../core/extension-ops.js';
import {fileExists} from '../../utils/fs.js';

interface UpdateCommandOptions {
  force?: boolean;
}

function formatReason(reason: string): string {
  switch (reason) {
    case 'source-hash-changed':
      return 'source changed';
    case 'installed-hash-drift':
      return 'local drift';
    case 'missing-managed-state':
      return 'state missing';
    case 'missing-installed-artifact':
      return 'artifact missing';
    case 'package-removed':
      return 'removed from package';
    case 'new-skill-not-installed':
      return 'new in package';
    case 'new-in-package':
      return 'new in package';
    case 'replaced-by-extension':
      return 'replaced by extension';
    case 'force-clean-reinstall':
      return 'force reinstall';
    case 'install-failed':
      return 'install failed';
    case 'source-missing':
      return 'source unavailable';
    default:
      return reason;
  }
}

function groupAndSortEntriesByStatus<T extends { status: 'changed' | 'unchanged' | 'skipped' | 'removed' }>(
  entries: T[],
  sortKey: (entry: T) => string,
): Record<'changed' | 'unchanged' | 'skipped' | 'removed', T[]> {
  const sort = (arr: T[]) => [...arr].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return {
    changed: sort(entries.filter(entry => entry.status === 'changed')),
    unchanged: sort(entries.filter(entry => entry.status === 'unchanged')),
    skipped: sort(entries.filter(entry => entry.status === 'skipped')),
    removed: sort(entries.filter(entry => entry.status === 'removed')),
  };
}

function isNewerVersion(latest: string, current: string): boolean {
  return compareExtensionVersions(latest, current) > 0;
}

async function getLatestVersion(): Promise<string | null> {
  const versionCheck = await getNpmVersionCheckResult('ai-factory', getCurrentVersion());
  return versionCheck.latestVersion;
}

function getInstallCommand(version: string): string {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const binPath = execSync(`${whichCmd} ai-factory`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).split('\n')[0].trim();
    const realPath = realpathSync(binPath).replaceAll('\\', '/');

    if (realPath.includes('.bun/')) return `bun add -g ai-factory@${version}`;
    if (realPath.includes('/mise/')) return `mise use -g npm:ai-factory@${version}`;
    if (realPath.includes('/volta/')) return `volta install ai-factory@${version}`;
    if (realPath.includes('/pnpm/')) return `pnpm add -g ai-factory@${version}`;
    if (realPath.includes('/yarn/')) return `yarn global add ai-factory@${version}`;
  } catch {
    // Binary not found or symlink resolution failed, default to npm
  }
  return `npm install -g ai-factory@${version}`;
}

async function selfUpdate(currentVersion: string): Promise<boolean> {
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(chalk.dim('Could not check for new versions\n'));
    return false;
  }

  if (!isNewerVersion(latestVersion, currentVersion)) {
    console.log(chalk.dim('ai-factory is up to date\n'));
    return false;
  }

  console.log(chalk.cyan(`📦 New version available: ${currentVersion} → ${latestVersion}`));

  if (!process.stdin.isTTY) {
    console.log(chalk.dim('Non-interactive mode — skipping self-update\n'));
    return false;
  }

  const {shouldUpdate} = await inquirer.prompt([{
    type: 'confirm',
    name: 'shouldUpdate',
    message: `Update ai-factory to ${latestVersion}?`,
    default: true,
  }]);

  if (!shouldUpdate) {
    console.log(chalk.dim('Skipping package update\n'));
    return false;
  }

  try {
    const installCmd = getInstallCommand(latestVersion);
    console.log(chalk.dim(`\n$ ${installCmd}`));
    execSync(installCmd, {stdio: 'inherit'});
    console.log(chalk.green(`\n✓ Updated to ${latestVersion}`));
    console.log(chalk.cyan('Please re-run `ai-factory update` to update skills with the new version.\n'));
    process.exitCode = 75; // EX_TEMPFAIL — signals caller to re-run
    return true;
  } catch (error) {
    console.log(chalk.yellow(`⚠ Self-update failed: ${(error as Error).message}`));
    return false;
  }
}

export async function updateCommand(options: UpdateCommandOptions = {}): Promise<void> {
  const projectDir = process.cwd();
  const force = Boolean(options.force);

  console.log(chalk.bold.blue('\n🏭 AI Factory - Update Skills\n'));

  const config = await loadConfig(projectDir);

  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();

  console.log(chalk.dim(`Config version: ${config.version}`));
  console.log(chalk.dim(`Package version: ${currentVersion}\n`));

  const selfUpdated = await selfUpdate(currentVersion);
  if (selfUpdated) return;

  const extensions = config.extensions ?? [];

  if (force) {
    console.log(chalk.yellow('⚠ Force mode enabled: clean reinstall of installed base skills\n'));
  }

  if (extensions.length > 0) {
    console.log(chalk.dim('Refreshing extensions...\n'));

    const extensionSummary = await refreshExtensions(projectDir, config, {
      force,
      log: (level, message) => {
        if (level === 'warn') {
          console.log(chalk.yellow(`  ⚠ ${message}`));
        } else {
          console.log(chalk.dim(`  ${message}`));
        }
      },
    });

    if (extensionSummary.updated.length > 0) {
      for (const r of extensionSummary.updated) {
        console.log(chalk.green(`  ✓ ${r.name}: v${r.oldVersion} → v${r.newVersion}`));
      }
    }

    for (const r of extensionSummary.skipped) {
      if (r.failureReason === 'rate-limited') {
        console.log(chalk.yellow(`  ⚠ ${r.name}: GitHub API rate limited`));
      } else if (r.failureReason === 'lookup-failed') {
        console.log(chalk.yellow(`  ⚠ ${r.name}: extension version check failed`));
      } else if (r.failureReason === 'source-type-requires-force') {
        console.log(chalk.dim(`  - ${r.name}: source type requires --force`));
      }
    }

    for (const r of extensionSummary.failed) {
      console.log(chalk.yellow(`  ⚠ ${r.name}: ${r.failureReason}`));
    }

    console.log(
      chalk.dim(
        `Extensions: ${extensionSummary.updated.length} updated, ${extensionSummary.unchanged.length} unchanged, ${extensionSummary.failed.length} failed\n`,
      ),
    );
  }

  console.log(chalk.dim('Updating skills and agent assets...\n'));

  try {
    const availableSkills = await getAvailableSkills();
    const skillEntriesByAgent = new Map<string, SkillUpdateEntry[]>();
    const subagentEntriesByAgent = new Map<string, SubagentUpdateEntry[]>();

    const allReplacedSkills = collectReplacedSkills(extensions);

    if (allReplacedSkills.size > 0) {
      console.log(chalk.dim(`Skipping replaced skills: ${[...allReplacedSkills].join(', ')}`));
    }

    for (const agent of config.agents) {
      const result = await updateSkills(agent, projectDir, {
        excludeSkills: [...allReplacedSkills],
        force,
      });
      agent.installedSkills = result.installedSkills;
      skillEntriesByAgent.set(agent.id, result.entries);

      const subagentResult = await updateSubagents(agent, projectDir, { force });
      agent.installedSubagents = subagentResult.installedSubagents;
      subagentEntriesByAgent.set(agent.id, subagentResult.entries);
    }

    // Re-install replacement skills from extensions
    // Fix 3: If manifest fails to load, fall back to installing the base skill
    const failedReplacements: string[] = [];
    for (const ext of extensions) {
      if (!ext.replacedSkills?.length) continue;
      const extensionDir = path.join(getExtensionsDir(projectDir), ext.name);
      const manifest = await loadExtensionManifest(extensionDir);
      if (!manifest?.replaces) {
        console.log(chalk.yellow(`⚠ Extension "${ext.name}" manifest missing — restoring base skills: ${ext.replacedSkills.join(', ')}`));
        failedReplacements.push(...ext.replacedSkills);
        ext.replacedSkills = [];
        continue;
      }

      const nameOverrides: Record<string, string> = { ...manifest.replaces };
      const manifestBaseSkills = new Set(Object.values(manifest.replaces));
      const replacePaths = Object.entries(manifest.replaces)
        .filter(([, baseSkill]) => ext.replacedSkills!.includes(baseSkill))
        .map(([extPath]) => extPath);

      // Detect replacedSkills in config that no longer exist in manifest.replaces
      const orphanedReplacements = ext.replacedSkills!.filter(s => !manifestBaseSkills.has(s));
      if (orphanedReplacements.length > 0) {
        console.log(chalk.yellow(`⚠ Extension "${ext.name}" no longer replaces: ${orphanedReplacements.join(', ')}`));
        failedReplacements.push(...orphanedReplacements);
        ext.replacedSkills = ext.replacedSkills!.filter(s => manifestBaseSkills.has(s));
      }

      if (replacePaths.length > 0) {
        const results = await installExtensionSkillsForAllAgents(projectDir, config.agents, extensionDir, replacePaths, nameOverrides);

        // Detect replacements that failed to install on all agents
        const agentCount = config.agents.length;
        for (const [extPath, baseSkill] of Object.entries(manifest.replaces)) {
          if (!ext.replacedSkills!.includes(baseSkill)) continue;
          if (!replacePaths.includes(extPath)) continue;
          let successCount = 0;
          for (const installed of results.values()) {
            if (installed.includes(baseSkill)) successCount++;
          }
          if (successCount < agentCount) {
            console.log(chalk.yellow(`⚠ Extension "${ext.name}" replacement "${baseSkill}" failed to install — restoring base skill`));
            failedReplacements.push(baseSkill);
            ext.replacedSkills = ext.replacedSkills!.filter(s => s !== baseSkill);
          }
        }
      }
    }

    // Install base skills that couldn't be replaced due to broken extensions
    // But only if no other extension still replaces them
    if (failedReplacements.length > 0) {
      const stillReplacedByOthers = collectReplacedSkills(extensions);
      const toRestore = failedReplacements.filter(s => !stillReplacedByOthers.has(s));
      if (toRestore.length > 0) {
        await installSkillsForAllAgents(projectDir, config.agents, toRestore);
      }
    }

    // Re-apply extension injections
    if (config.extensions?.length) {
      let totalInjections = 0;
      for (const agent of config.agents) {
        totalInjections += await applyExtensionInjections(projectDir, agent, config.extensions!);
      }
      if (totalInjections > 0) {
        console.log(chalk.green(`✓ Re-applied ${totalInjections} extension injection(s)`));
      }
    }

    // Rebuild managed state after final update + replacement + injection pipeline.
    const finalReplacedSkills = collectReplacedSkills(extensions);
    for (const agent of config.agents) {
      const { base: baseSkills } = partitionSkills(agent.installedSkills);
      const managedBaseSkills = baseSkills.filter(skill => availableSkills.includes(skill) && !finalReplacedSkills.has(skill));
      agent.managedSkills = await buildManagedSkillsState(projectDir, agent, managedBaseSkills);
      if (agent.subagentsDir) {
        agent.managedSubagents = await buildManagedSubagentsState(projectDir, agent, agent.installedSubagents ?? []);
      }
    }

    config.version = currentVersion;
    await saveConfig(projectDir, config);

    console.log(chalk.green('✓ Skills and agent assets updated successfully'));
    console.log(chalk.green('✓ Configuration updated'));

    for (const agent of config.agents) {
      const entries = skillEntriesByAgent.get(agent.id) ?? [];
      const grouped = groupAndSortEntriesByStatus(entries, e => e.skill);
      const changedWithContextWarnings: string[] = [];

      for (const entry of grouped.changed) {
        const skillContextPath = path.join(projectDir, '.ai-factory', 'skill-context', entry.skill, 'SKILL.md');
        if (await fileExists(skillContextPath)) {
          changedWithContextWarnings.push(entry.skill);
        }
      }

      console.log(chalk.bold(`\n[${agent.id}] Status:`));
      console.log(chalk.dim(`  changed: ${grouped.changed.length}`));
      console.log(chalk.dim(`  unchanged: ${grouped.unchanged.length}`));
      console.log(chalk.dim(`  skipped: ${grouped.skipped.length}`));
      console.log(chalk.dim(`  removed: ${grouped.removed.length}`));

      if (grouped.changed.length > 0) {
        console.log(chalk.bold('  Changed:'));
        for (const entry of grouped.changed) {
          console.log(chalk.dim(`    - ${entry.skill} (${formatReason(entry.reason)})`));
        }
      }

      if (grouped.skipped.length > 0) {
        console.log(chalk.bold('  Skipped:'));
        for (const entry of grouped.skipped) {
          console.log(chalk.dim(`    - ${entry.skill} (${formatReason(entry.reason)})`));
        }
      }

      if (grouped.removed.length > 0) {
        console.log(chalk.bold('  Removed:'));
        for (const entry of grouped.removed) {
          console.log(chalk.dim(`    - ${entry.skill} (${formatReason(entry.reason)})`));
        }
      }

      const recoveryEntries = grouped.changed.filter(entry => [
        'missing-managed-state',
        'missing-installed-artifact',
        'source-missing',
      ].includes(entry.reason));
      if (recoveryEntries.length > 0) {
        console.log(chalk.yellow('  WARN: managed state recovered for:'));
        for (const entry of recoveryEntries) {
          console.log(chalk.yellow(`    - ${entry.skill} (${formatReason(entry.reason)})`));
        }
      }

      if (changedWithContextWarnings.length > 0) {
        console.log(chalk.yellow('  WARN: skill-context override may need review for changed skills:'));
        for (const skill of changedWithContextWarnings) {
          console.log(chalk.yellow(`    - ${skill} (.ai-factory/skill-context/${skill}/SKILL.md)`));
        }
      }

      const subagentEntries = subagentEntriesByAgent.get(agent.id) ?? [];
      if (agent.subagentsDir || subagentEntries.length > 0) {
        const groupedSubagents = groupAndSortEntriesByStatus(subagentEntries, e => e.subagent);

        console.log(chalk.bold(`[${agent.id}] Subagents:`));
        console.log(chalk.dim(`  changed: ${groupedSubagents.changed.length}`));
        console.log(chalk.dim(`  unchanged: ${groupedSubagents.unchanged.length}`));
        console.log(chalk.dim(`  skipped: ${groupedSubagents.skipped.length}`));
        console.log(chalk.dim(`  removed: ${groupedSubagents.removed.length}`));

        if (groupedSubagents.changed.length > 0) {
          console.log(chalk.bold('  Changed:'));
          for (const entry of groupedSubagents.changed) {
            console.log(chalk.dim(`    - ${entry.subagent} (${formatReason(entry.reason)})`));
          }
        }

        if (groupedSubagents.skipped.length > 0) {
          console.log(chalk.bold('  Skipped:'));
          for (const entry of groupedSubagents.skipped) {
            console.log(chalk.dim(`    - ${entry.subagent} (${formatReason(entry.reason)})`));
          }
        }

        if (groupedSubagents.removed.length > 0) {
          console.log(chalk.bold('  Removed:'));
          for (const entry of groupedSubagents.removed) {
            console.log(chalk.dim(`    - ${entry.subagent} (${formatReason(entry.reason)})`));
          }
        }

        const recoveredSubagents = groupedSubagents.changed.filter(entry => [
          'missing-managed-state',
          'missing-installed-artifact',
          'source-missing',
        ].includes(entry.reason));
        if (recoveredSubagents.length > 0) {
          console.log(chalk.yellow('  WARN: managed subagent state recovered for:'));
          for (const entry of recoveredSubagents) {
            console.log(chalk.yellow(`    - ${entry.subagent} (${formatReason(entry.reason)})`));
          }
        }
      }

      const { custom: customSkills } = partitionSkills(agent.installedSkills);

      if (customSkills.length > 0) {
        console.log(chalk.bold(`[${agent.id}] Custom skills (preserved):`));
        for (const skill of customSkills) {
          console.log(chalk.dim(`  - ${skill}`));
        }
      }
    }
    console.log('');

  } catch (error) {
    console.log(chalk.red(`Error updating skills: ${(error as Error).message}`));
    process.exit(1);
  }
}
