# Mirror Dissonance Protocol - Architecture

## Overview

The Mirror Dissonance Protocol is designed to surface productive contradictions in agentic domain-specific reasoning. It operates as an "Oracle" that analyzes changes and makes machine decisions based on detected tensions.

## Core Concepts

### Phase Mirror Dissonance

The protocol addresses structural friction in four key dimensions:

1. **Autonomy ↔ Compliance**: Tension between agent independence and organizational rules
2. **Probabilistic ↔ Deterministic**: Conflict between AI uncertainty and business requirements
3. **Liability ↔ Innovation**: Balance between risk mitigation and experimentation
4. **Human ↔ Machine**: Appropriate balance of human oversight and automation

These tensions are not problems to eliminate but **productive contradictions** to navigate deliberately.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                         │
│                    (commander.js)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Oracle Core                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Input Validation & Context Building                  │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Rule Evaluation Engine                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │  │
│  │  │ MD-001  │ │ MD-002  │ │ MD-003  │ │ MD-004  │   │  │
│  │  │ Branch  │ │ Autonomy│ │Probabili│ │Liability│   │  │
│  │  │Protection│ │vs Comp  │ │stic Out │ │Framework│   │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │  │
│  │  ┌─────────┐                                         │  │
│  │  │ MD-005  │ (Extensible rule system)               │  │
│  │  │  Drift  │                                         │  │
│  │  └─────────┘                                         │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       False Positive Filter                           │  │
│  │       (FP Store - DynamoDB/NoOp)                      │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Decision Engine                              │  │
│  │    (Policy thresholds + Circuit breaker)             │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      Output Generation                                │  │
│  │  (Summary, Report, JSON, GitHub Summary)             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Storage Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   DynamoDB   │  │   DynamoDB   │  │   SSM        │     │
│  │  FP Events   │  │Block Counter │  │  Nonce       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Oracle Core (`oracle.ts`)

The main entrypoint that orchestrates the analysis pipeline.

**Responsibilities:**
- Accept input (mode, context, options)
- Coordinate rule evaluation
- Filter false positives
- Check circuit breaker
- Make final decision
- Generate output

**Key Methods:**
- `analyze(input: OracleInput): Promise<OracleOutput>`
- `generateSummary(decision, violations): string`

### 2. Rule System

#### Rule Interface

Each rule implements:
```typescript
async function checkRule(input: OracleInput): Promise<RuleViolation[]>
```

#### Rule Registry (`rules/index.ts`)

Maintains mapping of rule IDs to checker functions:
```typescript
const RULES: Record<string, RuleChecker> = {
  'MD-001': checkMD001,
  'MD-002': checkMD002,
  // ...
}
```

#### Rule Evaluation

Rules are evaluated in parallel:
```typescript
async function evaluateAllRules(input: OracleInput): Promise<RuleViolation[]>
```

Errors in individual rules don't crash the system; they generate high-severity violations.

### 3. Policy Framework

#### Thresholds (`policy/thresholds.ts`)

Defines violation tolerances:

**Standard Mode:**
- Critical: 0
- High: 3
- Medium: 10

**Strict Mode:**
- Critical: 0
- High: 0
- Medium: 5

#### Decision Logic (`policy/decision.ts`)

```typescript
function makeDecision(context: DecisionContext): MachineDecision
```

Decision outcomes:
- **ALLOW**: No blocking violations
- **BLOCK**: Violations exceed thresholds
- **WARN**: Violations detected but below threshold, or circuit breaker tripped

### 4. False Positive Store

#### Interface (`fp-store/store.ts`)

```typescript
interface IFPStore {
  recordFalsePositive(event): Promise<void>
  isFalsePositive(findingId): Promise<boolean>
  getFalsePositivesByRule(ruleId): Promise<FalsePositiveEvent[]>
}
```

#### Implementations

**DynamoDB Store:**
- Persistent storage
- GSI for finding and rule queries
- Production use

**NoOp Store:**
- No-operation mock
- Development/testing
- No AWS dependencies

### 5. Block Counter

Tracks blocks per hour to detect circuit breaker conditions.

#### TTL-Based Buckets

- Hourly buckets: `2026-01-28T01:00:00.000Z`
- Automatic expiration via DynamoDB TTL
- Circuit breaker at 100 blocks/hour

#### Implementations

**DynamoDB Counter:**
- Persistent across instances
- Production use

**Memory Counter:**
- In-process storage
- Development/testing
- Auto-cleanup of expired entries

### 6. Redaction System

Brand-by-capability redaction for sensitive information.

#### Capabilities

- `api-key`: API keys and tokens
- `email`: Email addresses
- `aws-credential`: AWS access keys
- `ip-address`: IP addresses

#### Nonce-Based Hashing

Uses SSM-stored nonce for deterministic HMAC:
```typescript
hashSensitiveValue(value: string): string
```

### 7. Nonce Management

#### SSM Integration

