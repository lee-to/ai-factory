import { discoverCommands, formatCommandCatalog } from '../../core/command-catalog.js';

export async function commandsCommand(directories: string[], options: { json?: boolean; mapping?: string }): Promise<void> {
  try {
    const catalog = await discoverCommands(process.cwd(), directories.length ? directories : ['.'], options.mapping);
    console.log(options.json ? JSON.stringify(catalog, null, 2) : formatCommandCatalog(catalog));
  } catch {
    // Paths and parser errors can contain secrets; do not reflect raw input/errors.
    console.error('[commands] ERROR: Cannot build catalog; check project-relative paths, access and discovery limits.');
    process.exitCode = 1;
  }
}
