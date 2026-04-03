import path from 'path';
import fs from 'fs-extra';
import * as semver from 'semver';
import { readJsonFile, removeDirectory, ensureDir } from '../utils/fs.js';
import type { McpServerConfig } from './mcp.js';

type ExtensionLogLevel = 'debug' | 'info' | 'warn';

export type ExtensionSourceType = 'local' | 'npm' | 'github' | 'gitlab' | 'git';

export interface ParsedGitSource {
  host: string | null;
  owner: string | null;
  repo: string | null;
  ref: string | null;
  cloneUrl: string;
  isGitHub: boolean;
  isGitLab: boolean;
}

export interface ExtensionVersionMetadata {
  sourceType: ExtensionSourceType;
  latestVersion: string;
  manifest: ExtensionManifest;
  source: string;
  metadata?: {
    path?: string;
    packageName?: string;
    host?: string;
    owner?: string;
    repo?: string;
    ref?: string;
  };
}

export interface ExtensionVersionResolution {
  status: 'resolved' | 'failed';
  sourceType: ExtensionSourceType;
  source: string;
  latestVersion?: string;
  manifest?: ExtensionManifest;
  metadata?: ExtensionVersionMetadata['metadata'];
  failureReason?: string;
}

interface NpmRegistryVersionResponse {
  version: string;
}

interface GitHubContentsResponse {
  content?: string;
  encoding?: string;
}

export interface NpmVersionCheckResult {
  packageName: string;
  latestVersion: string | null;
  shouldDownload: boolean;
  reason: 'force' | 'version-changed' | 'unchanged' | 'lookup-failed';
}

let githubAuthModeLogged = false;

function shouldLog(level: ExtensionLogLevel): boolean {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();

  if (envLevel === 'debug') {
    return true;
  }

  if (envLevel === 'info') {
    return level !== 'debug';
  }

  return level === 'warn';
}

