# AWS Resource Naming Convention

## Naming Pattern

```
{project}-{resource-type}-{environment}-{suffix}
```

## Components

- **project**: `mirror-dissonance` (consistent across all resources)
- **resource-type**: `terraform-state`, `fp-events`, `consent`, etc.
- **environment**: `dev`, `staging`, `prod`
- **suffix**: Optional uniqueness suffix (timestamp, region, etc.)

## Examples

### Terraform Backend Resources

| Resource Type | Name | Purpose |
|--------------|------|---------|
| S3 Bucket | `mirror-dissonance-terraform-state-prod` | Terraform state storage |
| DynamoDB Table | `mirror-dissonance-terraform-lock-prod` | State locking |

### Application Resources (Created Later)

| Resource Type | Name | Purpose |
|--------------|------|---------|
| DynamoDB Table | `mirror-dissonance-fp-events-staging` | False positive tracking |
| DynamoDB Table | `mirror-dissonance-consent-staging` | Calibration consent |
| DynamoDB Table | `mirror-dissonance-block-counter-staging` | Circuit breaker |
| SSM Parameter | `/guardian/staging/redaction_nonce_v1` | HMAC nonce |
| S3 Bucket | `mirror-dissonance-baselines-staging` | Drift detection baselines |

## Environment Strategy

### Development (`dev`)
- **Purpose:** Local testing, experimentation
- **Lifespan:** Ephemeral (can be destroyed/recreated)
- **Cost Target:** <$5/month

### Staging (`staging`)
- **Purpose:** Pre-production validation, integration testing
- **Lifespan:** Persistent
- **Cost Target:** $10-20/month

### Production (`prod`)
- **Purpose:** Live deployments, customer-facing
- **Lifespan:** Permanent
- **Cost Target:** $50-100/month (scales with usage)

## Tagging Strategy

All resources should include these tags:

```json
{
  "Project": "Phase-Mirror",
  "ManagedBy": "Terraform",
  "Environment": "staging|prod",
  "Owner": "platform-team",
  "CostCenter": "engineering"
}
```

## Region Strategy

**Primary Region:** us-east-1 (N. Virginia)
- Lowest cost for most services
- Broadest service availability
- Terraform backend always in us-east-1

**Secondary Region:** us-west-2 (Oregon) - Future DR consideration

## Naming Validation

Before creating resources, validate names:

```bash
# Check name length (S3 bucket limit: 63 chars)
echo "mirror-dissonance-terraform-state-prod" | wc -c
# Expected: ≤63

# Check DNS compliance (lowercase, hyphens only)
echo "mirror-dissonance-terraform-state-prod" | grep -E '^[a-z0-9-]+$'
# Expected: matches pattern
```
