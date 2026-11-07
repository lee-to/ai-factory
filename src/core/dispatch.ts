import { execFileSync } from 'child_process';
import { DISPATCH_PHASES, type AiFactoryConfig, type DispatchMode, type DispatchPhase } from './config.js';
import { resolveAgentRunSpec, type AgentRunSpec } from './dispatch-registry.js';

export interface ResolvedDispatch {
  phase: DispatchPhase;
  mode: DispatchMode;
  spec: AgentRunSpec;
  model: string;
  timeoutMs: number;
}

export type ResolveResult =
  | { kind: 'resolved'; value: ResolvedDispatch }
  | { kind: 'no-config' }
  | { kind: 'no-phase-entry'; phase: DispatchPhase }
  | { kind: 'unknown-agent'; phase: DispatchPhase; agent: string }
  | { kind: 'unknown-phase'; phase: string };

/** Soft cap for auto dispatch; checked by the spawned CLI, never mid-flight by aif-loop. */
export const DEFAULT_DISPATCH_TIMEOUT_MS = 600_000;

export function isDispatchPhase(v: string): v is DispatchPhase {
  return (DISPATCH_PHASES as readonly string[]).includes(v);
}

export function resolvePhaseDispatch(config: AiFactoryConfig | null, phase: string): ResolveResult {
  if (!isDispatchPhase(phase)) return { kind: 'unknown-phase', phase };
  if (!config?.phases || !config.dispatch) return { kind: 'no-config' };
  const entry = config.phases[phase];
  if (!entry) return { kind: 'no-phase-entry', phase };
  const spec = resolveAgentRunSpec(entry.agent, config.dispatchAgents);
  if (!spec) return { kind: 'unknown-agent', phase, agent: entry.agent };
  const model = entry.model ?? spec.defaultModel;
  const timeoutMs = entry.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  return { kind: 'resolved', value: { phase, mode: config.dispatch, spec, model, timeoutMs } };
}

export interface BuildContext { model: string; phase: DispatchPhase; prompt: string; }
export interface BuiltCommand { file: string; args: string[]; }

// Tokenize template on whitespace FIRST, then substitute per-token → {prompt} with spaces stays ONE argv arg.
// No shell anywhere → injection-safe. Templates are argv templates, not shell scripts: quotes and
// metacharacters have no special meaning and paths with spaces cannot be expressed as one token.
export function buildAgentCommand(spec: AgentRunSpec, ctx: BuildContext): BuiltCommand {
  const subst = (t: string) => t
    .replaceAll('{model}', ctx.model)
    .replaceAll('{phase}', ctx.phase)
    .replaceAll('{prompt}', ctx.prompt);
  const tokens = spec.command.trim().split(/\s+/);
  const [file, ...rest] = tokens.map(subst);
  return { file, args: rest };
}

// Phase-aware follow-up hint. The spec-driven phases hand off to their own skills;
// the aif-loop phases resume the loop.
function resumeHint(phase: DispatchPhase): string {
  switch (phase) {
    case 'implement':
      return 'Then run /aif-implement in that agent.';
    case 'review':
      return 'Then run /aif-review in that agent.';
    default:
      return 'Resume the loop afterwards with: /aif-loop resume';
  }
}

// Structured argv block, one element per line: preserves argv boundaries exactly, stays copy-safe for
// prompts with spaces, quotes, `$()`, backticks, or semicolons, and never renders a shell-looking string.
export function formatCommandBlock(b: BuiltCommand): string {
  return ['Command: ' + b.file, 'Args:', ...b.args.map(arg => '  ' + arg)].join('\n');
}

export function formatManualInstructions(r: ResolvedDispatch, prompt: string): string {
  const b = buildAgentCommand(r.spec, { model: r.model, phase: r.phase, prompt });
  return [
    `── Cross-agent dispatch: ${r.phase} ──`,
    `Agent : ${r.spec.displayName} (${r.spec.id})`,
    `Model : ${r.model}`,
    `Mode  : manual`,
    ``,
    `Switch to this agent for the ${r.phase} phase, then invoke (each argument is one argv element, not shell text):`,
    formatCommandBlock(b),
    ``,
    resumeHint(r.phase),
  ].join('\n');
}

export interface RunResult { ok: boolean; code: number | null; error?: string; }

export function runAuto(r: ResolvedDispatch, prompt: string): RunResult {
  const { file, args } = buildAgentCommand(r.spec, { model: r.model, phase: r.phase, prompt });
  try {
    execFileSync(file, args, { stdio: 'inherit', timeout: r.timeoutMs });
    return { ok: true, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number; killed?: boolean; signal?: NodeJS.Signals };
    if (e.code === 'ENOENT') return { ok: false, code: null, error: `Command not found on PATH: ${file}` };
    if (e.killed || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
      return { ok: false, code: null, error: `Dispatch timed out after ${r.timeoutMs} ms: ${file}` };
    }
    return { ok: false, code: typeof e.status === 'number' ? e.status : 1, error: e.message };
  }
}
