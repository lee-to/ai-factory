import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getSkillsDir(): string {
  return path.join(getPackageRoot(), 'skills');
}

export function getSubagentsDir(): string {
  return path.join(getPackageRoot(), 'subagents');
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

export async function readFileBuffer(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
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

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function listFilesRecursive(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  await walk(dirPath);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function hashDirectory(dirPath: string): Promise<string | null> {
  const files = await listFilesRecursive(dirPath);
  if (files.length === 0) {
    return null;
  }

  const hasher = createHash('sha256');
  for (const absFile of files) {
    const content = await readFileBuffer(absFile);
    if (!content) {
      return null;
    }
    const relPath = path.relative(dirPath, absFile).replaceAll('\\', '/');
    hasher.update(`path:${relPath}\n`);
    hasher.update(content);
    hasher.update('\n');
  }

  return hasher.digest('hex');
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function removeDirectory(dirPath: string): Promise<void> {
  await fs.remove(dirPath);
}

export async function removeFile(filePath: string): Promise<void> {
  await fs.remove(filePath);
}
