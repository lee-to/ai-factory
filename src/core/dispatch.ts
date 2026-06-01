import { execFileSync } from 'child_process';
import { DISPATCH_PHASES, type AiFactoryConfig, type DispatchPhase, type PhaseDispatch } from './config.js';
import { resolveAgentRunSpec, type AgentRunSpec } from './dispatch-registry.js';

export interface ResolvedDispatch {
  phase: DispatchPhase; mode: 'manual' | 'auto'; spec: AgentRunSpec; model: string;
}
export type ResolveResult =
  | { kind: 'resolved'; value: ResolvedDispatch }
  | { kind: 'no-config' }
  | { kind: 'no-phase-entry'; phase: DispatchPhase }
  | { kind: 'unknown-agent'; phase: DispatchPhase; agent: string }
  | { kind: 'unknown-phase'; phase: string };

export function isDispatchPhase(v: string): v is DispatchPhase {
  return (DISPATCH_PHASES as readonly string[]).includes(v);
}

export function resolvePhaseDispatch(config: AiFactoryConfig | null, phase: string): ResolveResult {
  if (!isDispatchPhase(phase)) return { kind: 'unknown-phase', phase };
  if (!config?.phases || !config.dispatch) return { kind: 'no-config' };
  const entry: PhaseDispatch | undefined = config.phases[phase];
  if (!entry) return { kind: 'no-phase-entry', phase };
  const spec = resolveAgentRunSpec(entry.agent, config.dispatchAgents);
  if (!spec) return { kind: 'unknown-agent', phase, agent: entry.agent };
  const model = entry.model ?? spec.defaultModel;
  return { kind: 'resolved', value: { phase, mode: config.dispatch, spec, model } };
}

export interface BuildContext { model: string; phase: DispatchPhase; prompt: string; }
export interface BuiltCommand { file: string; args: string[]; }

// Tokenize template on whitespace FIRST, then substitute per-token → {prompt} with spaces stays ONE argv arg.
// No shell anywhere → injection-safe.
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

export function formatManualInstructions(r: ResolvedDispatch, prompt: string): string {
  const b = buildAgentCommand(r.spec, { model: r.model, phase: r.phase, prompt });
  const shown = [b.file, ...b.args].join(' ');
  return [
    `── Cross-agent dispatch: ${r.phase} ──`,
    `Agent : ${r.spec.displayName} (${r.spec.id})`,
    `Model : ${r.model}`,
    `Mode  : manual`,
    ``,
    `Switch to this agent for the ${r.phase} phase, e.g.:`,
    `  ${shown}`,
    ``,
    resumeHint(r.phase),
  ].join('\n');
}

export interface RunResult { ok: boolean; code: number | null; error?: string; }

export function runAuto(r: ResolvedDispatch, prompt: string): RunResult {
  const { file, args } = buildAgentCommand(r.spec, { model: r.model, phase: r.phase, prompt });
  try {
    execFileSync(file, args, { stdio: 'inherit' });
    return { ok: true, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number };
    if (e.code === 'ENOENT') return { ok: false, code: null, error: `Command not found on PATH: ${file}` };
    return { ok: false, code: typeof e.status === 'number' ? e.status : 1, error: e.message };
  }
}
