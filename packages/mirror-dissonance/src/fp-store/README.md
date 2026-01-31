# FP Calibration Service Implementation

## Overview
This directory contains the False Positive (FP) Calibration Service implementation for Phase 2 of the Mirror Dissonance Protocol (Days 8-9).

## Components

### types.ts
Defines the core types for the FP Calibration Service:
- **FPEvent**: Detailed event tracking with outcome, review status, and context
- **FPWindow**: Windowed statistics for FP rate calculation
- **FPStoreConfig**: Configuration for FP store instances
- **FPStore**: Interface defining core operations

### dynamodb-store.ts
Enhanced DynamoDB implementation with:
- **recordEvent**: Store FP events with composite keys for efficient querying
- **markFalsePositive**: Update events to mark them as false positives
- **getWindowByCount**: Retrieve N most recent events for a rule
- **getWindowBySince**: Retrieve all events since a specific date
- **computeWindow**: Calculate statistics (FP rate, true positives, pending reviews)

### Key Design Decisions

#### Composite Key Structure
- **pk** (hash key): `rule#{ruleId}` - Enables efficient queries by rule
- **sk** (range key): `event#{timestamp}#{eventId}` - Supports time-based range queries

#### Global Secondary Index
- **FindingIndex**: Uses `gsi1pk` (finding#{findingId}) for suppression lookups
- Enables quick checks: "Is this finding already marked as FP?"

#### TTL Configuration
- Automatic expiry after 90 days (configurable)
- Reduces storage costs while maintaining audit trail
- Balances regulatory compliance with operational efficiency

#### Statistics Calculation
The `observedFPR` (False Positive Rate) is calculated as:
```
FPR = falsePositives / (total - pending)
```
This excludes unreviewed events from the denominator, providing accurate calibration data.

## Usage Example

```typescript
import { DynamoDBFPStore } from './dynamodb-store.js';
import type { FPEvent, FPStoreConfig } from './types.js';

// Initialize store
const config: FPStoreConfig = {
  tableName: 'mirror-dissonance-fp-events-production',
  region: 'us-east-1',
  ttlDays: 90
};
const store = new DynamoDBFPStore(config);

// Record an event
const event: FPEvent = {
  eventId: 'evt-123',
  ruleId: 'MD-001',
  ruleVersion: '1.2.0',
  findingId: 'finding-abc',
  outcome: 'block',
  isFalsePositive: false,
  timestamp: new Date(),
  context: {
    repo: 'org/repo',
    branch: 'main',
    eventType: 'pull_request'
  }
};
await store.recordEvent(event);

// Mark as false positive
await store.markFalsePositive('finding-abc', 'user@example.com', 'TICKET-123');

// Get windowed statistics
const window = await store.getWindowByCount('MD-001', 100);
console.log(`FP Rate: ${window.statistics.observedFPR}`);
```

## Terraform Infrastructure

See `infra/terraform/fp-store.tf` for the DynamoDB table definition.

To deploy:
```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

## Legacy Compatibility

The original Phase 1 FP store implementation (`store.ts`) is maintained for backward compatibility and exported with the `Legacy` prefix:
- `LegacyDynamoDBFPStore`
- `LegacyFPStoreConfig`

New code should use the enhanced implementations from `dynamodb-store.ts` and `types.ts`.
