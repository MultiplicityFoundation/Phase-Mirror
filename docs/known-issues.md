# Known Issues and Limitations

This document tracks known issues, limitations, and areas for improvement in the Mirror Dissonance Protocol implementation.

## Critical Items (Must Address Before Production)

### 1. CODEOWNERS Placeholders
**File:** `.github/CODEOWNERS`
**Issue:** Contains placeholder usernames (`@steward-username`, `@security-lead`, `@ops-team`)
**Impact:** Code review assignments will not work until real usernames are provided
**Action Required:** Update with actual GitHub usernames or teams before enabling branch protection

### 2. Drift Detection Baseline Loading
**File:** `.github/workflows/drift-detection.yml`, line 36-39
**Issue:** Baseline download step is not implemented (only contains a placeholder echo)
**Impact:** Drift detection workflow will fail without a baseline file
**Action Required:** Implement actual baseline retrieval from S3, GitHub artifacts, or other storage

### 3. GitHub Labels for Auto-Created Issues
**File:** `.github/workflows/drift-detection.yml`, line 71
**Issue:** Issue labels ('oracle', 'drift-detection') may not exist in repository
**Impact:** Auto-created issues may fail or create labels without descriptions
**Action Required:** Pre-create labels or remove from workflow until labels are configured

## Important Improvements

### 4. CLI Path Resolution ✅ RESOLVED
**File:** `packages/cli/src/paths.ts`
**Status:** Resolved - Implemented package-relative path resolution
**Solution:** Created path resolution utility that works in all deployment contexts:
  - Monorepo development: Uses sibling package resolution
  - Global install: Uses node_modules resolution
  - npx execution: Cascades through multiple strategies
  - Docker containers: Falls back to bundled resources
**Implementation:** Three-tier resolution cascade for schema, rules, and config files

### 5. SSM Nonce Lifecycle Management
**File:** `infra/terraform/main.tf`, lines 109-111
**Issue:** Terraform ignores changes to nonce value after initial creation
**Impact:** Cannot rotate nonce through Terraform apply
**Severity:** Medium
**Recommendation:** Document manual rotation procedure or implement controlled update mechanism

### 6. TypeScript rootDir Configuration
**File:** `tsconfig.json`, line 8
**Issue:** rootDir set to "./" instead of "./src"
**Impact:** May include unexpected files in compilation
**Severity:** Low
**Recommendation:** Consider changing to "./src" or use "composite" project references

## Error Handling Improvements

### 7. Rule Evaluation Error Handling
**File:** `packages/mirror-dissonance/src/rules/index.ts`, lines 28-37
**Issue:** Errors only logged to console, not propagated with full context
**Impact:** Could mask critical errors during rule evaluation
**Severity:** Medium
**Recommendation:** Add structured error logging, consider metrics/monitoring

### 8. FP Store Error Handling
**File:** `packages/mirror-dissonance/src/fp-store/store.ts`, lines 44-87
**Issue:** DynamoDB errors logged but not propagated; returns empty arrays/false
**Impact:** Silent failures could lead to incorrect decisions
**Severity:** Medium
**Recommendation:** Implement proper fallback behavior or fail-fast for critical paths

### 9. Nonce Loading Error Context
**File:** `packages/mirror-dissonance/src/nonce/loader.ts`, lines 35-38
**Issue:** Error lacks context about which SSM parameter failed
**Impact:** Harder to debug SSM access issues
**Severity:** Low
**Recommendation:** Wrap error with parameter name and region information

### 10. CLI Generic Error Handling
**File:** `packages/cli/src/index.ts`, lines 92-95
**Issue:** All errors handled generically with minimal diagnostic info
**Impact:** Users get unhelpful error messages
**Severity:** Low
**Recommendation:** Differentiate error types and provide specific troubleshooting guidance

## Design Considerations

