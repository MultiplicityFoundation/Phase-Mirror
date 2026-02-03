/**
 * File utilities for Phase Mirror CLI
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

export async function findFiles(patterns: string[]): Promise<string[]> {
  const files = new Set<string>();
  
  for (const pattern of patterns) {
    const matches = await glob(pattern, { ignore: ['node_modules/**', '**/node_modules/**'] });
    matches.forEach(file => files.add(file));
  }
  
  return Array.from(files);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
