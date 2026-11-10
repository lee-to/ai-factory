import fs from 'node:fs/promises';
import { normalizeInstructionPath, resolveInstructionLocalPath, type InstructionResourceInput } from './instruction-manifest.js';

// Inventory a caller-selected installed skill. This is a declared package, not a
// claim that its references (or the ambient runtime's rules) were actually loaded.
export async function prepareInstructionSpec(projectDir: string, directory: string, options: {
  skill: string; runtime?: string; entry?: string; context?: string[]; snapshot?: boolean;
}) {
  const safe = normalizeInstructionPath;
  const dir = safe(directory);
  const entry = safe(options.entry ?? 'SKILL.md');
  const files: string[] = [];
  async function visit(rel: string): Promise<void> {
    const current = await resolveInstructionLocalPath(projectDir, `${dir}/${rel}`.replace(/\/$/, ''));
    const stat = await fs.lstat(current);
    if (stat.isFile()) files.push(rel);
    else if (stat.isDirectory()) {
      for (const name of (await fs.readdir(current)).sort()) {
        if (!rel && name === 'tests') continue;
        await visit(rel ? `${rel}/${name}` : name);
      }
    } else throw new Error('Inventory supports only regular files and directories.');
  }
  if (entry === 'SKILL.md') await visit('');
  else {
    await visit(entry);
    try { await visit('references'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  if (!files.includes(entry)) throw new Error('Installed entry file was not found in the selected inventory.');
  const resources: InstructionResourceInput[] = files.map((file, index) => ({
    id: file === entry ? 'installed' : `dependency-${index + 1}`,
    role: file === entry ? 'installed' : 'reference', path: `${dir}/${file}`,
    required: file === entry, in_composition: file === entry, output_path: `${dir}/${file}`,
  }));
  for (const [index, context] of (options.context ?? []).entries()) {
    resources.push({ id: `context-${index + 1}`, role: 'project-context', path: safe(context),
      required: true, in_composition: true, addition: true });
  }
  return {
    skill: options.skill, runtime: options.runtime ?? 'unknown', task: 'unknown', stage: 'unknown',
    policy: { snapshot_roots: options.snapshot ? [dir, ...(options.context ?? []).map(safe)] : [], exclude: [], settings_allowlist: [] },
    resources,
    dependencies: resources.filter(resource => resource.id !== 'installed').map(resource => ({
      from: 'installed', to: resource.id, required: resource.required ?? false,
      condition: 'unknown', declaration: 'caller-selected package inventory; not a load observation', resolution: 'declared',
    })),
    operations: [],
  };
}
