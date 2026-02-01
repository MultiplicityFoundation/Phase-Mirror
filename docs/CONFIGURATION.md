# Configuration Guide

Complete guide to configuring Mirror Dissonance for your environment.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Terraform Variables](#terraform-variables)
- [Rule Configuration](#rule-configuration)
- [Threshold Tuning](#threshold-tuning)
- [GitHub Actions Configuration](#github-actions-configuration)

---

## Environment Variables

### CLI Environment Variables

The CLI supports the following environment variables:

```bash
# AWS Configuration
AWS_REGION=us-east-1                    # AWS region (default: us-east-1)
AWS_ACCESS_KEY_ID=<key>                 # AWS access key (use IAM role instead)
AWS_SECRET_ACCESS_KEY=<secret>          # AWS secret key (use IAM role instead)

# Mirror Dissonance Configuration
FP_TABLE_NAME=mirror-dissonance-staging-fp-events        # DynamoDB table for FP events
CONSENT_TABLE_NAME=mirror-dissonance-staging-consent     # DynamoDB table for consent
BLOCK_COUNTER_TABLE=mirror-dissonance-staging-block-counter  # Circuit breaker table
NONCE_PARAMETER=/guardian/staging/redaction_nonce_v1     # SSM parameter for nonce

# Operational Settings
LOG_LEVEL=info                          # Logging level: debug, info, warn, error
VERBOSE=false                           # Enable verbose output
LOCAL_MODE=false                        # Run without AWS dependencies

# Rule Behavior
DRIFT_THRESHOLD=0.15                    # Maximum drift magnitude (15%)
FP_WINDOW_SIZE=100                      # Number of events for FPR calculation
CIRCUIT_BREAKER_THRESHOLD=10            # Blocks before circuit breaker triggers
CIRCUIT_BREAKER_WINDOW=3600             # Time window in seconds (1 hour)

# Performance
TIMEOUT_MS=30000                        # Operation timeout (30 seconds)
MAX_RETRIES=3                           # AWS operation retries
CACHE_TTL=3600                          # Nonce cache TTL (1 hour)
```

### Setting Environment Variables

**Local Development (.env file):**
```bash
# Create .env file in project root
cat > .env << EOF
AWS_REGION=us-east-1
FP_TABLE_NAME=mirror-dissonance-staging-fp-events
CONSENT_TABLE_NAME=mirror-dissonance-staging-consent
NONCE_PARAMETER=/guardian/staging/redaction_nonce_v1
LOG_LEVEL=debug
EOF
```

**GitHub Actions (Secrets):**
```yaml
env:
  AWS_REGION: us-east-1
  FP_TABLE_NAME: ${{ secrets.FP_TABLE_NAME }}
  NONCE_PARAMETER: ${{ secrets.NONCE_PARAMETER }}
```

**Production (AWS Systems Manager):**
```bash
# Store configuration in SSM Parameter Store
aws ssm put-parameter \
  --name /mirror-dissonance/staging/config \
  --value '{"fpTableName":"mirror-dissonance-staging-fp-events"}' \
  --type SecureString
```

---

## Terraform Variables

### Required Variables

Create `terraform.tfvars` or use `-var-file`:

```hcl
# Basic Configuration
project_name = "mirror-dissonance"
environment  = "staging"  # or "prod"
aws_region   = "us-east-1"

# DynamoDB Configuration
fp_events_table_name    = "mirror-dissonance-staging-fp-events"
consent_table_name      = "mirror-dissonance-staging-consent"
block_counter_table_name = "mirror-dissonance-staging-block-counter"

# Enable encryption and backups
enable_pitr             = true   # Point-in-time recovery
enable_deletion_protection = true
kms_key_deletion_window = 30     # Days before KMS key deletion

# SSM Configuration
nonce_parameter_name = "/guardian/staging/redaction_nonce_v1"

# CloudWatch Alarms
enable_alarms           = true
alarm_email             = "ops@example.com"
sns_topic_name          = "mirror-dissonance-staging-ops-alerts"

# S3 Baseline Storage
baseline_bucket_name    = "mirror-dissonance-staging-baselines"
baseline_retention_days = 90

# Tags
tags = {
  Project     = "MirrorDissonance"
  Environment = "staging"
  ManagedBy   = "Terraform"
  Owner       = "platform-team"
}
```

### Variable Descriptions

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `project_name` | string | Project identifier | `"mirror-dissonance"` |
| `environment` | string | Environment name (staging/prod) | Required |
| `aws_region` | string | AWS region | `"us-east-1"` |
| `enable_pitr` | bool | Enable DynamoDB PITR | `true` |
| `enable_alarms` | bool | Create CloudWatch alarms | `true` |
| `alarm_email` | string | Email for alarm notifications | Required if alarms enabled |

### Example Configurations

**Staging Environment:**
```hcl
# staging.tfvars
project_name = "mirror-dissonance"
environment  = "staging"
enable_pitr  = true
enable_deletion_protection = false  # Allow easier cleanup in staging
alarm_email  = "staging-ops@example.com"
```

**Production Environment:**
```hcl
# production.tfvars
project_name = "mirror-dissonance"
environment  = "prod"
enable_pitr  = true
enable_deletion_protection = true  # Protect production data
kms_key_deletion_window = 30
alarm_email = "prod-ops@example.com"
```

---

## Rule Configuration

### Rule Registry

Rules are defined in `packages/mirror-dissonance/src/rules/`:

```typescript
// Example rule configuration
export const MD001_BRANCH_PROTECTION: Rule = {
  id: 'MD-001',
  name: 'Branch Protection Configuration',
  severity: 'block',  // 'pass' | 'warn' | 'block'
  enabled: true,
  thresholds: {
    minimumReviewers: 2,
    requireCodeOwnerReview: true,
    requireSignedCommits: false
  }
};
```

### Enabling/Disabling Rules

**Via Configuration File:**
```json
{
  "rules": {
    "MD-001": { "enabled": true, "severity": "block" },
    "MD-002": { "enabled": true, "severity": "warn" },
    "MD-003": { "enabled": false },
    "MD-004": { "enabled": true, "severity": "block" },
    "MD-005": { "enabled": true, "severity": "warn" }
  }
}
```

**Via CLI Flags:**
```bash
mirror-dissonance analyze \
  --disable-rule MD-003 \
  --rule-severity MD-002=warn
```

**Via Environment Variables:**
```bash
DISABLE_RULES="MD-003,MD-004" mirror-dissonance analyze
```

### Rule-Specific Configuration

#### MD-001: Branch Protection
```json
{
  "MD-001": {
    "minimumReviewers": 2,
    "requireCodeOwnerReview": true,
    "requireSignedCommits": false,
    "allowForcePush": false
  }
}
```

#### MD-002: Autonomy vs Compliance
```json
{
  "MD-002": {
    "maxAutonomyScore": 0.8,
    "complianceFramework": "SOC2",
    "requireHumanApproval": true
  }
}
```

#### MD-003: Probabilistic Outputs
```json
{
  "MD-003": {
    "maxUncertainty": 0.3,
    "requireDeterministicFallback": true
  }
}
```

#### MD-004: Liability Framework
```json
{
  "MD-004": {
    "requireInsurance": false,
    "maxLiabilityExposure": 1000000
  }
}
```

#### MD-005: Drift Detection
```json
{
  "MD-005": {
    "driftThreshold": 0.15,
    "checkFrequency": "daily",
    "baselineSource": "s3"
  }
}
```

---

## Threshold Tuning

### False Positive Rate (FPR) Thresholds

Control when the circuit breaker triggers based on FP events:

```javascript
// Default thresholds
const FPR_THRESHOLDS = {
  windowSize: 100,          // Number of recent events to analyze
  criticalFPR: 0.30,        // 30% FPR triggers circuit breaker
  warningFPR: 0.20,         // 20% FPR generates warning
  minimumEvents: 10         // Minimum events before calculating FPR
};
```

**Conservative (Stricter):**
```json
{
  "fprThresholds": {
    "criticalFPR": 0.20,    // Trigger at 20% instead of 30%
    "warningFPR": 0.10,
    "minimumEvents": 20     // Require more data before triggering
  }
}
```

**Permissive (More Lenient):**
```json
{
  "fprThresholds": {
    "criticalFPR": 0.40,    // Allow up to 40% FPR
    "warningFPR": 0.30,
    "minimumEvents": 5      // Act on less data
  }
}
```

### Circuit Breaker Configuration

```json
{
  "circuitBreaker": {
    "threshold": 10,              // Number of blocks before triggering
    "timeWindowSeconds": 3600,    // Time window (1 hour)
    "cooldownSeconds": 7200,      // Cooldown period (2 hours)
    "degradedModeBehavior": "warn" // 'warn' or 'allow'
  }
}
```

**Recommendations by Environment:**

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| threshold | 20 | 10 | 5 |
| timeWindow | 7200 | 3600 | 1800 |
| cooldown | 3600 | 7200 | 14400 |

### Drift Detection Thresholds

```json
{
  "driftDetection": {
    "threshold": 0.15,           // 15% maximum drift
    "checkSchedule": "0 0 * * *", // Daily at midnight
    "baselineBucket": "s3://mirror-dissonance-staging-baselines",
    "alertOnDrift": true,
    "autoUpdateBaseline": false   // Require manual approval
  }
}
```

---

## GitHub Actions Configuration

### Complete Workflow Example

```yaml
name: Mirror Dissonance Check

on:
  pull_request:
    types: [opened, synchronize, reopened]
  merge_group:
  push:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      id-token: write      # For AWS OIDC
      contents: read       # For checkout
      pull-requests: write # For comments
      
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0   # Full history for drift detection
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ORACLE_ROLE }}
          aws-region: us-east-1
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Run Oracle
        id: oracle
        run: |
          npx @mirror-dissonance/cli analyze \
            --mode ${{ github.event_name == 'merge_group' && 'merge_group' || 'pull_request' }} \
            --repository ${{ github.repository }} \
            --commit ${{ github.sha }} \
            --fp-table-name mirror-dissonance-staging-fp-events \
            --consent-table-name mirror-dissonance-staging-consent \
            --nonce-parameter /guardian/staging/redaction_nonce_v1 \
            --verbose
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dissonance-report-${{ github.sha }}
          path: dissonance_report.json
          retention-days: 30
      
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('dissonance_report.json', 'utf8'));
            
            const body = `
            ## Mirror Dissonance Report
            
            **Decision:** ${report.decision}
            **Violations:** ${report.violations.length}
            
            ${report.violations.map(v => `- ${v.rule}: ${v.message}`).join('\n')}
            `;
            
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body
            });
```

### Configuration Matrix

For testing across environments:

```yaml
strategy:
  matrix:
    environment: [staging, production]
    
steps:
  - name: Run Oracle (${{ matrix.environment }})
    env:
      FP_TABLE_NAME: mirror-dissonance-${{ matrix.environment }}-fp-events
      NONCE_PARAMETER: /guardian/${{ matrix.environment }}/redaction_nonce_v1
```

---

## Advanced Configuration

### Custom Rule Development

Create custom rules by extending the base Rule interface:

```typescript
import { Rule, RuleContext, RuleResult } from '@mirror-dissonance/core';

export const CUSTOM_RULE: Rule = {
  id: 'CUSTOM-001',
  name: 'Custom Business Logic',
  async evaluate(context: RuleContext): Promise<RuleResult> {
    // Your custom logic
    return {
      pass: true,
      message: 'Custom rule passed'
    };
  }
};
```

### Performance Tuning

```json
{
  "performance": {
    "maxConcurrentEvaluations": 5,
    "evaluationTimeout": 30000,
    "cacheTTL": 3600,
    "enableMetrics": true
  }
}
```

---

## Configuration Validation

Validate your configuration:

```bash
# Validate Terraform configuration
terraform validate

# Dry-run CLI with config
mirror-dissonance analyze --dry-run --config config.json

# Test AWS connectivity
mirror-dissonance doctor
```

---

## See Also

- [QUICKSTART.md](./QUICKSTART.md) - Getting started guide
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
- [architecture.md](./architecture.md) - System architecture
- [ADRs](./adr/) - Architecture decision records
