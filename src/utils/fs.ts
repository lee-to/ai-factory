import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getSkillsDir(): string {
  return path.join(getPackageRoot(), 'skills');
}

export function getMcpDir(): string {
  return path.join(getPackageRoot(), 'mcp');
}

export async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.ensureDir(dest);
  await fs.copy(src, dest, { overwrite: true });
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest, { overwrite: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/** Skip directories when walking (e.g. node_modules, .git, build output) */
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.gradle', 'target', 'bin', 'out']);

/**
 * Recursively find files matching a predicate.
 * @param dirPath Root directory to search
 * @param predicate Function returning true for files to include
 * @returns Array of absolute paths to matching files
 */
export async function findFiles(
  dirPath: string,
  predicate: (relativePath: string, fullPath: string) => boolean
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(dirPath, fullPath);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          results.push(...(await findFiles(fullPath, predicate)));
        }
      } else if (entry.isFile() && predicate(relativePath, fullPath)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors, etc.
  }
  return results;
}
