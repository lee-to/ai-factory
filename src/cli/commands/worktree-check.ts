import { diagnoseWorktrees, formatWorktreeDiagnostic } from '../../core/worktree-readiness.js';

export async function worktreeCheckCommand(checkouts: string[], options: { json?: boolean; mapping?: string }): Promise<void> {
  try {
    const report = await diagnoseWorktrees(checkouts.length ? checkouts : ['.'], options.mapping);
    console.log(options.json ? JSON.stringify(report, null, 2) : formatWorktreeDiagnostic(report));
  } catch {
    console.error('[worktree-check] ERROR: Cannot diagnose; check selected checkout directories, mapping path and discovery limits.');
    process.exitCode = 1;
  }
}
