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
      const defaultPrompt = r.value.phase === 'implement'
        ? 'Implement the current plan.'
        : r.value.phase === 'review'
          ? 'Review the latest changes.'
          : `Run the ${r.value.phase} phase of the aif-loop.`;
      const prompt = options.prompt ?? defaultPrompt;
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