function logExtension(level: ExtensionLogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const suffix = context ? ` ${JSON.stringify(context)}` : '';
  const line = `[extensions] ${message}${suffix}`;

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

function isValidVersionString(version: string): boolean {
  return semver.valid(version) !== null;
}

function logGitHubAuthModeOnce(hasToken: boolean): void {
  if (githubAuthModeLogged) {
    return;
  }

  githubAuthModeLogged = true;
  logExtension('info', hasToken ? 'Using authenticated GitHub API requests' : 'Using unauthenticated GitHub API requests', {
    sourceType: 'github',
    authMode: hasToken ? 'token' : 'anonymous',
  });
}

function isGitHubRateLimited(response: Response): boolean {
  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

export async function fetchLatestNpmPackageVersion(packageName: string): Promise<string | null> {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;

  logExtension('debug', 'Fetching latest npm package version', {
    sourceType: 'npm',
    packageName,
    registryUrl,
  });

  try {
    const response = await fetch(registryUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logExtension('warn', 'Failed to fetch npm package metadata', {
        sourceType: 'npm',
        packageName,
        status: response.status,
      });
      return null;
    }

    const data = await response.json() as NpmRegistryVersionResponse;
    if (typeof data.version !== 'string' || !isValidVersionString(data.version)) {
      logExtension('warn', 'npm package metadata missing version', {
        sourceType: 'npm',
        packageName,
        latestVersion: data.version,
      });
      return null;
    }

    logExtension('info', 'Fetched latest npm package version', {
      sourceType: 'npm',
      packageName,
      latestVersion: data.version,
    });

    return data.version;
  } catch (error) {
    logExtension('warn', 'npm package version lookup failed', {
      sourceType: 'npm',
      packageName,
      failureReason: (error as Error).message,
    });
    return null;
  }
}

export async function getNpmVersionCheckResult(
  packageName: string,
  currentVersion: string,
  force = false,
): Promise<NpmVersionCheckResult> {
  const latestVersion = await fetchLatestNpmPackageVersion(packageName);

  if (!latestVersion) {
    return {
      packageName,
      latestVersion: null,
      shouldDownload: force,
      reason: 'lookup-failed',
    };
  }

  if (force) {
    return {
      packageName,
      latestVersion,
      shouldDownload: true,
      reason: 'force',
    };
  }

  if (compareExtensionVersions(latestVersion, currentVersion) > 0) {
    return {
      packageName,
      latestVersion,
      shouldDownload: true,
      reason: 'version-changed',
    };
  }

  return {
    packageName,
    latestVersion,
    shouldDownload: false,
    reason: 'unchanged',
  };
}

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
}

function validateExtensionManifest(manifest: ExtensionManifest): void {
  validateExtensionName(manifest.name);

  if (!isValidVersionString(manifest.version)) {
    throw new Error(`Invalid extension version: "${manifest.version}". Versions must use SemVer format.`);
  }

  if (manifest.replaces) {
    for (const baseSkillName of Object.values(manifest.replaces)) {
      validateSkillName(baseSkillName);
    }
  }
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
  validateExtensionManifest(manifest);
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
  return source.startsWith('./')
    || source.startsWith('.\\')
    || source.startsWith('/')
    || source.startsWith('../')
    || source.startsWith('..\\')
    || path.isAbsolute(source);
}

export function classifyExtensionSource(source: string): ExtensionSourceType {
  if (isLocalPath(source)) {
    return 'local';
  }

  if (source.includes('github.com/')) {
    return 'github';
  }

  if (source.includes('gitlab.com/')) {
    return 'gitlab';
  }

  if (isGitUrl(source)) {
    return 'git';
  }

  return 'npm';
}

export function compareExtensionVersions(left: string, right: string): number {
  logExtension('debug', 'Comparing extension versions', {
    left,
    right,
  });

  const leftValid = semver.valid(left);
  const rightValid = semver.valid(right);

  if (!leftValid && !rightValid) {
    logExtension('warn', 'Both extension versions are invalid for comparison', {
      left,
      right,
    });
    return 0;
  }

  if (!leftValid) {
    logExtension('warn', 'Left extension version is invalid for comparison', {
      left,
      right,
    });
    return -1;
  }

  if (!rightValid) {
    logExtension('warn', 'Right extension version is invalid for comparison', {
      left,
      right,
    });
    return 1;
  }

  const result = semver.compare(leftValid, rightValid);
  logExtension('debug', 'Extension version comparison result', {
    left: leftValid,
    right: rightValid,
    result,
  });

  return result;
}

export function parseGitSource(source: string): ParsedGitSource {
  const withoutPrefix = source.replace(/^git\+/, '');
  const [cloneCandidate, refCandidate] = withoutPrefix.split('#', 2);
  const cloneUrl = cloneCandidate.replace(/^git@github\.com:/, 'https://github.com/');
  const normalizedUrl = cloneUrl.replace(/^git@gitlab\.com:/, 'https://gitlab.com/');

  let host: string | null = null;
  let owner: string | null = null;
  let repo: string | null = null;

  try {
    const url = new URL(normalizedUrl);
    host = url.hostname;
    const segments = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/').filter(Boolean);
    owner = segments[0] ?? null;
    repo = segments[1] ?? null;
  } catch {
    const sshMatch = normalizedUrl.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      host = sshMatch[1] ?? null;
      owner = sshMatch[2] ?? null;
      repo = sshMatch[3] ?? null;
    }
  }

  const isGitHub = host === 'github.com';
  const isGitLab = host === 'gitlab.com';

  return {
    host,
    owner,
    repo,
    ref: refCandidate ?? null,
    cloneUrl: cloneCandidate,
    isGitHub,
    isGitLab,
  };
}

export interface GitHubManifestResult {
  manifest: ExtensionManifest | null;
  rateLimited: boolean;
}

