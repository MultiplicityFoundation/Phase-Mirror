#!/usr/bin/env bash
# Create GitHub OIDC provider in AWS

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
GITHUB_OIDC_URL="https://token.actions.githubusercontent.com"
GITHUB_THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GitHub OIDC Provider Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Region: $REGION"
echo "Provider URL: $GITHUB_OIDC_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if provider already exists
if aws iam list-open-id-connect-providers --region "$REGION" 2>/dev/null | grep -q "token.actions.githubusercontent.com"; then
  echo "✓ OIDC provider already exists"
  PROVIDER_ARN=$(aws iam list-open-id-connect-providers --region "$REGION" --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" --output text)
  echo "  ARN: $PROVIDER_ARN"
  exit 0
fi

echo "[1/2] Creating OIDC provider..."

PROVIDER_ARN=$(aws iam create-open-id-connect-provider \
  --url "$GITHUB_OIDC_URL" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "$GITHUB_THUMBPRINT" \
  --query 'OpenIDConnectProviderArn' \
  --output text \
  --region "$REGION")

echo "      ✓ Provider created: $PROVIDER_ARN"

echo ""
echo "[2/2] Tagging provider..."

aws iam tag-open-id-connect-provider \
  --open-id-connect-provider-arn "$PROVIDER_ARN" \
  --tags \
    Key=Project,Value=MirrorDissonance \
    Key=Purpose,Value=GitHubActionsOIDC \
  --region "$REGION"

echo "      ✓ Tags applied"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ OIDC provider ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Provider ARN:"
echo "  $PROVIDER_ARN"
echo ""
echo "Next: Create IAM roles for GitHub Actions"
