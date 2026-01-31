import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Compute SHA-256 hash of a file
 */
export async function computeFileHash(filePath: string): Promise<string> {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256');
    hash.update(fileContent);
    return hash.digest('hex');
  } catch (error) {
    console.error(`Error computing hash for ${filePath}:`, error);
    return '';
  }
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
