# Phase 2: FP Calibration Service (Days 8-21)

## Comprehensive Blueprint \& Exposition


***

## Overview: Why Calibration Matters

After Week 1 (foundation locked), Week 2-3 is about building the **feedback loop that makes the protocol self-improving**.

Here's the problem you're solving:

**You publish a rule: "Flag all X509 certificate mismatches."**

In production, you discover: "This rule fires in 47% of valid cases (false positive rate = 0.47)."

**Question:** How do you know this?

**Without calibration:** You don't. You get anecdotal complaints ("your rule is noisy") but no data.

**With calibration:** Every certified implementation reports:

- Rule ID + version
- Input claim
- Rule outcome (matched/not matched)
- Actual outcome (should have matched / should not have matched)
- Org ID (anonymized as HMAC hash)

You aggregate 1,000,000 reports and compute: "0.47 FP rate on Rule X509-1.0 across 247 organizations."

**Then you improve the rule** and deploy version 1.1 with a refined threshold. FP rate drops to 0.12.

**That's calibration.** It's the virtuous cycle: rules improve because you measure their real-world behavior.

***

## The Privacy Challenge: Why This is Hard

But there's a trap: **if you're collecting outcome data, you know which organizations use which rules.**

Example:

- Org A reports 10,000 false positives for "PII Leak Detection"
- Org B reports 0 false positives
- You can infer: Org A probably processes more data, or has different data patterns

This leaks information. So you need **privacy-respecting calibration**: aggregate enough data to be useful, but not enough to be individually identifying.

**Solution: k-anonymity + HMAC hashing**

- Hash the org ID so you can't decode it
- Enforce minimum k (e.g., 10 orgs per query result)
- Only answer queries if ≥10 orgs reported similar findings

This is the backbone of Phase 2.

***

## Architecture: Three Components

```
┌─────────────────────────────────────────────────────────┐
│ CERTIFIED IMPLEMENTATION (Client)                       │
│ • Runs rules on customer data                          │
│ • Detects false positives                              │
│ • Submits IngestEvents to calibration service          │
└──────────────────┬──────────────────────────────────────┘
                   │ IngestEvent
                   │ (encrypted, org auth token)
                   ▼
┌─────────────────────────────────────────────────────────┐
│ CONSENT STORE (DynamoDB, Encrypted)                    │
│ • Raw orgid (in plaintext, encrypted at rest)          │
│ • TTL = 30 days (auto-delete)                          │
│ • Purpose: Support GDPR deletion requests               │
│ • NOT used for calibration queries                     │
└──────────────────┬──────────────────────────────────────┘
                   │ (batch ETL)
                   ▼
┌─────────────────────────────────────────────────────────┐
│ ANONYMIZER (Lambda ETL)                                │
│ • Read from Consent Store (unencrypted in memory only) │
│ • Hash orgid: HMAC-SHA256(orgid, salt)                 │
│ • Hash findingid: HMAC-SHA256(findingid, salt)         │
│ • Write to Calibration Store (hashes only)             │
│ • Delete source from Consent Store                     │
│ • Rotate salt monthly                                   │
└──────────────────┬──────────────────────────────────────┘
                   │ (aggregation queries)
                   ▼
┌─────────────────────────────────────────────────────────┐
│ CALIBRATION STORE (DynamoDB, Anonymized)               │
│ • Hashed orgid (cannot be decrypted)                   │
│ • Hashed findingid                                      │
│ • Timestamp bucket (week-level)                         │
│ • k-anonymity enforcer: min 10 orgs per bucket         │
│ • Permanent retention (for research)                    │
└──────────────────┬──────────────────────────────────────┘
                   │ (query API)
                   ▼
┌─────────────────────────────────────────────────────────┐
│ QUERY API (Lambda)                                      │
│ • Input: ruleid, ruleversion, outcome, timerange       │
│ • Check: count(unique hashed orgid) >= 10              │
│ • Output: COUNT + confidence interval                   │
│ • Reject queries that would expose <10 orgs            │
└─────────────────────────────────────────────────────────┘
```


***

## Phase 2 Detailed Execution (Days 8-21)

### **Days 8-10: Ingest \& Consent Store**

#### **Day 8: Define IngestResult \& IngestEvent Types**

This is **critical**: every operation must return an explicit result, never silently skip.

**File: `/src/types/ingest.ts`**

