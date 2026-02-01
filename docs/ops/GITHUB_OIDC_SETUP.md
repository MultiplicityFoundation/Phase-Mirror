# GitHub Actions OIDC Authentication

## Overview

Phase Mirror uses OpenID Connect (OIDC) to authenticate GitHub Actions workflows with AWS, eliminating the need for long-lived AWS credentials.

## Architecture

```
GitHub Actions → OIDC Token → AWS STS → Temporary Credentials → AWS Services
```

**Benefits:**
- ✅ No AWS access keys in GitHub secrets
- ✅ Automatic credential rotation (1-hour sessions)
- ✅ Fine-grained IAM permissions per workflow
- ✅ Audit trail via CloudTrail
- ✅ Multi-environment isolation

## Setup

### Prerequisites

- AWS CLI configured with admin credentials
- Terraform >= 1.5.0
- GitHub repository admin access

### One-Time Setup

```bash
# 1. Create OIDC provider and IAM roles
./scripts/oidc/setup-oidc.sh

# 2. Verify setup
./scripts/oidc/verify-oidc.sh

# 3. Add secrets to GitHub
# Copy the role ARNs from step 2 output
```

## GitHub Secrets Configuration

Navigate to: `Settings → Secrets and variables → Actions → New repository secret`

Add two secrets:

**Secret 1:**
- Name: `AWS_TERRAFORM_ROLE_ARN`
- Value: `arn:aws:iam::<account-id>:role/mirror-dissonance-staging-github-terraform`

**Secret 2:**
- Name: `AWS_DEPLOY_ROLE_ARN`
- Value: `arn:aws:iam::<account-id>:role/mirror-dissonance-staging-github-deploy`

## IAM Roles

### Terraform Role

**Name:** `mirror-dissonance-staging-github-terraform`

**Purpose:** Infrastructure management via Terraform

**Permissions:**
- Terraform state (S3, DynamoDB)
- DynamoDB table management
- KMS key management
- SSM parameter management
- S3 bucket management
- CloudWatch management
- SNS topic management

**Trust Policy:**
```json
{
  "Principal": {
    "Federated": "arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com"
  },
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": [
        "repo:PhaseMirror/Phase-Mirror:ref:refs/heads/main",
        "repo:PhaseMirror/Phase-Mirror:ref:refs/heads/develop",
        "repo:PhaseMirror/Phase-Mirror:pull_request"
      ]
    }
  }
}
```

### Deploy Role

**Name:** `mirror-dissonance-staging-github-deploy`

**Purpose:** Application deployment and testing

**Permissions:**
- DynamoDB read/write
- SSM parameter read
- KMS decrypt (via DynamoDB/SSM)
- S3 baseline bucket access
- CloudWatch metrics/logs

## Workflows

### Terraform Workflow

**Triggers:**
- Push to `main` or `develop`
- Pull requests
- Manual dispatch

**Permissions:**
```yaml
permissions:
  id-token: write    # Required for OIDC
  contents: read
  pull-requests: write
```

**Usage:**
```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_TERRAFORM_ROLE_ARN }}
    aws-region: us-east-1
    role-session-name: GitHubActions-Terraform
```

### Integration Tests Workflow

**Triggers:**
- Push to any branch
- Pull requests
- Manual dispatch

**Permissions:**
```yaml
permissions:
  id-token: write
  contents: read
```

**Usage:**
```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
    aws-region: us-east-1
    role-session-name: GitHubActions-IntegrationTests
```

## Security Best Practices

### 1. Least Privilege
Each role has only the permissions needed for its specific purpose.

### 2. Branch Restrictions
Trust policy limits role assumption to:
- `main` branch
- `develop` branch
- Pull requests from the repository

### 3. Session Duration
Max session duration: 1 hour (automatically renewed by GitHub Actions)

### 4. Audit Trail
All AWS API calls logged to CloudTrail with session tags:
- `aws:userid`: GitHub Actions role
- `aws:sourceIdentity`: Workflow run ID

### 5. Multi-Environment Isolation
Separate roles per environment (staging, production)

## Troubleshooting

### "Error: Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Cause:** Trust policy doesn't match workflow context

**Solution:**
- Verify branch name in trust policy
- Check repository name matches exactly
- Ensure OIDC provider exists

### "Error: No OpenIDConnect provider found"

**Cause:** OIDC provider not created

**Solution:**
```bash
./scripts/oidc/create-oidc-provider.sh
```

### "Error: Access Denied" on AWS API

**Cause:** IAM role missing required permissions

**Solution:**
- Check role policies
- Verify resource ARNs match
- Review CloudTrail for denied actions

## Verify OIDC Setup

```bash
./scripts/oidc/verify-oidc.sh
```

## Cost

OIDC authentication is free. Costs:
- CloudTrail logging: ~$2/month
- STS API calls: Free tier (1M calls/month)

## References

- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS OIDC Documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials)
