# Troubleshooting Guide

Comprehensive guide to diagnosing and resolving common issues with Mirror Dissonance.

## Table of Contents

- [Common Errors](#common-errors)
- [Debugging Procedures](#debugging-procedures)
- [AWS Connectivity Issues](#aws-connectivity-issues)
- [Performance Issues](#performance-issues)
- [GitHub Actions Issues](#github-actions-issues)

---

## Common Errors

### Error: "Nonce not found"

**Full Error Message:**
```
Error: Nonce parameter not found: /guardian/staging/redaction_nonce_v1
```

**Cause:** SSM parameter for nonce doesn't exist or is inaccessible.

**Solutions:**

1. **Generate the nonce:**
   ```bash
   ./scripts/rotate-nonce.sh staging 0
   ```

2. **Verify parameter exists:**
   ```bash
   aws ssm get-parameter \
     --name /guardian/staging/redaction_nonce_v1 \
     --with-decryption
   ```

3. **Check IAM permissions:**
   ```bash
   # Verify your role has ssm:GetParameter permission
   aws iam get-role-policy \
     --role-name YourOracleRole \
     --policy-name SSMReadPolicy
   ```

4. **Verify correct region:**
   ```bash
   # Ensure AWS_REGION matches where parameter was created
   export AWS_REGION=us-east-1
   ```

---

### Error: "DynamoDB table not found"

**Full Error Message:**
```
ResourceNotFoundException: Requested resource not found: Table: mirror-dissonance-staging-fp-events not found
```

**Cause:** DynamoDB table hasn't been created or wrong region/table name.

**Solutions:**

1. **Verify Terraform was applied:**
   ```bash
   cd infra/terraform
   terraform workspace select staging
   terraform plan -var-file=staging.tfvars
   # If changes shown, apply them:
   terraform apply -var-file=staging.tfvars
   ```

2. **Check table exists:**
   ```bash
   aws dynamodb list-tables | grep mirror-dissonance-staging
   ```

3. **Verify table name in configuration:**
   ```bash
   # Check that FP_TABLE_NAME matches actual table
   echo $FP_TABLE_NAME
   ```

4. **Confirm correct region:**
   ```bash
   aws dynamodb describe-table \
     --table-name mirror-dissonance-staging-fp-events \
     --region us-east-1
   ```

---

### Error: "Permission denied"

**Full Error Message:**
```
AccessDeniedException: User is not authorized to perform: dynamodb:PutItem on resource
```

**Cause:** IAM role lacks required permissions.

**Solutions:**

1. **Review IAM policy:**
   ```bash
   aws iam get-role-policy \
     --role-name GitHubActionsOracleRole \
     --policy-name OraclePolicy
   ```

2. **Verify required permissions exist:**
   Required permissions:
   - `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:Query` on tables
   - `ssm:GetParameter` on nonce parameter
   - `kms:Decrypt` on KMS key

3. **Check trust relationship for GitHub OIDC:**
   ```bash
   aws iam get-role \
     --role-name GitHubActionsOracleRole \
     --query 'Role.AssumeRolePolicyDocument'
   ```

4. **Update IAM policy:**
   ```bash
   cd infra/terraform
   terraform apply -var-file=staging.tfvars
   ```

---

### Error: "Schema validation failed"

**Full Error Message:**
```
Error: Schema validation failed: Expected version 1.2.0, got 1.1.0
```

**Cause:** Version mismatch between CLI and core library.

**Solutions:**

1. **Reinstall dependencies:**
   ```bash
   pnpm install
   ```

2. **Verify package versions:**
   ```bash
   pnpm list @mirror-dissonance/core
   pnpm list @mirror-dissonance/cli
   ```

3. **Rebuild packages:**
   ```bash
   pnpm build
   ```

4. **Clear cache:**
   ```bash
   rm -rf node_modules
   rm -rf packages/*/node_modules
   pnpm install
   ```

5. **Check for local links:**
   ```bash
   npm ls -g --link
   # If linked, rebuild:
   cd packages/cli && npm link
   ```

---

### Error: "Circuit breaker triggered"

**Full Error Message:**
```
CircuitBreakerError: Too many blocks detected (10 in last hour). Entering degraded mode.
```

**Cause:** System detected too many blocking violations in short time period.

**This is Expected Behavior!** The circuit breaker prevents cascading blocks.

**Actions:**

1. **Review recent FP events:**
   ```bash
   aws dynamodb scan \
     --table-name mirror-dissonance-staging-fp-events \
     --filter-expression "timestamp > :time" \
     --expression-attribute-values '{":time":{"N":"'$(date -d '1 hour ago' +%s)'"}}' \
     --limit 20
   ```

2. **Check if legitimate or false positives:**
   - If legitimate: Address the violations
   - If false positives: Mark them in system

3. **Mark false positives:**
   ```bash
   # Via CLI (when available)
   mirror-dissonance fp-mark \
     --event-id <event-id> \
     --reviewer <email> \
     --ticket <ticket-number>
   ```

4. **Wait for cooldown:**
   Default cooldown is 2 hours. Check counter:
   ```bash
   aws dynamodb get-item \
     --table-name mirror-dissonance-staging-block-counter \
     --key '{"counterId": {"S": "global"}}'
   ```

5. **Adjust threshold if needed:**
   Edit `infra/terraform/variables.tf`:
   ```hcl
   variable "circuit_breaker_threshold" {
     default = 15  # Increase from 10
   }
   ```

---

### Error: "Drift magnitude exceeds threshold"

**Full Error Message:**
```
DriftViolation: Schema drift magnitude 0.18 exceeds threshold of 0.15
```

**Cause:** Repository structure has changed significantly from baseline.

**Solutions:**

1. **Review drift details:**
   ```bash
   cat dissonance_report.json | jq '.violations[] | select(.rule == "MD-005")'
   ```

2. **Inspect what changed:**
   ```bash
   # Compare current state to baseline
   aws s3 cp s3://mirror-dissonance-staging-baselines/baseline.json - | \
     jq '.schema' > /tmp/baseline-schema.json
   
   # Generate current schema
   mirror-dissonance analyze --mode drift --output /tmp/current-schema.json
   
   # Compare
   diff /tmp/baseline-schema.json /tmp/current-schema.json
   ```

3. **If drift is intentional, update baseline:**
   ```bash
   # Generate new baseline
   mirror-dissonance analyze --mode drift --update-baseline
   
   # Upload to S3
   aws s3 cp dissonance_baseline.json \
     s3://mirror-dissonance-staging-baselines/baseline.json
   ```

4. **Adjust threshold if needed:**
   ```bash
   # In configuration
   export DRIFT_THRESHOLD=0.20  # Increase from 0.15
   ```

---

## Debugging Procedures

### Enable Verbose Logging

```bash
# CLI
mirror-dissonance analyze --verbose --log-level debug

# Environment variable
export LOG_LEVEL=debug
export VERBOSE=true
```

### Check CloudWatch Logs

```bash
# List log groups
aws logs describe-log-groups | grep mirror-dissonance

# Tail logs in real-time
aws logs tail /aws/lambda/mirror-dissonance-staging --follow

# Query specific errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/mirror-dissonance-staging \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

### Verify AWS Connectivity

```bash
# Test AWS credentials
aws sts get-caller-identity

# Test DynamoDB access
aws dynamodb describe-table \
  --table-name mirror-dissonance-staging-fp-events

# Test SSM access
aws ssm get-parameter \
  --name /guardian/staging/redaction_nonce_v1

# Test S3 access
aws s3 ls s3://mirror-dissonance-staging-baselines/
```

### Inspect Terraform State

```bash
cd infra/terraform

# Show current state
terraform show

# List resources
terraform state list

# Show specific resource
terraform state show aws_dynamodb_table.fp_events

# Verify outputs
terraform output
```

### Test Nonce Generation and Validation

```bash
# Generate test nonce
openssl rand -hex 32

# Test HMAC generation
echo -n "test-data" | \
  openssl dgst -sha256 -hmac "$(cat /dev/urandom | head -c 32 | xxd -p -c 64)"

# Verify nonce in SSM
aws ssm get-parameter \
  --name /guardian/staging/redaction_nonce_v1 \
  --with-decryption | \
  jq -r '.Parameter.Value' | \
  wc -c  # Should be 65 (64 hex chars + newline)
```

---

## AWS Connectivity Issues

### Issue: Credentials not found

**Error:**
```
NoCredentialsError: Unable to locate credentials
```

**Solutions:**

1. **Configure AWS CLI:**
   ```bash
   aws configure
   ```

2. **Use environment variables:**
   ```bash
   export AWS_ACCESS_KEY_ID=your_key
   export AWS_SECRET_ACCESS_KEY=your_secret
   export AWS_REGION=us-east-1
   ```

3. **Use IAM role (EC2/Lambda):**
   Ensure instance/function has attached IAM role

4. **For GitHub Actions, use OIDC:**
   ```yaml
   - uses: aws-actions/configure-aws-credentials@v4
     with:
       role-to-assume: ${{ secrets.AWS_ORACLE_ROLE }}
   ```

### Issue: Wrong region

**Error:**
```
Region not found: eu-west-1
```

**Solutions:**

1. **Set region explicitly:**
   ```bash
   export AWS_REGION=us-east-1
   ```

2. **Update Terraform:**
   ```hcl
   provider "aws" {
     region = "us-east-1"
   }
   ```

3. **Update CLI calls:**
   ```bash
   aws dynamodb list-tables --region us-east-1
   ```

---

## Performance Issues

### Issue: Slow analysis times

**Symptoms:** CLI takes >60 seconds to complete

**Diagnostics:**

1. **Enable timing metrics:**
   ```bash
   time mirror-dissonance analyze --verbose
   ```

2. **Check DynamoDB throttling:**
   ```bash
   # Get throttling metrics for the past hour
   aws cloudwatch get-metric-statistics \
     --namespace AWS/DynamoDB \
     --metric-name ThrottledRequests \
     --dimensions Name=TableName,Value=mirror-dissonance-staging-fp-events \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Sum
   ```

3. **Review L0 benchmark:**
   ```bash
   pnpm test:benchmark
   ```

**Solutions:**

1. **Increase DynamoDB capacity** (if using provisioned):
   ```bash
   aws dynamodb update-table \
     --table-name mirror-dissonance-staging-fp-events \
     --billing-mode PAY_PER_REQUEST
   ```

2. **Enable caching:**
   ```bash
   export CACHE_TTL=3600  # 1 hour
   ```

3. **Reduce rule complexity:**
   Disable non-critical rules in config

4. **Optimize queries:**
   Ensure GSI exists for common query patterns

---

## GitHub Actions Issues

### Issue: Workflow not triggering

**Symptoms:** PR created but no Oracle check runs

**Diagnostics:**

1. **Check workflow syntax:**
   ```bash
   # Use GitHub API to validate
   gh api repos/:owner/:repo/actions/workflows
   ```

2. **Verify triggers:**
   ```yaml
   on:
     pull_request:  # Ensure this matches your event
   ```

3. **Check Actions tab** for errors

**Solutions:**

1. **Enable Actions:**
   Repository Settings → Actions → Allow all actions

2. **Fix workflow syntax:**
   ```bash
   yamllint .github/workflows/mirror-dissonance.yml
   ```

3. **Check branch protection:**
   Ensure Oracle check is required in branch protection rules

### Issue: OIDC authentication fails

**Error:**
```
Error: Could not assume role with OIDC
```

**Solutions:**

1. **Verify OIDC provider exists:**
   ```bash
   aws iam list-open-id-connect-providers
   ```

2. **Check trust policy:**
   ```bash
   aws iam get-role \
     --role-name GitHubActionsOracleRole \
     --query 'Role.AssumeRolePolicyDocument'
   ```

3. **Ensure correct repo in trust policy:**
   ```json
   {
     "Condition": {
       "StringEquals": {
         "token.actions.githubusercontent.com:sub": "repo:owner/repo:*"
       }
     }
   }
   ```

4. **Update Terraform:**
   ```bash
   cd infra/terraform
   terraform apply -target=aws_iam_role.github_actions
   ```

---

## Getting More Help

If issues persist:

1. **Enable debug logging** and capture full output
2. **Check [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues)** for similar problems
3. **Review [FAQ.md](./FAQ.md)** for common questions
4. **File a bug report** with:
   - Full error message
   - Steps to reproduce
   - Environment details (Node version, AWS region, etc.)
   - Relevant logs

---

## Diagnostic Checklist

Before filing an issue, verify:

- [ ] AWS credentials configured and valid
- [ ] Correct AWS region set
- [ ] Terraform applied successfully
- [ ] All DynamoDB tables exist
- [ ] SSM nonce parameter exists
- [ ] IAM permissions correct
- [ ] Package versions match
- [ ] Dependencies installed
- [ ] Build successful
- [ ] CloudWatch logs checked
- [ ] Verbose logging enabled
