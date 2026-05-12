import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const schemaPath = path.join(rootDir, 'schemas', 'extension.schema.json');
const manifestPath = path.join(rootDir, 'examples', 'extensions', 'aif-ext-hello', 'extension.json');
const docsPath = path.join(rootDir, 'docs', 'extensions.md');
const publicSchemaId = 'https://raw.githubusercontent.com/lee-to/ai-factory/2.x/schemas/extension.schema.json';
const packedSchemaPath = 'schemas/extension.schema.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatErrors(errors) {
  return (errors ?? [])
    .map(error => `${error.instancePath || '/'} ${error.message} (${error.keyword})`)
    .join('; ');
}

function assertFileExists(filePath, label) {
  assert.ok(fs.existsSync(filePath), `${label} not found: ${filePath}`);
}

function compileSchema() {
  assertFileExists(schemaPath, 'Extension schema');
  const schema = readJson(schemaPath);
  assert.equal(schema.$id, publicSchemaId, 'Extension schema $id must be a public, resolvable URI');
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
  });
  return ajv.compile(schema);
}

function assertSchemaReferencesDocumented() {
  assertFileExists(docsPath, 'Extensions documentation');
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.ok(
    docs.includes(publicSchemaId),
    `Extensions documentation must recommend the public schema URL: ${publicSchemaId}`,
  );
  assert.ok(
    docs.includes('./node_modules/ai-factory/schemas/extension.schema.json'),
    'Extensions documentation must document the package-local schema path for local installs',
  );
  assert.ok(
    docs.includes('globally'),
    'Extensions documentation must distinguish global CLI installs from local package installs',
  );

  console.log('pass: extension schema references documented for global and local installs');
}

function assertExampleManifestValid(validate) {
  assertFileExists(manifestPath, 'Example extension manifest');
  const manifest = readJson(manifestPath);
  const isValid = validate(manifest);

  assert.ok(
    isValid,
    `Example manifest must validate against ${schemaPath}: ${formatErrors(validate.errors)}`,
  );

  console.log(`pass: example manifest validates (${manifestPath})`);
}

function assertStringAgentFilesInvalid(validate) {
  const invalidManifest = {
    name: 'aif-ext-invalid-agent-files',
    version: '1.0.0',
    agentFiles: ['bad'],
  };
  const isValid = validate(invalidManifest);

  assert.equal(isValid, false, 'agentFiles as an array of strings must fail schema validation');
  assert.ok(
    (validate.errors ?? []).some(error => error.instancePath === '/agentFiles/0'),
    `agentFiles string-array failure should point to /agentFiles/0: ${formatErrors(validate.errors)}`,
  );

  console.log('pass: negative agentFiles string-array fixture fails validation');
}

function assertSchemaPacked() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = [
    ...(npmExecPath ? [npmExecPath] : []),
    'pack',
    '--dry-run',
    '--json',
  ];
  const output = execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [packResult] = JSON.parse(output);
  const files = (packResult?.files ?? []).map(file => file.path);

  assert.ok(
    files.includes(packedSchemaPath),
    `npm pack --dry-run --json must include ${packedSchemaPath}; packed files sample: ${files.slice(0, 20).join(', ')}`,
  );

  console.log(`pass: npm package dry-run includes ${packedSchemaPath}`);
}

const validate = compileSchema();
assertExampleManifestValid(validate);
assertStringAgentFilesInvalid(validate);
assertSchemaPacked();
assertSchemaReferencesDocumented();
