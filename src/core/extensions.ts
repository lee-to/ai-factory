import path from 'path';
import fs from 'fs-extra';
import { readJsonFile, removeDirectory, ensureDir } from '../utils/fs.js';
import type { McpServerConfig } from './mcp.js';

export interface ExtensionInjection {
  target: string;
  position: 'append' | 'prepend';
  file: string;
}

export interface ExtensionCommand {
  name: string;
  description: string;
  module: string;
}

export interface ExtensionAgentDef {
  id: string;
  displayName: string;
  configDir: string;
  skillsDir: string;
  settingsFile: string | null;
  supportsMcp: boolean;
  skillsCliAgent: string | null;
}

export interface ExtensionMcpServer {
  key: string;
  template: string | McpServerConfig;
  instruction?: string;
}

export interface ExtensionSubagentDef {
  id: string;
  role: string;
  description?: string;
  maxContextChars?: number;
  outputFormat?: 'json' | 'markdown';
}

export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  commands?: ExtensionCommand[];
  agents?: ExtensionAgentDef[];
  injections?: ExtensionInjection[];
  skills?: string[];
  replaces?: Record<string, string>;
  mcpServers?: ExtensionMcpServer[];
  subagents?: ExtensionSubagentDef[];
}

const EXTENSIONS_DIR = 'extensions';
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9_@][\w.@/-]*$/;
const SAFE_SKILL_NAME_PATTERN = /^[a-zA-Z0-9][\w.-]*$/;

export function validateExtensionName(name: string): void {
  if (!SAFE_NAME_PATTERN.test(name) || name.includes('..') || path.isAbsolute(name)) {
    throw new Error(`Invalid extension name: "${name}". Names must be alphanumeric (with -, _, @, /) and cannot contain ".." or absolute paths.`);
  }
}

export function validateSkillName(name: string): void {
  if (!SAFE_SKILL_NAME_PATTERN.test(name) || name.includes('..') || name.includes('/') || name.includes('\\') || path.isAbsolute(name)) {
    throw new Error(`Invalid skill name: "${name}". Skill names must be simple identifiers (letters, digits, -, _, .).`);
  }
}

export function getExtensionsDir(projectDir: string): string {
  return path.join(projectDir, '.ai-factory', EXTENSIONS_DIR);
}

export async function loadExtensionManifest(extensionDir: string): Promise<ExtensionManifest | null> {
  const manifestPath = path.join(extensionDir, 'extension.json');
  const manifest = await readJsonFile<ExtensionManifest>(manifestPath);
  if (!manifest || !manifest.name || !manifest.version) {
    return null;
  }
  validateExtensionName(manifest.name);
  if (manifest.replaces) {
    for (const baseSkillName of Object.values(manifest.replaces)) {
      validateSkillName(baseSkillName);
    }
  }
  return manifest;
}

export async function loadAllExtensions(
  projectDir: string,
  registeredNames: string[],
): Promise<{ dir: string; manifest: ExtensionManifest }[]> {
  const extensionsDir = getExtensionsDir(projectDir);
  const results: { dir: string; manifest: ExtensionManifest }[] = [];

  for (const name of registeredNames) {
    try {
      validateExtensionName(name);
    } catch {
      continue;
    }
    const extDir = path.join(extensionsDir, name);
    const manifest = await loadExtensionManifest(extDir);
    if (manifest) {
      results.push({ dir: extDir, manifest });
    }
  }

  return results;
}

function isGitUrl(source: string): boolean {
  return source.startsWith('git+') ||
    source.startsWith('git://') ||
    source.endsWith('.git') ||
    source.includes('github.com/') ||
    source.includes('gitlab.com/');
}

function isLocalPath(source: string): boolean {
  return source.startsWith('./') || source.startsWith('/') || source.startsWith('../') || path.isAbsolute(source);
}

// Two-phase install: resolve (download/validate) then commit (copy to project).
// This allows callers to inspect the manifest and check constraints before any files are written.

export interface ResolvedExtension {
  manifest: ExtensionManifest;
  sourceDir: string;
  tempDir?: string; // set for git/npm — caller must call cleanup()
  cleanup: () => Promise<void>;
}

