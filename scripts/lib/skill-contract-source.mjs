// Static test inventory only. Runtime agents load the selected routes, never
// this concatenation. Keep legacy wording/section assertions across relocations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function readSkillContract(entrypoint) {
  const root = path.dirname(entrypoint);
  const seen = new Set();
  function read(file) {
    if (seen.has(file)) return '';
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const references = [...text.matchAll(/\]\((references\/[^)#]+\.md)(?:#[^)]*)?\)/g)]
      .map(match => path.resolve(root, match[1]));
    for (const reference of references) {
      if (!reference.startsWith(path.resolve(root, 'references') + path.sep)) {
        throw new Error(`Reference escapes its skill: ${reference}`);
      }
    }
    return [text, ...references.map(read)].filter(Boolean).join('\n\n');
  }
  return read(path.resolve(entrypoint));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(readSkillContract(process.argv[2]));
}
