# GitHub OIDC Identity Provider
#
# This resource creates the AWS IAM OIDC provider that allows GitHub Actions
# to assume IAM roles without long-lived credentials.
#
# Prerequisites:
#   - Run scripts/oidc/create-oidc-provider.sh first (one-time per account), OR
#   - Import existing provider: terraform import aws_iam_openid_connect_provider.github <ARN>
#
# The IAM roles that trust this provider are defined in modules/iam/.

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  # GitHub's OIDC thumbprint — AWS validates this automatically for
  # actions.githubusercontent.com, but it must be present in the resource.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1"
  ]

  tags = merge(
    local.common_tags,
    {
      Name    = "github-actions-oidc"
      Purpose = "GitHubActionsOIDC"
    }
  )
}
