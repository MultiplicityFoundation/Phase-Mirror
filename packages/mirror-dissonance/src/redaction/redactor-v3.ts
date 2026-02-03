/**
 * Redactor v3 - Nonce-based redaction with rotation support
 * Supports multi-version nonce loading and grace periods
 * Now uses secret store adapter for AWS abstraction
 */
import crypto from 'crypto';
import { SSMClient } from '@aws-sdk/client-ssm';
import { SSMSecretStore } from '../adapters/aws/secret-store.js';
import { ISecretStore } from '../adapters/types.js';

export interface RedactedText {
  __brand: 'RedactedText';
  __mac: string;
  value: string;
  originalLength?: number;
  version?: string;
}

export interface RedactionRule {
  regex: RegExp;
  replacement: string;
}

interface NonceCache {
  value: string;
  loadedAt: number;
  version: string;
}

// Cache for multiple nonce versions
const nonceCache = new Map<string, NonceCache>();
const CACHE_TTL_MS = 3600000; // 1 hour

// Global secret store instance for backward compatibility
let globalSecretStore: ISecretStore | null = null;

/**
 * Initialize the secret store (for new code)
 */
export function initializeSecretStore(secretStore: ISecretStore): void {
  globalSecretStore = secretStore;
}

/**
 * Load nonce from SSM Parameter Store
 * @deprecated For new code, use initializeSecretStore() and loadNonceWithStore()
 */
export async function loadNonce(
  client: SSMClient,
  parameterName: string
): Promise<void> {
  // Create a temporary secret store with the provided client for backward compatibility
  const tempStore = new SSMSecretStore();
  (tempStore as any).client = client;
  return loadNonceWithStore(tempStore, parameterName);
}

/**
 * Load nonce using the secret store adapter
 */
export async function loadNonceWithStore(
  secretStore: ISecretStore,
  parameterName: string
): Promise<void> {
  try {
    const value = await secretStore.getSecret(parameterName, true);
    
    // Extract version from parameter name (e.g., /test/nonce_v1 -> v1)
    const versionMatch = parameterName.match(/v(\d+)$/);
    const version = versionMatch ? `v${versionMatch[1]}` : 'v1';

    nonceCache.set(version, {
      value,
      loadedAt: Date.now(),
      version,
    });

    console.log(`Loaded nonce ${version} from ${parameterName}`);
  } catch (error) {
    // If we have a valid cache, use degraded mode
    const cachedNonces = Array.from(nonceCache.values());
    if (cachedNonces.length > 0 && isCacheValid(cachedNonces[0])) {
      console.warn('SSM unreachable, using cached nonce (degraded mode)');
      return;
    }
    
    throw new Error(`Failed to load nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if cache is still valid
 */
function isCacheValid(cache: NonceCache): boolean {
  return Date.now() - cache.loadedAt < CACHE_TTL_MS;
}

/**
 * Get the most recent valid nonce for creating new redactions
 */
function getActiveNonce(): NonceCache {
  const validNonces = Array.from(nonceCache.values()).filter(isCacheValid);
  
  if (validNonces.length === 0) {
    throw new Error('No valid nonce in cache (cache expired)');
  }

  // Return the most recently loaded nonce
  return validNonces.reduce((latest, current) => 
    current.loadedAt > latest.loadedAt ? current : latest
  );
}

/**
 * Redact text using the active nonce
 * 
 * Note: Uses HMAC-SHA256 for Message Authentication Code (MAC) to verify data integrity.
 * This is NOT password hashing - HMAC is the appropriate cryptographic primitive for
 * ensuring the authenticity and integrity of redacted data.
 */
export function redact(
  text: string,
  rules: RedactionRule[]
): RedactedText {
  const activeNonce = getActiveNonce();
  
  let redactedValue = text;
  for (const rule of rules) {
    redactedValue = redactedValue.replace(rule.regex, rule.replacement);
  }

  // Generate HMAC-SHA256 MAC for integrity verification
  // This is message authentication, not password hashing
  const hmac = crypto
    .createHmac('sha256', activeNonce.value)
    .update(text)
    .digest('hex');

  return {
    __brand: 'RedactedText',
    __mac: hmac,
    value: redactedValue,
    originalLength: text.length,
    version: activeNonce.version,
  };
}

/**
 * Verify a RedactedText object against the original text
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyRedactedText(
  redactedText: RedactedText,
  originalText: string
): boolean {
  if (!isValidRedactedText(redactedText)) {
    return false;
  }

  // Get all valid nonces to check against (supports grace period)
  const validNonces = Array.from(nonceCache.values()).filter(isCacheValid);
  
  // Try to verify with any valid nonce (for grace period support)
  for (const nonce of validNonces) {
    const computedMac = crypto
      .createHmac('sha256', nonce.value)
      .update(originalText)
      .digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    try {
      if (crypto.timingSafeEqual(
        Buffer.from(redactedText.__mac, 'hex'),
        Buffer.from(computedMac, 'hex')
      )) {
        return true;
      }
    } catch {
      // Buffers are different lengths, continue to next nonce
      continue;
    }
  }
  
  return false;
}

/**
 * Validate a RedactedText object structure
 * Note: This only checks structural validity, not MAC integrity.
 * Use verifyRedactedText() with the original text for cryptographic verification.
 */
export function isValidRedactedText(redactedText: any): boolean {
  if (!redactedText || typeof redactedText !== 'object') {
    return false;
  }

  if (redactedText.__brand !== 'RedactedText') {
    return false;
  }

  if (!redactedText.__mac || typeof redactedText.__mac !== 'string') {
    return false;
  }

  // Check that we have at least one valid nonce available
  const validNonces = Array.from(nonceCache.values()).filter(isCacheValid);
  
  return validNonces.length > 0;
}

/**
 * Clear nonce cache (for testing)
 */
export function clearNonceCache(): void {
  nonceCache.clear();
}

/**
 * Get cache status (for testing/debugging)
 */
export function getCacheStatus(): Array<{version: string; age: number; valid: boolean}> {
  return Array.from(nonceCache.values()).map(cache => ({
    version: cache.version,
    age: Date.now() - cache.loadedAt,
    valid: isCacheValid(cache),
  }));
}
