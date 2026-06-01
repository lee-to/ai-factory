# Implementation Spec — Cross-Agent Dispatch for `aif-loop`

> Hand-off task for an implementing agent. This document is self-contained: it lists every file to
> touch, the exact types/signatures, behavior contracts, tests, and how to verify. Follow it precisely.
> The reviewing human will verify the result against this spec afterwards.

---

## 0. Goal & background

AI Factory (`ai-factory` CLI, TypeScript ESM, commander-based) runs the `aif-loop` workflow with phases
**PLAN → PRODUCE‖PREPARE → EVALUATE → CRITIQUE → REFINE**, all in-process inside a single AI tool via the
`Task` tool. There is currently **no external CLI invocation** anywhere in the loop.

We want users to assign a **different external AI CLI tool (and model) to each loop phase** — e.g. produce
with Antigravity, plan/review with Claude Code. Two modes:
- `dispatch: "manual"` (default): print switch instructions, the loop pauses for the user.
- `dispatch: "auto"`: spawn the target agent's CLI as a subprocess.

Everything must be **fully backwards-compatible**: with no dispatch config, the loop behaves exactly as today.

### Config shape (lives in `.ai-factory.json`, top-level)
```json
{
  "version": "2.13.2",
  "agents": [ /* existing install state — unchanged */ ],

  "dispatch": "manual",
  "phases": {
    "plan":     { "agent": "claude-code", "model": "opus" },
    "produce":  { "agent": "antigravity", "model": "gemini-3.5-flash" },
    "prepare":  { "agent": "antigravity" },
    "evaluate": { "agent": "claude-code", "model": "sonnet" },
    "critique": { "agent": "claude-code", "model": "sonnet" },
    "refine":   { "agent": "antigravity" }
  },
  "dispatchAgents": {
    "antigravity": { "command": "antigravity run --model {model} --prompt {prompt}", "defaultModel": "gemini-3.5-flash" }
  }
}
```

### Locked decisions
1. **Phase keys = the 6 literal loop phases**: `plan, produce, prepare, evaluate, critique, refine`.
2. **Integration = a new CLI command `ai-factory dispatch <phase>`** that the `aif-loop` skill calls via Bash
   at phase boundaries. All `.ai-factory.json` resolution stays in TS; the skill never parses JSON.
3. **Implement both `manual` and `auto`.**
4. **Run-registry holds a command template** with placeholders `{model}` `{phase}` `{prompt}` + a `defaultModel`.
   Ship defaults for `claude-code`, `gemini-cli`, `antigravity`. Users override per-agent via `dispatchAgents`
   in config (no code change needed). The antigravity binary/flags are a best-effort placeholder — overridable.
5. **No `dispatch`/`phases` in the file → transparent no-op**, loop unchanged.

---

## 1. `src/core/config.ts` — schema + preservation

### 1.1 Add types near `AiFactoryConfig` (currently ~line 51)
```ts
export type DispatchMode = 'manual' | 'auto';

export const DISPATCH_PHASES = [
  'plan', 'produce', 'prepare', 'evaluate', 'critique', 'refine',
] as const;
export type DispatchPhase = typeof DISPATCH_PHASES[number];

export interface PhaseDispatch {
  agent: string;   // dispatch-agent id: claude-code | gemini-cli | antigravity | <custom>
  model?: string;  // optional; falls back to the agent's defaultModel
}

export type PhasesConfig = Partial<Record<DispatchPhase, PhaseDispatch>>;

export interface AgentRunOverride {
  command?: string;       // template, e.g. "claude --model {model} -p {prompt}"
  defaultModel?: string;
}
```

### 1.2 Extend `AiFactoryConfig`
```ts
export interface AiFactoryConfig {
  version: string;
  agents: AgentInstallation[];
  extensions?: ExtensionRecord[];
  dispatch?: DispatchMode;                            // NEW, top-level
  phases?: PhasesConfig;                              // NEW, top-level
  dispatchAgents?: Record<string, AgentRunOverride>;  // NEW, top-level (per-agent overrides)
}
```

