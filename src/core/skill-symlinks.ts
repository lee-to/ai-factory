import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'fs-extra';
import type { AiFactoryConfig } from './config.js';
import { getTransformer } from './transformer.js';
import { physicalProjectPath, resolveSkillTargets } from './skill-targets.js';
import { buildManagedSkillsState, getAvailableSkills } from './installer.js';
import { hashDirectory, readJsonFile, writeJsonFile } from '../utils/fs.js';

const SHARED_DIR = '.agents/skills';

async function sharedPath(projectDir: string, relative: string): Promise<string> {
  const resolved = await physicalProjectPath(projectDir, relative);
  const expected = path.resolve(projectDir, relative);
  if (resolved !== (process.platform === 'win32' ? expected.toLowerCase() : expected)) {
    throw new Error(`Shared skill path must not be redirected by symlinks: ${relative}`);
  }
  return expected;
}

function skillPaths(config: AiFactoryConfig): string[] {
  return [...new Set(config.agents.flatMap(agent => agent.installedSkills.flatMap(name => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..') return [];
    const result = getTransformer(agent.id).transform(name, '');
    return result.flat ? [] : [path.posix.join(agent.skillsDir.replaceAll('\\', '/'), result.targetDir)];
  })))];
}

async function stat(file: string): Promise<fs.Stats | null> {
  try { return await fs.lstat(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Sharing requires equal bytes, permissions and empty directories, with no nested links.
async function treeHash(directory: string): Promise<string | null> {
  const hash = createHash('sha256');
  async function visit(file: string, relative: string): Promise<boolean> {
    const info = await stat(file);
    if (!info || info.isSymbolicLink()) return false;
    hash.update(JSON.stringify([relative, info.mode & 0o7777, info.isDirectory()]));
    if (info.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) {
        if (!await visit(path.join(file, name), `${relative}/${name}`)) return false;
      }
    } else if (info.isFile()) {
      const bytes = await fs.readFile(file);
      hash.update(`${bytes.length}:`);
      hash.update(bytes);
    } else return false;
    return true;
  }
  return await visit(directory, '') ? hash.digest('hex') : null;
}

async function materialize(projectDir: string, config: AiFactoryConfig): Promise<void> {
  if (!config.skillSymlinks) return;
  const { links, shared } = config.skillSymlinks;
  if (!links || !shared || typeof links !== 'object' || typeof shared !== 'object') {
    throw new Error('Invalid managed skill symlink state.');
  }
  const allowed = new Set(skillPaths(config));
  const copies: Array<{ link: string; target: string; hash: string; missing: boolean }> = [];
  const sharedPaths: Array<{ target: string; hash: string }> = [];
  for (const [relative, destination] of Object.entries(links)) {
    if (!allowed.has(relative) || destination !== `${SHARED_DIR}/${path.posix.basename(relative)}`) {
      throw new Error(`Invalid managed skill symlink: ${relative}`);
    }
    const link = path.join(projectDir, relative);
    const info = await stat(link);
    if (info && !info.isSymbolicLink()) continue;
    const target = await sharedPath(projectDir, destination);
    if (info && await physicalProjectPath(projectDir, relative) !== target) {
      throw new Error(`Managed skill symlink changed: ${relative}`);
    }
    const hash = await treeHash(target);
    if (!hash) throw new Error(`Unsafe shared skill tree: ${destination}`);
    copies.push({ link, target, hash, missing: !info });
  }
  for (const [relative, hash] of Object.entries(shared)) {
    if (!/^\.agents\/skills\/[a-zA-Z0-9_-]+$/.test(relative) || !/^[a-f0-9]{64}$/.test(hash)
      || !Object.values(links).includes(relative)) {
      throw new Error(`Invalid shared skill ownership: ${relative}`);
    }
    sharedPaths.push({ target: await sharedPath(projectDir, relative), hash });
  }
  // Validate the complete recorded state before replacing any links.
  for (const { link, target, hash, missing } of copies) {
    const temporary = `${link}.aif-copy-${randomUUID()}`;
    const backup = `${link}.aif-link-${randomUUID()}`;
    try {
      await fs.copy(target, temporary);
      if (await treeHash(temporary) !== hash) throw new Error(`Shared skill changed while copying: ${target}`);
      if (!missing) await fs.rename(link, backup);
      try { await fs.rename(temporary, link); }
      catch (error) {
        if (!missing) await fs.rename(backup, link);
        throw error;
      }
      await fs.remove(backup);
    } finally {
      await fs.remove(temporary);
    }
  }
  const consumers = new Set(await Promise.all(skillPaths(config).map(relative => physicalProjectPath(projectDir, relative))));
  for (const { target, hash } of sharedPaths) {
    if (!consumers.has(target) && await treeHash(target) === hash) await fs.remove(target);
  }
}

async function linkSkills(projectDir: string, config: AiFactoryConfig): Promise<void> {
  delete config.skillSymlinks;
  if (!config.useSymlinks) return;
  const state = { links: {} as Record<string, string>, shared: {} as Record<string, string> };
  config.skillSymlinks = state;
  const configPath = path.join(projectDir, '.ai-factory.json');
  const groups = await resolveSkillTargets(projectDir, config.agents, { select: false });
  const available = new Set(await getAvailableSkills());
  // Native .agents consumers keep their own format; otherwise prefer Codex's format.
  const agents = [...config.agents].sort((a, b) => {
    const rank = (agent: typeof a): number => agent.skillsDir === SHARED_DIR ? 0
      : ['codex', 'codex-app'].includes(agent.id) ? 1 : 2;
    return rank(a) - rank(b) || a.id.localeCompare(b.id);
  });
  const seen = new Set<string>();
  for (const agent of agents) {
    for (const name of agent.installedSkills) {
      // Only a complete source-proven receipt authorizes moving a managed skill.
      let receipt = agent.managedSkills?.[name]?.rawInstalledHash;
      // shortcut: extension-owned skills keep copies until their sources have reusable ownership receipts.
      if (!available.has(name) || !/^[a-zA-Z0-9_-]+$/.test(name)) continue;
      const transformed = getTransformer(agent.id).transform(name, '');
      if (transformed.flat) continue;
      const relative = path.posix.join(agent.skillsDir.replaceAll('\\', '/'), transformed.targetDir);
      const destination = `${SHARED_DIR}/${transformed.targetDir}`;
      if (relative === destination || seen.has(relative)) continue;
      seen.add(relative);
      if ((await stat(path.join(projectDir, relative)))?.isSymbolicLink()) continue;
      const source = await physicalProjectPath(projectDir, relative);
      const target = await sharedPath(projectDir, destination);
      if (source === target) continue;
      if (source.startsWith(`${target}${path.sep}`) || target.startsWith(`${source}${path.sep}`)) {
        throw new Error(`Nested shared skill paths: ${relative} and ${destination}`);
      }
      const hash = await treeHash(source);
      if (!hash) continue;
      if (await hashDirectory(source) !== receipt) {
        // Extension composition can change raw bytes without refreshing base receipts.
        const context = groups.find(group => group.targets.some(target => target.id === agent.id))!.context;
        const fresh = (await buildManagedSkillsState(projectDir, agent, [name], context, config.extensions))[name];
        if (!fresh?.rawInstalledHash) continue;
        agent.managedSkills ??= {};
        agent.managedSkills[name] = fresh;
        receipt = fresh.rawInstalledHash;
        if (await hashDirectory(source) !== receipt) continue;
      }
      if (!await stat(target)) {
        await fs.copy(source, target);
        state.shared[destination] = hash;
      }
      if (await treeHash(target) !== hash) {
        delete state.shared[destination];
        continue;
      }
      state.links[relative] = destination;
      const link = path.join(projectDir, relative);
      const temporary = `${link}.aif-link-${randomUUID()}`;
      const backup = `${link}.aif-backup-${randomUUID()}`;
      try {
        try {
          await fs.symlink(path.relative(path.dirname(link), path.join(projectDir, destination)), temporary, 'dir');
        } catch (error) {
          if (!['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
          console.warn('Symlinks are unavailable; keeping independent skill copies.');
          return;
        }
        // Persist intent first so an interrupted operation can recover its links.
        await writeJsonFile(configPath, config);
        await fs.rename(link, backup);
        try { await fs.rename(temporary, link); }
        catch (error) {
          await fs.rename(backup, link);
          throw error;
        }
        if (await treeHash(backup) !== hash) {
          await fs.unlink(link);
          await fs.rename(backup, link);
          throw new Error(`Skill changed while linking: ${relative}`);
        }
        await fs.remove(backup);
      } finally {
        await fs.remove(temporary);
      }
    }
  }
}

// Runs once inside the outer project lock: all existing writers see ordinary copies.
export async function withSkillSymlinks<T>(projectDir: string, action: () => Promise<T>): Promise<T> {
  const configPath = path.join(projectDir, '.ai-factory.json');
  const before = await readJsonFile<AiFactoryConfig>(configPath);
  if (before?.skillSymlinks) await materialize(projectDir, before);
  const result = await action();
  const config = await readJsonFile<AiFactoryConfig>(configPath);
  if (config && (config.useSymlinks || config.skillSymlinks)) {
    await linkSkills(projectDir, config);
    await writeJsonFile(configPath, config);
  }
  return result;
}
