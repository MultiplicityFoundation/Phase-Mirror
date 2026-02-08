# Nonce Rotation Runbook

> Operational runbook for rotating the HMAC redaction nonce used by
> `RedactedText` validation.  Split from `docs/ops/NONCE_ROTATION.md`
> for quick on-call reference.

## When to rotate

| Trigger | SLA | Approval |
|---------|-----|----------|
| Quarterly schedule | Within maintenance window | Steward |
| Suspected compromise | Immediately | Any operator + notify Steward |
| Pre-major-deployment | Before deploy begins | Deployer + Steward |

## Pre-flight checks

```bash
# 1. Confirm current nonce version
aws ssm get-parameter \
  --name /guardian/<ENV>/redaction_nonce_v1 \
  --region us-east-1 \
  --query 'Parameter.{Version:Version,LastModified:LastModifiedDate}' \
  --output table

# 2. Verify application is healthy
aws cloudwatch describe-alarms \
  --alarm-name-prefix mirror-dissonance-<ENV> \
  --state-value ALARM --region us-east-1 \
  --query 'MetricAlarms[].AlarmName'
# Expected: empty list (no alarms firing)
```

## Rotation procedure

### Step 1 — Generate new nonce (T=0)

```bash
./scripts/rotate-nonce.sh <ENV> <CURRENT_VERSION>

# Example: staging, rotating from v1 → v2
./scripts/rotate-nonce.sh staging 1
```

**Record the new nonce value in the team password manager before continuing.**

### Step 2 — Deploy dual-nonce code (T+5 min)

The nonce loader supports multiple versions.  Update the SSM parameter
names loaded by the application:

```typescript
// packages/mirror-dissonance/src/nonce/loader.ts
await loadNonce(ssmClient, `/guardian/${env}/redaction_nonce_v1`);
await loadNonce(ssmClient, `/guardian/${env}/redaction_nonce_v2`);
```

Deploy to all environments.  The grace period begins now.

### Step 3 — Observe (T+1 hr)

- [ ] CloudWatch dashboard shows no spike in validation failures
- [ ] New reports use v2 nonce (check via CLI: `pnpm oracle:run report …`)
- [ ] No errors in CloudWatch Logs

### Step 4 — Remove old nonce (T+2 hr)

```bash
aws ssm delete-parameter \
  --name /guardian/<ENV>/redaction_nonce_v1 \
  --region us-east-1
```

Update code to load only v2.  Deploy again.

### Step 5 — Update Terraform state (T+4 hr)

In `infra/terraform/modules/ssm/main.tf`, update the parameter name to
reference the new version:

```hcl
resource "aws_ssm_parameter" "redaction_nonce" {
  name  = "/guardian/${var.environment}/redaction_nonce_v2"
  # ...
}
```

Run `terraform plan` → confirm no destructive changes → `terraform apply`.

## Rollback

If validation errors appear during the grace period:

1. Revert application code to load **only** the old nonce
2. Delete the new nonce parameter:
   ```bash
   aws ssm delete-parameter \
     --name /guardian/<ENV>/redaction_nonce_v2 \
     --region us-east-1
   ```
3. Investigate root cause before retrying

## Post-rotation checklist

- [ ] New nonce stored in password manager
- [ ] Old nonce deleted from SSM
- [ ] Application deployed with single-nonce config
- [ ] Terraform updated to new version name
- [ ] CloudWatch confirms zero validation failures for 24 hr
- [ ] Rotation documented in `docs/ops/rotation-log.md`

## Emergency contacts

| Role | Action |
|------|--------|
| On-call operator | Execute rotation steps |
| Steward | Approve off-schedule rotation |
| Security lead | Investigate if compromise-triggered |
