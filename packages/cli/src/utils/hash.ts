import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Compute SHA-256 hash of a file.
 * Throws on I/O error — callers must handle the failure.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256');
  hash.update(fileContent);
  return hash.digest('hex');
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}
