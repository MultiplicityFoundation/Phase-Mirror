# Mirror Dissonance Protocol - Operations Runbook

## Overview

The Mirror Dissonance Protocol is a diagnostic tool that surfaces productive contradictions, names hidden assumptions, and converts them into concrete levers for agentic domain-specific reasoning.

## Initial Setup

### 1. Generate Redaction Nonce

```bash
openssl rand -hex 32
```

This generates a 64-character hexadecimal string (32 bytes).

### 2. Store Nonce in SSM Parameter Store

```bash
aws ssm put-parameter \
  --name /guardian/redaction_nonce \
  --value <generated-nonce> \
  --type SecureString \
  --region us-east-1
```

### 3. Deploy Infrastructure

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

This creates:
- DynamoDB table for false positive tracking
- DynamoDB table for block counter with TTL
- SSM parameter for redaction nonce
- CloudWatch alarms for monitoring

### 4. Configure Branch Protection

Apply branch protection rules from `.github/branch-protection.json`:

- Required status checks must include: "Mirror Dissonance Oracle"
- Require code owner reviews
- Dismiss stale reviews
- Require conversation resolution

### 5. Assign Code Owners

Update `.github/CODEOWNERS` with actual usernames:
- Replace `@steward-username` with the rule registry steward
- Replace `@security-lead` with security team lead
- Replace `@ops-team` with operations team

### 6. Run Initial Calibration

```bash
pnpm oracle:run run --mode calibration --output baseline.json
```

This establishes the baseline for drift detection.

## Daily Operations

### Running Oracle Checks

**Pull Request Check:**
```bash
pnpm oracle:run run --mode pull_request
```

**Merge Queue Check (Strict):**
```bash
pnpm oracle:run run --mode merge_group --strict
```

**Drift Detection:**
```bash
pnpm oracle:run run --mode drift --baseline baseline.json
```

**Dry Run (Warn Only):**
```bash
pnpm oracle:run run --dry-run
```

### Interpreting Results

The oracle returns one of three outcomes:

1. **ALLOW** - No critical issues, changes can proceed
2. **WARN** - Issues detected but below blocking threshold
3. **BLOCK** - Critical issues detected, changes blocked

### Monitoring

#### CloudWatch Alarms

1. **SSM GetParameter Errors**
   - Triggers when nonce loading fails
   - Action: Check SSM parameter exists and IAM permissions

2. **High Block Rate**
   - Triggers when >100 blocks per hour
   - Action: Review rules, check for false positives, investigate root cause

#### Metrics to Monitor

- Block rate per hour
- Violation counts by severity
- Rule evaluation failures
- Circuit breaker trips

## Troubleshooting

### Oracle Fails to Load Nonce

**Symptom:** Error message about nonce loading failure

**Solution:**
1. Verify SSM parameter exists:
   ```bash
   aws ssm get-parameter --name /guardian/redaction_nonce --with-decryption
   ```
2. Check IAM permissions for SSM:GetParameter
3. Verify region configuration

### High Block Rate / Circuit Breaker

**Symptom:** Circuit breaker alarm triggered

**Solution:**
1. Review recent violations in oracle reports
2. Check for systematic issues (e.g., misconfigured rule)
3. Consider temporarily raising threshold if legitimate
4. Investigate false positive rate

### False Positive Management

**Recording a False Positive:**

False positives should be recorded in the FP store to prevent future blocks:

```typescript
await fpStore.recordFalsePositive({
  id: generateId(),
  findingId: 'finding-id-from-report',
  ruleId: 'MD-XXX',
  timestamp: new Date().toISOString(),
  resolvedBy: 'username',
  context: { reason: 'Explanation' }
});
```

### Drift Detection Failures

**Symptom:** Scheduled drift detection job fails

**Solution:**
1. Verify baseline.json exists and is accessible
2. Check for breaking changes in schema
3. Review drift report for specific violations
4. Update baseline if legitimate changes occurred

## Maintenance

### Updating Rules

Rules are in `packages/mirror-dissonance/src/rules/`:
- MD-001: Branch Protection Validation
- MD-002: Autonomy vs Compliance
- MD-003: Probabilistic Output Management
- MD-004: Liability and Accountability
- MD-005: Drift Detection

All rule changes require review from code owners.

### Updating Thresholds

Thresholds are configured in `packages/mirror-dissonance/src/policy/thresholds.ts`:
- Default mode thresholds
- Strict mode thresholds
- Circuit breaker limits

Threshold changes require security lead approval.

### Rotating Nonce

Nonce rotation procedure:
1. Generate new nonce: `openssl rand -hex 32`
2. Update SSM parameter
3. Verify oracle can load new nonce
4. Update any cached references

## Emergency Procedures

### Disable Oracle Temporarily

To temporarily bypass oracle checks:
1. Use `--dry-run` flag for warn-only mode
2. Or comment out oracle job in GitHub Actions workflow
3. Document reason and timeline for re-enabling

### Manual Override

If oracle incorrectly blocks critical changes:
1. Use `--dry-run` to analyze without blocking
2. Record false positive
3. Merge using admin override if necessary
4. File incident report to review rule

## Support

For issues or questions:
- Review documentation in `/docs`
- Check logs in CloudWatch
- Review oracle reports in GitHub Actions artifacts
- Contact @steward-username for rule-specific questions