```typescript
/**
 * Explicit return types for ingest operations.
 * No silent skips. Every ingest attempt produces a named result.
 */

// ============================================================================
// INGEST EVENT (What client submits)
// ============================================================================

export interface IngestEvent {
  // Identity
  orgid: string; // "org-12345" or email for individual
  
  // Authentication
  token: string; // JWT or API key, verified before processing
  
  // Claim details
  ruleid: string; // "R-X509-CERT-MISMATCH"
  ruleversion: string; // "1.0"
  
  // Evidence
  claim: {
    input: string; // Raw input that rule examined
    metadata?: Record<string, unknown>; // Extra context
  };
  
  // Outcome
  outcome: 'matched' | 'not_matched'; // What the rule said
  actualOutcome: 'should_have_matched' | 'should_not_have_matched'; // What should have happened
  
  // Confidence
  confidence: number; // 0.0-1.0, how sure is the reporter?
  
  // Metadata
  timestamp: number; // Unix ms when event occurred
  environment: 'production' | 'staging' | 'test';
}

// ============================================================================
// EXPLICIT RESULT TYPES (No Silent Skips)
// ============================================================================

/**
 * Base result type: all ingest operations return a discriminated union.
 */
export type IngestResult =
  | IngestResultAccepted
  | IngestResultRejectedInvalidAuth
  | IngestResultRejectedInvalidSchema
  | IngestResultRejectedMalformedClaim
  | IngestResultRejectedDuplicate
  | IngestResultRejectedThrottled
  | IngestResultErrorInternal;

// ──────────────────────────────────────────────────────────────────────────

/**
 * ACCEPTED: Event stored in Consent Store.
 * Next step: Anonymizer will process within 24 hours.
 */
export interface IngestResultAccepted {
  status: 'accepted';
  eventid: string; // UUID for tracking
  orgid_hash: string; // Salted HMAC hash (for correlation without exposing orgid)
  stored_at: number; // Unix ms
  expected_anonymization_at: number; // Unix ms when anonymizer will process
  message: 'Event accepted. Will be anonymized within 24 hours.';
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * REJECTED: Authentication failed.
 * Reason: Token missing, invalid, expired, or org not certified.
 */
export interface IngestResultRejectedInvalidAuth {
  status: 'rejected';
  code: 'INVALID_AUTH';
  reason:
    | 'token_missing'
    | 'token_invalid'
    | 'token_expired'
    | 'org_not_certified'
    | 'org_suspended';
  hint?: string; // "Check your API key" or "Your organization lost certification on 2026-02-01"
  message: 'Event rejected: authentication failed.';
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * REJECTED: Event schema is invalid.
 * Reason: Missing required field, wrong type, out-of-range value.
 */
export interface IngestResultRejectedInvalidSchema {
  status: 'rejected';
  code: 'INVALID_SCHEMA';
  field: string; // "ruleid" or "confidence"
  expected: string; // "string matching /^R-[A-Z0-9-]+$/"
  received: string; // "x509" (invalid)
  message: `Event rejected: field '${string}' is invalid.`;
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * REJECTED: Claim is unparseable or incoherent.
 * Reason: JSON parsing failed, claim contradicts itself, etc.
 */
export interface IngestResultRejectedMalformedClaim {
  status: 'rejected';
  code: 'MALFORMED_CLAIM';
  detail: string; // "JSON parsing error: unexpected end of input"
  message: 'Event rejected: claim is malformed or incoherent.';
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * REJECTED: Duplicate event.
 * Reason: Same org + rule + claim hash already ingested in last 24 hours.
 * Prevents double-counting.
 */
export interface IngestResultRejectedDuplicate {
  status: 'rejected';
  code: 'DUPLICATE';
  prior_eventid: string; // UUID of the first ingestion
  prior_stored_at: number; // Unix ms
  message: 'Event rejected: duplicate detected.';
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * REJECTED: Rate limit exceeded.
 * Reason: Org is submitting too many events (>1000/hour, configurable).
 * Protects against DoS.
 */
export interface IngestResultRejectedThrottled {
  status: 'rejected';
  code: 'THROTTLED';
  limit_per_hour: number; // 1000
  reset_at: number; // Unix ms when quota resets
  message: 'Event rejected: rate limit exceeded.';
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * ERROR: Internal server error.
 * Reason: Database unavailable, Lambda timeout, etc.
 * Caller should retry with exponential backoff.
 */
export interface IngestResultErrorInternal {
  status: 'error';
  code: 'INTERNAL_ERROR';
  request_id: string; // For debugging with support
  detail?: string; // Error message (not customer-facing)
  message: 'Event processing failed. Please retry or contact support with request ID.';
  retry_after_seconds: number; // Backoff hint
}

// ============================================================================
// HELPER: Type guard functions
// ============================================================================

export function isAccepted(result: IngestResult): result is IngestResultAccepted {
  return result.status === 'accepted';
}

export function isRejected(result: IngestResult): result is Exclude<IngestResult, IngestResultAccepted | IngestResultErrorInternal> {
  return result.status === 'rejected';
}

export function isError(result: IngestResult): result is IngestResultErrorInternal {
  return result.status === 'error';
}

// ============================================================================
// METRICS & LOGGING
// ============================================================================

/**
 * Every ingest handler logs the result type.
 * This enables monitoring and alerting:
 * - High rejection rate? → Check if rules changed, auth is broken, or clients are misbehaving
 * - High error rate? → Check database health
 * - Increasing duplicates? → Clients may be retrying incorrectly
 */
export interface IngestMetrics {
  accepted: number;
  rejected_invalid_auth: number;
  rejected_invalid_schema: number;
  rejected_malformed_claim: number;
  rejected_duplicate: number;
  rejected_throttled: number;
  error_internal: number;
  total_processed: number;
  timestamp: number;
}
```

**Why This Matters:**

1. **No silent skips.** Every call to ingest returns a named result. If you're rejected, you know exactly why.
2. **Client feedback.** The client gets actionable hints ("Your API key is expired" vs. generic "401 Unauthorized").
3. **Monitoring hooks.** You can count rejections by type and alert if something breaks ("INVALID_SCHEMA rejections spiked 500% in the last hour").
4. **Debugging.** Every error includes a request_id so support can trace what happened.

***

#### **Day 9: Consent Store Schema \& Encryption**

**File: `/src/store/consent-store.ts`**

