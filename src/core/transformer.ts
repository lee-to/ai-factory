import { DefaultTransformer } from './transformers/default.js';
import { KiloCodeTransformer } from './transformers/kilocode.js';
import { AntigravityTransformer } from './transformers/antigravity.js';
import { CodexTransformer } from './transformers/codex.js';
import { QwenTransformer } from './transformers/qwen.js';

export interface TransformResult {
  targetDir: string;
  targetName: string;
  content: string;
  flat: boolean;
}

export interface AgentTransformer {
  transform(skillName: string, content: string): TransformResult;
  postInstall?(projectDir: string): Promise<void>;
  getWelcomeMessage(): string[];
  getInvocationHint?(): string;
  cleanup?(projectDir: string, skillsDir: string): Promise<void>;
}

export interface AgentOnboarding {
  welcomeMessage: string[];
  invocationHint: string | null;
}

export const WORKFLOW_SKILLS = new Set([
  'aif',
  'aif-commit',
  'aif-explore',
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

export function removeFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

const INVOCATION_PATTERN = /(^|[^A-Za-z0-9_-])\/(aif(?:-[a-z0-9-]+)?)/g;

export function rewriteInvocationPrefix(
  content: string,
  mapInvocation: (invocation: string) => string,
): string {
  return content.replace(
    INVOCATION_PATTERN,
    (_match, prefix: string, invocation: string) => `${prefix}${mapInvocation(invocation)}`,
  );
}

const registry: Record<string, () => AgentTransformer> = {
  codex: () => new CodexTransformer(),
  kilocode: () => new KiloCodeTransformer(),
  qwen: () => new QwenTransformer(),
  antigravity: () => new AntigravityTransformer(),
};

export function getTransformer(agentId: string): AgentTransformer {
  const factory = registry[agentId];
  return factory ? factory() : new DefaultTransformer();
}

export function getAgentOnboarding(agentId: string): AgentOnboarding {
  const transformer = getTransformer(agentId);
  return {
    welcomeMessage: transformer.getWelcomeMessage(),
    invocationHint: transformer.getInvocationHint?.() ?? null,
  };
}

export async function cleanupAgentSetup(agentId: string, projectDir: string, skillsDir: string): Promise<void> {
  const transformer = getTransformer(agentId);
  await transformer.cleanup?.(projectDir, skillsDir);
}
