import path from 'path';
import fs from 'fs/promises';
import { getAgentConfig, type AgentConfig } from './agents.js';

export interface TemplateVars {
  config_dir: string;
  skills_dir: string;
  home_skills_dir: string;
  shell_home_skills_dir: string;
  settings_file: string;
  agent_name: string;
  skills_cli_agent_flag: string;
}

function resolveHomeSkillsPath(agent: AgentConfig): string {
  const homeSkillsDir = ['.codex/skills', '.agents/skills'].includes(agent.skillsDir)
    ? agent.skillsDir
    : agent.homeSkillsDir ?? getAgentConfig(agent.id).skillsDir;

  if (path.isAbsolute(homeSkillsDir) || path.win32.isAbsolute(homeSkillsDir)) {
    return homeSkillsDir;
  }
  return homeSkillsDir.startsWith('~/') || homeSkillsDir.startsWith('~\\')
    ? homeSkillsDir
    : `~/${homeSkillsDir}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function resolveShellHomeSkillsPath(homeSkillsPath: string): string {
  const tildePath = homeSkillsPath.startsWith('~/') || homeSkillsPath.startsWith('~\\')
    ? `~/${homeSkillsPath.slice(2).replaceAll('\\', '/')}`
    : path.isAbsolute(homeSkillsPath) || path.win32.isAbsolute(homeSkillsPath)
      ? null
      : `~/${homeSkillsPath.replaceAll('\\', '/')}`;

  if (tildePath !== null) {
    const suffix = tildePath.slice(2);
    return /^[A-Za-z0-9_./-]+$/.test(suffix) ? tildePath : `~/${shellQuote(suffix)}`;
  }

  return /^[A-Za-z0-9_./-]+$/.test(homeSkillsPath) ? homeSkillsPath : shellQuote(homeSkillsPath);
}

export function buildTemplateVars(agent: AgentConfig): TemplateVars {
  const homeSkillsDir = resolveHomeSkillsPath(agent);
  return {
    config_dir: agent.configDir,
    skills_dir: agent.skillsDir,
    home_skills_dir: homeSkillsDir,
    shell_home_skills_dir: resolveShellHomeSkillsPath(homeSkillsDir),
    settings_file: agent.settingsFile ?? '',
    agent_name: agent.displayName,
    skills_cli_agent_flag: agent.skillsCliAgent ? `--agent ${agent.skillsCliAgent}` : '',
  };
}

export function processTemplate(content: string, vars: TemplateVars): string {
  return content.replaceAll('~/{{skills_dir}}', vars.home_skills_dir).replace(/\{\{(config_dir|skills_dir|home_skills_dir|shell_home_skills_dir|settings_file|agent_name|skills_cli_agent_flag)\}\}/g, (_, key: string) => {
    return vars[key as keyof TemplateVars];
  });
}

export async function processSkillTemplates(skillDir: string, agent: AgentConfig): Promise<void> {
  const vars = buildTemplateVars(agent);
  await processDirectoryTemplates(skillDir, vars);
}

async function processDirectoryTemplates(dir: string, vars: TemplateVars): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await processDirectoryTemplates(fullPath, vars);
    } else if (entry.name.endsWith('.md')) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const processed = processTemplate(content, vars);
      if (processed !== content) {
        await fs.writeFile(fullPath, processed, 'utf-8');
      }
    }
  }
}