async function resolveFromLocal(sourcePath: string): Promise<ResolvedExtension> {
  const resolvedSource = path.resolve(sourcePath);
  const manifest = await loadExtensionManifest(resolvedSource);
  if (!manifest) {
    throw new Error(`Invalid extension: no valid extension.json found in ${resolvedSource}`);
  }
  return { manifest, sourceDir: resolvedSource, cleanup: async () => {} };
}

async function resolveFromNpm(projectDir: string, packageName: string): Promise<ResolvedExtension> {
  const { execFileSync } = await import('child_process');
  const tmpDir = path.join(getExtensionsDir(projectDir), '.tmp-install');
  await removeDirectory(tmpDir);
  await ensureDir(tmpDir);

  execFileSync('npm', ['pack', packageName, '--pack-destination', tmpDir], { stdio: 'pipe' });

  const files = await fs.readdir(tmpDir);
  const tgzFile = files.find(f => f.endsWith('.tgz'));
  if (!tgzFile) {
    await removeDirectory(tmpDir);
    throw new Error('npm pack produced no output');
  }

  const extractDir = path.join(tmpDir, 'extracted');
  await ensureDir(extractDir);
  execFileSync('tar', ['-xzf', path.join(tmpDir, tgzFile), '-C', extractDir], { stdio: 'pipe' });

  const packageDir = path.join(extractDir, 'package');
  const manifest = await loadExtensionManifest(packageDir);
  if (!manifest) {
    await removeDirectory(tmpDir);
    throw new Error(`Invalid extension: no valid extension.json in ${packageName}`);
  }

  return { manifest, sourceDir: packageDir, tempDir: tmpDir, cleanup: () => removeDirectory(tmpDir) };
}

async function resolveFromGit(projectDir: string, url: string): Promise<ResolvedExtension> {
  const { execFileSync } = await import('child_process');
  const tmpDir = path.join(getExtensionsDir(projectDir), '.tmp-clone');
  await removeDirectory(tmpDir);

  const cleanUrl = url.replace(/^git\+/, '');
  execFileSync('git', ['clone', '--depth', '1', cleanUrl, tmpDir], { stdio: 'pipe' });

  const manifest = await loadExtensionManifest(tmpDir);
  if (!manifest) {
    await removeDirectory(tmpDir);
    throw new Error(`Invalid extension: no valid extension.json in ${url}`);
  }

  return { manifest, sourceDir: tmpDir, tempDir: tmpDir, cleanup: () => removeDirectory(tmpDir) };
}

export async function resolveExtension(projectDir: string, source: string): Promise<ResolvedExtension> {
  if (isLocalPath(source)) {
    return resolveFromLocal(source);
  }
  if (isGitUrl(source)) {
    return resolveFromGit(projectDir, source);
  }
  return resolveFromNpm(projectDir, source);
}

export async function commitExtensionInstall(projectDir: string, resolved: ResolvedExtension): Promise<void> {
  const targetDir = path.join(getExtensionsDir(projectDir), resolved.manifest.name);
  await ensureDir(targetDir);

  if (resolved.sourceDir === resolved.tempDir && await fs.pathExists(path.join(resolved.sourceDir, '.git'))) {
    // Git clone: copy everything except .git
    const entries = await fs.readdir(resolved.sourceDir);
    for (const entry of entries) {
      if (entry === '.git') continue;
      await fs.copy(path.join(resolved.sourceDir, entry), path.join(targetDir, entry), { overwrite: true });
    }
  } else {
    await fs.copy(resolved.sourceDir, targetDir, { overwrite: true });
  }
}

export async function removeExtensionFiles(projectDir: string, name: string): Promise<void> {
  validateExtensionName(name);
  const targetDir = path.join(getExtensionsDir(projectDir), name);
  // Verify target stays within extensions dir
  const extensionsDir = getExtensionsDir(projectDir);
  if (!path.resolve(targetDir).startsWith(path.resolve(extensionsDir) + path.sep)) {
    throw new Error(`Extension path escapes extensions directory: "${name}"`);
  }
  await removeDirectory(targetDir);
}
