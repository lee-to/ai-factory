import { getAgentConfig, type AgentConfig } from './agents.js';
import path from 'node:path';

export interface TemplateVars {
  config_dir: string;
  skills_dir: string;
  home_skills_dir: string;
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

export function buildTemplateVars(agent: AgentConfig): TemplateVars {
  return {
    config_dir: agent.configDir,
    skills_dir: agent.skillsDir,
    home_skills_dir: resolveHomeSkillsPath(agent),
    settings_file: agent.settingsFile ?? '',
    agent_name: agent.displayName,
    skills_cli_agent_flag: agent.skillsCliAgent ? `--agent ${agent.skillsCliAgent}` : '',
  };
}

export function processTemplate(content: string, vars: TemplateVars): string {
  return content.replaceAll('~/{{skills_dir}}', vars.home_skills_dir).replace(/\{\{(config_dir|skills_dir|home_skills_dir|settings_file|agent_name|skills_cli_agent_flag)\}\}/g, (_, key: string) => {
    return vars[key as keyof TemplateVars];
  });
}
