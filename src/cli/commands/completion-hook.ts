import { Command, Option } from 'commander';
import { enableCompletionHook, disableCompletionHook, runCompletionHook, inspectCompletionReceipt } from '../../core/completion-hook.js';

async function action(operation: () => Promise<unknown>) {
  try {
    const result = await operation();
    console.log(JSON.stringify(result, null, 2));
    if ((result as { status?: string }).status === 'unsupported') process.exitCode = 1;
  } catch {
    console.error('[completion-hook] Operation failed; check the specification, project paths and existing hook settings.');
    process.exitCode = 1;
  }
}
async function eventInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => process.stdin.destroy(new Error('Hook input timeout.')), 2000);
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 64 * 1024) throw new Error('Hook input limit.');
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}
export function registerCompletionHookCommands(program: Command): void {
  const command = program.command('completion-hook').description('Opt-in project verifier adapter for Claude Code Stop');
  command.command('enable').requiredOption('--spec <file>', 'Explicitly approved project-relative JSON specification')
    .action((options: { spec: string }) => action(() => enableCompletionHook(process.cwd(), options.spec)));
  command.command('disable').action(() => action(() => disableCompletionHook(process.cwd())));
  command.command('inspect <receipt>').description('Check freshness only; does not authenticate or accept evidence')
    .action((receipt: string) => action(() => inspectCompletionReceipt(process.cwd(), receipt)));
  command.command('run').requiredOption('--project <path>', 'Exact approved worktree root')
    .requiredOption('--approval <id>', 'Installed approval identity')
    .addOption(new Option('--role <role>', 'Existing project verification policy').choices(['required', 'observer']).makeOptionMandatory())
    .action(async (options: { project: string; approval: string; role: string }) => {
      let outcome = 'error';
      let blocking = options.role !== 'observer';
      let receipt: string | undefined;
      try {
        let event: unknown;
        try { event = await eventInput(); } catch { event = null; }
        const result = await runCompletionHook(options.project, options.approval, options.role, event);
        ({ outcome, blocking, receipt } = result);
      } catch { /* An unwritable receipt cannot authorize completion. */ }
      if (process.env.AIF_COMPLETION_HOOK_LOG_LEVEL !== 'silent') console.error(`[completion-hook] ${outcome}${receipt ? `; ${receipt}` : ''}`);
      console.log(JSON.stringify(blocking ? { decision: 'block', reason: `Project verification: ${outcome}. Resolve through the existing verification workflow; no automatic retry.`,
        systemMessage: receipt ? `Completion-hook receipt: ${receipt}` : 'Completion-hook receipt unavailable.' }
        : { systemMessage: `Project verification (${options.role}): ${outcome}.${receipt ? ` Receipt: ${receipt}` : ''}` }));
    });
}
