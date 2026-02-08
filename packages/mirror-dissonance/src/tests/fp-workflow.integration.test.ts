/**
 * Integration Test 2 — FP Workflow End-to-End
 *
 * Validates the full false-positive lifecycle against LocalStack DynamoDB:
 *   1. Record a blocking violation (outcome=block, isFalsePositive=false)
 *   2. Mark that event as FP → verify isFalsePositive flips to true
 *   3. Query window → verify FPR = FP / (TP + FP - pending)
 *   4. Circuit breaker: 10 blocks in one hour → isCircuitBroken = true
 *   5. Degraded mode: DynamoDB unreachable → fail-closed behavior
 *
 * Prerequisites:
 *   docker run -d --name localstack -p 4566:4566 localstack/localstack
 *   export AWS_ENDPOINT=http://localhost:4566
 *
 * Run:
 *   pnpm test --testPathPattern=fp-workflow.integration
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { AwsFPStore, FPStoreError } from '../adapters/aws/fp-store.js';
import { AwsBlockCounter } from '../adapters/aws/block-counter.js';
import { BlockCounterError } from '../adapters/errors.js';
import type { FPEvent, CloudConfig } from '../adapters/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENDPOINT =
  process.env.AWS_ENDPOINT ||
  process.env.LOCALSTACK_ENDPOINT ||
  'http://localhost:4566';

const CREDENTIALS = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
};

const REGION = 'us-east-1';

const FP_TABLE = `phase-mirror-fp-events-test-${Date.now()}`;
const BLOCK_TABLE = `phase-mirror-block-counter-test-${Date.now()}`;

// ---------------------------------------------------------------------------
// DynamoDB table schemas (mirrors production)
// ---------------------------------------------------------------------------

const FP_TABLE_SCHEMA = {
  TableName: FP_TABLE,
  KeySchema: [
    { AttributeName: 'pk', KeyType: 'HASH' as const },
    { AttributeName: 'sk', KeyType: 'RANGE' as const },
  ],
  AttributeDefinitions: [
    { AttributeName: 'pk', AttributeType: 'S' as const },
    { AttributeName: 'sk', AttributeType: 'S' as const },
    { AttributeName: 'gsi1pk', AttributeType: 'S' as const },
    { AttributeName: 'gsi1sk', AttributeType: 'S' as const },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'FindingIndex',
      KeySchema: [
        { AttributeName: 'gsi1pk', KeyType: 'HASH' as const },
        { AttributeName: 'gsi1sk', KeyType: 'RANGE' as const },
      ],
      Projection: { ProjectionType: 'ALL' as const },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST' as const,
};

const BLOCK_TABLE_SCHEMA = {
  TableName: BLOCK_TABLE,
  KeySchema: [
    { AttributeName: 'bucketKey', KeyType: 'HASH' as const },
  ],
  AttributeDefinitions: [
    { AttributeName: 'bucketKey', AttributeType: 'S' as const },
  ],
  BillingMode: 'PAY_PER_REQUEST' as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testCounter = 0;

function makeFPEvent(overrides: Partial<FPEvent> = {}): FPEvent {
  testCounter++;
  return {
    eventId: `evt-${testCounter}-${Date.now()}`,
    ruleId: overrides.ruleId || 'rule-secret-leak',
    ruleVersion: '1.0.0',
    findingId: `finding-${testCounter}-${Date.now()}`,
    outcome: 'block',
    isFalsePositive: false,
    timestamp: new Date(),
    context: {
      repo: 'org/test-repo',
      branch: 'main',
      eventType: 'pullrequest' as const,
    },
    ...overrides,
  };
}

/**
 * Inject a LocalStack-pointed DynamoDB client into an AwsFPStore or
 * AwsBlockCounter instance, overriding the private client field.
 * This is the standard integration test pattern used in this codebase.
 */