```typescript
class NonceLoader {
  async loadNonce(parameterName): Promise<NonceConfig>
  validateNonce(nonce): boolean
  getCachedNonce(): NonceConfig | null
}
```

**Features:**
- Cached after first load
- Validates format (64 hex chars)
- Error handling and logging

## Data Flow

### 1. Input Processing

```
User Input → CLI Parser → OracleInput Schema
```

**OracleInput:**
```typescript
{
  mode: 'pull_request' | 'merge_group' | 'drift' | 'calibration',
  strict?: boolean,
  dryRun?: boolean,
  baselineFile?: string,
  context: {
    repositoryName, prNumber, commitSha, branch, author
  }
}
```

### 2. Rule Evaluation

```
OracleInput → evaluateAllRules() → RuleViolation[]
```

**RuleViolation:**
```typescript
{
  ruleId: string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  message: string,
  context: Record<string, unknown>
}
```

### 3. False Positive Filtering

```
RuleViolation[] → FP Store Check → Filtered Violations
```

### 4. Decision Making

```
Filtered Violations + Context → Decision Engine → MachineDecision
```

**MachineDecision:**
```typescript
{
  outcome: 'allow' | 'block' | 'warn',
  reasons: string[],
  metadata: {
    timestamp, mode, rulesEvaluated
  }
}
```

### 5. Output Generation

```
MachineDecision + Violations → Multiple Outputs:
  - Console summary
  - JSON report
  - GitHub Step Summary
  - Exit code
```

## Operational Modes

### Pull Request Mode

- Standard thresholds
- Evaluates all rules
- Allows minor violations
- Full reporting

### Merge Group Mode

- Strict thresholds (typically)
- Full history fetch
- Zero-tolerance configuration
- Fail-closed behavior

### Drift Mode

- Compares against baseline
- Scheduled execution
- Trend analysis
- Deviation reporting

### Calibration Mode

- Establishes baseline
- One-time or periodic
- Captures current state
- Used for drift detection

## Integration Points

### GitHub Actions

```yaml
- name: Oracle Check
  run: pnpm oracle:run run --mode pull_request
```

**Workflow Integration:**
- PR validation (ci.yml)
- Merge queue (merge-queue.yml)
- Scheduled drift (drift-detection.yml)

### AWS Services

**DynamoDB:**
- `mirror-dissonance-fp-events` table
- `mirror-dissonance-block-counter` table

**SSM Parameter Store:**
- `/guardian/redaction_nonce` parameter

**CloudWatch:**
- SSM GetParameter error alarms
- High block rate alarms

### Terraform

Infrastructure as code:
```hcl
resource "aws_dynamodb_table" "fp_events" { ... }
resource "aws_ssm_parameter" "redaction_nonce" { ... }
resource "aws_cloudwatch_metric_alarm" "high_block_rate" { ... }
```

## Extensibility

### Adding New Rules

1. Create `packages/mirror-dissonance/src/rules/md-00X.ts`
2. Implement `checkMD00X(input): Promise<RuleViolation[]>`
3. Register in `rules/index.ts`
4. Update documentation

### Custom Storage Implementations

Implement `IFPStore` interface:
```typescript
class CustomFPStore implements IFPStore {
  async recordFalsePositive(event) { ... }
  async isFalsePositive(findingId) { ... }
  async getFalsePositivesByRule(ruleId) { ... }
}
```

### Custom Redaction Rules

```typescript
redactor.addCustomRule({
  capability: 'custom-pattern',
  pattern: /custom-regex/g,
  replacement: '[REDACTED-CUSTOM]'
});
```

## Security Considerations

1. **Nonce Protection**: Stored in SSM SecureString, never logged
2. **Redaction**: Sensitive data removed before logging
3. **Audit Trail**: All decisions logged with context
4. **Access Control**: IAM policies for AWS resources
5. **Least Privilege**: Minimal permissions required

## Performance Characteristics

- **Rule Evaluation**: Parallel, ~100ms total
- **FP Store Query**: ~50ms per lookup (DynamoDB)
- **Block Counter**: ~50ms increment (DynamoDB)
- **Total Latency**: ~200-500ms typical

## Monitoring and Observability

### Metrics

- Decisions per hour (allow/block/warn)
- Violations by severity
- Rule evaluation time
- False positive rate
- Circuit breaker trips

### Alarms

- High block rate (> 100/hour)
- SSM nonce load failures
- Rule evaluation failures
- DynamoDB throttling

### Logs

- Console output (CLI)
- GitHub Step Summary (CI)
- CloudWatch Logs (AWS)
- JSON reports (artifacts)

## Future Enhancements

1. **Machine Learning**: Learn from false positives
2. **Custom Thresholds**: Per-repository configuration
3. **Web Dashboard**: Visualization and analytics
4. **Webhook Integration**: External notifications
5. **Rule Marketplace**: Community-contributed rules
6. **A/B Testing**: Experiment with rule changes
7. **Audit API**: Query historical decisions
8. **Multi-tenant**: Support multiple organizations
