# Nonce Rotation Runbook

## Overview

Redaction nonces must be rotated:

- **Quarterly** (routine policy)
- **On suspected compromise**
- **Before major deployments** (multi-version support ensures zero-downtime)

## Procedure

### Step 1: Generate New Nonce (T=0)

```bash
./scripts/rotate-nonce.sh <environment> <current_version>

# Example: staging, upgrading from v1 to v2
./scripts/rotate-nonce.sh staging 1
```

This creates `/guardian/<env>/redaction_nonce_v<new>` in SSM.

### Step 2: Deploy Dual-Nonce Code (T+5min)

Update application config to load both nonces:

```typescript
await loadNonce(ssmClient, '/guardian/staging/redaction_nonce_v1');
await loadNonce(ssmClient, '/guardian/staging/redaction_nonce_v2');
```

Deploy to all environments. Grace period: 1-2 hours.

### Step 3: Observe (T+1hr)

- Check CloudWatch logs for validation failures
- Verify new reports use v2 nonce
- Confirm no errors in production

### Step 4: Remove Old Nonce (T+2hr)

```bash
aws ssm delete-parameter --name /guardian/staging/redaction_nonce_v1 --region us-east-1
```

Update code to load only v2.

### Step 5: Update Terraform (T+4hr)

After successful rotation, update `infra/terraform/ssm-nonce.tf`:

```hcl
resource "aws_ssm_parameter" "redaction_nonce" {
  name  = "/guardian/staging/redaction_nonce_v2"  # <-- increment
  # ...
}
```

## Rollback

If issues detected during grace period:

1. Revert code to load only old nonce
2. Delete new nonce: `aws ssm delete-parameter --name <new_param> --region us-east-1`
3. Investigate before retry

## Testing

Use staging environment:

```bash
export AWS_PROFILE=guardian-staging
./scripts/rotate-nonce.sh staging 1
```

## Multi-Version Nonce Support

The nonce loader supports loading multiple nonce versions simultaneously during grace periods. This ensures zero-downtime rotation:

- Old nonces continue to validate existing redacted text
- New nonces are used for creating new redacted text
- After grace period, old nonces can be safely removed

## Troubleshooting

### Error: Current nonce not found

The specified current version doesn't exist in SSM. Verify:
- Environment name is correct
- Version number is correct
- You have access to the SSM parameter

### Error: Failed to create new nonce parameter

Check:
- IAM permissions for `ssm:PutParameter`
- KMS key access permissions
- AWS region is correct (us-east-1)

### Validation failures after rotation

If seeing validation errors:
1. Verify both nonces are loaded in application
2. Check nonce format (64 hex characters)
3. Verify MAC computation is using correct nonce

## Security Considerations

- Nonces are stored as SecureString in SSM (encrypted with KMS)
- Old nonces should be deleted promptly after grace period
- Log nonce rotation events to CloudWatch for audit trail
- Never log nonce values themselves
