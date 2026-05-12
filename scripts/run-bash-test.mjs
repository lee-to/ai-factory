#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const [scriptArg, ...scriptArgs] = process.argv.slice(2);
const debug = process.env.AIF_TEST_RUNNER_DEBUG === '1';

if (!scriptArg) {
  console.error('Usage: node scripts/run-bash-test.mjs <script> [args...]');
  process.exit(2);
}

const scriptPath = path.resolve(repoRoot, scriptArg);
if (!fs.existsSync(scriptPath)) {
  console.error(`Test script not found: ${scriptArg}`);
  process.exit(2);
}

function pathExists(candidate) {
  return candidate ? fs.existsSync(candidate) : false;
}

function isWslLauncher(candidate) {
  if (process.platform !== 'win32') {
    return false;
  }
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return path.resolve(candidate).toLowerCase() === path.join(systemRoot, 'System32', 'bash.exe').toLowerCase();
}

function findOnPath(binary) {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map(entry => path.join(entry, binary))
    .filter(pathExists);
}

function findBash() {
  if (process.env.AIF_BASH) {
    return process.env.AIF_BASH;
  }

  if (process.platform !== 'win32') {
    return 'bash';
  }

  const gitBashCandidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'usr', 'bin', 'bash.exe'),
  ].filter(Boolean);

  const pathCandidates = findOnPath('bash.exe');
  const candidates = [
    ...gitBashCandidates,
    ...pathCandidates.filter(candidate => candidate.toLowerCase().includes(`${path.sep}git${path.sep}`)),
    ...pathCandidates.filter(candidate => !isWslLauncher(candidate)),
    ...pathCandidates,
  ];

  return candidates.find(pathExists) || 'bash';
}

function toBashPath(targetPath, bashPath) {
  if (process.platform !== 'win32') {
    return targetPath;
  }

  if (isWslLauncher(bashPath)) {
    const drivePath = targetPath.match(/^([A-Za-z]):\\(.*)$/);
    if (drivePath) {
      return `/mnt/${drivePath[1].toLowerCase()}/${drivePath[2].replace(/\\/g, '/')}`;
    }
  }

  return targetPath.replace(/\\/g, '/');
}

const bash = findBash();
const bashScriptPath = toBashPath(scriptPath, bash);

if (debug) {
  console.error(`[FIX:test-runner] Using bash: ${bash}`);
  console.error(`[FIX:test-runner] Running script: ${bashScriptPath}`);
}

const child = spawn(bash, [bashScriptPath, ...scriptArgs], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[FIX:test-runner] ${scriptArg} terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', error => {
  console.error(`[FIX:test-runner] Failed to start bash: ${error.message}`);
  process.exit(1);
});
