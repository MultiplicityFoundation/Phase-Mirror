# Governance Cache Table
#
# Stores org governance snapshots produced by the org-aggregator federation
# module. MD-101's cross-repo protection gap analysis loads from this cache
# rather than hitting the GitHub API at analysis time.
#
# Schema:
#   PK: org   (string)  — GitHub org login
#   SK: repo  (string)  — repo full_name (org/repo)
#   state     (string)  — JSON-encoded RepoGovernanceState
#   scannedAt (string)  — ISO 8601 timestamp of last scan
#   expiresAt (number)  — TTL epoch seconds (default: scan time + 2 hours)

resource "aws_dynamodb_table" "governance_cache" {
  name         = "${var.project_name}-${var.environment}-governance-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "org"
  range_key    = "repo"

  attribute {
    name = "org"
    type = "S"
  }

  attribute {
    name = "repo"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-governance-cache"
      Purpose     = "GovernanceCache"
      Component   = "Federation"
      Environment = var.environment
    }
  )
}
