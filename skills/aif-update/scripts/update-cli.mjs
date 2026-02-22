#!/usr/bin/env node
// update-cli.mjs — Update ai-factory CLI and project with confirmation

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Get current CLI version
 * @returns {string | null} e.g. "1.2.3" or null on error
 */
function getCurrentCliVersion() {
  try {
    const output = execSync('ai-factory --version', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const version = output.trim();
    // Output can be "2.1.0" or "ai-factory 2.1.0" or "ai-factory v2.1.0"
    return version.match(/^\d+\.\d+\.\d+$/) ? version : version.split(' ').pop().replace(/^v/, '');
  } catch {
    return null;
  }
}

/**
 * Get latest version from npm
 * @returns {string | null} e.g. "1.2.4" or null on error
 */
function getLatestCliVersion() {
  try {
    const output = execSync('npm view ai-factory version', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Read project config
 * @returns {{version: string, agent: string} | null}
 */
function getProjectConfig() {
  const configPath = join(process.cwd(), '.ai-factory.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return {
      version: data.version || 'unknown',
      agent: data.agent || 'unknown'
    };
  } catch {
    return null;
  }
}

/**
 * Compare versions (semver)
 * @param {string} v1
 * @param {string} v2
 * @returns {-1 | 0 | 1} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Check mode (--check)
 * @returns {object} JSON for the skill
 */
function checkMode() {
  const cliVersion = getCurrentCliVersion();
  const latestVersion = getLatestCliVersion();
  const projectConfig = getProjectConfig();

  // Version fetch errors
  if (!cliVersion) {
    return {
      cliNeedsUpdate: false,
      projectNeedsUpdate: false,
      cliVersion: null,
      latestVersion: latestVersion,
      projectVersion: projectConfig?.version || null,
      agent: projectConfig?.agent || null,
      error: 'CLI not installed or --version failed'
    };
  }

  if (!latestVersion) {
    return {
      cliNeedsUpdate: false,
      projectNeedsUpdate: false,
      cliVersion: cliVersion,
      latestVersion: null,
      projectVersion: projectConfig?.version || null,
      agent: projectConfig?.agent || null,
      error: 'Cannot fetch latest version from npm'
    };
  }

  const cliNeedsUpdate = compareVersions(cliVersion, latestVersion) < 0;
  const projectNeedsUpdate = projectConfig
    ? compareVersions(projectConfig.version, latestVersion) < 0
    : false;

  return {
    cliNeedsUpdate,
    projectNeedsUpdate,
    cliVersion,
    latestVersion,
    projectVersion: projectConfig?.version || null,
    agent: projectConfig?.agent || null,
    error: null
  };
}

/**
 * Execute mode (--execute --step=cli|project)
 * @param {string} step - 'cli' or 'project'
 * @returns {object} JSON with result
 */
function executeMode(step) {
  if (step === 'cli') {
    try {
      execSync('npm install -g ai-factory@latest', {
        encoding: 'utf8',
        stdio: 'inherit'
      });

      const newVersion = getCurrentCliVersion();
      return {
        success: true,
        step: 'cli',
        message: `CLI updated to ${newVersion || 'unknown'}`,
        newVersion
      };
    } catch (err) {
      return {
        success: false,
        step: 'cli',
        message: `Failed to update CLI: ${err.message}`,
        error: err.message
      };
    }
  }

  if (step === 'project') {
    try {
      const output = execSync('ai-factory upgrade', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return {
        success: true,
        step: 'project',
        message: 'Project upgraded successfully',
        output: output.slice(0, 500) // Truncate long output
      };
    } catch (err) {
      return {
        success: false,
        step: 'project',
        message: `Failed to upgrade project: ${err.message}`,
        error: err.message
      };
    }
  }

  return {
    success: false,
    step: step,
    message: `Unknown step: ${step}`,
    error: 'Invalid step'
  };
}

// ============================================
// MAIN: Parse arguments
// ============================================
const args = process.argv.slice(2);

if (args.includes('--check')) {
  console.log(JSON.stringify(checkMode(), null, 2));
} else if (args.includes('--execute')) {
  const stepArg = args.find(a => a.startsWith('--step='));
  const step = stepArg ? stepArg.split('=')[1] : null;

  if (!step) {
    console.log(JSON.stringify({
      success: false,
      error: '--execute requires --step=cli or --step=project'
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(executeMode(step), null, 2));
} else {
  // Default — check mode
  console.log(JSON.stringify(checkMode(), null, 2));
}
