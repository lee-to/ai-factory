import { DefaultTransformer } from './transformers/default.js';
import { KiloCodeTransformer } from './transformers/kilocode.js';
import { AntigravityTransformer } from './transformers/antigravity.js';

export interface TransformResult {
  targetDir: string;
  targetName: string;
  content: string;
  flat: boolean;
}

export interface AgentTransformer {
  transform(skillName: string, content: string): TransformResult;
  postInstall?(projectDir: string): Promise<void>;
  getWelcomeMessage?(): string[];
}

export const WORKFLOW_SKILLS = new Set([
  'aif',
  'aif-commit',
  'aif-deploy',
  'aif-fix',
  'aif-implement',
  'aif-improve',
  'aif-plan',
  'aif-verify',
]);

export function sanitizeName(name: string): string {
  return name.replace(/\./g, '-');
}

export function extractFrontmatterName(content: string): string | null {
  const match = content.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

export function replaceFrontmatterName(content: string, newName: string): string {
  return content.replace(/^name:\s*.+$/m, `name: ${newName}`);
}

export function simplifyFrontmatter(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  const frontmatter = fmMatch[1];
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!descMatch) return content;

  const newFrontmatter = `---\ndescription: ${descMatch[1].trim()}\n---`;
  return content.replace(/^---\n[\s\S]*?\n---/, newFrontmatter);
}

const registry: Record<string, () => AgentTransformer> = {
  kilocode: () => new KiloCodeTransformer(),
  antigravity: () => new AntigravityTransformer(),
};

export function getTransformer(agentId: string): AgentTransformer {
  const factory = registry[agentId];
  return factory ? factory() : new DefaultTransformer();
}
