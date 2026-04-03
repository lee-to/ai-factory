import path from 'path';
import fs from 'fs-extra';
import { readTextFile, writeTextFile } from '../utils/fs.js';
import type { AgentInstallation } from './config.js';
import type { ExtensionRecord } from './config.js';
import { getAgentConfig } from './agents.js';
import { loadAllExtensions, type ExtensionManifest } from './extensions.js';
import { getTransformer } from './transformer.js';

function startMarker(extensionName: string, skillName: string, position: string): string {
  return `<!-- aif-ext:${extensionName}:${skillName}:${position}:start -->`;
}

function endMarker(extensionName: string, skillName: string, position: string): string {
  return `<!-- aif-ext:${extensionName}:${skillName}:${position}:end -->`;
}

function markerRegex(extensionName: string, skillName: string, position: string): RegExp {
  const start = startMarker(extensionName, skillName, position).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = endMarker(extensionName, skillName, position).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n?${start}\\n[\\s\\S]*?\\n${end}\\n?`, 'g');
}

export function stripInjection(content: string, extensionName: string, skillName: string, position: string): string {
  return content.replace(markerRegex(extensionName, skillName, position), '');
}

export function applyInjection(
  skillContent: string,
  injectionContent: string,
  position: 'append' | 'prepend',
  extensionName: string,
  skillName: string,
): string {
  // First strip existing injection for idempotency
  let content = stripInjection(skillContent, extensionName, skillName, position);

  const block = [
    startMarker(extensionName, skillName, position),
    injectionContent.trimEnd(),
    endMarker(extensionName, skillName, position),
  ].join('\n');

  if (position === 'append') {
    content = content.trimEnd() + '\n\n' + block + '\n';
  } else {
    // prepend: after frontmatter if present
    const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    if (fmMatch) {
      const afterFm = fmMatch[0].length;
      content = content.slice(0, afterFm) + '\n' + block + '\n' + content.slice(afterFm);
    } else {
      content = block + '\n\n' + content;
    }
  }

  return content;
}

function getSkillFilePath(
  projectDir: string,
  agent: AgentInstallation,
  skillName: string,
): string {
  const transformer = getTransformer(agent.id);
  const result = transformer.transform(skillName, '');
  const agentConfig = getAgentConfig(agent.id);

  if (result.flat) {
    return path.join(projectDir, agentConfig.configDir, result.targetDir, result.targetName);
  }
  return path.join(projectDir, agent.skillsDir, result.targetDir, 'SKILL.md');
}

export async function applyExtensionInjections(
  projectDir: string,
  agent: AgentInstallation,
  registeredExtensions: ExtensionRecord[],
): Promise<number> {
  const names = registeredExtensions.map(e => e.name);
  const extensions = await loadAllExtensions(projectDir, names);
  let count = 0;

  for (const { dir, manifest } of extensions) {
    if (!manifest.injections?.length) continue;

    for (const injection of manifest.injections) {
      const skillFilePath = getSkillFilePath(projectDir, agent, injection.target);
      const skillContent = await readTextFile(skillFilePath);
      if (!skillContent) continue;

      const injectionFilePath = path.join(dir, injection.file);
      const injectionContent = await readTextFile(injectionFilePath);
      if (!injectionContent) continue;

      const updated = applyInjection(
        skillContent,
        injectionContent,
        injection.position,
        manifest.name,
        injection.target,
      );

      await writeTextFile(skillFilePath, updated);
      count++;
    }
  }

  return count;
}

export async function applySingleExtensionInjections(
  projectDir: string,
  agent: AgentInstallation,
  extensionDir: string,
  manifest: ExtensionManifest,
): Promise<number> {
  if (!manifest.injections?.length) return 0;
  let count = 0;

  for (const injection of manifest.injections) {
    const skillFilePath = getSkillFilePath(projectDir, agent, injection.target);
    const skillContent = await readTextFile(skillFilePath);
    if (!skillContent) continue;

    const injectionFilePath = path.join(extensionDir, injection.file);
    const injectionContent = await readTextFile(injectionFilePath);
    if (!injectionContent) continue;

    const updated = applyInjection(
      skillContent,
      injectionContent,
      injection.position,
      manifest.name,
      injection.target,
    );

    await writeTextFile(skillFilePath, updated);
    count++;
  }

  return count;
}

export async function stripAllExtensionInjections(
  projectDir: string,
  agent: AgentInstallation,
  extensionName: string,
  manifest: ExtensionManifest,
): Promise<void> {
  if (!manifest.injections?.length) return;

  for (const injection of manifest.injections) {
    const skillFilePath = getSkillFilePath(projectDir, agent, injection.target);
    const skillContent = await readTextFile(skillFilePath);
    if (!skillContent) continue;

    const updated = stripInjection(skillContent, extensionName, injection.target, injection.position);
    if (updated !== skillContent) {
      await writeTextFile(skillFilePath, updated);
    }
  }
}

function extensionMarkerRegex(extensionName: string): RegExp {
  const escaped = extensionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\n?<!-- aif-ext:${escaped}:[^:]+:[^:]+:start -->\\n[\\s\\S]*?\\n<!-- aif-ext:${escaped}:[^:]+:[^:]+:end -->\\n?`,
    'g',
  );
}

function stripAllMarkersForExtension(content: string, extensionName: string): string {
  return content.replace(extensionMarkerRegex(extensionName), '');
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Recurse into subdirectories (covers skills/*/SKILL.md, workflows/*.md, rules/*.md)
        const nested = await findMarkdownFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // dir doesn't exist
  }
  return results;
}

export async function stripInjectionsByExtensionName(
  projectDir: string,
  agent: AgentInstallation,
  extensionName: string,
): Promise<void> {
  // Search agent configDir recursively — covers skills/*/SKILL.md,
  // flat workflow files (e.g. .agent/workflows/*.md), and rules
  const agentConfig = getAgentConfig(agent.id);
  const configDir = path.join(projectDir, agentConfig.configDir);
  const files = await findMarkdownFiles(configDir);

  for (const filePath of files) {
    const content = await readTextFile(filePath);
    if (!content || !content.includes(`aif-ext:${extensionName}:`)) continue;

    const updated = stripAllMarkersForExtension(content, extensionName);
    if (updated !== content) {
      await writeTextFile(filePath, updated);
    }
  }
}
