#!/usr/bin/env bash
# Verify OIDC setup

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "OIDC Setup Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0

# Test 1: OIDC provider exists
echo "[1/4] Checking OIDC provider..."
if aws iam list-open-id-connect-providers --region "$REGION" 2>/dev/null | grep -q "token.actions.githubusercontent.com"; then
  PROVIDER_ARN=$(aws iam list-open-id-connect-providers --region "$REGION" --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" --output text)
  echo "      ✓ Provider exists: $PROVIDER_ARN"
else
  echo "      ✗ OIDC provider not found"
  FAILURES=$((FAILURES + 1))
fi

# Test 2: Terraform role exists
echo ""
echo "[2/4] Checking Terraform role..."
if aws iam get-role --role-name mirror-dissonance-staging-github-terraform --region "$REGION" &>/dev/null; then
  TERRAFORM_ROLE_ARN=$(aws iam get-role --role-name mirror-dissonance-staging-github-terraform --region "$REGION" --query 'Role.Arn' --output text)
  echo "      ✓ Role exists: $TERRAFORM_ROLE_ARN"
  
  # Check trust policy
  TRUST_POLICY=$(aws iam get-role --role-name mirror-dissonance-staging-github-terraform --region "$REGION" --query 'Role.AssumeRolePolicyDocument' --output json)
  if echo "$TRUST_POLICY" | jq -e '.Statement[0].Principal.Federated | contains("token.actions.githubusercontent.com")' >/dev/null; then
    echo "      ✓ OIDC trust policy configured"
  else
    echo "      ✗ Invalid trust policy"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "      ✗ Terraform role not found"
  FAILURES=$((FAILURES + 1))
fi

# Test 3: Deploy role exists
echo ""
echo "[3/4] Checking deploy role..."
if aws iam get-role --role-name mirror-dissonance-staging-github-deploy --region "$REGION" &>/dev/null; then
  DEPLOY_ROLE_ARN=$(aws iam get-role --role-name mirror-dissonance-staging-github-deploy --region "$REGION" --query 'Role.Arn' --output text)
  echo "      ✓ Role exists: $DEPLOY_ROLE_ARN"
else
  echo "      ✗ Deploy role not found"
  FAILURES=$((FAILURES + 1))
fi

# Test 4: Role permissions
echo ""
echo "[4/4] Checking role policies..."

if aws iam list-role-policies --role-name mirror-dissonance-staging-github-terraform --region "$REGION" | grep -q "TerraformOperations"; then
  echo "      ✓ Terraform role has policies"
else
  echo "      ✗ Terraform role missing policies"
  FAILURES=$((FAILURES + 1))
fi

if aws iam list-role-policies --role-name mirror-dissonance-staging-github-deploy --region "$REGION" | grep -q "DeployOperations"; then
  echo "      ✓ Deploy role has policies"
else
  echo "      ✗ Deploy role missing policies"
  FAILURES=$((FAILURES + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILURES -eq 0 ]; then
  echo "✓ All checks passed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Role ARNs for GitHub Secrets:"
  echo "  AWS_TERRAFORM_ROLE_ARN: $TERRAFORM_ROLE_ARN"
  echo "  AWS_DEPLOY_ROLE_ARN: $DEPLOY_ROLE_ARN"
  exit 0
else
  echo "✗ $FAILURES check(s) failed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