export async function fetchGitHubExtensionManifest(source: string): Promise<GitHubManifestResult> {
  const gitSource = parseGitSource(source);

  if (!gitSource.isGitHub || !gitSource.owner || !gitSource.repo) {
    return { manifest: null, rateLimited: false };
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  logGitHubAuthModeOnce(Boolean(token));

  const contentsUrl = new URL(`https://api.github.com/repos/${gitSource.owner}/${gitSource.repo}/contents/extension.json`);
  if (gitSource.ref) {
    contentsUrl.searchParams.set('ref', gitSource.ref);
  }

  logExtension('debug', 'Fetching extension manifest via GitHub API', {
    sourceType: 'github',
    owner: gitSource.owner,
    repo: gitSource.repo,
    ref: gitSource.ref,
    contentsUrl: contentsUrl.toString(),
  });

  try {
    const response = await fetch(contentsUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });

    if (isGitHubRateLimited(response)) {
      logExtension('warn', 'GitHub API rate limit reached while fetching extension metadata', {
        sourceType: 'github',
        owner: gitSource.owner,
        repo: gitSource.repo,
        ref: gitSource.ref,
        hint: token ? 'retry later or investigate token scope' : 'set GITHUB_TOKEN with repo read access',
      });
      return { manifest: null, rateLimited: true };
    }

    if (!response.ok) {
      logExtension('warn', 'Failed to fetch extension manifest via GitHub API', {
        sourceType: 'github',
        owner: gitSource.owner,
        repo: gitSource.repo,
        ref: gitSource.ref,
        status: response.status,
      });
      return { manifest: null, rateLimited: false };
    }

    const payload = await response.json() as GitHubContentsResponse;
    if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
      logExtension('warn', 'GitHub API payload missing base64 extension manifest content', {
        sourceType: 'github',
        owner: gitSource.owner,
        repo: gitSource.repo,
        ref: gitSource.ref,
      });
      return { manifest: null, rateLimited: false };
    }

    const manifest = JSON.parse(Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8')) as ExtensionManifest;
    validateExtensionManifest(manifest);

    logExtension('info', 'Fetched extension manifest via GitHub API', {
      sourceType: 'github',
      owner: gitSource.owner,
      repo: gitSource.repo,
      ref: gitSource.ref,
      latestVersion: manifest.version,
    });

    return { manifest, rateLimited: false };
  } catch (error) {
    logExtension('warn', 'GitHub API manifest lookup failed', {
      sourceType: 'github',
      owner: gitSource.owner,
      repo: gitSource.repo,
      ref: gitSource.ref,
      failureReason: (error as Error).message,
    });
    return { manifest: null, rateLimited: false };
  }
}

export async function resolveExtensionVersion(
  projectDir: string,
  source: string,
): Promise<ExtensionVersionResolution> {
  const sourceType = classifyExtensionSource(source);

  logExtension('debug', 'Resolving extension version metadata', {
    source,
    sourceType,
  });

  try {
    if (sourceType === 'local') {
      const localPath = path.resolve(projectDir, source);
      const manifest = await loadExtensionManifest(localPath);
      if (!manifest) {
        return {
          status: 'failed',
          sourceType,
          source,
          failureReason: `No valid extension.json found in ${localPath}`,
          metadata: { path: localPath },
        };
      }

      return {
        status: 'resolved',
        sourceType,
        source,
        latestVersion: manifest.version,
        manifest,
        metadata: { path: localPath },
      };
    }

    if (sourceType === 'npm') {
      const packageName = source.replace(/^npm:/, '');
      const latestVersion = await fetchLatestNpmPackageVersion(packageName);
      if (!latestVersion) {
        return {
          status: 'failed',
          sourceType,
          source,
          failureReason: `Could not fetch npm metadata for ${packageName}`,
          metadata: { packageName },
        };
      }

      return {
        status: 'resolved',
        sourceType,
        source,
        latestVersion,
        metadata: { packageName },
      };
    }

    if (sourceType === 'github') {
      const gitSource = parseGitSource(source);
      const result = await fetchGitHubExtensionManifest(source);

      if (result.rateLimited) {
        return {
          status: 'failed',
          sourceType,
          source,
          failureReason: 'rate-limited',
          metadata: {
            host: gitSource.host ?? undefined,
            owner: gitSource.owner ?? undefined,
            repo: gitSource.repo ?? undefined,
            ref: gitSource.ref ?? undefined,
          },
        };
      }

      if (result.manifest) {
        return {
          status: 'resolved',
          sourceType,
          source,
          latestVersion: result.manifest.version,
          manifest: result.manifest,
          metadata: {
            host: gitSource.host ?? undefined,
            owner: gitSource.owner ?? undefined,
            repo: gitSource.repo ?? undefined,
            ref: gitSource.ref ?? undefined,
          },
        };
      }

      logExtension('warn', 'GitHub metadata unavailable, falling back to git clone for version resolution', {
        sourceType,
        host: gitSource.host,
        owner: gitSource.owner,
        repo: gitSource.repo,
        ref: gitSource.ref,
      });

      const resolved = await resolveFromGit(projectDir, source);
      try {
        return {
          status: 'resolved',
          sourceType,
          source,
          latestVersion: resolved.manifest.version,
          manifest: resolved.manifest,
          metadata: {
            host: gitSource.host ?? undefined,
            owner: gitSource.owner ?? undefined,
            repo: gitSource.repo ?? undefined,
            ref: gitSource.ref ?? undefined,
          },
        };
      } finally {
        await resolved.cleanup();
      }
    }

    return {
      status: 'failed',
      sourceType,
      source,
      failureReason: `Lightweight version checks are not available for ${sourceType} sources`,
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceType,
      source,
      failureReason: (error as Error).message,
    };
  }
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
  logExtension('debug', 'Resolving local extension source', { sourcePath, resolvedSource });
  const manifest = await loadExtensionManifest(resolvedSource);
  if (!manifest) {
    throw new Error(`Invalid extension: no valid extension.json found in ${resolvedSource}`);
  }
  logExtension('info', 'Resolved local extension manifest', {
    sourceType: 'local',
    path: resolvedSource,
    latestVersion: manifest.version,
  });
  return { manifest, sourceDir: resolvedSource, cleanup: async () => {} };
}

