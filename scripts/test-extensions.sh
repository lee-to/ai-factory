#!/bin/bash
# Focused tests for extension resolver branches.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$ROOT_DIR/scripts/test-extension-schema.mjs"

ROOT_DIR="$ROOT_DIR" node --input-type=module <<'EOF'
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { resolveNpmCommand } = await import(pathToFileURL(path.join(process.env.ROOT_DIR, 'dist/core/extensions.js')).href);

function createPathExists(paths) {
  const existingPaths = new Set(paths);
  return async targetPath => existingPaths.has(targetPath);
}

const execPath = path.join('runtime', 'bin', 'node.exe');
const firstCandidate = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const secondCandidate = path.resolve(path.dirname(execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const thirdCandidate = path.resolve(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: '',
    pathExists: createPathExists([firstCandidate]),
  }),
  { command: execPath, argsPrefix: [firstCandidate] },
  'resolveNpmCommand must prefer npm-cli.js adjacent to the current node binary',
);

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: '',
    pathExists: createPathExists([secondCandidate]),
  }),
  { command: execPath, argsPrefix: [secondCandidate] },
  'resolveNpmCommand must fall back to ../node_modules/npm/bin/npm-cli.js',
);

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: '',
    pathExists: createPathExists([thirdCandidate]),
  }),
  { command: execPath, argsPrefix: [thirdCandidate] },
  'resolveNpmCommand must fall back to ../lib/node_modules/npm/bin/npm-cli.js',
);

const npmRoot = path.join('portable-npm');
const npmCommandPath = path.join(npmRoot, 'npm.cmd');
const npmCliPath = path.join(npmRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const bundledNodePath = path.join(npmRoot, 'node.exe');

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: `ignored:${npmRoot}`,
    pathDelimiter: ':',
    pathExists: createPathExists([npmCommandPath, npmCliPath, bundledNodePath]),
  }),
  { command: bundledNodePath, argsPrefix: [npmCliPath] },
  'resolveNpmCommand must resolve npm-cli.js from PATH on Windows when adjacent candidates are missing',
);

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: npmRoot,
    pathExists: createPathExists([npmCommandPath, npmCliPath]),
  }),
  { command: execPath, argsPrefix: [npmCliPath] },
  'resolveNpmCommand must fall back to execPath when npm.cmd is found without bundled node.exe',
);

await assert.rejects(
  () => resolveNpmCommand({
    platform: 'win32',
    execPath,
    pathEnv: npmRoot,
    pathExists: createPathExists([]),
  }),
  /safe Windows npm/i,
  'resolveNpmCommand must fail closed when no safe Windows npm entrypoint exists',
);

assert.deepEqual(
  await resolveNpmCommand({
    platform: 'linux',
    execPath,
    pathEnv: '',
    pathExists: createPathExists([]),
  }),
  { command: 'npm', argsPrefix: [] },
  'resolveNpmCommand must fall back to npm on non-Windows platforms',
);

console.log('extension resolver unit tests passed');
EOF