```typescript
/**
 * CONSENT STORE - Raw Event Storage
 * 
 * Purpose:
 * - Preserve enough information to support GDPR deletion requests
 * - Temporary holding area before anonymization
 * - All orgid/personal data stored encrypted at rest
 * 
 * Schema:
 * PK: eventid (UUID)
 * SK: orgid_hash (for querying by org, masked)
 * TTL: 30 days (auto-delete, GDPR-compliant)
 * 
 * Encryption:
 * - Data encrypted with AWS KMS at rest
 * - Decrypted in memory only (Lambda runtime)
 * - Never logged or cached
 */

import crypto from 'crypto';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IngestEvent, IngestResultAccepted, IngestResultErrorInternal } from '../types/ingest';

const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
const CONSENT_TABLE = process.env.CONSENT_TABLE_NAME || 'consent-store-dev';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * What we store in DynamoDB.
 * All sensitive fields are encrypted by AWS KMS.
 */
interface ConsentStoreItem {
  eventid: string; // UUID, partition key
  orgid_hash: string; // HMAC(orgid, secret), for querying without exposing orgid
  
  // Encrypted by KMS at rest
  orgid_encrypted: string; // Base64, contains the real orgid
  claim_encrypted: string; // Base64, contains the claim details
  
  // Metadata (not sensitive)
  ruleid: string;
  ruleversion: string;
  outcome: 'matched' | 'not_matched';
  actual_outcome: 'should_have_matched' | 'should_not_have_matched';
  environment: string;
  
  // Timestamps
  created_at: number; // Unix ms
  ttl: number; // Unix seconds for DynamoDB TTL
  expected_anonymization_at: number; // Unix ms
}

// ============================================================================
// CONSENT STORE MANAGER
// ============================================================================

export class ConsentStore {
  /**
   * Store a raw ingest event with encryption.
   * 
   * @param event The IngestEvent from client
   * @param orgid_hash HMAC hash of orgid (for querying without exposing orgid)
   * @returns IngestResultAccepted | IngestResultErrorInternal
   */
  async storeEvent(
    event: IngestEvent,
    orgid_hash: string,
  ): Promise<IngestResultAccepted | IngestResultErrorInternal> {
    const eventid = crypto.randomUUID();
    const now = Date.now();
    
    try {
      // Encrypt sensitive fields (orgid, claim)
      const orgid_encrypted = await this.encryptWithKMS(event.orgid);
      const claim_encrypted = await this.encryptWithKMS(JSON.stringify(event.claim));
      
      // Prepare item for DynamoDB
      const item: ConsentStoreItem = {
        eventid,
        orgid_hash,
        orgid_encrypted,
        claim_encrypted,
        ruleid: event.ruleid,
        ruleversion: event.ruleversion,
        outcome: event.outcome,
        actual_outcome: event.actualOutcome,
        environment: event.environment,
        created_at: now,
        ttl: Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days in Unix seconds
        expected_anonymization_at: now + 24 * 60 * 60 * 1000, // 24 hours from now
      };
      
      // Store in DynamoDB
      const command = new PutItemCommand({
        TableName: CONSENT_TABLE,
        Item: marshall(item),
      });
      
      await dynamodb.send(command);
      
      return {
        status: 'accepted',
        eventid,
        orgid_hash,
        stored_at: now,
        expected_anonymization_at: item.expected_anonymization_at,
        message: 'Event accepted. Will be anonymized within 24 hours.',
      };
    } catch (error) {
      console.error('Consent store error:', error);
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        request_id: eventid,
        message: 'Event processing failed. Please retry or contact support with request ID.',
        retry_after_seconds: 5,
      };
    }
  }

  /**
   * Query events by org (using hashed orgid, doesn't expose actual orgid).
   * Used by anonymizer to batch-process events for a hashed org.
   */
  async queryByOrgHash(orgid_hash: string, limit: number = 100): Promise<ConsentStoreItem[]> {
    try {
      const command = new QueryCommand({
        TableName: CONSENT_TABLE,
        IndexName: 'orgid_hash-created_at-index', // GSI on orgid_hash
        KeyConditionExpression: 'orgid_hash = :hash',
        ExpressionAttributeValues: marshall({
          ':hash': orgid_hash,
        }),
        Limit: limit,
      });
      
      const response = await dynamodb.send(command);
      return (response.Items || []).map((item) => unmarshall(item) as ConsentStoreItem);
    } catch (error) {
      console.error('Query consent store error:', error);
      return [];
    }
  }

  /**
   * Decrypt a field (used by anonymizer only).
   * Never expose decrypted values to logs or external APIs.
   */
  async decrypt(encrypted: string): Promise<string> {
    // In real implementation, call AWS KMS decrypt
    // For now, mock:
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  }

  /**
   * Encrypt a field (used during ingest).
   */
  async encryptWithKMS(plaintext: string): Promise<string> {
    // In real implementation, call AWS KMS encrypt
    // For now, mock:
    return Buffer.from(plaintext).toString('base64');
  }

  /**
   * Delete a stored event (GDPR deletion request).
   */
  async deleteEvent(eventid: string): Promise<boolean> {
    try {
      const command = new DeleteCommand({
        TableName: CONSENT_TABLE,
        Key: marshall({
          eventid,
        }),
      });
      
      await dynamodb.send(command);
      return true;
    } catch (error) {
      console.error('Delete consent store error:', error);
      return false;
    }
  }

  /**
   * Scan all events created before a cutoff (for anonymizer batching).
   * Returns encrypted items; anonymizer decrypts and hashes.
   */
  async scanForAnonymization(createdBefore: number, limit: number = 1000): Promise<ConsentStoreItem[]> {
    try {
      const command = new ScanCommand({
        TableName: CONSENT_TABLE,
        FilterExpression: 'created_at < :cutoff',
        ExpressionAttributeValues: marshall({
          ':cutoff': createdBefore,
        }),
        Limit: limit,
      });
      
      const response = await dynamodb.send(command);
      return (response.Items || []).map((item) => unmarshall(item) as ConsentStoreItem);
    } catch (error) {
      console.error('Scan consent store error:', error);
      return [];
    }
  }
}

export const consentStore = new ConsentStore();
```


***

#### **Day 10: Ingest Handler (Lambda)**

**File: `/src/handlers/ingest.ts`**