async function resolveFromNpm(projectDir: string, packageName: string): Promise<ResolvedExtension> {
  const { execFileSync } = await import('child_process');
  const tmpDir = path.join(getExtensionsDir(projectDir), '.tmp-install');
  logExtension('debug', 'Resolving npm extension source', { packageName, tmpDir });
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

  logExtension('info', 'Resolved npm extension manifest', {
    sourceType: 'npm',
    packageName,
    latestVersion: manifest.version,
  });

  return { manifest, sourceDir: packageDir, tempDir: tmpDir, cleanup: () => removeDirectory(tmpDir) };
}

async function resolveFromGit(projectDir: string, url: string): Promise<ResolvedExtension> {
  const { execFileSync } = await import('child_process');
  const tmpDir = path.join(getExtensionsDir(projectDir), '.tmp-clone');
  const gitSource = parseGitSource(url);
  const sourceType = classifyExtensionSource(url);
  logExtension('debug', 'Resolving git extension source', {
    sourceType,
    url,
    host: gitSource.host,
    owner: gitSource.owner,
    repo: gitSource.repo,
    ref: gitSource.ref,
    tmpDir,
  });
  await removeDirectory(tmpDir);

  const manifestFromApi = await fetchGitHubExtensionManifest(url);
  if (!manifestFromApi.manifest && !gitSource.isGitHub) {
    logExtension('debug', 'Using git clone fallback for non-GitHub extension metadata', {
      sourceType,
      host: gitSource.host,
      ref: gitSource.ref,
      url,
    });
  }

  const cloneArgs = ['clone', '--depth', '1'];
  if (gitSource.ref) {
    cloneArgs.push('--branch', gitSource.ref, '--single-branch');
  }
  cloneArgs.push(gitSource.cloneUrl, tmpDir);
  execFileSync('git', cloneArgs, { stdio: 'pipe' });

  const manifest = await loadExtensionManifest(tmpDir);
  if (!manifest) {
    await removeDirectory(tmpDir);
    throw new Error(`Invalid extension: no valid extension.json in ${url}`);
  }

  logExtension('info', 'Resolved git extension manifest', {
    sourceType,
    host: gitSource.host,
    owner: gitSource.owner,
    repo: gitSource.repo,
    ref: gitSource.ref,
    latestVersion: manifest.version,
    metadataSource: manifestFromApi.manifest ? 'github-api+clone' : 'clone',
  });

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
