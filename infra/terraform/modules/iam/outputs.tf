output "terraform_role_arn" {
  description = "IAM role ARN for Terraform operations"
  value       = aws_iam_role.github_actions_terraform.arn
}

output "terraform_role_name" {
  description = "IAM role name for Terraform operations"
  value       = aws_iam_role.github_actions_terraform.name
}

output "deploy_role_arn" {
  description = "IAM role ARN for deploy/test operations"
  value       = aws_iam_role.github_actions_deploy.arn
}

output "deploy_role_name" {
  description = "IAM role name for deploy/test operations"
  value       = aws_iam_role.github_actions_deploy.name
}