function injectClient(
  instance: any,
  client: DynamoDBClient,
): void {
  instance.client = client;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FP Workflow Integration (LocalStack DynamoDB)', () => {
  let dynamoClient: DynamoDBClient;
  let fpStore: AwsFPStore;
  let blockCounter: AwsBlockCounter;
  let localStackAvailable = false;

  // ── Setup / teardown ──────────────────────────────────────────────────

  beforeAll(async () => {
    dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT,
      credentials: CREDENTIALS,
    });

    // Health-check: verify LocalStack is reachable
    try {
      await dynamoClient.send(new ListTablesCommand({}));
      localStackAvailable = true;
    } catch {
      console.warn(
        `LocalStack not reachable at ${ENDPOINT} — integration tests will be skipped.`,
      );
      localStackAvailable = false;
      return;
    }

    // Create FP events table (production-equivalent schema)
    try {
      await dynamoClient.send(new CreateTableCommand(FP_TABLE_SCHEMA));
      await waitForTable(FP_TABLE);
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') throw error;
    }

    // Create block counter table
    try {
      await dynamoClient.send(new CreateTableCommand(BLOCK_TABLE_SCHEMA));
      await waitForTable(BLOCK_TABLE);
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') throw error;
    }

    // Create adapter instances pointed at LocalStack
    const config: CloudConfig = {
      provider: 'aws',
      region: REGION,
      fpTableName: FP_TABLE,
      blockCounterTableName: BLOCK_TABLE,
    };

    fpStore = new AwsFPStore(config);
    injectClient(fpStore, dynamoClient);

    blockCounter = new AwsBlockCounter(config);
    // AwsBlockCounter uses DynamoDBDocumentClient wrapping a base client;
    // we need to re-create it from our endpoint-configured client
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const docClient = DynamoDBDocumentClient.from(dynamoClient);
    injectClient(blockCounter, docClient);
  }, 60_000);

  afterAll(async () => {
    if (!localStackAvailable) return;

    // Best-effort cleanup: delete test tables
    try {
      await dynamoClient.send(
        new DeleteTableCommand({ TableName: FP_TABLE }),
      );
    } catch { /* ignore */ }
    try {
      await dynamoClient.send(
        new DeleteTableCommand({ TableName: BLOCK_TABLE }),
      );
    } catch { /* ignore */ }

    dynamoClient.destroy();
  });

  /** Wait for a DynamoDB table to become ACTIVE. */
  async function waitForTable(tableName: string, maxWaitMs = 10_000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        const result = await dynamoClient.send(
          new DescribeTableCommand({ TableName: tableName }),
        );
        if (result.Table?.TableStatus === 'ACTIVE') return;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Table ${tableName} did not become ACTIVE within ${maxWaitMs}ms`);
  }

  /** Skip the current test if LocalStack is not reachable. */
  function requireLocalStack(): void {
    if (!localStackAvailable) {
      console.log('Skipping: LocalStack not available');
    }
  }

  // ── Scenario 1: Record → Mark FP → Verify ──────────────────────────

  it('records a blocking violation and marks it as FP', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    // Step 1: Record a blocking violation
    const event = makeFPEvent({
      ruleId: 'rule-secret-leak',
      outcome: 'block',
      isFalsePositive: false,
    });

    await fpStore.recordEvent(event);

    // Step 2: Verify event appears in window
    const windowBefore = await fpStore.getWindowByCount('rule-secret-leak', 10);
    expect(windowBefore.events.length).toBeGreaterThanOrEqual(1);

    const recorded = windowBefore.events.find(
      (e) => e.eventId === event.eventId,
    );
    expect(recorded).toBeDefined();
    expect(recorded!.outcome).toBe('block');
    expect(recorded!.isFalsePositive).toBe(false);

    // Step 3: Mark as FP (markFalsePositive uses FindingIndex GSI)
    await fpStore.markFalsePositive(event.findingId, 'reviewer@test.org');

    // Step 4: Verify isFalsePositive returns true
    const isFP = await fpStore.isFalsePositive(event.findingId);
    expect(isFP).toBe(true);

    // Also verify via 2-arg form
    const isFP2 = await fpStore.isFalsePositive(
      event.ruleId,
      event.findingId,
    );
    expect(isFP2).toBe(true);
  }, 30_000);

  // ── Scenario 2: FPR calculation in window ───────────────────────────

  it('computes correct FPR in windowed query', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-fpr-calc-${Date.now()}`;

    // Record 5 events: 2 will be marked as FP, 3 remain TP
    const events: FPEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const event = makeFPEvent({
        ruleId,
        outcome: 'block',
        isFalsePositive: false,
        // Stagger timestamps so ordering is deterministic
        timestamp: new Date(Date.now() - (5 - i) * 1000),
      });
      events.push(event);
      await fpStore.recordEvent(event);
    }

    // Mark first 2 events as FP
    await fpStore.markFalsePositive(events[0].findingId, 'reviewer-1');
    await fpStore.markFalsePositive(events[1].findingId, 'reviewer-2');

    // Query window
    const window = await fpStore.getWindowByCount(ruleId, 10);
    expect(window.ruleId).toBe(ruleId);
    expect(window.statistics.total).toBe(5);
    expect(window.statistics.falsePositives).toBe(2);

    // FPR = FP / (total - pending)
    // After marking 2 as FP, those 2 have reviewedBy set.
    // The remaining 3 are "pending" (no reviewedBy).
    // reviewed = total - pending = 5 - 3 = 2
    // observedFPR = 2 / 2 = 1.0 (only reviewed events factor into FPR)
    //
    // Note: If all events counted regardless of review status,
    // FPR would be 2/5 = 0.4. The production formula excludes pending.
    expect(window.statistics.observedFPR).toBeGreaterThan(0);
    // Verify the FPR is consistent with the formula
    const { falsePositives, pending, total } = window.statistics;
    const reviewed = total - pending;
    const expectedFPR = reviewed > 0 ? falsePositives / reviewed : 0;
    expect(window.statistics.observedFPR).toBeCloseTo(expectedFPR, 5);
  }, 30_000);

  // ── Scenario 3: Window query with mixed outcomes ────────────────────

  it('window query handles mixed block/warn/pass outcomes', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-mixed-${Date.now()}`;

    const outcomes: Array<'block' | 'warn' | 'pass'> = [
      'block', 'block', 'warn', 'pass', 'block',
    ];

    for (let i = 0; i < outcomes.length; i++) {
      await fpStore.recordEvent(
        makeFPEvent({
          ruleId,
          outcome: outcomes[i],
          timestamp: new Date(Date.now() - (5 - i) * 1000),
        }),
      );
    }

    const window = await fpStore.getWindowByCount(ruleId, 10);
    expect(window.statistics.total).toBe(5);
    expect(window.events).toHaveLength(5);

    // Verify outcome distribution
    const blocks = window.events.filter((e) => e.outcome === 'block');
    const warns = window.events.filter((e) => e.outcome === 'warn');
    const passes = window.events.filter((e) => e.outcome === 'pass');
    expect(blocks).toHaveLength(3);
    expect(warns).toHaveLength(1);
    expect(passes).toHaveLength(1);
  }, 30_000);

  // ── Scenario 4: Duplicate event prevention ──────────────────────────

  it('rejects duplicate events with ConditionalCheckFailedException', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const event = makeFPEvent();
    await fpStore.recordEvent(event);

    // Second insert with same PK/SK should fail
    await expect(fpStore.recordEvent(event)).rejects.toThrow(FPStoreError);
    await expect(fpStore.recordEvent(event)).rejects.toThrow(/[Dd]uplicate/);
  }, 30_000);

  // ── Scenario 5: markFalsePositive for non-existent event ────────────

  it('throws on markFalsePositive for non-existent finding', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    await expect(
      fpStore.markFalsePositive('non-existent-finding-id', 'reviewer'),
    ).rejects.toThrow(FPStoreError);
    await expect(
      fpStore.markFalsePositive('non-existent-finding-id', 'reviewer'),
    ).rejects.toThrow(/not found/i);
  }, 30_000);

  // ── Scenario 6: Circuit breaker trips at threshold ──────────────────

  it('circuit breaker trips after 10 blocks in one hour', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-cb-${Date.now()}`;
    const orgId = 'org-test-cb';
    const threshold = 10;

    // Circuit should NOT be broken initially
    const brokenBefore = await blockCounter.isCircuitBroken(
      ruleId, orgId, threshold,
    );
    expect(brokenBefore).toBe(false);

    // Increment counter 10 times (simulating 10 block decisions)
    for (let i = 0; i < 10; i++) {
      const count = await blockCounter.increment(ruleId, orgId);
      expect(count).toBe(i + 1);
    }

    // Verify count
    const count = await blockCounter.getCount(ruleId, orgId);
    expect(count).toBe(10);

    // Circuit SHOULD be broken now
    const brokenAfter = await blockCounter.isCircuitBroken(
      ruleId, orgId, threshold,
    );
    expect(brokenAfter).toBe(true);

    // One more increment → still broken
    await blockCounter.increment(ruleId, orgId);
    expect(
      await blockCounter.isCircuitBroken(ruleId, orgId, threshold),
    ).toBe(true);
  }, 30_000);

  // ── Scenario 7: Circuit breaker below threshold ─────────────────────

  it('circuit breaker stays open below threshold', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-cb-low-${Date.now()}`;
    const orgId = 'org-test-low';

    // 5 increments with threshold of 10
    for (let i = 0; i < 5; i++) {
      await blockCounter.increment(ruleId, orgId);
    }

    expect(await blockCounter.getCount(ruleId, orgId)).toBe(5);
    expect(
      await blockCounter.isCircuitBroken(ruleId, orgId, 10),
    ).toBe(false);
  }, 30_000);

  // ── Scenario 8: Degraded mode — DynamoDB unreachable ────────────────

  describe('degraded mode: DynamoDB unreachable', () => {
    let brokenFPStore: AwsFPStore;
    let brokenBlockCounter: AwsBlockCounter;

    beforeAll(async () => {
      // Create adapters pointing to a dead endpoint
      const deadClient = new DynamoDBClient({
        region: REGION,
        endpoint: 'http://localhost:1', // unreachable
        credentials: CREDENTIALS,
        requestHandler: {
          connectionTimeout: 1000,
          requestTimeout: 1000,
        } as any,
      });

      const config: CloudConfig = {
        provider: 'aws',
        region: REGION,
        fpTableName: FP_TABLE,
        blockCounterTableName: BLOCK_TABLE,
      };

      brokenFPStore = new AwsFPStore(config);
      injectClient(brokenFPStore, deadClient);

      brokenBlockCounter = new AwsBlockCounter(config);
      const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
      const deadDocClient = DynamoDBDocumentClient.from(deadClient);
      injectClient(brokenBlockCounter, deadDocClient);
    });

    it('FP store recordEvent throws FPStoreError on DynamoDB failure', async () => {
      requireLocalStack();
      // This test doesn't need LocalStack — it tests failure behavior
      const event = makeFPEvent();

      await expect(brokenFPStore.recordEvent(event)).rejects.toThrow(
        FPStoreError,
      );
    }, 15_000);

    it('FP store getWindowByCount throws FPStoreError on DynamoDB failure', async () => {
      await expect(
        brokenFPStore.getWindowByCount('rule-x', 10),
      ).rejects.toThrow(FPStoreError);
    }, 15_000);

    it('FP store isFalsePositive throws FPStoreError on DynamoDB failure', async () => {
      await expect(
        brokenFPStore.isFalsePositive('finding-x'),
      ).rejects.toThrow(FPStoreError);
    }, 15_000);

    it('block counter increment throws BlockCounterError on DynamoDB failure', async () => {
      await expect(
        brokenBlockCounter.increment('rule-x', 'org-x'),
      ).rejects.toThrow(BlockCounterError);
    }, 15_000);

    it('block counter getCount throws BlockCounterError on DynamoDB failure', async () => {
      await expect(
        brokenBlockCounter.getCount('rule-x', 'org-x'),
      ).rejects.toThrow(BlockCounterError);
    }, 15_000);

    it('block counter isCircuitBroken throws BlockCounterError on DynamoDB failure', async () => {
      await expect(
        brokenBlockCounter.isCircuitBroken('rule-x', 'org-x', 10),
      ).rejects.toThrow(BlockCounterError);
    }, 15_000);

    it('errors carry structured context for observability', async () => {
      try {
        await brokenBlockCounter.increment('rule-obs', 'org-obs');
        fail('Expected BlockCounterError');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockCounterError);
        const bce = error as InstanceType<typeof BlockCounterError>;
        expect(bce.code).toBe('INCREMENT_FAILED');
        expect(bce.context).toMatchObject({
          source: 'aws-dynamodb',
          ruleId: 'rule-obs',
          orgId: 'org-obs',
        });
      }
    }, 15_000);
  });

  // ── Scenario 9: Full lifecycle (record → FP → FPR → circuit) ───────

  it('end-to-end: record → mark FP → FPR check → circuit breaker', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-e2e-${Date.now()}`;
    const orgId = 'org-e2e';

    // ── Phase A: Record 4 blocking violations ─────────────────────
    const events: FPEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const event = makeFPEvent({
        ruleId,
        outcome: 'block',
        timestamp: new Date(Date.now() - (4 - i) * 1000),
      });
      events.push(event);
      await fpStore.recordEvent(event);
    }

    // ── Phase B: Mark 2 as FP ─────────────────────────────────────
    await fpStore.markFalsePositive(events[0].findingId, 'reviewer-e2e');
    await fpStore.markFalsePositive(events[1].findingId, 'reviewer-e2e');

    // Verify FP status
    expect(await fpStore.isFalsePositive(events[0].findingId)).toBe(true);
    expect(await fpStore.isFalsePositive(events[1].findingId)).toBe(true);
    expect(await fpStore.isFalsePositive(events[2].findingId)).toBe(false);
    expect(await fpStore.isFalsePositive(events[3].findingId)).toBe(false);

    // ── Phase C: Check FPR ────────────────────────────────────────
    const window = await fpStore.getWindowByCount(ruleId, 10);
    expect(window.statistics.total).toBe(4);
    expect(window.statistics.falsePositives).toBe(2);
    // reviewed = total - pending; 2 reviewed (have reviewedBy), 2 pending
    // FPR = 2 / 2 = 1.0
    expect(window.statistics.observedFPR).toBeGreaterThan(0);

    // ── Phase D: Simulate circuit breaker ─────────────────────────
    // Increment block counter 10 times for this rule (threshold=10)
    for (let i = 0; i < 10; i++) {
      await blockCounter.increment(ruleId, orgId);
    }

    expect(
      await blockCounter.isCircuitBroken(ruleId, orgId, 10),
    ).toBe(true);

    // ── Phase E: Verify get count is accurate ─────────────────────
    expect(await blockCounter.getCount(ruleId, orgId)).toBe(10);
  }, 60_000);

  // ── Scenario 10: isFalsePositive returns false for unknown finding ──

  it('isFalsePositive returns false for unknown finding', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const result = await fpStore.isFalsePositive('totally-unknown-finding');
    expect(result).toBe(false);
  }, 10_000);

  // ── Scenario 11: getWindowByCount returns empty for unknown rule ────

  it('getWindowByCount returns empty window for unknown rule', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const window = await fpStore.getWindowByCount('rule-does-not-exist', 10);
    expect(window.statistics.total).toBe(0);
    expect(window.statistics.falsePositives).toBe(0);
    expect(window.statistics.observedFPR).toBe(0);
    expect(window.events).toHaveLength(0);
  }, 10_000);

  // ── Scenario 12: getWindowBySince ───────────────────────────────────

  it('getWindowBySince returns events after given timestamp', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    const ruleId = `rule-since-${Date.now()}`;
    const now = Date.now();

    // Record events at different times
    const oldEvent = makeFPEvent({
      ruleId,
      timestamp: new Date(now - 60_000), // 1 min ago
    });
    const recentEvent = makeFPEvent({
      ruleId,
      timestamp: new Date(now - 5_000), // 5s ago
    });

    await fpStore.recordEvent(oldEvent);
    await fpStore.recordEvent(recentEvent);

    // Query since 30s ago → should only get the recent event
    const window = await fpStore.getWindowBySince(
      ruleId,
      new Date(now - 30_000),
    );
    expect(window.statistics.total).toBe(1);
    expect(window.events[0].eventId).toBe(recentEvent.eventId);
  }, 30_000);
});
