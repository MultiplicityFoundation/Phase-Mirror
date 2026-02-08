# Phase 4 Orchestration Response (Days 19-24)

## Scope

Phase 4 lives on branch `infra/staging-deploy`. It wires the tested adapter layer to real cloud infrastructure, staging first, then production readiness. The goal is end-to-end proof of the Oracle path with guardrails that preserve L0 invariants.

## Central Tension

Velocity vs. safety. We need real infrastructure to prove the Oracle works end-to-end, but every `terraform apply` creates irreversible state. Misconfigured KMS or missing PITR silently degrades guarantees.

## Levers

| Lever | Owner | Metric | Horizon |
| --- | --- | --- | --- |
| Terraform plan review gate | Lead Architect / Steward | Every `terraform plan` reviewed before `apply` | Day 19 |
| PITR verification script | Lead Architect / Steward | All 3 DynamoDB tables return `ENABLED` | Day 20 |
| CloudWatch alarm coverage | Lead Architect / Steward | 6 alarms in `OK` + SNS test received | Day 22 |
| E2E cycle proof | Lead Architect / Steward | PR to Oracle to FP event to drift detection | Day 24 |

## Deployment Path

Staging deploy via local CLI first, GitHub Actions OIDC second. This keeps Day 19 unblocked while OIDC secrets are added on Day 21.

## Implementation Tasks (Sequenced)

### Day 19 - Terraform to Staging

1. Create the staging workspace and plan:
   ```bash
   cd infra/terraform
   terraform workspace new staging
   terraform plan -var-file=staging.tfvars -out=staging.tfplan
   ```
2. Review the plan (expect ~15 resources).
3. Apply after manual review:
   ```bash
   terraform apply staging.tfplan
   ```

### Day 20 - Post-Deploy Validation

1. Enable and verify PITR:
   ```bash
   for table in fp-events consent block-counter; do
     aws dynamodb update-continuous-backups \
       --table-name "mirror-dissonance-staging-${table}" \
       --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
   done
   ./scripts/verify-pitr.sh staging
   ```
2. Generate initial nonce:
   ```bash
   ./scripts/rotate-nonce.sh staging 0
   ```
3. Verify CloudWatch alarms and test SNS alerting.
4. Run Oracle against staging and confirm FP event in DynamoDB.

### Day 21 - GitHub Secrets and Deploy Workflow

1. Add secrets:
   - `AWS_ROLE_ARN_STAGING`
   - `OPS_SNS_TOPIC_ARN_STAGING`
   - `TERRAFORM_STATE_BUCKET`
2. Confirm `.github/workflows/deploy-staging.yml` uses OIDC and integration tests.
3. Subscribe ops email to SNS topic and confirm the subscription.

### Day 22 - Monitoring

1. Apply CloudWatch dashboard changes.
2. Send a test SNS alert and confirm receipt.

### Days 23-24 - E2E Test

1. Create `PhaseMirror/Phase-Mirror-Test` repo.
2. Add `oracle-check.yml` workflow with OIDC.
3. Run full cycle: PR to Oracle to FP event to drift detection.
4. Run nonce rotation test to validate grace period behavior.

## Branch Strategy

This work lives on `infra/staging-deploy` and merges to `main` independently. Integration tests against staging validate that the adapter layer works with real DynamoDB, which is the Phase 4 proof.
