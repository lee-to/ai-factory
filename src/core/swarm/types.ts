import { createHash, randomUUID } from 'node:crypto';
import type { ContextFile } from './context.js';

export type RunStatus = 'running' | 'paused' | 'needs_attention' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'pending' | 'running' | 'submitted' | 'verifying' | 'integrated' | 'done' | 'blocked' | 'failed' | 'cancelled';
export type Role = 'lead' | 'worker' | 'integration' | 'verifier';
export interface Provider { provider: 'claude' | 'codex'; model?: string }
export interface SwarmSpec {
  goal: string;
  acceptanceCriteria: string[];
  checks: string[][];
  lead: Provider;
  workers: Provider[];
  approval: 'manual' | 'integration' | 'restricted-actions';
  limits: { maxAgents: number; maxTasks: number; maxDepth: number; maxAttempts: number;
    leaseMs: number; timeoutMs: number; runTimeoutMs: number; budgetTokens: number; tokensPerAttempt: number };
  allowedTools: string[];
}
export interface TaskInput { title: string; description: string; acceptanceCriteria: string[]; dependsOn?: string[]; parentId?: string; priority?: number }
export interface Task extends TaskInput {
  id: string; dependsOn: string[]; depth: number; priority: number; status: TaskStatus;
  attempts: number; assignedAgentId?: string; leaseUntil?: number; claimToken?: string;
  gitRef?: string; baseRef?: string; integratedRef?: string; report?: string;
}
export interface Agent extends Provider {
  id: string; role: Role; status: 'running' | 'idle' | 'stopped'; heartbeatAt: number;
  currentTaskId?: string; tokens: number; reservation: number; usageSource?: 'observed' | 'reservation';
}
export interface Approval { id: string; taskId?: string; gitRef: string; kind: 'integration' | 'completion'; status: 'pending' | 'approved' | 'rejected' }
export interface SwarmEvent {
  event_id: string; sequence: number; run_id: string; type: string; timestamp: string;
  actor: string; payload: Record<string, unknown>; schema_version: 1;
}
export interface Run {
  schema_version: 1; id: string; project: string; goal: string; status: RunStatus; spec: SwarmSpec;
  baseRef: string; integrationRef: string; startedAt: number; finishedAt?: number;
  tasks: Task[]; agents: Agent[]; approvals: Approval[];
  artifacts: { id: string; taskId?: string; type: string; git_ref: string; metadata: Record<string, unknown> }[];
  messages: { id: string; sender: string; recipient?: string; topic: string; body: string }[];
  tokens: number; reservedTokens: number; sequence: number; planned: boolean;
  context: ContextFile[];
  operations: Record<string, { hash: string; result: unknown }>;
}

export class SwarmError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new SwarmError(message);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  return value as Record<string, unknown>;
}
export function textValue(value: unknown, name: string, max = 16000): string {
  requireValue(typeof value === 'string' && value.trim() && value.length <= max, `Invalid ${name}`);
  return value;
}
export function strings(value: unknown, name: string): string[] {
  requireValue(Array.isArray(value) && value.length > 0 && value.length <= 100, `Invalid ${name}`);
  return value.map(item => textValue(item, name));
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  requireValue(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max, `Invalid ${name}`);
  return value as number;
}
function provider(value: unknown): Provider {
  const p = object(value);
  requireValue(Object.keys(p).every(key => ['provider', 'model'].includes(key)), 'Unknown provider setting');
  requireValue(p.provider === 'claude' || p.provider === 'codex', 'Provider must be claude or codex');
  return { provider: p.provider, ...(p.model === undefined ? {} : { model: textValue(p.model, 'model', 200) }) };
}
export function parseSpec(value: unknown): SwarmSpec {
  const s = object(value), l = s.limits === undefined ? {} : object(s.limits);
  const defaults = { maxAgents: 5, maxTasks: 100, maxDepth: 4, maxAttempts: 3, leaseMs: 30000,
    timeoutMs: 600000, runTimeoutMs: 3600000, budgetTokens: 1000000, tokensPerAttempt: 100000 };
  requireValue(Object.keys(s).every(key => ['goal', 'acceptanceCriteria', 'checks', 'lead', 'workers', 'approval', 'limits', 'allowedTools'].includes(key)), 'Unknown Swarm setting');
  requireValue(Object.keys(l).every(key => Object.hasOwn(defaults, key)), 'Unknown Swarm limit');
  const limits = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    limits[key] = integer(l[key] ?? defaults[key], key, key === 'leaseMs' ? 3000 : 1,
      key === 'maxAgents' ? 5 : key === 'maxTasks' ? 500 : key === 'maxDepth' ? 16 : key === 'maxAttempts' ? 10 :
        key === 'timeoutMs' || key === 'leaseMs' ? 86400000 : key === 'runTimeoutMs' ? 604800000 : Number.MAX_SAFE_INTEGER);
  }
  requireValue(limits.tokensPerAttempt <= limits.budgetTokens, 'Attempt reservation exceeds token budget');
  requireValue(Array.isArray(s.checks) && s.checks.length > 0 && s.checks.length <= 20, 'Explicit verification checks are required');
  requireValue(Array.isArray(s.workers) && s.workers.length > 0 && s.workers.length <= 5, 'One to five worker providers are required');
  const approval = s.approval ?? 'integration';
  requireValue(['manual', 'integration', 'restricted-actions'].includes(String(approval)), 'Invalid approval policy');
  return { goal: textValue(s.goal, 'goal'), acceptanceCriteria: strings(s.acceptanceCriteria, 'acceptanceCriteria'),
    checks: s.checks.map(check => strings(check, 'check argv')), lead: provider(s.lead ?? { provider: 'codex' }),
    workers: s.workers.map(provider), approval: approval as SwarmSpec['approval'], limits,
    allowedTools: s.allowedTools === undefined || Array.isArray(s.allowedTools) && s.allowedTools.length === 0 ? [] : strings(s.allowedTools, 'allowedTools') };
}
export function parseTask(value: unknown): TaskInput {
  const t = object(value);
  return { title: textValue(t.title, 'title', 300), description: textValue(t.description, 'description'),
    acceptanceCriteria: strings(t.acceptanceCriteria, 'acceptanceCriteria'),
    dependsOn: t.dependsOn === undefined ? [] : Array.isArray(t.dependsOn) && t.dependsOn.length === 0 ? [] : strings(t.dependsOn, 'dependsOn'),
    ...(t.parentId === undefined ? {} : { parentId: textValue(t.parentId, 'parentId', 100) }),
    priority: integer(t.priority ?? 0, 'priority', -100, 100) };
}
export const terminal = (status: RunStatus) => ['completed', 'failed', 'cancelled'].includes(status);
export const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const uid = () => randomUUID();

// Raw provider output is never persisted; only bounded, redacted structured reports are retained.
export function redact(value: string): string {
  let result = value.replace(/(?:postgres(?:ql)?|https?|redis):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/\b(?:password|secret|token|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, '[redacted]');
  for (const [key, secret] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL/.test(key) && secret && secret.length >= 8) result = result.split(secret).join('[redacted]');
  }
  return result.slice(0, 16000);
}
