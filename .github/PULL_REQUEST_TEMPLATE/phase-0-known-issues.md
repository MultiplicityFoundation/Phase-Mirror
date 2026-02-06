# Phase 0: Fix Known Issues and Error Propagation

## Summary
This PR addresses critical items identified in `docs/known-issues.md`, focusing on error handling and propagation across all persistence modules.

## Phase 0 Checklist

Map each commit to an item below. Each item should be its own atomic commit.

### Critical Fixes (Issues 1-3)
- [ ] **Fix CODEOWNERS placeholders**: Update `.github/CODEOWNERS` with real GitHub usernames
- [ ] **Implement drift detection baseline loading**: Replace placeholder echo with actual S3/artifact retrieval  
- [ ] **Ensure GitHub workflow labels exist**: Pre-create required labels with descriptions

### Error Handling Improvements (Issues 7-10)
- [ ] **Fix FP store error propagation**: Update `fp-store/store.ts` to re-throw errors with context instead of returning empty arrays
- [ ] **Add context to rule evaluation errors**: Update `rules/index.ts` to include rule ID and input context in error messages
- [ ] **Enhance nonce loading error context**: Update `nonce/loader.ts` to wrap errors with SSM parameter name and region
- [ ] **Improve CLI error diagnostics**: Update `cli/src/index.ts` to differentiate error types and provide troubleshooting guidance

### Code Quality (Issue 4)
- [ ] **Fix CLI hardcoded path resolution**: Use package resolution instead of relative paths for oracle module

## Testing
- [ ] All existing tests pass
- [ ] New tests added for error handling paths
- [ ] Build succeeds after each commit
- [ ] Manual verification of error messages complete

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (tests pass, build succeeds)
- [ ] No scope creep (each commit does exactly what message describes)
- [ ] All commits follow Conventional Commits format

## Related Documentation
- `docs/known-issues.md` - Source of Phase 0 items
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview
- `docs/COMMIT_DISCIPLINE.md` - Commit guidelines followed

## Review Notes
Each commit in this PR represents one completed point from Phase 0. Reviewers can examine commits individually to see the clean `git bisect` history, then review the PR as a whole to understand the architectural story of improved error propagation.

## Breaking Changes
- [ ] None
- [ ] Documented in CHANGELOG.md

## Security Considerations
- [ ] No new secrets exposed
- [ ] Error messages don't leak sensitive information
- [ ] All error handling tested for information disclosure

---
**Phase**: 0 (Foundation)  
**Branch**: `fix/known-issues`  
**Target**: `main`
