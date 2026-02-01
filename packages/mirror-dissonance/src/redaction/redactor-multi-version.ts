/**
 * Multi-Version Redactor
 * 
 * Supports validating RedactedText created with different nonce versions
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  getValidNonces,
  getLatestNonce,
  type NonceRecord
} from '../nonce/multi-version-loader.js';

export interface RedactedText {
  brand: string;
  mac: string;
  nonceVersion: number;
  value: string;
  redactionHits: number;
}

export interface RedactionPattern {
  regex: RegExp;
  replacement: string;
}

/**
 * Compute HMAC-SHA256 for message authentication
 * 
 * Note: This is NOT password hashing. HMAC is used for Message Authentication Code (MAC)
 * to verify data integrity and authenticity. This is the correct cryptographic primitive
 * for this use case.
 */
function computeHMAC(nonce: string, data: string): string {
  return createHmac('sha256', nonce).update(data).digest('hex');
}

/**
 * Redact text using latest nonce version
 * 
 * Uses HMAC-SHA256 for message authentication to ensure data integrity.
 * This is NOT password hashing - HMAC is the appropriate cryptographic primitive
 * for verifying the authenticity and integrity of redacted data.
 */
export function redact(
  input: string,
  patterns: RedactionPattern[]
): RedactedText {
  const latestNonce = getLatestNonce();

  let result = input;
  let hits = 0;

  // Apply all patterns
  for (const { regex, replacement } of patterns) {
    // Compile regex once with global flag
    const globalRegex = new RegExp(regex, 'g');
    const matches = result.match(globalRegex);
    if (matches) {
      hits += matches.length;
      // Reset lastIndex since we already used it for match()
      globalRegex.lastIndex = 0;
      result = result.replace(globalRegex, replacement);
    }
  }

  // Compute brand HMAC (validates origin)
  const brand = computeHMAC(latestNonce.nonce, 'PHASE_MIRROR_REDACTED');

  // Compute MAC HMAC (validates integrity)
  const mac = computeHMAC(latestNonce.nonce, result);

  return {
    brand,
    mac,
    nonceVersion: latestNonce.version,
    value: result,
    redactionHits: hits
  };
}

/**
 * Validate RedactedText using any valid nonce version
 */
export function isValidRedactedText(obj: unknown): obj is RedactedText {
  // Type guard
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as any;

  // Check required fields
  if (
    typeof candidate.brand !== 'string' ||
    typeof candidate.mac !== 'string' ||
    typeof candidate.nonceVersion !== 'number' ||
    typeof candidate.value !== 'string' ||
    typeof candidate.redactionHits !== 'number'
  ) {
    return false;
  }

  // Try validation against all valid nonces
  const validNonces = getValidNonces();

  for (const nonceRecord of validNonces) {
    // Check brand using timing-safe comparison
    const expectedBrand = computeHMAC(
      nonceRecord.nonce,
      'PHASE_MIRROR_REDACTED'
    );

    try {
      // Use timing-safe comparison for brand to prevent timing attacks
      if (!timingSafeEqual(
        Buffer.from(candidate.brand, 'hex'),
        Buffer.from(expectedBrand, 'hex')
      )) {
        continue; // Try next nonce
      }
    } catch {
      // timingSafeEqual throws if lengths differ
      continue;
    }

    // Check MAC
    const expectedMAC = computeHMAC(nonceRecord.nonce, candidate.value);

    try {
      if (
        timingSafeEqual(
          Buffer.from(candidate.mac, 'hex'),
          Buffer.from(expectedMAC, 'hex')
        )
      ) {
        // Valid with this nonce version
        return true;
      }
    } catch {
      // timingSafeEqual throws if lengths differ
      continue;
    }
  }

  // No valid nonce matched
  return false;
}

/**
 * Validate and get the nonce version used
 */
export function getRedactedTextVersion(
  redactedText: RedactedText
): number | null {
  if (!isValidRedactedText(redactedText)) {
    return null;
  }

  return redactedText.nonceVersion;
}
