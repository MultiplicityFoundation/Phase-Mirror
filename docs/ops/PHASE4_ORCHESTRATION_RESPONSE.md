# Phase 4: Infrastructure Deploy (Days 19–24)

Phase 4 is the `infra/staging-deploy` branch. It takes the tested adapter layer
and spec documents from prior phases and wires them to real cloud infrastructure
— staging first, then production readiness.

---

## Central Tension

**Velocity vs. safety.** We need real infrastructure running to prove the Oracle
works end-to-end, but every `terraform apply` against real AWS/GCP resources
introduces irreversible state. A misconfigured KMS key or a missing PITR enable
silently degrades L0 invariant guarantees.

---

## Levers

| Lever | Owner | Metric | Horizon |
|---|---|---|---|
| Terraform plan review gate | Lead Architect / Steward | `terraform plan` diff reviewed before every `apply`; zero unreviewed applies | Day 19 (7-day) |
| PITR verification script | Lead Architect / Steward | All 3 DynamoDB tables return `ENABLED` from `verify-pitr.sh` | Day 20 (7-day) |
| CloudWatch alarm coverage | Lead Architect / Steward | 8 alarms in `OK` state; SNS test alert received in inbox | Day 22 (30-day) |
| E2E cycle proof | Lead Architect / Steward | PR → Oracle → FP event in DynamoDB → drift detection completes in Phase-Mirror-Test repo | Day 24 (30-day) |

---

## Artifacts

