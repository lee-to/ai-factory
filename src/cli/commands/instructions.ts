import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { prepareInstructionSpec } from '../../core/instruction-inventory.js';
import {
  addInstructionOperation, addInstructionResource, finalizeInstructionRun, instructionRunPath,
  observeInstructionLoad, readInstructionManifest, startInstructionRun, verifyInstructionRun,
  normalizeInstructionPath, resolveInstructionLocalPath,
} from '../../core/instruction-manifest.js';

interface Options { spec?: string; runsDir?: string; restore?: string; quiet?: boolean }

async function input(file: string | undefined): Promise<unknown> {
  if (!file) throw new Error('Provide a JSON input with --spec <file>.');
  try {
    const bytes = await fs.readFile(file);
    const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  }
  catch { throw new Error('Cannot read the JSON specification; check the file and JSON syntax.'); }
}

function action(operation: (runId: string, options: Options) => Promise<unknown>) {
  return async (runId: string, options: Options) => {
    try {
      if (!options.quiet && process.env.AIF_INSTRUCTIONS_LOG_LEVEL !== 'silent') console.error(`[instructions] ${runId}: processing local instruction record`);
      const result = await operation(runId, options);
      console.log(JSON.stringify(result, null, 2));
      if ((result as { status?: string })?.status === 'fail') process.exitCode = 1;
    } catch (error) {
      // Avoid reflecting resource paths, settings, or raw filesystem errors into logs.
      const message = error instanceof Error && !('code' in error) ? error.message : 'Local operation failed; check access, existing run id, and capture policy.';
      console.error(`[instructions] ERROR ${message}`);
      process.exitCode = 1;
    }
  };
}

export function registerInstructionCommands(program: Command): void {
  const instructions = program.command('instructions').description('Record explicit skill invocations and their instruction composition');
  const common = (command: Command) => command
    .option('--runs-dir <path>', 'Project-relative storage directory (default: .ai-factory/instruction-runs)')
    .option('--quiet', 'Suppress progress logging; JSON results and errors remain visible');

  instructions.command('prepare <directory>').description('Print a composition specification for an installed skill package; does not register a run')
    .requiredOption('--skill <name>', 'Logical skill name')
    .option('--runtime <name>', 'Runtime identity, otherwise unknown')
    .option('--entry <file>', 'Entry file relative to directory (default: SKILL.md; supports flat workflows)')
    .option('--context <paths...>', 'Explicit project rule/context files to include; producer must resolve configured paths')
    .option('--snapshot', 'Explicitly allow local snapshots of the selected package and context files')
    .option('--output <file>', 'Write a NEW project-relative UTF-8 specification file (avoids shell encoding changes)')
    .action(async (directory: string, options: { skill: string; runtime?: string; entry?: string; context?: string[]; snapshot?: boolean; output?: string }) =>
      action(async () => {
        const specification = await prepareInstructionSpec(process.cwd(), directory, options);
        if (!options.output) return specification;
        const output = normalizeInstructionPath(options.output);
        const target = await resolveInstructionLocalPath(process.cwd(), output, true);
        await fs.writeFile(target, JSON.stringify(specification, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        return { specification: output };
      })(directory, { quiet: true }));

  common(instructions.command('start').description('Register an open invocation from a composition specification').requiredOption('--spec <file>', 'JSON composition specification'))
    .action(async (options: Options) => action(async () => {
      const manifest = await startInstructionRun(process.cwd(), await input(options.spec), options.runsDir);
      return { run_id: manifest.run.id, manifest: `${instructionRunPath(manifest.run.id, options.runsDir)}/manifest.json`, composition_sha256: manifest.composition_sha256, state: 'open' };
    })('start', options));

  common(instructions.command('resource <run-id>').description('Append a resource revision, preserving earlier captures').requiredOption('--spec <file>', 'JSON resource declaration'))
    .action(action(async (runId, options) => {
      const manifest = await addInstructionResource(process.cwd(), runId, await input(options.spec), options.runsDir);
      return { resource: manifest.resources.at(-1), composition_sha256: manifest.composition_sha256 };
    }));

  common(instructions.command('operation <run-id>').description('Append a declared operation against exact resource revisions').requiredOption('--spec <file>', 'JSON operation declaration'))
    .action(action(async (runId, options) => {
      const manifest = await addInstructionOperation(process.cwd(), runId, await input(options.spec), options.runsDir);
      return { operation: manifest.operations.at(-1), composition_sha256: manifest.composition_sha256 };
    }));

  common(instructions.command('observe <run-id>').description('Append caller-supplied load evidence; does not authenticate runtime events').requiredOption('--spec <file>', 'JSON observation'))
    .action(action(async (runId, options) => {
      const manifest = await observeInstructionLoad(process.cwd(), runId, await input(options.spec), options.runsDir);
      return { observation: manifest.observations.at(-1) };
    }));

  common(instructions.command('finish <run-id>').description('Explicitly finalize a run; does not assert complete loading'))
    .action(action((runId, options) => finalizeInstructionRun(process.cwd(), runId, options.runsDir)));
  common(instructions.command('show <run-id>').description('Read an instruction manifest, including unfinished runs'))
    .action(action((runId, options) => readInstructionManifest(process.cwd(), runId, options.runsDir)));
  common(instructions.command('verify <run-id>').description('Verify archived bytes, dependencies, load evidence, and accounting')
    .option('--restore <path>', 'Restore exact installed output bytes to a NEW project-relative directory'))
    .action(action((runId, options) => verifyInstructionRun(process.cwd(), runId, options.runsDir, options.restore)));
}
