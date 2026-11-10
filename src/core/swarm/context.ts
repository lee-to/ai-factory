import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { digest, requireValue } from './types.js';

export interface ContextFile { path: string; sha256: string; content: string }
export async function loadSwarmContext(project: string): Promise<ContextFile[]> {
  const files: ContextFile[] = [];
  let bytes = 0;
  async function read(relative: string, optional: boolean, markdown = true): Promise<string | undefined> {
    requireValue(!path.isAbsolute(relative) && (!markdown || relative.endsWith('.md')), 'Context must reference project Markdown artifacts');
    const target = path.resolve(project, relative);
    requireValue(target.startsWith(project + path.sep), 'Context path leaves the project');
    try {
      const physical = await realpath(target);
      requireValue(physical.startsWith(project + path.sep), 'Context symlink leaves the project');
      const content = await readFile(physical, 'utf8');
      bytes += Buffer.byteLength(content); requireValue(bytes <= 256 * 1024, 'Swarm context exceeds 256 KiB');
      return content;
    } catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  const configText = await read('.ai-factory/config.yaml', true, false);
  const config = configText ? parseYaml(configText) : {};
  requireValue(config === null || typeof config === 'object' && !Array.isArray(config), 'Invalid project config');
  const paths = config?.paths ?? {}, rules = config?.rules ?? {};
  requireValue(config?.git?.enabled !== false, 'Swarm requires git.enabled');
  const candidates: [string, boolean][] = [ ['AGENTS.md', true],
    [paths.description ?? '.ai-factory/DESCRIPTION.md', paths.description === undefined],
    [paths.architecture ?? '.ai-factory/ARCHITECTURE.md', paths.architecture === undefined],
    [paths.rules_file ?? '.ai-factory/RULES.md', paths.rules_file === undefined],
    [path.posix.join(paths.rules ?? '.ai-factory/rules', 'base.md'), true],
    ['.ai-factory/skill-context/global-skill-context.md', true],
    ['.ai-factory/skill-context/aif-swarm/SKILL.md', true] ];
  for (const value of Object.values(rules)) {
    requireValue(typeof value === 'string', 'Invalid rule path'); candidates.push([value, false]);
  }
  const seen = new Set<string>();
  for (const [relative, optional] of candidates) {
    requireValue(typeof relative === 'string', 'Invalid context path');
    if (seen.has(relative)) continue; seen.add(relative);
    const content = await read(relative, optional);
    if (content !== undefined) files.push({ path: relative, sha256: digest(content), content });
  }
  // Retain only the context/language policy, never unrelated settings or credentials.
  if (config?.language) {
    const content = JSON.stringify(config.language);
    files.push({ path: '.ai-factory/config.yaml#language', sha256: digest(content), content });
  }
  return files;
}
