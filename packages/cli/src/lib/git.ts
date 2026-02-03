/**
 * Git utilities for Phase Mirror CLI
 */
import { execSync } from 'child_process';

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
