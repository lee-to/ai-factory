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

export interface SkillTargetRuntime {
  id: string;
  skillsDir: string;
}

export const WORKFLOW_SKILLS = new Set([
  'aif',
  'aif-commit',
  'aif-explore',
  'aif-fix',
  'aif-implement',
  'aif-improve',
  'aif-plan',
  'aif-rules-check',
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

const INVOCATION_PATTERN = /(^|[^A-Za-z0-9_.~\/}-])\/(aif(?:-[a-z0-9-]+)?)/g;

export function rewriteInvocationPrefix(
  content: string,
  mapInvocation: (invocation: string) => string,
): string {
  return content.replace(
    INVOCATION_PATTERN,
    (_match, prefix: string, invocation: string) => `${prefix}${mapInvocation(invocation)}`,
  );
}

interface TransformerRegistration {
  create: () => AgentTransformer;
  identity: string;
}

const DEFAULT_TRANSFORMER_IDENTITY = 'default';

const registry: Record<string, TransformerRegistration> = {
  codex: {
    create: () => new CodexTransformer(),
    identity: 'codex',
  },
  'codex-app': {
    create: () => new CodexTransformer('Codex app'),
    identity: 'codex',
  },
  kilocode: {
    create: () => new KiloCodeTransformer(),
    identity: 'kilocode',
  },
  qwen: {
    create: () => new QwenTransformer(),
    identity: 'qwen',
  },
  antigravity: {
    create: () => new AntigravityTransformer(),
    identity: 'antigravity',
  },
};

export function getTransformer(agentId: string): AgentTransformer {
  const registration = registry[agentId];
  return registration ? registration.create() : new DefaultTransformer();
}

export function getTransformerIdentity(agentId: string): string {
  return registry[agentId]?.identity ?? DEFAULT_TRANSFORMER_IDENTITY;
}

function normalizeSkillsDir(skillsDir: string): string {
  return skillsDir.replaceAll('\\', '/').replace(/\/+$/, '');
}

export function assertCompatibleSkillTargets(targets: SkillTargetRuntime[]): void {
  const targetsByDir = new Map<string, SkillTargetRuntime[]>();

  for (const target of targets) {
    const normalizedDir = normalizeSkillsDir(target.skillsDir);
    targetsByDir.set(normalizedDir, [...(targetsByDir.get(normalizedDir) ?? []), target]);
  }

  for (const [skillsDir, groupedTargets] of targetsByDir) {
    const identities = new Map<string, string[]>();
    for (const target of groupedTargets) {
      const identity = getTransformerIdentity(target.id);
      identities.set(identity, [...(identities.get(identity) ?? []), target.id]);
    }

    if (identities.size <= 1) {
      continue;
    }

    const runtimeIds = groupedTargets.map(target => target.id).join(', ');
    const transformerSummary = [...identities.entries()]
      .map(([identity, ids]) => `${identity}: ${ids.join(', ')}`)
      .join('; ');

    throw new Error(
      `Incompatible agent skill targets: ${runtimeIds} all write to "${skillsDir}" ` +
      `but use different skill transformers (${transformerSummary}). ` +
      'Select only one of these agents for this project or configure separate skills directories.',
    );
  }
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