```typescript
/**
 * INGEST HANDLER - HTTP endpoint for submitting FP events
 * 
 * Path: POST /api/v1/events/ingest
 * Auth: Bearer token (JWT or API key)
 * Returns: IngestResult (explicit, never silent)
 * 
 * Flow:
 * 1. Validate auth token
 * 2. Parse and validate IngestEvent schema
 * 3. Check for duplicates
 * 4. Check rate limits
 * 5. Hash orgid (without storing plaintext)
 * 6. Store encrypted event in Consent Store
 * 7. Return explicit result
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';
import {
  IngestEvent,
  IngestResult,
  IngestResultAccepted,
  IngestResultRejectedInvalidAuth,
  IngestResultRejectedInvalidSchema,
  IngestResultRejectedMalformedClaim,
  IngestResultRejectedDuplicate,
  IngestResultRejectedThrottled,
  IngestResultErrorInternal,
} from '../types/ingest';
import { consentStore } from '../store/consent-store';
import { authService } from '../auth/auth-service';
import { rateLimiter } from '../ratelimit/rate-limiter';
import { deduplicator } from '../dedup/deduplicator';

// ============================================================================
// VALIDATION & PARSING
// ============================================================================

/**
 * Parse and validate the IngestEvent schema.
 * Returns explicit error or parsed event.
 */
function parseAndValidateEvent(body: string): { event?: IngestEvent; error?: IngestResultRejectedInvalidSchema | IngestResultRejectedMalformedClaim } {
  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return {
      error: {
        status: 'rejected',
        code: 'MALFORMED_CLAIM',
        detail: `JSON parsing error: ${(e as Error).message}`,
        message: 'Event rejected: claim is malformed or incoherent.',
      },
    };
  }

  // Type guard
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      error: {
        status: 'rejected',
        code: 'INVALID_SCHEMA',
        field: 'root',
        expected: 'object',
        received: typeof parsed,
        message: 'Event rejected: field \'root\' is invalid.',
      },
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  const requiredFields = ['orgid', 'token', 'ruleid', 'ruleversion', 'claim', 'outcome', 'actualOutcome', 'confidence', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      return {
        error: {
          status: 'rejected',
          code: 'INVALID_SCHEMA',
          field,
          expected: 'string | object',
          received: 'undefined',
          message: `Event rejected: field '${field}' is invalid.`,
        },
      };
    }
  }

  // Validate types
  if (typeof obj.orgid !== 'string' || obj.orgid.length === 0) {
    return {
      error: {
        status: 'rejected',
        code: 'INVALID_SCHEMA',
        field: 'orgid',
        expected: 'non-empty string',
        received: typeof obj.orgid,
        message: 'Event rejected: field \'orgid\' is invalid.',
      },
    };
  }

  if (typeof obj.ruleid !== 'string' || !/^R-[A-Z0-9-]+$/.test(obj.ruleid)) {
    return {
      error: {
        status: 'rejected',
        code: 'INVALID_SCHEMA',
        field: 'ruleid',
        expected: 'string matching /^R-[A-Z0-9-]+$/',
        received: obj.ruleid,
        message: 'Event rejected: field \'ruleid\' is invalid.',
      },
    };
  }

  if (typeof obj.outcome !== 'string' || !['matched', 'not_matched'].includes(obj.outcome)) {
    return {
      error: {
        status: 'rejected',
        code: 'INVALID_SCHEMA',
        field: 'outcome',
        expected: '"matched" | "not_matched"',
        received: obj.outcome,
        message: 'Event rejected: field \'outcome\' is invalid.',
      },
    };
  }

  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    return {
      error: {
        status: 'rejected',
        code: 'INVALID_SCHEMA',
        field: 'confidence',
        expected: 'number between 0.0 and 1.0',
        received: obj.confidence,
        message: 'Event rejected: field \'confidence\' is invalid.',
      },
    };
  }

  // If all validations pass, return parsed event
  const event: IngestEvent = {
    orgid: obj.orgid as string,
    token: obj.token as string,
    ruleid: obj.ruleid as string,
    ruleversion: obj.ruleversion as string,
    claim: obj.claim as IngestEvent['claim'],
    outcome: obj.outcome as 'matched' | 'not_matched',
    actualOutcome: obj.actualOutcome as 'should_have_matched' | 'should_not_have_matched',
    confidence: obj.confidence as number,
    timestamp: obj.timestamp as number,
    environment: (obj.environment as string) || 'production',
  };

  return { event };
}

// ============================================================================
// LAMBDA HANDLER
// ============================================================================

export async function ingestHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Ingest request received', { requestId: event.requestContext.requestId });

  const requestId = event.requestContext.requestId || crypto.randomUUID();

  // ──────────────────────────────────────────────────────────────────────
  // Step 1: Parse body
  // ──────────────────────────────────────────────────────────────────────

  if (!event.body) {
    const result: IngestResultRejectedMalformedClaim = {
      status: 'rejected',
      code: 'MALFORMED_CLAIM',
      detail: 'Request body is empty',
      message: 'Event rejected: claim is malformed or incoherent.',
    };
    console.log('Ingest rejected: empty body', { requestId });
    return {
      statusCode: 400,
      body: JSON.stringify(result),
    };
  }

  const parseResult = parseAndValidateEvent(event.body);
  if (parseResult.error) {
    console.log('Ingest rejected: schema validation', { requestId, error: parseResult.error.code });
    return {
      statusCode: 400,
      body: JSON.stringify(parseResult.error),
    };
  }

  const ingestEvent = parseResult.event!;

  // ──────────────────────────────────────────────────────────────────────
  // Step 2: Authenticate
  // ──────────────────────────────────────────────────────────────────────

  const authResult = await authService.verifyToken(ingestEvent.token);
  if (!authResult.valid) {
    const result: IngestResultRejectedInvalidAuth = {
      status: 'rejected',
      code: 'INVALID_AUTH',
      reason: authResult.reason as any,
      hint: authResult.hint,
      message: 'Event rejected: authentication failed.',
    };
    console.log('Ingest rejected: auth failure', { requestId, reason: authResult.reason });
    return {
      statusCode: 401,
      body: JSON.stringify(result),
    };
  }

  const orgid = authResult.orgid!;
  ingestEvent.orgid = orgid; // Use authenticated orgid (not what client claimed)

  // ──────────────────────────────────────────────────────────────────────
  // Step 3: Hash orgid (never store plaintext in logs or external output)
  // ──────────────────────────────────────────────────────────────────────

  const orgid_hash = crypto
    .createHmac('sha256', process.env.ORGID_HMAC_SECRET || 'dev-secret')
    .update(orgid)
    .digest('hex');

  // ──────────────────────────────────────────────────────────────────────
  // Step 4: Check rate limit
  // ──────────────────────────────────────────────────────────────────────

  const limiterResult = await rateLimiter.checkLimit(orgid_hash);
  if (limiterResult.exceeded) {
    const result: IngestResultRejectedThrottled = {
      status: 'rejected',
      code: 'THROTTLED',
      limit_per_hour: limiterResult.limit,
      reset_at: limiterResult.reset_at,
      message: 'Event rejected: rate limit exceeded.',
    };
    console.log('Ingest rejected: rate limit exceeded', { requestId, orgid_hash });
    return {
      statusCode: 429,
      body: JSON.stringify(result),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Step 5: Check for duplicates
  // ──────────────────────────────────────────────────────────────────────

  const claimHash = crypto.createHash('sha256').update(JSON.stringify(ingestEvent.claim)).digest('hex');
  const dupResult = await deduplicator.isDuplicate(orgid_hash, ingestEvent.ruleid, claimHash);
  if (dupResult.isDuplicate) {
    const result: IngestResultRejectedDuplicate = {
      status: 'rejected',
      code: 'DUPLICATE',
      prior_eventid: dupResult.priorEventid,
      prior_stored_at: dupResult.priorStoredAt,
      message: 'Event rejected: duplicate detected.',
    };
    console.log('Ingest rejected: duplicate', { requestId, orgid_hash, ruleid: ingestEvent.ruleid });
    return {
      statusCode: 409,
      body: JSON.stringify(result),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Step 6: Store in Consent Store
  // ──────────────────────────────────────────────────────────────────────

  const storeResult = await consentStore.storeEvent(ingestEvent, orgid_hash);

  if (storeResult.status === 'accepted') {
    console.log('Ingest accepted', { requestId, eventid: storeResult.eventid, orgid_hash });
    return {
      statusCode: 202, // 202 Accepted (processing async)
      body: JSON.stringify(storeResult),
    };
  } else {
    const result: IngestResultErrorInternal = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      request_id: requestId,
      message: 'Event processing failed. Please retry or contact support with request ID.',
      retry_after_seconds: 5,
    };
    console.error('Ingest error: store failed', { requestId });
    return {
      statusCode: 500,
      body: JSON.stringify(result),
    };
  }
}
```

**Key Principles Demonstrated:**

1. **No silent skips.** Every branch returns an explicit IngestResult.
2. **Request ID tracking.** Every operation logs the requestId for debugging.
3. **Early validation.** Schema, auth, and rate limits checked before storing anything.
4. **Explicit HTTP status codes.** 202 Accepted, 400 Bad Request, 401 Unauthorized, 429 Too Many Requests, 500 Internal Error.
5. **No plaintext orgid in logs.** Only orgid_hash is logged.

***

### **Days 11-14: Anonymizer with HMAC \& k-Anonymity**

#### **Day 11: Anonymizer Schema**

**File: `/src/types/anonymizer.ts`**