### 1.3 Non-throwing normalizers (add as module functions)
```ts
function normalizeDispatchMode(raw: unknown): DispatchMode {
  return raw === 'auto' ? 'auto' : 'manual';          // unknown/invalid → 'manual'
}

function normalizePhases(raw: unknown): PhasesConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: PhasesConfig = {};
  for (const phase of DISPATCH_PHASES) {               // ignores unknown phase keys
    const entry = (raw as Record<string, unknown>)[phase];
    if (!entry || typeof entry !== 'object') continue;
    const agent = (entry as { agent?: unknown }).agent;
    const model = (entry as { model?: unknown }).model;
    if (typeof agent !== 'string' || !agent) continue; // agent required
    out[phase] = { agent, ...(typeof model === 'string' && model ? { model } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeDispatchAgents(raw: unknown): Record<string, AgentRunOverride> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, AgentRunOverride> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const command = (v as { command?: unknown }).command;
    const defaultModel = (v as { defaultModel?: unknown }).defaultModel;
    const e: AgentRunOverride = {};
    if (typeof command === 'string' && command) e.command = command;
    if (typeof defaultModel === 'string' && defaultModel) e.defaultModel = defaultModel;
    if (Object.keys(e).length) out[id] = e;
  }
  return Object.keys(out).length ? out : undefined;
}
```

### 1.4 Preserve across `loadConfig` — CRITICAL
`loadConfig` (lines ~230–308) rebuilds the config object **field-by-field at three return sites**, so unknown
top-level keys are silently dropped. You MUST re-attach the new keys at all three returns. `raw` is typed
`AiFactoryConfig & LegacyAiFactoryConfig`, so after 1.2 `raw.dispatch`/`raw.phases` are visible.

Compute once right after the `if (!raw) return null;` guard (~line 235):
```ts
const dispatchPhases = normalizePhases(raw.phases);
const dispatchMode =
  (raw.dispatch !== undefined || dispatchPhases) ? normalizeDispatchMode(raw.dispatch) : undefined;
const dispatchAgents = normalizeDispatchAgents((raw as Record<string, unknown>).dispatchAgents);
const dispatchFields = {
  ...(dispatchMode !== undefined ? { dispatch: dispatchMode } : {}),
  ...(dispatchPhases ? { phases: dispatchPhases } : {}),
  ...(dispatchAgents ? { dispatchAgents } : {}),
};
```
Then spread `...dispatchFields` into each returned object:
- the `Array.isArray(raw.agents)` branch (return ~line 288),
- the legacy `raw.agent` branch (return ~line 296),
- the final empty branch (return ~line 303).

**Backwards-compat invariant:** if the file had no `dispatch`/`phases`/`dispatchAgents`, all three stay
`undefined` and the returned object is byte-identical to today.

### 1.5 `saveConfig` — no change
It serializes the whole object via `writeJsonFile`; the keys round-trip once they exist on the interface.

---

## 2. `src/core/dispatch-registry.ts` (NEW)

A **separate** registry from `src/core/agents.ts`. `agents.ts` describes *install targets* keyed by `id`
(`claude`, `gemini`, `antigravity`). Dispatch ids are the `skillsCliAgent` names (`claude-code`, `gemini-cli`,
`antigravity`) — exactly what the example JSON uses. Keep install-vs-run concerns separate.