### 11. Workspace Package Dependencies
**File:** `packages/cli/package.json`, line 19
**Issue:** Uses `workspace:*` reference which requires build order
**Impact:** CLI build depends on core package being built first
**Severity:** Low
**Note:** Current pnpm scripts handle this correctly, but worth documenting

## Security Notes

### 12. Nonce Exposure Risk
**Files:** Various
**Note:** Nonce is properly stored in SSM SecureString and never logged
**Status:** ✅ Handled correctly
**Reminder:** Ensure CloudWatch Logs don't capture nonce in error messages

### 13. Redaction Coverage
**File:** `packages/mirror-dissonance/src/redaction/redactor.ts`
**Note:** Current rules cover common patterns (API keys, emails, AWS creds, IPs)
**Status:** ✅ Good starting point
**Recommendation:** Periodically review and add organization-specific patterns

## Future Enhancements

### 14. Machine Learning Integration
**Priority:** Medium
**Description:** Learn from false positive patterns to improve rule accuracy
**Benefit:** Reduced manual false positive management

### 15. Custom Threshold Configuration
**Priority:** Medium
**Description:** Per-repository or per-branch threshold configuration
**Benefit:** More flexible policy enforcement

### 16. Web Dashboard
**Priority:** Low
**Description:** Visualization of trends, violations, and metrics over time
**Benefit:** Better observability and insights

### 17. Webhook Integration
**Priority:** Low
**Description:** Send notifications to Slack, PagerDuty, or other tools
**Benefit:** Improved team awareness of violations

## Documentation Gaps

### 18. Nonce Rotation Procedure
**Status:** Documented in runbook but could be more detailed
**Recommendation:** Add step-by-step guide with rollback procedure

### 19. Rule Development Guide
**Status:** Architecture doc mentions extensibility but lacks tutorial
**Recommendation:** Create guide with example rule from start to finish

### 20. Threshold Tuning Guide
**Status:** Thresholds documented but tuning guidance minimal
**Recommendation:** Add guide on analyzing violation patterns and adjusting thresholds

## Testing Coverage

### 21. Unit Tests
**Status:** Not implemented (placeholder in package.json)
**Priority:** High for production deployment
**Recommendation:** Add Jest or similar test framework with rule unit tests

### 22. Integration Tests
**Status:** Manual testing performed, no automated integration tests
**Priority:** Medium
**Recommendation:** Add tests for AWS integration, CLI end-to-end scenarios

### 23. Performance Tests
**Status:** Not implemented
**Priority:** Low (manual observation shows good performance)
**Recommendation:** Add benchmarks if scaling becomes a concern

## Monitoring Gaps

### 24. Custom CloudWatch Metrics
**Status:** Alarms configured but not emitting custom metrics
**Priority:** Medium
**Recommendation:** Emit metrics for decisions, violations by rule, etc.

### 25. Distributed Tracing
**Status:** Not implemented
**Priority:** Low
**Recommendation:** Consider AWS X-Ray if troubleshooting complex scenarios

## Deployment Considerations

### 26. Multi-Region Support
**Status:** Hardcoded to us-east-1 in many places
**Priority:** Low (unless multi-region needed)
**Recommendation:** Make region configurable via environment variables

### 27. Cost Optimization
**Status:** Using DynamoDB on-demand pricing
**Note:** Appropriate for initial deployment
**Recommendation:** Monitor usage and consider provisioned capacity if costs grow

### 28. Backup and Recovery
**Status:** DynamoDB provides point-in-time recovery capability
**Priority:** Medium
**Recommendation:** Enable PITR for production DynamoDB tables

## Summary

- **Critical**: 3 items requiring attention before production
- **Important**: 7 items for near-term improvement (1 resolved)
- **Future**: 7 enhancement ideas
- **Documentation**: 3 gaps to fill
- **Testing**: 3 coverage areas
- **Operational**: 3 deployment considerations

Total: 23 tracked items (1 resolved)

Last Updated: 2026-02-06