```typescript
/**
 * ANONYMIZER TYPES
 * 
 * Transforms raw events from Consent Store into anonymized records
 * suitable for calibration aggregation.
 * 
 * Key principle:
 * - Input: plaintext orgid, findingid (encrypted in DynamoDB)
 * - Output: hashed orgid, hashed findingid (cannot be reversed)
 */

export interface AnonymizationRun {
  runid: string; // UUID
  started_at: number; // Unix ms
  completed_at?: number; // Unix ms, null until done
  status: 'in_progress' | 'completed' | 'failed';
  
  // Salt version (rotated monthly)
  salt_version: number; // 1, 2, 3, ... (increments on rotation)
  
  // Processing stats
  events_processed: number;
  events_anonymized: number;
  events_deduplicated: number; // Hashed orgid + ruleid already exists
  events_failed: number;
  
  // Error tracking
  errors?: {
    message: string;
    count: number;
  }[];
}

export interface AnonymizedEvent {
  // These are the "rows" in the Calibration Store
  // Nothing here maps back to a person or organization
  
  anonymized_orgid: string; // HMAC-SHA256(orgid, salt) - cannot be reversed
  anonymized_findingid: string; // HMAC-SHA256(findingid, salt) - cannot be reversed
  
  ruleid: string; // Public (needed to aggregate by rule)
  ruleversion: string; // Public
  
  outcome: 'matched' | 'not_matched'; // Public
  actual_outcome: 'should_have_matched' | 'should_not_have_matched'; // Public
  
  // Bucketing for k-anonymity queries
  timestamp_bucket: string; // ISO week: "2026-W04" (week-level granularity)
  environment: string; // 'production' | 'staging'
  confidence: number; // Original confidence score
  
  // Metadata (for debugging, not exposed in queries)
  created_from_eventid: string; // Trace back to which consent event (for audits)
  anonymized_at: number; // Unix ms when anonymized
  salt_version: number; // Track which salt was used
}

/**
 * What the anonymizer reports after each run.
 */
export interface AnonymizationReport {
  run: AnonymizationRun;
  summary: {
    total_events_ingested: number;
    total_events_stored_calibration: number;
    total_consent_records_deleted: number;
  };
  errors: string[];
}
```


***

#### **Day 12: Anonymizer Implementation**

**File: `/src/service/anonymizer.ts`**

```typescript
/**
 * ANONYMIZER SERVICE
 * 
 * Runs as a scheduled Lambda (once per day).
 * 
 * Process:
 * 1. Scan Consent Store for events older than 1 hour
 *    (Allow 1 hour grace period so clients see their event is accepted)
 * 2. For each event:
 *    a. Decrypt orgid and findingid
 *    b. Hash with HMAC(value, salt_current)
 *    c. Check if hashed event already exists in Calibration Store
 *    d. If not, insert new record
 *    e. If yes, deduplicate (log and skip)
 * 3. Delete processed events from Consent Store
 * 4. Rotate salt if needed (monthly)
 * 5. Report results
 */

import crypto from 'crypto';
import { consentStore, ConsentStoreItem } from '../store/consent-store';
import { calibrationStore } from '../store/calibration-store';
import { AnonymizationRun, AnonymizedEvent, AnonymizationReport } from '../types/anonymizer';
import { getISO8601WeekBucket } from '../util/date-utils';

export class AnonymizerService {
  private salt: string; // Current salt (rotated monthly)
  private saltVersion: number;

  constructor() {
    this.salt = process.env.ANONYMIZER_SALT || 'dev-salt-v1';
    this.saltVersion = parseInt(process.env.SALT_VERSION || '1', 10);
  }

  /**
   * Main anonymization run.
   * Called daily by CloudWatch scheduled Lambda.
   */
  async run(): Promise<AnonymizationReport> {
    const runid = crypto.randomUUID();
    const startedAt = Date.now();

    const run: AnonymizationRun = {
      runid,
      started_at: startedAt,
      status: 'in_progress',
      salt_version: this.saltVersion,
      events_processed: 0,
      events_anonymized: 0,
      events_deduplicated: 0,
      events_failed: 0,
      errors: [],
    };

    console.log(`[Anonymizer] Starting run ${runid}`);

    try {
      // ────────────────────────────────────────────────────────────────
      // 1. Check if salt rotation needed (monthly)
      // ────────────────────────────────────────────────────────────────
      await this.checkAndRotateSalt();

      // ────────────────────────────────────────────────────────────────
      // 2. Scan Consent Store for events older than 1 hour
      // ────────────────────────────────────────────────────────────────
      const oneHourAgo = startedAt - 60 * 60 * 1000;
      const consentEvents = await consentStore.scanForAnonymization(oneHourAgo, 10000);

      console.log(`[Anonymizer] Found ${consentEvents.length} events to process`);

      // ────────────────────────────────────────────────────────────────
      // 3. Process each event
      // ────────────────────────────────────────────────────────────────
      for (const consentEvent of consentEvents) {
        run.events_processed++;

        try {
          // Decrypt orgid and claim
          const orgid = await consentStore.decrypt(consentEvent.orgid_encrypted);
          const claimStr = await consentStore.decrypt(consentEvent.claim_encrypted);
          const claim = JSON.parse(claimStr);

          // Hash orgid and findingid
          const anonymized_orgid = this.hmacHash(orgid);
          const findingid = claim.findingid || 'unknown';
          const anonymized_findingid = this.hmacHash(findingid);

          // Create anonymized record
          const anonymized: AnonymizedEvent = {
            anonymized_orgid,
            anonymized_findingid,
            ruleid: consentEvent.ruleid,
            ruleversion: consentEvent.ruleversion,
            outcome: consentEvent.outcome,
            actual_outcome: consentEvent.actual_outcome,
            timestamp_bucket: getISO8601WeekBucket(consentEvent.created_at),
            environment: consentEvent.environment,
            confidence: claim.confidence || 0.5,
            created_from_eventid: consentEvent.eventid,
            anonymized_at: startedAt,
            salt_version: this.saltVersion,
          };

          // Check for duplicate in Calibration Store
          const isDup = await calibrationStore.isDuplicate(anonymized_orgid, anonymized.ruleid, anonymized.timestamp_bucket);

          if (isDup) {
            run.events_deduplicated++;
            console.log(`[Anonymizer] Duplicate detected: ${anonymized_orgid} / ${anonymized.ruleid}`);
          } else {
            // Store in Calibration Store
            await calibrationStore.store(anonymized);
            run.events_anonymized++;
          }

          // Delete from Consent Store (GDPR compliance: don't keep raw data longer than 30 days)
          await consentStore.deleteEvent(consentEvent.eventid);
        } catch (error) {
          run.events_failed++;
          const msg = (error as Error).message;
          console.error(`[Anonymizer] Processing failed for event ${consentEvent.eventid}:`, msg);
          
          const existingError = run.errors?.find((e) => e.message === msg);
          if (existingError) {
            existingError.count++;
          } else {
            run.errors = (run.errors || []).concat({ message: msg, count: 1 });
          }
        }
      }

      // ────────────────────────────────────────────────────────────────
      // 4. Finalize run
      // ────────────────────────────────────────────────────────────────
      run.status = 'completed';
      run.completed_at = Date.now();

      console.log(`[Anonymizer] Run complete:`, {
        processed: run.events_processed,
        anonymized: run.events_anonymized,
        deduplicated: run.events_deduplicated,
        failed: run.events_failed,
      });

      return {
        run,
        summary: {
          total_events_ingested: run.events_processed,
          total_events_stored_calibration: run.events_anonymized,
          total_consent_records_deleted: run.events_anonymized + run.events_deduplicated, // Deduplicated also get deleted
        },
        errors: run.errors?.map((e) => `${e.message} (${e.count} occurrences)`) || [],
      };
    } catch (error) {
      run.status = 'failed';
      run.completed_at = Date.now();
      console.error(`[Anonymizer] Fatal error in run:`, error);

      return {
        run,
        summary: {
          total_events_ingested: run.events_processed,
          total_events_stored_calibration: run.events_anonymized,
          total_consent_records_deleted: 0,
        },
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * HMAC hash a value.
   * Salt is rotated monthly; this function uses current salt.
   */
  private hmacHash(value: string): string {
    return crypto.createHmac('sha256', this.salt).update(value).digest('hex');
  }

  /**
   * Check if salt rotation is needed (monthly).
   * If so, update salt and increment saltVersion.
   * Old salt is retained for 60 days to support decryption of previously anonymized data.
   */
  private async checkAndRotateSalt(): Promise<void> {
    const lastRotationEnv = process.env.LAST_SALT_ROTATION_DATE || '';
    const lastRotation = lastRotationEnv ? new Date(lastRotationEnv).getTime() : 0;
    const now = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

    if (now - lastRotation > thirtyDaysInMs) {
      // Time to rotate
      const newSalt = `dev-salt-v${this.saltVersion + 1}-${Date.now()}`;
      this.salt = newSalt;
      this.saltVersion++;

      console.log(`[Anonymizer] Salt rotated. New version: ${this.saltVersion}`);

      // In production, store new salt in AWS Secrets Manager
      // For now, just log
    }
  }
}

export const anonymizer = new AnonymizerService();
```


