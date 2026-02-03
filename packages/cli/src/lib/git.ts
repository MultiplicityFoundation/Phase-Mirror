/**
 * Git utilities for Phase Mirror CLI
 */
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { CLIError } from './errors.js';

const execAsync = promisify(exec);

export async function getChangedFiles(mode: string): Promise<string[]> {
  try {
    let command: string;

    switch (mode) {
      case 'pull_request':
        // Get files changed between base and head
        command = 'git diff --name-only origin/main...HEAD';
        break;
      
      case 'merge_group':
        // Get files changed in the merge group
        command = 'git diff --name-only HEAD~1';
        break;
      
      case 'drift':
        // Get all tracked files for drift detection
        command = 'git ls-files';
        break;
      
      case 'calibration':
        // Get recently modified files
        command = 'git diff --name-only HEAD~10..HEAD';
        break;
      
      default:
        // Default: get uncommitted changes
        command = 'git diff --name-only HEAD';
    }

    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && stderr.trim()) {
      console.warn(`Git warning: ${stderr.trim()}`);
    }

    const files = stdout
      .trim()
      .split('\n')
      .filter(file => file.length > 0)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

    return files;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIError(
      `Failed to get changed files: ${message}`,
      'GIT_ERROR'
    );
  }
}

export function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function getCommitAuthor(): string {
  try {
    return execSync('git log -1 --format="%an"', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function getRepositoryName(): string {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function hasUncommittedChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}
