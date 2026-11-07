import { loadConfig, DISPATCH_PHASES } from '../../core/config.js';
import { resolvePhaseDispatch, formatManualInstructions, runAuto } from '../../core/dispatch.js';
import { listDispatchAgentIds } from '../../core/dispatch-registry.js';
import { hydrateProjectAgentRegistry } from '../../core/agents.js';

export async function dispatchCommand(
  phase: string,
  options: { prompt?: string; print?: boolean } = {},
): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  // Extension-provided runtimes referenced from phases.<phase>.agent must be registered
  // before resolution, otherwise a fresh CLI process reports them as unknown agents.
  await hydrateProjectAgentRegistry(projectDir, {
    extensionNames: config?.extensions?.map(extension => extension.name) ?? [],
  });
  const r = resolvePhaseDispatch(config, phase);

  switch (r.kind) {
    case 'unknown-phase':
      console.error(`Unknown phase '${r.phase}'. Valid phases: ${DISPATCH_PHASES.join(', ')}`);
      process.exitCode = 2; return;
    case 'no-config':
    case 'no-phase-entry':
      // Fully silent no-op (exit 0, empty stdout and stderr): the aif-loop contract treats
      // "no dispatch block on stdout" as "run the phase in-process", and this is the path taken
      // by every project without dispatch config. Diagnostics would look like tool errors.
      return;
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
