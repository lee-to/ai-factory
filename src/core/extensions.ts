import path from 'path';
import { execFileSync } from 'child_process';
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

function isMissingCommandError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export interface ResolveNpmCommandOptions {
  platform?: NodeJS.Platform;
  execPath?: string;
  pathEnv?: string;
  pathDelimiter?: string;
  pathExists?: (targetPath: string) => Promise<boolean>;
}

interface ResolvedNpmCommand {
  command: string;
  argsPrefix: string[];
}

const npmCommandResolutionCache = new Map<string, Promise<ResolvedNpmCommand>>();

function getNpmCliCandidates(execPath: string): string[] {
  const nodeDir = path.dirname(execPath);
  return [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
}

function getPathDelimiter(platform: NodeJS.Platform, override?: string): string {
  if (override) {
    return override;
  }

  return platform === 'win32' ? ';' : ':';
}

async function findWindowsPathNpmCli(
  pathEnv: string,
  fallbackExecPath: string,
  pathDelimiter: string,
  pathExists: (targetPath: string) => Promise<boolean>,
): Promise<ResolvedNpmCommand | null> {
  const npmCommandPaths = pathEnv
    .split(pathDelimiter)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => path.join(entry, 'npm.cmd'));

  for (const npmCommandPath of npmCommandPaths) {
    if (!await pathExists(npmCommandPath)) {
      continue;
    }

    const npmRoot = path.dirname(npmCommandPath);
    const npmCliPath = path.join(npmRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');

    if (!await pathExists(npmCliPath)) {
      continue;
    }

    const bundledNodePath = path.join(npmRoot, 'node.exe');
    const command = await pathExists(bundledNodePath) ? bundledNodePath : fallbackExecPath;

    logExtension('debug', '[FIX] Resolved Windows npm-cli.js from PATH', {
      npmCliPath,
      command,
      pathDelimiter,
    });

    return {
      command,
      argsPrefix: [npmCliPath],
    };
  }

  return null;
}

function getNpmCommandResolutionCacheKey(
  platform: NodeJS.Platform,
  execPath: string,
  pathEnv: string,
  pathDelimiter: string,
  pathExists?: ResolveNpmCommandOptions['pathExists'],
): string | null {
  if (pathExists) {
    return null;
  }

  return JSON.stringify([platform, execPath, pathEnv, pathDelimiter]);
}

async function resolveNpmCommandUncached(
  platform: NodeJS.Platform,
  execPath: string,
  pathEnv: string,
  pathDelimiter: string,
  pathExists: (targetPath: string) => Promise<boolean>,
): Promise<ResolvedNpmCommand> {
  for (const candidate of new Set(getNpmCliCandidates(execPath))) {
    if (await pathExists(candidate)) {
      return {
        command: execPath,
        argsPrefix: [candidate],
      };
    }
  }

  if (platform === 'win32') {
    // Resolve npm-cli.js directly so package specs never pass through cmd.exe parsing.
    logExtension('debug', '[FIX] Resolving Windows npm-cli.js from PATH', {
      pathDelimiter,
    });
    const resolvedFromPath = await findWindowsPathNpmCli(pathEnv, execPath, pathDelimiter, pathExists);
    if (resolvedFromPath) {
      return resolvedFromPath;
    }

    throw new Error(
      'Unable to locate npm-cli.js for a safe Windows npm invocation. Reinstall Node.js/npm or ensure npm.cmd points to a standard npm installation.',
    );
  }

  return {
    command: 'npm',
    argsPrefix: [],
  };
}

export async function resolveNpmCommand(options: ResolveNpmCommandOptions = {}): Promise<ResolvedNpmCommand> {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const pathEnv = options.pathEnv ?? process.env.PATH ?? '';
  const pathDelimiter = getPathDelimiter(platform, options.pathDelimiter);
  const pathExists = options.pathExists ?? fs.pathExists;
  const cacheKey = getNpmCommandResolutionCacheKey(platform, execPath, pathEnv, pathDelimiter, options.pathExists);

  if (!cacheKey) {
    return resolveNpmCommandUncached(platform, execPath, pathEnv, pathDelimiter, pathExists);
  }

  let cachedResolution = npmCommandResolutionCache.get(cacheKey);
  if (!cachedResolution) {
    cachedResolution = resolveNpmCommandUncached(platform, execPath, pathEnv, pathDelimiter, pathExists);
    npmCommandResolutionCache.set(cacheKey, cachedResolution);
  }

  return cachedResolution;
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
    if (!isValidVersionString(data.version)) {
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
  agentsDir?: string;
  agentFileExtension?: '.md' | '.toml';
  settingsFile: string | null;
  supportsMcp: boolean;
  skillsCliAgent: string | null;
}

export interface ExtensionAgentFile {
  runtime: string;
  source: string;
  target: string;
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
  agentFiles?: ExtensionAgentFile[];
  injections?: ExtensionInjection[];
  skills?: string[];
  replaces?: Record<string, string>;
  mcpServers?: ExtensionMcpServer[];
}

export interface InstalledExtensionManifest {
  dir: string;
  manifest: ExtensionManifest;
}

interface LoadExtensionManifestOptions {
  allowLegacyAgentFileTargetAliases?: boolean;
}

function isSafeRelativeAssetPath(filePath: string): boolean {
  const windowsDriveAbsolute = /^[a-zA-Z]:[\\/]/.test(filePath);
  const windowsUncAbsolute = /^(\\\\|\/\/)/.test(filePath);

  if (!filePath || path.isAbsolute(filePath) || windowsDriveAbsolute || windowsUncAbsolute) {
    return false;
  }

  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '');

  return !normalized.split('/').some(segment => segment === '..' || segment.length === 0);
}

function isCanonicalRelativeAssetPath(filePath: string): boolean {
  const normalized = path.posix.normalize(filePath.replaceAll('\\', '/'));
  return normalized === filePath;
}

function normalizeLegacyAgentFileTarget(filePath: string): string | null {
  const normalized = path.posix.normalize(filePath.replaceAll('\\', '/'));

  if (!isSafeRelativeAssetPath(normalized) || !isCanonicalRelativeAssetPath(normalized)) {
    return null;
  }

  return normalized;
}

function validateRuntimeAwareAgentDefinition(agent: ExtensionAgentDef, extensionName: string): void {
  if (!agent.id || !agent.displayName || !agent.configDir || !agent.skillsDir) {
    throw new Error(
      `Extension "${extensionName}" defines an invalid runtime. Required fields: id, displayName, configDir, skillsDir.`,
    );
  }

  if ((agent.agentsDir && !agent.agentFileExtension) || (!agent.agentsDir && agent.agentFileExtension)) {
    throw new Error(
      `Extension "${extensionName}" runtime "${agent.id}" must set both "agentsDir" and "agentFileExtension" together.`,
    );
  }

  if (agent.agentsDir && !isSafeRelativeAssetPath(agent.agentsDir)) {
    throw new Error(
      `Extension "${extensionName}" runtime "${agent.id}" has an invalid "agentsDir". It must be a safe relative path without "..".`,
    );
  }

  if (agent.agentFileExtension && agent.agentFileExtension !== '.md' && agent.agentFileExtension !== '.toml') {
    throw new Error(
      `Extension "${extensionName}" runtime "${agent.id}" has unsupported "agentFileExtension": ${agent.agentFileExtension}.`,
    );
  }
}

function validateExtensionAgentFile(manifest: ExtensionManifest, agentFile: ExtensionAgentFile): void {
  if (!agentFile.runtime) {
    throw new Error(`Extension "${manifest.name}" has an agentFiles entry without "runtime".`);
  }

  if (!isSafeRelativeAssetPath(agentFile.source)) {
    throw new Error(
      `Extension "${manifest.name}" agentFiles entry for runtime "${agentFile.runtime}" has an invalid "source" path.`,
    );
  }

  if (!isSafeRelativeAssetPath(agentFile.target)) {
    throw new Error(
      `Extension "${manifest.name}" agentFiles entry for runtime "${agentFile.runtime}" has an invalid "target" path.`,
    );
  }

  if (!isCanonicalRelativeAssetPath(agentFile.target)) {
    throw new Error(
      `Extension "${manifest.name}" agentFiles entry for runtime "${agentFile.runtime}" must use a canonical "target" path without aliases like "./" or "nested/../".`,
    );
  }
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

  const runtimeIds = new Set<string>();
  for (const agent of manifest.agents ?? []) {
    validateRuntimeAwareAgentDefinition(agent, manifest.name);
    if (runtimeIds.has(agent.id)) {
      throw new Error(`Extension "${manifest.name}" declares duplicate runtime id "${agent.id}".`);
    }
    runtimeIds.add(agent.id);
  }

  const ownedTargets = new Set<string>();
  for (const agentFile of manifest.agentFiles ?? []) {
    validateExtensionAgentFile(manifest, agentFile);
    const ownershipKey = `${agentFile.runtime}::${agentFile.target}`;
    if (ownedTargets.has(ownershipKey)) {
      throw new Error(
        `Extension "${manifest.name}" declares duplicate agent file target "${agentFile.target}" for runtime "${agentFile.runtime}".`,
      );
    }
    ownedTargets.add(ownershipKey);
  }
}

function normalizeLegacyExtensionManifestTargets(
  manifest: ExtensionManifest,
  extensionDir: string,
): ExtensionManifest {
  const agentFiles = manifest.agentFiles?.map((agentFile) => {
    if (isCanonicalRelativeAssetPath(agentFile.target)) {
      return agentFile;
    }

    const normalizedTarget = normalizeLegacyAgentFileTarget(agentFile.target);
    if (!normalizedTarget) {
      return agentFile;
    }

    logExtension('warn', 'Normalized legacy extension agentFiles.target alias', {
      extension: manifest.name,
      extensionDir,
      runtime: agentFile.runtime,
      target: agentFile.target,
      normalizedTarget,
    });

    return {
      ...agentFile,
      target: normalizedTarget,
    };
  });

  if (!agentFiles) {
    return manifest;
  }

  return {
    ...manifest,
    agentFiles,
  };
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

export async function loadExtensionManifest(
  extensionDir: string,
  options: LoadExtensionManifestOptions = {},
): Promise<ExtensionManifest | null> {
  const manifestPath = path.join(extensionDir, 'extension.json');
  let manifest = await readJsonFile<ExtensionManifest>(manifestPath);
  if (!manifest || !manifest.name || !manifest.version) {
    return null;
  }
  if (options.allowLegacyAgentFileTargetAliases) {
    manifest = normalizeLegacyExtensionManifestTargets(manifest, extensionDir);
  }
  validateExtensionManifest(manifest);
  return manifest;
}

export async function loadInstalledExtensionManifest(extensionDir: string): Promise<ExtensionManifest | null> {
  return loadExtensionManifest(extensionDir, { allowLegacyAgentFileTargetAliases: true });
}

export async function loadAllExtensions(
  projectDir: string,
  registeredNames: string[],
): Promise<InstalledExtensionManifest[]> {
  const extensionsDir = getExtensionsDir(projectDir);
  const results: InstalledExtensionManifest[] = [];

  for (const name of registeredNames) {
    try {
      validateExtensionName(name);
    } catch {
      continue;
    }
    const extDir = path.join(extensionsDir, name);
    const manifest = await loadInstalledExtensionManifest(extDir);
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
  const tmpDir = path.join(getExtensionsDir(projectDir), '.tmp-install');
  const npmRunner = await resolveNpmCommand();
  logExtension('debug', 'Resolving npm extension source', { packageName, tmpDir });
  await removeDirectory(tmpDir);
  await ensureDir(tmpDir);

  try {
    logExtension('debug', '[FIX] Starting npm pack for extension source', {
      packageName,
      command: npmRunner.command,
      argsPrefix: npmRunner.argsPrefix,
    });
    execFileSync(
      npmRunner.command,
      [...npmRunner.argsPrefix, 'pack', packageName, '--pack-destination', tmpDir],
      { stdio: 'pipe' },
    );
  } catch (error) {
    await removeDirectory(tmpDir);
    if (isMissingCommandError(error)) {
      if (npmRunner.argsPrefix.length > 0) {
        throw new Error('A safe npm entrypoint was resolved, but the npm command could not be started. Reinstall Node.js/npm and rerun with LOG_LEVEL=debug to inspect the resolved command.');
      }

      throw new Error('npm is required to install npm-based extensions but was not found in PATH. Rerun with LOG_LEVEL=debug for resolver details.');
    }
    throw error;
  }

  const files = await fs.readdir(tmpDir);
  const tgzFile = files.find(f => f.endsWith('.tgz'));
  if (!tgzFile) {
    await removeDirectory(tmpDir);
    throw new Error('npm pack produced no output');
  }

  const extractDir = path.join(tmpDir, 'extracted');
  await ensureDir(extractDir);
  try {
    execFileSync('tar', ['-xzf', path.join(tmpDir, tgzFile), '-C', extractDir], { stdio: 'pipe' });
  } catch (error) {
    await removeDirectory(tmpDir);
    if (isMissingCommandError(error)) {
      throw new Error('tar is required to extract npm-based extensions but was not found in PATH.');
    }
    throw error;
  }

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
  try {
    execFileSync('git', cloneArgs, { stdio: 'pipe' });
  } catch (error) {
    await removeDirectory(tmpDir);
    if (isMissingCommandError(error)) {
      throw new Error('git is required to install extensions from Git sources but was not found in PATH.');
    }
    throw error;
  }

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