```ts
import { findAgentConfig } from './agents.js';
import type { AgentRunOverride } from './config.js';

export interface AgentRunSpec {
  id: string;          // 'claude-code'
  displayName: string;
  command: string;     // template with {model} {phase} {prompt}
  defaultModel: string;
}

export const BUILTIN_DISPATCH_AGENTS: Record<string, AgentRunSpec> = {
  'claude-code': { id: 'claude-code', displayName: 'Claude Code',
    command: 'claude --model {model} -p {prompt}', defaultModel: 'sonnet' },
  'gemini-cli':  { id: 'gemini-cli',  displayName: 'Gemini CLI',
    command: 'gemini -m {model} -p {prompt}',      defaultModel: 'gemini-2.5-pro' },
  antigravity:   { id: 'antigravity', displayName: 'Antigravity',
    command: 'antigravity run --model {model} --prompt {prompt}', defaultModel: 'gemini-3.5-flash' },
};

export function listDispatchAgentIds(): string[] {
  return Object.keys(BUILTIN_DISPATCH_AGENTS);
}

// Resolution order:
//  1) exact builtin by dispatch id (skillsCliAgent name)
//  2) else findAgentConfig(id); if its skillsCliAgent maps to a builtin, use that (lets users pass 'claude'/'gemini')
//  3) else undefined (unknown agent)
// Then merge overrides[id] (command/defaultModel) on top of the resolved spec.
export function resolveAgentRunSpec(
  agentId: string,
  overrides?: Record<string, AgentRunOverride>,
): AgentRunSpec | undefined {
  let base: AgentRunSpec | undefined = BUILTIN_DISPATCH_AGENTS[agentId];
  if (!base) {
    const installCfg = findAgentConfig(agentId);
    const cliName = installCfg?.skillsCliAgent ?? undefined;
    if (cliName && BUILTIN_DISPATCH_AGENTS[cliName]) base = BUILTIN_DISPATCH_AGENTS[cliName];
  }
  const ov = overrides?.[agentId] ?? (base ? overrides?.[base.id] : undefined);
  if (!base && ov?.command) {
    // user defines a brand-new agent purely via dispatchAgents
    base = { id: agentId, displayName: agentId, command: ov.command,
             defaultModel: ov.defaultModel ?? '' };
  }
  if (!base) return undefined;
  return {
    ...base,
    ...(ov?.command ? { command: ov.command } : {}),
    ...(ov?.defaultModel ? { defaultModel: ov.defaultModel } : {}),
  };
}
```

**Adding a custom agent:** add `dispatchAgents.<id>.{command,defaultModel}` to `.ai-factory.json` and reference
`"agent":"<id>"` in a phase. No code change.

---

## 3. `src/core/dispatch.ts` (NEW — pure + testable)

```ts
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
    `Resume the loop afterwards with: /aif-loop resume`,
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
```

---

## 4. `src/cli/commands/dispatch.ts` (NEW) + register in `src/cli/index.ts`

### 4.1 Command (mirror the shape of `src/cli/commands/audit-artifacts.ts`)
```ts
import { loadConfig } from '../../core/config.js';
import { resolvePhaseDispatch, formatManualInstructions, runAuto } from '../../core/dispatch.js';
import { listDispatchAgentIds } from '../../core/dispatch-registry.js';
import { DISPATCH_PHASES } from '../../core/config.js';

export async function dispatchCommand(
  phase: string,
  options: { prompt?: string; print?: boolean } = {},
): Promise<void> {
  const config = await loadConfig(process.cwd());
  const r = resolvePhaseDispatch(config, phase);

  switch (r.kind) {
    case 'unknown-phase':
      console.error(`Unknown phase '${r.phase}'. Valid phases: ${DISPATCH_PHASES.join(', ')}`);
      process.exitCode = 2; return;
    case 'no-config':
      console.error('No cross-agent dispatch configured; loop continues in-process.');
      return; // exit 0
    case 'no-phase-entry':
      console.error(`No dispatch agent set for phase '${r.phase}'; loop continues in-process.`);
      return; // exit 0
    case 'unknown-agent':
      console.error(
        `Unknown dispatch agent '${r.agent}' for phase '${r.phase}'. ` +
        `Known agents: ${listDispatchAgentIds().join(', ')}. ` +
        `Add it under "dispatchAgents" in .ai-factory.json.`);
      process.exitCode = 2; return;
    case 'resolved': {
      const prompt = options.prompt ?? `Run the ${r.value.phase} phase of the aif-loop.`;
      if (options.print || r.value.mode === 'manual') {
        console.log(formatManualInstructions(r.value, prompt));
        return; // exit 0
      }
      const res = runAuto(r.value, prompt);
      if (!res.ok) { console.error(res.error ?? 'dispatch failed'); process.exitCode = 1; }
      return;
    }
  }
}
```
> Note on stderr vs stdout: `no-config`/`no-phase-entry` notes go to **stderr** so the manual instruction
> block on **stdout** is the only thing the skill parses as "show this to the user". Manual block → stdout.

