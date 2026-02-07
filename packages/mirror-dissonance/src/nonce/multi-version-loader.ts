/**
 * Multi-Version Nonce Loader
 * 
 * Supports loading multiple nonce versions simultaneously during grace periods.
 *
 * @deprecated Direct SSM coupling removed. loadNonce() now accepts a
 *   SecretFetcher function instead of an SSMClient.
 */

/** Cloud-agnostic secret fetcher. Replaces direct SSM coupling. */
export type SecretFetcher = (parameterName: string) => Promise<string>;

export interface NonceRecord {
  nonce: string;
  version: number;
  issuedAt: number;
  parameterName: string;
}

export interface NonceCache {
  records: NonceRecord[];
  lastUpdated: number;
  ttlMs: number;
}

const cache: NonceCache = {
  records: [],
  lastUpdated: 0,
  ttlMs: 3600000 // 1 hour default
};

/**
 * Extract version number from SSM parameter name
 * Example: /guardian/staging/redaction_nonce_v2 → 2
 */
function extractVersion(parameterName: string): number {
  const match = parameterName.match(/_v(\d+)$/);
  if (!match) {
    throw new Error(`Cannot extract version from parameter name: ${parameterName}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Load a nonce version from a secret store and add to cache
 */
export async function loadNonce(
  fetchSecret: SecretFetcher,
  parameterName: string
): Promise<NonceRecord> {
  const version = extractVersion(parameterName);

  try {
    const nonce = await fetchSecret(parameterName);

    if (!nonce) {
      throw new Error(
        `Nonce parameter '${parameterName}' exists but has no value`
      );
    }

    // Validate nonce format (64 hex characters)
    if (!/^[0-9a-f]{64}$/i.test(nonce)) {
      throw new Error(
        `Invalid nonce format in ${parameterName}: expected 64 hex chars, got ${nonce.length}`
      );
    }

    const record: NonceRecord = {
      nonce,
      version,
      issuedAt: Date.now(),
      parameterName
    };

    // Add or update in cache
    const existingIndex = cache.records.findIndex(r => r.version === version);
    if (existingIndex >= 0) {
      cache.records[existingIndex] = record;
    } else {
      cache.records.push(record);
    }

    // Sort by version descending (newest first)
    cache.records.sort((a, b) => b.version - a.version);

    cache.lastUpdated = Date.now();

    console.log(
      `[nonce] Loaded v${version}, cache now has ${cache.records.length} version(s)`
    );

    return record;
  } catch (error: any) {
    throw new Error(
      `Failed to load nonce from ${parameterName}: ${error.message}`
    );
  }
}

/**
 * Get all currently valid nonces (within TTL)
 */
export function getValidNonces(): NonceRecord[] {
  const now = Date.now();
  const validNonces = cache.records.filter(
    record => (now - record.issuedAt) < cache.ttlMs
  );

  if (validNonces.length === 0) {
    throw new Error(
      'No valid nonces in cache. Call loadNonce() before using redaction.'
    );
  }

  return validNonces;
}

/**
 * Get the latest (highest version) nonce for new redactions
 */
export function getLatestNonce(): NonceRecord {
  const valid = getValidNonces();
  return valid[0]; // Already sorted by version descending
}

/**
 * Clear specific version from cache (used after grace period)
 */
export function evictNonceVersion(version: number): void {
  const index = cache.records.findIndex(r => r.version === version);
  if (index >= 0) {
    cache.records.splice(index, 1);
    console.log(`[nonce] Evicted v${version}, cache now has ${cache.records.length} version(s)`);
  }
}

/**
 * Clear entire cache (for testing)
 */
export function clearNonceCache(): void {
  cache.records = [];
  cache.lastUpdated = 0;
  console.log('[nonce] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getNonceCacheStats() {
  return {
    versions: cache.records.map(r => r.version),
    count: cache.records.length,
    lastUpdated: cache.lastUpdated,
    ttlMs: cache.ttlMs
  };
}

/**
 * Configure cache TTL
 */
export function setNonceTTL(ttlMs: number): void {
  cache.ttlMs = ttlMs;
}
