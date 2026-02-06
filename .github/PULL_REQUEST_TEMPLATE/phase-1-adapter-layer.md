# Phase 1: Introduce Cloud-Agnostic Adapter Layer

## Summary
This PR introduces a cloud-agnostic adapter layer that abstracts persistence operations across multiple cloud providers (AWS, GCP, Oracle Cloud) and local development environments.

## Phase 1 Checklist

Each commit below is an atomic, verifiable unit implementing one aspect of the adapter layer.

### Adapter Foundation (Commits 1-2)
- [ ] **Define adapter interfaces and types**: Create interface definitions for cloud providers, common types, and error structures
- [ ] **Implement local adapter**: File-based persistence with JSON storage for development

### Cloud Provider Adapters (Commits 3-5)  
- [ ] **Refactor AWS adapter**: Extract AWS-specific code (DynamoDB/SSM) to implement adapter interface
- [ ] **Add GCP adapter with wiring**: Implement Firestore/Secret Manager adapter and connect to orchestrator
- [ ] **Add Oracle Cloud adapter**: Implement Oracle-specific persistence with configuration documentation

### Orchestration (Commit 6)
- [ ] **Create adapter orchestrator**: Provider selection logic, unified error handling, failover support

## Architecture Changes

### Before (Tightly Coupled)
```
┌─────────────┐
│ FP Store    │──> DynamoDB (hardcoded)
├─────────────┤
│ Nonce Store │──> SSM (hardcoded)
└─────────────┘
```

### After (Abstracted)
```
┌─────────────┐      ┌──────────────┐
│ FP Store    │──>   │ Orchestrator │──> AWS Adapter    ──> DynamoDB
├─────────────┤      │              │──> GCP Adapter    ──> Firestore
│ Nonce Store │──>   │              │──> Oracle Adapter ──> Oracle DB
└─────────────┘      │              │──> Local Adapter  ──> JSON Files
                     └──────────────┘
```

## Testing
- [ ] All existing integration tests pass with AWS adapter
- [ ] Local adapter tests pass (no cloud dependencies)
- [ ] GCP adapter tests pass with emulator
- [ ] Oracle adapter tests pass (if credentials available)
- [ ] Orchestrator selects correct adapter based on config
- [ ] Build succeeds after each commit

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (tests pass, build succeeds)
- [ ] No scope creep (no performance optimizations from Phase 0 point 4)
- [ ] All commits follow Conventional Commits format

## Configuration Changes

New environment variables:
```bash
CLOUD_PROVIDER=aws|gcp|oracle|local  # Default: aws
AWS_REGION=us-east-1                 # AWS-specific
GCP_PROJECT_ID=my-project            # GCP-specific
ORACLE_CONNECT_STRING=...            # Oracle-specific
LOCAL_STORAGE_PATH=/data             # Local development
```

## Migration Guide
Existing deployments using AWS will continue to work with no changes (default provider is `aws`). To use a different provider:

1. Set `CLOUD_PROVIDER` environment variable
2. Provide provider-specific configuration
3. Redeploy application

## Related Documentation
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview
- `docs/CLOUD_PROVIDER_SETUP.md` - Provider configuration guide
- `ADR-XXX` - Decision record for adapter pattern (to be created)

## Review Notes
This PR refactors existing cloud-specific code into a pluggable adapter pattern. Each commit:
1. Defines interfaces → 2. Implements local adapter → 3-5. Migrates cloud providers → 6. Adds orchestration

The incremental approach ensures we can bisect if issues arise during the migration.

## Breaking Changes
- [ ] None (backward compatible with default AWS provider)
- [ ] Documented in CHANGELOG.md

## Performance Impact
- [ ] Negligible (one additional function call for provider selection)
- [ ] Benchmarks show <1ms overhead per operation

## Security Considerations
- [ ] Each adapter implements same security controls
- [ ] Provider credentials isolated to adapter implementations
- [ ] No cross-provider credential leakage possible
- [ ] Redaction still applies to all adapters

---
**Phase**: 1 (Adapter Layer)  
**Branch**: `refactor/adapter-layer`  
**Target**: `main`  
**Depends On**: Phase 0 (`fix/known-issues`)
