# Nonce Rotation Runbook

## Overview
Redaction nonce must be rotated if:
- Suspected compromise
- Quarterly routine rotation (policy)
- Multi-version grace period needed for zero-downtime deploy

## Rotation Procedure

### Step 1: Create New Nonce (T-0)
```bash
# Generate v2 parameter
aws ssm put-parameter \
  --name /guardian/redaction_nonce_v2 \
  --type SecureString \
  --value "$(uuidgen)" \
  --tags Key=Project,Value=MirrorDissonance Key=Version,Value=2
```

### Step 2: Deploy Dual-Nonce Code (T+0)
Update `redactor-v3.ts` to support both v1 and v2:
```typescript
const VALID_NONCES: Array<{
  nonce: string;
  version: number;
  expiresAt: Date | null;
}> = [];

// Load both nonces
await loadNonce(client, '/guardian/redaction_nonce_v1'); // version 1
await loadNonce(client, '/guardian/redaction_nonce_v2'); // version 2
```

**Grace Period:** 1-2 hours (allow all running processes to refresh cache)

### Step 3: Observe (T+1hr)
- Check CloudWatch logs for validation failures
- Verify new reports use v2 nonce
- Confirm no errors in production

### Step 4: Remove Old Nonce (T+2hr)
```bash
# Update code to load only v2
# Deploy

# After successful deploy:
aws ssm delete-parameter --name /guardian/redaction_nonce_v1
```

### Step 5: Update Terraform (T+4hr)
```hcl
# Rename in terraform
resource "aws_ssm_parameter" "redaction_nonce" {
  name = "/guardian/redaction_nonce_v2"  # Update
  # ...
}
```

## Rollback Procedure
If issues detected during grace period:
```bash
# Revert code to v1-only
# Old reports still validate (v1 nonce still exists)
```

## Testing Rotation
Use staging environment:
```bash
export AWS_PROFILE=guardian-staging
./scripts/test-nonce-rotation.sh
```

## Emergency Contact
- On-call: Check PagerDuty rotation
- Slack: #phase-mirror-ops
- Escalation: See MAINTAINERS.md

## Post-Rotation Checklist
- [ ] All services showing v2 nonce in use
- [ ] Zero validation failures in logs (30min window)
- [ ] Old v1 parameter deleted
- [ ] Terraform state updated
- [ ] Post-mortem document created (if rotation was due to compromise)