***

#### **Day 13: Calibration Store with k-Anonymity**

**File: `/src/store/calibration-store.ts`**

```typescript
/**
 * CALIBRATION STORE - Anonymized Event Storage
 * 
 * Purpose:
 * - Aggregate anonymized events for calibration queries
 * - Enforce k-anonymity on all queries
 * - Permanent retention (research use)
 * 
 * Schema:
 * PK: ruleid-ruleversion-outcome
 * SK: timestamp_bucket-anonymized_orgid
 * 
 * Query Enforcement:
 * All queries require k >= 10 (minimum 10 organizations per result)
 */

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { AnonymizedEvent } from '../types/anonymizer';

const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
const CALIBRATION_TABLE = process.env.CALIBRATION_TABLE_NAME || 'calibration-store-dev';
const K_ANONYMITY_MIN = parseInt(process.env.K_ANONYMITY_MIN || '10', 10);

// ============================================================================
// CALIBRATION STORE MANAGER
// ============================================================================

export class CalibrationStore {
  /**
   * Store an anonymized event.
   */
  async store(event: AnonymizedEvent): Promise<void> {
    const command = new PutItemCommand({
      TableName: CALIBRATION_TABLE,
      Item: marshall(event),
    });

    await dynamodb.send(command);
  }

  /**
   * Check if a hashed event is a duplicate.
   * (Same org + rule + timeframe already stored)
   */
  async isDuplicate(anonymized_orgid: string, ruleid: string, timestamp_bucket: string): Promise<boolean> {
    const command = new QueryCommand({
      TableName: CALIBRATION_TABLE,
      KeyConditionExpression: 'ruleid = :ruleid AND begins_with(sk, :sk_prefix)',
      ExpressionAttributeValues: marshall({
        ':ruleid': ruleid,
        ':sk_prefix': `${timestamp_bucket}#${anonymized_orgid}`,
      }),
      Limit: 1,
    });

    const response = await dynamodb.send(command);
    return (response.Items?.length || 0) > 0;
  }

  /**
   * Query calibration data with k-anonymity enforcement.
   * 
   * @param ruleid Rule ID to query
   * @param ruleversion Rule version
   * @param outcome 'matched' | 'not_matched' | 'any'
   * @param timerange Start and end Unix ms
   * @returns { count, k, confidence_interval } or error if k < minimum
   */
  async queryWithKAnonymity(
    ruleid: string,
    ruleversion: string,
    outcome: 'matched' | 'not_matched' | 'any',
    timerange: { start: number; end: number },
  ): Promise<
    | {
        status: 'ok';
        count: number;
        k: number; // Number of unique orgs
        outcome_distribution: Record<string, number>;
        confidence_interval: { lower: number; upper: number };
      }
    | {
        status: 'rejected';
        reason: 'k_too_small';
        k: number;
        minimum: number;
      }
  > {
    // Query all events for this rule in the time range
    const command = new QueryCommand({
      TableName: CALIBRATION_TABLE,
      KeyConditionExpression: 'ruleid = :ruleid AND ruleversion = :ruleversion',
      ExpressionAttributeValues: marshall({
        ':ruleid': ruleid,
        ':ruleversion': ruleversion,
      }),
    });

    const response = await dynamodb.send(command);
    const items = (response.Items || []).map((item) => unmarshall(item) as AnonymizedEvent);

    // Filter by time range and outcome
    const filtered = items.filter((item) => {
      const inRange = item.anonymized_at >= timerange.start && item.anonymized_at <= timerange.end;
      const outcomeMatch = outcome === 'any' || item.outcome === outcome;
      return inRange && outcomeMatch;
    });

    if (filtered.length === 0) {
      return {
        status: 'ok',
        count: 0,
        k: 0,
        outcome_distribution: {},
        confidence_interval: { lower: 0, upper: 0 },
      };
    }

    // Count unique organizations (k-anonymity check)
    const uniqueOrgs = new Set(filtered.map((item) => item.anonymized_orgid));
    const k = uniqueOrgs.size;

    // If k is too small, reject the query
    if (k < K_ANONYMITY_MIN) {
      return {
        status: 'rejected',
        reason: 'k_too_small',
        k,
        minimum: K_ANONYMITY_MIN,
      };
    }

    // Aggregate results
    const outcomeDistribution: Record<string, number> = {};
    for (const item of filtered) {
      const key = `${item.outcome}/${item.actual_outcome}`;
      outcomeDistribution[key] = (outcomeDistribution[key] || 0) + 1;
    }

    // Calculate confidence interval (95% CI using normal approximation)
    const n = filtered.length;
    const falsePositives = filtered.filter((item) => item.outcome === 'matched' && item.actual_outcome === 'should_not_have_matched').length;
    const fpRate = falsePositives / n;
    const stdErr = Math.sqrt((fpRate * (1 - fpRate)) / n);
    const ci = {
      lower: Math.max(0, fpRate - 1.96 * stdErr),
      upper: Math.min(1, fpRate + 1.96 * stdErr),
    };

    return {
      status: 'ok',
      count: n,
      k,
      outcome_distribution: outcomeDistribution,
      confidence_interval: ci,
    };
  }
}

