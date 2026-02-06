# Phase 5: Deploy and Validate Staging Infrastructure

## Summary
This PR deploys production-ready infrastructure to a staging environment, validates deployment with end-to-end tests, and establishes monitoring and alerting.

## Phase 5 Checklist

Each commit progresses through infrastructure deployment and validation.

### Infrastructure Deployment (Commits 1-2)
- [ ] **Deploy backend infrastructure**: Terraform apply for staging (DynamoDB tables, SSM parameters, IAM roles)
- [ ] **Create Terraform plan validation**: Automated plan checks, drift detection integration

### Observability (Commit 3)
- [ ] **Set up monitoring and alarms**: CloudWatch dashboards, custom metrics emission, alert configurations

### Validation (Commit 4)
- [ ] **Add end-to-end validation tests**: Smoke tests against staging, performance benchmarks, failure scenario testing

## Infrastructure Components

### AWS Resources
- **DynamoDB Tables**:
  - `mirror-dissonance-fp-events-staging`
  - `mirror-dissonance-consent-staging`
  - Point-in-time recovery enabled
  - On-demand billing mode

- **SSM Parameters**:
  - `/mirror-dissonance/staging/nonce` (SecureString)
  - `/mirror-dissonance/staging/github-token` (SecureString)

- **IAM Roles**:
  - `MirrorDissonanceOracleRole-staging`
  - Least-privilege permissions
  - Trust policy for GitHub Actions OIDC

- **CloudWatch Alarms**:
  - DynamoDB throttling (>10 requests/min)
  - Lambda errors (>1% error rate)
  - API latency (>500ms p95)

## Terraform Structure

### Backend Configuration
```hcl
terraform {
  backend "s3" {
    bucket = "mirror-dissonance-tfstate-staging"
    key    = "staging/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
    dynamodb_table = "terraform-lock-staging"
  }
}
```

### Module Organization
```
infra/terraform/
├── main.tf           # Root module
├── variables.tf      # Input variables
├── outputs.tf        # Stack outputs
├── modules/
│   ├── dynamodb/    # DynamoDB tables
│   ├── iam/         # IAM roles and policies
│   ├── monitoring/  # CloudWatch alarms
│   └── ssm/         # SSM parameters
└── environments/
    ├── staging.tfvars
    └── production.tfvars
```

## Deployment Process

### Commit 1: Deploy Backend
```bash
cd infra/terraform
terraform init -backend-config=environments/staging.backend.hcl
terraform plan -var-file=environments/staging.tfvars -out=staging.plan
terraform apply staging.plan
```

### Commit 2: Validation Pipeline
```yaml
# .github/workflows/terraform-validate.yml
name: Terraform Validation
on:
  pull_request:
    paths:
      - 'infra/terraform/**'
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Terraform Format Check
        run: terraform fmt -check -recursive
      - name: Terraform Validate
        run: terraform validate
      - name: Plan
        run: terraform plan -var-file=environments/staging.tfvars
```

### Commit 3: Monitoring Setup
- Create CloudWatch dashboard showing:
  - Request throughput
  - Error rates
  - DynamoDB capacity usage
  - Lambda duration
- Configure SNS topic for alerts
- Set up email/Slack notifications

### Commit 4: E2E Validation
```typescript
// test-harness/staging-validation.ts
describe('Staging Environment', () => {
  it('should process PR event successfully', async () => {
    const result = await invokeOracle({
      event: 'pull_request',
      payload: mockPRPayload
    });
    expect(result.statusCode).toBe(200);
    expect(result.violations).toBeDefined();
  });
  
  it('should handle invalid nonce gracefully', async () => {
    // Test error handling in production-like environment
  });
  
  it('should meet performance SLOs', async () => {
    const startTime = Date.now();
    await invokeOracle({...});
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // <1s SLO
  });
});
```

## Testing
- [ ] Terraform plan shows expected changes
- [ ] All resources created successfully
- [ ] IAM roles have correct permissions
- [ ] SSM parameters are encrypted
- [ ] DynamoDB tables accessible
- [ ] Monitoring dashboards display data
- [ ] Alarms trigger on simulated failures
- [ ] E2E tests pass against staging
- [ ] Performance meets SLOs

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (infra is functional after each commit)
- [ ] No scope creep (staging only, not production yet)
- [ ] All commits follow Conventional Commits format

## Environment Variables

### Staging
```bash
AWS_REGION=us-east-1
ENVIRONMENT=staging
DYNAMODB_TABLE_PREFIX=mirror-dissonance-
SSM_PARAMETER_PREFIX=/mirror-dissonance/staging/
GITHUB_TOKEN_SSM=/mirror-dissonance/staging/github-token
NONCE_SSM=/mirror-dissonance/staging/nonce
```

## Security Checklist
- [ ] No secrets in Terraform code
- [ ] SSM parameters use SecureString encryption
- [ ] IAM policies follow least-privilege
- [ ] DynamoDB tables encrypted at rest
- [ ] CloudWatch Logs retention set (30 days)
- [ ] VPC endpoints for AWS services (if applicable)

## Cost Estimation

### Monthly Costs (Staging)
- DynamoDB: ~$5 (on-demand, low traffic)
- SSM: Free tier
- CloudWatch: ~$3 (logs + metrics)
- S3 (Terraform state): <$1
- **Total**: ~$10/month

## Rollback Plan

If deployment fails:
```bash
# Destroy staging environment
terraform destroy -var-file=environments/staging.tfvars

# Or rollback to previous state
terraform apply -var-file=environments/staging.tfvars \
  -backup=previous.tfstate
```

## Related Documentation
- `infra/README.md` - Infrastructure overview
- `docs/ops/deployment-guide.md` - Deployment procedures
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview

## Review Notes
This PR deploys infrastructure to staging and validates it works correctly. Each commit:
1. Deploys resources → 2. Adds validation → 3. Sets up monitoring → 4. Runs E2E tests

The incremental approach allows reverting to a known-good state if issues occur.

## Breaking Changes
- [ ] None (new staging environment, doesn't affect production)

## Performance Targets
- [ ] Oracle evaluation: <1s (p95)
- [ ] DynamoDB queries: <100ms (p95)
- [ ] Cold start: <3s (Lambda)
- [ ] API response: <500ms (p95)

## Post-Deployment Verification
- [ ] Staging environment URL: https://staging.mirror-dissonance.example.com
- [ ] CloudWatch dashboard: [link]
- [ ] Smoke test results: All passing
- [ ] Performance benchmark: Meets SLOs
- [ ] Cost actuals: Within budget

---
**Phase**: 5 (Staging Infrastructure)  
**Branch**: `infra/staging-deploy`  
**Target**: `main`  
**Depends On**: Phase 4 (`docs/spec-documents`)