### 4.2 Register in `src/cli/index.ts` (after the `audit-artifacts` block, ~line 43)
```ts
import { dispatchCommand } from './commands/dispatch.js';
// ...
program
  .command('dispatch <phase>')
  .description('Resolve the agent/model for a loop phase and switch or spawn it')
  .option('--prompt <text>', 'Instruction passed to the target agent (fills {prompt})')
  .option('--print', 'Force manual mode: print instructions, never spawn')
  .action(dispatchCommand);
```

### 4.3 Exit codes
- `0` — manual printed / auto spawned ok / backwards-compat no-op.
- `1` — auto spawn failed (missing binary or non-zero child).
- `2` — usage error (unknown phase, unknown agent).

---

## 5. `skills/aif-loop/SKILL.md` — Step 4.0 hook (minimal, backwards-compatible)

Add a new sub-step at the top of **Step 4: Iteration Execution** (before the current step 1, ~line 289):

```markdown
### Step 4.0: Phase dispatch (optional, backwards-compatible)

Before running each phase's in-process work, attempt cross-agent dispatch:

    ai-factory dispatch <phase> [--prompt "<short plan/task summary>"]

where `<phase>` ∈ `plan | produce | prepare | evaluate | critique | refine`.

Interpret the result:
- **No "Cross-agent dispatch" block on stdout (exit 0)** → no dispatch configured for this phase;
  run the phase in-process exactly as today.
- **Manual block printed (exit 0, `Mode : manual`)** → STOP. Show the block to the user, persist
  `run.json.current_step` for this phase, and do NOT run it in-process. `/aif-loop resume` re-enters
  this phase.
- **Auto mode (exit 0, no manual block)** → the external agent already produced this phase's output;
  read the artifact/checks it wrote and continue.
- **Non-zero exit** → append a `phase_error` event to `history.jsonl` and fall back to running the
  phase in-process. Dispatch must NEVER block the loop.

`current_step = PRODUCE_PREPARE` spans two phase keys: call `ai-factory dispatch produce` and
`ai-factory dispatch prepare` separately (sequentially in auto mode), then aggregate in-process.
The skill still reads only `.ai-factory/config.yaml`; all `.ai-factory.json` resolution lives in the
`ai-factory dispatch` command.
```

Also add a one-line pointer in the Step 3.1 phase list noting phases may be dispatched to external agents.

---

## 6. Tests — `scripts/test-dispatch.sh` (NEW)

Model after `scripts/test-cleanup-helper.sh` (fake-binary-on-PATH + argv log) and run via
`node scripts/run-bash-test.mjs scripts/test-dispatch.sh`. The runner sets `cwd = repoRoot`, so run the CLI
inside the tmp project with a subshell: `( cd "$TMP" && node "$ROOT/dist/cli/index.js" dispatch <phase> ... )`.
Build first (`dist/` must exist).

Cases (each `pass`/`fail` like the existing scripts):
1. **Manual round-trip** — `dispatch:"manual"`, `plan:{agent:"claude-code",model:"opus"}`; `dispatch plan` →
   stdout contains `claude-code`, `opus`, `manual`, and the suggested command line; exit 0.
2. **defaultModel fallback** — phase entry without `model` (antigravity) → output shows `gemini-3.5-flash`.
3. **Unknown phase** — `dispatch frobnicate` → exit 2, stderr lists the 6 phases.
4. **Backwards-compat no-op** — `.ai-factory.json` with no dispatch/phases → exit 0, no "Cross-agent dispatch"
   block on stdout.
5. **No phase entry** — dispatch present but `produce` unset → `dispatch produce` exit 0, no block.
6. **Unknown agent** — phase references `"agent":"nope"` → exit 2, stderr lists known ids.
7. **Auto invokes fake CLI + argv assertion** — `dispatch:"auto"` +
   `dispatchAgents:{"claude-code":{"command":"fakeagent --model {model} -p {prompt}","defaultModel":"sonnet"}}`;
   `dispatch plan --prompt "do the plan"` → argv log shows `--model`, the model, `-p`, and `do the plan` as
   **one** argv element (assert with `grep -Fx "do the plan"` on the per-line argv log).
8. **Auto missing binary** — template points at a nonexistent binary → exit 1 + "Command not found on PATH".
9. **`--print` under auto** — `dispatch:"auto"` + `--print` → manual block on stdout, fake binary NOT invoked
   (empty argv log).

