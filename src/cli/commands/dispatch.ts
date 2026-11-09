import { loadConfig, DISPATCH_PHASES } from '../../core/config.js';
import { resolvePhaseDispatch, formatManualInstructions, buildAgentCommand, runAuto } from '../../core/dispatch.js';
import { listDispatchAgentIds } from '../../core/dispatch-registry.js';
import { hydrateProjectAgentRegistry } from '../../core/agents.js';

export async function dispatchCommand(
  phase: string,
  options: { prompt?: string; print?: boolean; json?: boolean } = {},
): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  // Extension-provided runtimes referenced from phases.<phase>.agent must be registered
  // before resolution, otherwise a fresh CLI process reports them as unknown agents.
  await hydrateProjectAgentRegistry(projectDir, {
    extensionNames: config?.extensions?.map(extension => extension.name) ?? [],
  });
  const r = resolvePhaseDispatch(config, phase);
  const result = (status: string, details: Record<string, unknown> = {}): void => {
    if (options.json) console.log(JSON.stringify({ schema_version: 1, phase, status, ...details }));
  };

  switch (r.kind) {
    case 'unknown-phase':
      console.error(`Unknown phase '${r.phase}'. Valid phases: ${DISPATCH_PHASES.join(', ')}`);
      result('error', { reason: r.kind });
      process.exitCode = 2; return;
    case 'no-config':
    case 'no-phase-entry':
      // Preserve the fully silent default; machine consumers opt into explicit no-op results.
      result('noop', { reason: r.kind });
      return;
    case 'unknown-agent':
      console.error(
        `Unknown dispatch agent '${r.agent}' for phase '${r.phase}'. ` +
        `Known agents: ${listDispatchAgentIds().join(', ')}. ` +
        `Add it under "dispatchAgents" in .ai-factory.json.`);
      result('error', { reason: r.kind });
      process.exitCode = 2; return;
    case 'resolved': {
      const defaultPrompt = r.value.phase === 'implement'
        ? 'Implement the current plan.'
        : r.value.phase === 'review'
          ? 'Review the latest changes.'
          : `Run the ${r.value.phase} phase of the aif-loop.`;
      const prompt = options.prompt ?? defaultPrompt;
      if (options.print || r.value.mode === 'manual') {
        const instructions = formatManualInstructions(r.value, prompt);
        if (options.json) {
          result('manual', { agent: r.value.spec.id, model: r.value.model,
            command: buildAgentCommand(r.value.spec, { model: r.value.model, phase: r.value.phase, prompt }),
            instructions });
        } else console.log(instructions);
        return; // exit 0
      }
      const res = runAuto(r.value, prompt, { json: options.json });
      if (!res.ok) {
        console.error(res.error ?? 'dispatch failed');
        result('error', { error: res.error ?? 'dispatch failed' });
        process.exitCode = 1;
      } else result('completed');
      return;
    }
  }
}