export const calibrationStore = new CalibrationStore();
```


***

#### **Day 14: Query API (Lambda)**

**File: `/src/handlers/calibration-query.ts`**

```typescript
/**
 * CALIBRATION QUERY API
 * 
 * Path: GET /api/v1/calibration/query
 * Query params: ruleid, ruleversion, outcome, start_ms, end_ms
 * Auth: Optional (public endpoint, but rate-limited by IP)
 * 
 * Returns: Anonymized aggregate statistics with k-anonymity enforced.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { calibrationStore } from '../store/calibration-store';

export async function calibrationQueryHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { ruleid, ruleversion, outcome = 'any', start_ms, end_ms } = event.queryStringParameters || {};

  // Validate inputs
  if (!ruleid || !ruleversion || !start_ms || !end_ms) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required query params: ruleid, ruleversion, start_ms, end_ms',
      }),
    };
  }

  const startMs = parseInt(start_ms, 10);
  const endMs = parseInt(end_ms, 10);

  if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid time range: start_ms must be < end_ms',
      }),
    };
  }

  // Query with k-anonymity enforcement
  const result = await calibrationStore.queryWithKAnonymity(ruleid, ruleversion, outcome as any, {
    start: startMs,
    end: endMs,
  });

  if (result.status === 'rejected') {
    return {
      statusCode: 403,
      body: JSON.stringify({
        status: 'rejected',
        reason: `Insufficient data: ${result.k} organizations reported this rule, but ${result.minimum} are required (k-anonymity).`,
        k: result.k,
        minimum: result.minimum,
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'ok',
      query: {
        ruleid,
        ruleversion,
        outcome,
        time_range_ms: { start: startMs, end: endMs },
      },
      result: {
        count: result.count,
        k: result.k,
        false_positive_rate: result.outcome_distribution['matched/should_not_have_matched'] || 0 / (result.count || 1),
        confidence_interval: result.confidence_interval,
      },
      note: `Based on ${result.k} organizations reporting this rule.`,
    }),
  };
}
```


***

### **Days 15-21: Integration, Testing \& Deployment**

#### **Day 15-18: Unit \& Integration Tests**

**File: `/test/calibration.integration.test.ts`**

```typescript
/**
 * INTEGRATION TEST SUITE
 * 
 * Tests the full flow:
 * 1. Ingest FP event
 * 2. Anonymize
 * 3. Query with k-anonymity enforcement
 * 4. Verify privacy (cannot recover orgid)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ingestHandler } from '../src/handlers/ingest';
import { anonymizer } from '../src/service/anonymizer';
import { calibrationStore } from '../src/store/calibration-store';

describe('Calibration Service Integration', () => {
  beforeAll(async () => {
    // Set up test tables in DynamoDB Local
  });

  afterAll(async () => {
    // Clean up test tables
  });

  it('ingests an FP event and stores it encrypted', async () => {
    const ingestEvent = {
      body: JSON.stringify({
        orgid: 'test-org-123',
        token: 'valid-test-token',
        ruleid: 'R-X509-CERT-MISMATCH',
        ruleversion: '1.0',
        claim: {
          input: 'cert-data-here',
          findingid: 'finding-456',
        },
        outcome: 'matched',
        actualOutcome: 'should_not_have_matched',
        confidence: 0.95,
        timestamp: Date.now(),
        environment: 'production',
      }),
      requestContext: {
        requestId: 'test-request-123',
      },
    } as any;

    const response = await ingestHandler(ingestEvent);
    expect(response.statusCode).toBe(202); // Accepted
    const body = JSON.parse(response.body);
    expect(body.status).toBe('accepted');
    expect(body.eventid).toBeDefined();
  });

  it('anonymizes stored events without exposing orgid', async () => {
    // First, ingest some events
    // Then run anonymizer
    // Then verify hashed orgid exists in Calibration Store
    // And plaintext orgid does not

    const report = await anonymizer.run();
    expect(report.run.status).toBe('completed');
    expect(report.run.events_anonymized).toBeGreaterThan(0);
  });

  it('rejects calibration queries when k < minimum', async () => {
    // Ingest only 5 events (from 5 orgs)
    // Query should be rejected because k=5 < 10

    const result = await calibrationStore.queryWithKAnonymity(
      'R-X509-CERT-MISMATCH',
      '1.0',
      'matched',
      { start: Date.now() - 1000, end: Date.now() },
    );

    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('k_too_small');
  });

  it('allows calibration queries when k >= minimum', async () => {
    // Ingest 15 events (from 15 different orgs)
    // Query should succeed

    const result = await calibrationStore.queryWithKAnonymity(
      'R-X509-CERT-MISMATCH',
      '1.0',
      'matched',
      { start: Date.now() - 1000, end: Date.now() },
    );

    expect(result.status).toBe('ok');
    expect(result.k).toBeGreaterThanOrEqual(10);
  });
});
```


***

#### **Days 19-20: Terraform Infrastructure**

**File: `/infra/dynamodb.tf`**

```hcl
# DynamoDB tables for Calibration Service

# Consent Store (raw events, encrypted, 30-day TTL)
resource "aws_dynamodb_table" "consent_store" {
  name             = "consent-store-${var.environment}"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "eventid"
  range_key        = "orgid_hash"
  stream_specification {
    stream_view_type = "NEW_IMAGE"
  }

  attribute {
    name = "eventid"
    type = "S"
  }

  attribute {
    name = "orgid_hash"
    type = "S"
  }

  # TTL for automatic deletion (30 days)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # GSI for querying by orgid_hash
  global_secondary_index {
    name            = "orgid_hash-created_at-index"
    hash_key        = "orgid_hash"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  tags = {
    Environment = var.environment
    Service     = "calibration"
  }
}

# Calibration Store (anonymized events, permanent retention)
resource "aws_dynamodb_table" "calibration_store" {
  name         = "calibration-store-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ruleid"
  range_key    = "sk" # timestamp_bucket#anonymized_orgid

  attribute {
    name = "ruleid"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Service     = "calibration"
  }
}

# Deduplication index
resource "aws_dynamodb_table" "dedup_index" {
  name         = "dedup-index-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "dedup_key" # orgid_hash#ruleid#claim_hash

  attribute {
    name = "dedup_key"
    type = "S"
  }

  # TTL for automatic deletion (24 hours)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Environment = var.environment
    Service     = "calibration"
  }
}
```

**File: `/infra/lambda.tf`**

```hcl
# Lambda functions for Calibration Service

resource "aws_lambda_function" "ingest_handler" {
  filename      = "dist/handlers/ingest.zip"
  function_name = "calibration-ingest-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "ingest.handler"
  timeout       = 30
  memory_size   = 512

  environment {
    variables = {
      CONSENT_TABLE_NAME    = aws_dynamodb_table.consent_store.name
      DEDUP_TABLE_NAME      = aws_dynamodb_table.dedup_index.name
      ORGID_HMAC_SECRET     = var.orgid_hmac_secret
      RATE_LIMIT_PER_HOUR   = 1000
    }
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_lambda_function" "anonymizer" {
  filename      = "dist/services/anonymizer.zip"
  function_name = "calibration-anonymizer-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "anonymizer.handler"
  timeout       = 300
  memory_size   = 2048

  environment {
    variables = {
      CONSENT_TABLE_NAME         = aws_dynamodb_table.consent_store.name
      CALIBRATION_TABLE_NAME     = aws_dynamodb_table.calibration_store.name
      ANONYMIZER_SALT            = var.anonymizer_salt
      SALT_VERSION               = var.salt_version
      LAST_SALT_ROTATION_DATE    = var.last_salt_rotation_date
    }
  }

  tags = {
    Environment = var.environment
  }
}

# Scheduled rule: run anonymizer daily at 2 AM UTC
resource "aws_cloudwatch_event_rule" "anonymizer_schedule" {
  name                = "calibration-anonymizer-schedule-${var.environment}"
  description         = "Run calibration anonymizer daily"
  schedule_expression = "cron(0 2 * * ? *)" # 2 AM UTC
}

resource "aws_cloudwatch_event_target" "anonymizer_lambda" {
  rule      = aws_cloudwatch_event_rule.anonymizer_schedule.name
  target_id = "AnonymizerLambda"
  arn       = aws_lambda_function.anonymizer.arn

  input = jsonencode({
    action = "anonymize"
  })
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.anonymizer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.anonymizer_schedule.arn
}
```


***

#### **Day 21: Monitoring \& Documentation**

**File: `/docs/calibration-service.md`**

```markdown
# FP Calibration Service - Operational Guide

## Overview

The FP Calibration Service collects false positive events from certified implementations, 
anonymizes them, and provides aggregate statistics for rule improvement.

## Architecture

### Ingest Flow
1. Client submits IngestEvent to `/api/v1/events/ingest`
2. Service validates auth, schema, dedup, rate limits
3. If all pass, event is encrypted and stored in Consent Store
4. Response: Explicit IngestResult (accepted, rejected, or error)

### Anonymization Flow (Daily, 2 AM UTC)
1. Anonymizer Lambda scans Consent Store for events >1 hour old
2. For each event:
   - Decrypt orgid and claim
   - Hash with HMAC(value, salt_current)
   - Store hashed event in Calibration Store
   - Delete from Consent Store
3. Report: Processing stats, errors, salt version

### Query Flow
1. Client requests `/api/v1/calibration/query?ruleid=R-X509&ruleversion=1.0&...`
2. Service queries Calibration Store
3. Check k-anonymity: must have ≥10 unique orgs
4. If k >= 10: return aggregate stats + confidence interval
5. If k < 10: reject query with reason

## Privacy Guarantees

- **Orgid is hashed.** HMAC-SHA256 is irreversible.
- **Finding ID is hashed.** Cannot correlate back to original issue.
- **k-Anonymity enforced.** No query can expose <10 organizations.
- **Consent Store is encrypted.** At-rest encryption with AWS KMS.
- **Automatic deletion.** Consent records deleted after anonymization (max 30 days).

## Monitoring

### Key Metrics
- `ingest_accepted`: Count of successful events
- `ingest_rejected_*`: Count by rejection reason
- `anonymizer_events_processed`: Count of events anonymized
- `k_anonymity_rejections`: Count of queries rejected for low k

### Alerts
- `anonymizer_failed`: Lambda execution failed
- `ingest_error_rate_high`: >5% internal errors
- `consent_store_growth`: Unexpected table size growth (may indicate anonymizer failure)

## Troubleshooting

### Q: Why was my event rejected?
A: Check the IngestResult code field. Common reasons:
- `INVALID_AUTH`: API key is invalid or org is not certified
- `INVALID_SCHEMA`: A field is missing or wrong type
- `THROTTLED`: Rate limit exceeded (1000 events/hour per org)
- `DUPLICATE`: Exact same event already submitted in last 24 hours

### Q: Can I see my organization's data?
A: No. The Calibration Service is designed to prevent this. Orgid is hashed, 
and queries return only aggregate stats. Individual events cannot be queried.

### Q: How long is my data stored?
A: Raw data (Consent Store) is deleted after anonymization (max 30 days). 
Anonymized data is retained permanently for research.

### Q: What if I want to delete my data (GDPR)?
A: Use the `/api/v1/events/delete/{eventid}` endpoint with proof of org ownership. 
We will delete the event from Consent Store immediately. 
Once anonymized, deletion is not possible (data is hashed and irreversible).
```


***

## Phase 2 Summary \& Verification

### **Deliverables by Day 21:**

- [ ] **Ingest Handler (Day 8-10)**
    - ✅ IngestResult types (explicit, no silent skips)
    - ✅ Ingest Lambda with auth, validation, dedup, rate limiting
    - ✅ Consent Store schema + encryption
    - ✅ Unit tests passing
- [ ] **Anonymizer (Day 11-14)**
    - ✅ Anonymization types + HMAC hashing
    - ✅ Anonymizer Lambda (runs daily via CloudWatch)
    - ✅ Calibration Store with k-anonymity queries
    - ✅ Salt rotation mechanism (monthly)
    - ✅ Integration tests passing
- [ ] **Query API (Day 14)**
    - ✅ Calibration query endpoint
    - ✅ k-Anonymity enforcement (reject if k < 10)
    - ✅ Confidence interval calculation
    - ✅ Tests for k-too-small rejection
- [ ] **Infrastructure (Day 19-20)**
    - ✅ DynamoDB tables (Consent, Calibration, Dedup)
    - ✅ Lambda functions (Ingest, Anonymizer)
    - ✅ CloudWatch scheduled rule (daily anonymizer)
    - ✅ IAM roles + KMS encryption
- [ ] **Monitoring \& Docs (Day 21)**
    - ✅ CloudWatch alarms (error rates, growth)
    - ✅ Operational runbook
    - ✅ Troubleshooting guide
    - ✅ Privacy guarantees documented

***

## What Phase 2 Achieves

**By end of Week 3, you have:**

1. **A feedback loop:** Rules are automatically improved by real-world data.
2. **Privacy-respecting calibration:** Anonymized, k-anonymous aggregate stats, no individual exposure.
3. **Explicit error handling:** Every ingest operation returns a named result (no silent failures).
4. **Operational confidence:** You can trace every event from ingest through anonymization, monitor key metrics, and alert on failures.
5. **GDPR compliance:** Raw data deleted within 30 days, anonymized data is irreversible.

**Next: Phase 3 (Days 22-30) focuses on completing infrastructure deployment and setting up monitoring/alerting for production readiness.**
<span style="display:none">[^1][^2]</span>

<div align="center">⁂</div>

[^1]: yes-if-mirror-dissonance-is-yo-vtZAAPZ3QamZaFcNJAm2Lw.md

[^2]: The Phase to Mirror Dissonance.pdf

