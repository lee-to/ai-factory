import path from 'path';
import fs from 'fs/promises';
import type { AgentConfig } from './agents.js';

export interface TemplateVars {
  config_dir: string;
  skills_dir: string;
  home_skills_dir: string;
  settings_file: string;
  agent_name: string;
  workflows_dir: string;
  rules_dir: string;
}

export function buildTemplateVars(agent: AgentConfig): TemplateVars {
  const isAntigravity = agent.id === 'antigravity';
  return {
    config_dir: agent.configDir,
    skills_dir: agent.skillsDir,
    home_skills_dir: `~/${agent.skillsDir}`,
    settings_file: agent.settingsFile ?? '',
    agent_name: agent.displayName,
    workflows_dir: isAntigravity ? '.agent/workflows' : agent.skillsDir,
    rules_dir: isAntigravity ? '.agent/rules' : agent.configDir,
  };
}

export function processTemplate(content: string, vars: TemplateVars): string {
  return content.replace(/\{\{(config_dir|skills_dir|home_skills_dir|settings_file|agent_name|workflows_dir|rules_dir)\}\}/g, (_, key: string) => {
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