### Wiring
- `package.json` scripts: add `"test:dispatch": "node scripts/run-bash-test.mjs scripts/test-dispatch.sh"`.
- `.github/workflows/ci.yml`: add a step after the cleanup-helper step:
  ```yaml
  - name: Dispatch tests
    run: npm run test:dispatch
  ```
- (Optional, lower priority) skill YAML test `skills/aif-loop/tests/dispatch.spec.yaml` verifying the skill
  surfaces manual instructions and pauses instead of running the phase in-process.

---

## 7. Docs

- `docs/config-reference.md` — NEW subsection **"Cross-agent dispatch (`.ai-factory.json`)"** documenting
  `dispatch`, `phases.<phase>.{agent,model}`, `dispatchAgents.<id>.{command,defaultModel}`, the 6 phase keys,
  builtin defaults, placeholders (`{model}`/`{phase}`/`{prompt}`), and manual/auto behavior. (This file is
  otherwise about `config.yaml` — scope the heading explicitly to `.ai-factory.json`.)
- `docs/configuration.md` — short pointer + the example JSON block.
- `docs/workflow.md` — one line under the loop description noting phases can dispatch to different agents.
- `AGENTS.md` — add `ai-factory dispatch <phase>` if it enumerates CLI commands.

---

## 8. Risks / edge cases to honor
- **PRODUCE_PREPARE split agents** — one `current_step` covers two phase keys; dispatch independently, spawn
  sequentially in auto, aggregate in-process.
- **Agent-in-agent (auto)** — spawning a full external CLI from inside a running agent risks nested/runaway
  sessions and doubled cost. Mitigations already baked in: default `manual`; `stdio:'inherit'`; child exit
  code returned; skill falls back to in-process on non-zero. Document the cost/recursion caveat in docs.
- **Prompt quoting/escaping** — solved structurally by argv-array `execFileSync` (no shell) + per-token
  substitution; `{prompt}` is exactly one arg. Never build a shell string. Asserted by test case 7.
- **Missing binary / bad config** — ENOENT → exit 1 with a clean message; normalizers never throw (loud
  failures only at the CLI layer, exit 2).
- **Strict backwards-compat** — no dispatch config → `loadConfig` leaves the new keys `undefined`,
  `resolvePhaseDispatch` returns `no-config`, command no-ops (exit 0), loop runs in-process exactly as today.

---

## 9. Verification checklist (run before declaring done)
1. `npm install` (if deps missing) → `npm run build` (tsc) — clean.
2. `npm run lint` (`lint:unused` + `knip`) — clean (no unused exports; ensure new exports are referenced).
3. `npm run test:dispatch` — new suite green.
4. `npm test && npm run test:init && npm run test:update && npm run test:cleanup-helper` — no regressions.
5. Manual smoke in a tmp project:
   - write `.ai-factory.json` with a manual `phases` block → `ai-factory dispatch plan` prints instructions;
   - flip `dispatch:"auto"` + a `dispatchAgents` template pointing at a fake script on PATH → it is spawned;
   - remove dispatch config → `ai-factory dispatch plan` is a silent no-op (exit 0).

---

## 10. Files to create / modify (with reason)
| File | Action | Reason |
|------|--------|--------|
| `src/core/config.ts` | modify | Add dispatch types; preserve `dispatch`/`phases`/`dispatchAgents` across all 3 `loadConfig` returns |
| `src/core/dispatch-registry.ts` | create | Run-spec registry + builtin defaults + id/skillsCliAgent resolver |
| `src/core/dispatch.ts` | create | Pure resolve/build/format + `runAuto` (execFileSync, ENOENT) |
| `src/cli/commands/dispatch.ts` | create | The `dispatch` command (manual/auto, exit codes) |
| `src/cli/index.ts` | modify | Register `dispatch <phase>` command |
| `skills/aif-loop/SKILL.md` | modify | Step 4.0 dispatch hook at phase boundaries |
| `scripts/test-dispatch.sh` | create | Bash test suite |
| `package.json` | modify | `test:dispatch` script |
| `.github/workflows/ci.yml` | modify | Run dispatch tests in CI |
| `docs/config-reference.md`, `docs/configuration.md`, `docs/workflow.md`, `AGENTS.md` | modify | Document the feature |