| File | Purpose |
|---|---|
| `infra/terraform/backend.tf` | S3 backend + DynamoDB lock table configuration |
| `infra/terraform/main.tf` | 3 DynamoDB tables (fp-events, consent, block-counter), KMS key, SSM nonce parameter, CloudWatch alarms, S3 baselines, IAM OIDC, audit trail, backup |
| `infra/terraform/variables.tf` | Environment, region, PITR toggle, circuit breaker threshold |
| `infra/terraform/cloudwatch-dashboard.tf` | Dashboard for DynamoDB capacity, SSM errors, circuit breaker events, alarm status |
| `infra/terraform/staging.tfvars` | Staging-specific variable values |
| `infra/terraform/production.tfvars` | Production-specific variable values |
| `infra/terraform/github-oidc.tf` | GitHub Actions OIDC provider |
| `infra/terraform/outputs.tf` | All infrastructure outputs (ARNs, URLs, summaries) |
| `infra/gcp/main.tf` | GCP equivalent: Firestore, Secret Manager, Cloud Storage, Cloud KMS, Workload Identity Federation |
| `scripts/deploy-production.sh` | Manual approval gate + verify step |
| `scripts/deploy-staging.sh` | Staging deployment script |
| `scripts/verify-pitr.sh` | PITR status checker for all tables |
| `scripts/rotate-nonce.sh` | Nonce rotation with grace-period handoff |
| `.github/workflows/deploy-staging.yml` | GitHub Actions OIDC workflow |
| `docs/ops/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | Sign-off document |

---

## Deployment Path

Staging deploy via local CLI first, GitHub Actions OIDC second. This keeps
Day 19 unblocked while OIDC secrets are added on Day 21. If OIDC is already
configured from Phase 3 backend setup, Days 19 and 21 can be collapsed.

---

## Implementation Tasks (Sequenced)

### Day 19 — Terraform to Staging

1. Navigate to `infra/terraform`, create the staging workspace, and generate the
   plan:

   ```bash
   cd infra/terraform
   terraform workspace new staging
   terraform plan -var-file=staging.tfvars -out=staging.tfplan
   ```

2. Review the plan output — expect **~15 resources**: 3 DynamoDB tables, 1 SSM
   parameter, 1 KMS key, 8 CloudWatch alarms, 1 S3 baseline bucket, IAM roles
   for GitHub Actions OIDC.

3. Apply only after manual review:

   ```bash
   terraform apply staging.tfplan
   ```

4. GCP equivalent already exists at `infra/gcp/main.tf` with Firestore, Secret
   Manager, Cloud Storage, Cloud KMS, and Workload Identity Federation.

### Day 20 — Post-Deploy Validation

1. Enable PITR on all DynamoDB tables and verify:

   ```bash
   for table in fp-events consent block-counter; do
     aws dynamodb update-continuous-backups \
       --table-name "mirror-dissonance-staging-$table" \
       --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
   done
   ./scripts/verify-pitr.sh staging
   ```

2. Generate initial nonce:

   ```bash
   ./scripts/rotate-nonce.sh staging 0
   ```

3. Verify CloudWatch alarms fire on test conditions.

4. Run Oracle against staging, confirm FP event appears in DynamoDB.

### Day 21 — Configure GitHub Secrets & Deploy Workflow

1. Add these GitHub Actions secrets:
   - `AWS_ROLE_ARN_STAGING` — from `terraform output github_deploy_role_arn`
   - `OPS_SNS_TOPIC_ARN_STAGING` — from `terraform output sns_topic_arn`
   - `TERRAFORM_STATE_BUCKET` — the S3 backend bucket name

2. The `deploy-staging.yml` workflow is already configured with OIDC auth
   (`id-token: write`, `contents: read`), build, test, and integration test
   steps against staging tables.

3. Subscribe ops email to SNS topic and confirm subscription.

### Day 22 — CloudWatch Dashboard & Monitoring

1. The `cloudwatch-dashboard.tf` provides panels for:
   - DynamoDB capacity usage (all 3 tables, read + write)
   - DynamoDB user errors and system errors
   - SSM parameter access failures
   - Circuit breaker events
   - Active alarm status widget

2. Send a test SNS alert and confirm receipt:

   ```bash
   aws sns publish \
     --topic-arn "$(cd infra/terraform && terraform output -raw sns_topic_arn)" \
     --subject "[Test] Phase 4 monitoring validation" \
     --message "Test alert from Phase 4 Day 22" \
     --region us-east-1
   ```

### Days 23–24 — E2E Test

1. Create `PhaseMirror/Phase-Mirror-Test` repository.

2. Add the Oracle check workflow (`.github/workflows/oracle-check.yml`) using
   OIDC and the staging config.

3. Run the full cycle: **create PR → Oracle triggers → report generated → FP
   event recorded → merge queue → drift detection**.

4. Run nonce rotation test script to verify grace-period behavior against
   staging SSM:

   ```bash
   ./scripts/test-nonce-rotation.sh staging
   ```

---

## Alarm Coverage (8 alarms)

| # | Alarm | Table/Metric | Threshold |
|---|---|---|---|
| 1 | `fp-events-read-throttle` | fp-events / ReadThrottleEvents | > 10 / 5 min |
| 2 | `fp-events-write-throttle` | fp-events / WriteThrottleEvents | > 10 / 5 min |
| 3 | `consent-read-throttle` | consent / ReadThrottleEvents | > 10 / 5 min |
| 4 | `consent-write-throttle` | consent / WriteThrottleEvents | > 10 / 5 min |
| 5 | `block-counter-read-throttle` | block-counter / ReadThrottleEvents | > 10 / 5 min |
| 6 | `block-counter-write-throttle` | block-counter / WriteThrottleEvents | > 10 / 5 min |
| 7 | `ssm-parameter-failures` | Custom / SSMParameterFailures | > 5 / 5 min |
| 8 | `circuit-breaker-triggered` | Custom / CircuitBreakerTriggers | > 0 / 5 min |

---

## Branch Strategy

This work lives on `infra/staging-deploy` and merges to `main` independently. It
has no dependency on `test/integration` — but running integration tests *against
staging* validates that the adapter layer actually works with real DynamoDB,
which is the whole point.

### Recommended Commit Sequence

1. `infra: configure Terraform backend for staging`
2. `infra: deploy staging DynamoDB + KMS + SSM`
3. `infra: enable PITR and CloudWatch alarms`
4. `ci: add deploy-staging GitHub Actions workflow`
5. `infra: create CloudWatch dashboard`
6. `test: E2E validation against staging`

---

## Precision Question

> **Are you deploying staging to AWS (Terraform apply from local CLI) or via
> GitHub Actions OIDC?**
>
> The answer determines whether you need `AWS_ROLE_ARN_STAGING` configured
> *before* Day 19 (OIDC path) or can proceed with local credentials and add the
> workflow later (Day 21). The phased plan assumes local apply first, OIDC second
> — but if you've already configured OIDC from the Phase 3 backend setup, you
> can collapse Days 19 and 21.
