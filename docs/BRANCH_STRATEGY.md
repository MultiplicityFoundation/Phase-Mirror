# Phase Mirror Branch Strategy

## Overview

The Phase Mirror project uses a **point-by-point commit, phase-level PR** strategy that combines the clean `git bisect` history of individual atomic commits with the reviewable narrative of coherent pull requests.

## Core Principles

### 1. Atomic Commits
Each commit is a **verifiable unit** — you run the build, confirm the fix, move on. Every commit should:
- Pass all tests
- Build successfully
- Address exactly one concern
- Be bisectable (can be used as a good/bad point in `git bisect`)

### 2. Phase-Level PRs
The PR is where the **architectural story** lives. A reviewer looking at a Phase PR sees the complete change as a single coherent narrative, not as unrelated patches landing on `main` at different times.

### 3. Scope Discipline
**Write the commit message before you start coding.** The message is your scope boundary — if you find yourself doing something the message doesn't describe, that's a different commit.

## Branch Structure

The Phase Mirror development is organized into six phases, each with its own branch and PR:

| Branch | Commit Count | PR Title | Purpose |
|--------|-------------|----------|---------|
| `fix/known-issues` | ~8 commits | Fix critical known issues and error propagation | Phase 0: Address critical items from known-issues.md |
| `refactor/adapter-layer` | ~6 commits | Introduce cloud-agnostic adapter layer | Phase 1: Implement abstraction for multi-cloud support |
| `test/unit-coverage` | ~5 commits | Achieve 80% unit test coverage | Phase 2: Build comprehensive unit test suite |
| `test/integration` | ~3 commits | Add integration test suite | Phase 3: Implement integration tests with LocalStack |
| `docs/spec-documents` | 3 commits | Formalize three-plane architecture specs | Phase 4: Create SPEC-COMPUTE, SPEC-PMD, SPEC-TRUST |
| `infra/staging-deploy` | ~4 commits | Deploy and validate staging infrastructure | Phase 5: Production-ready infrastructure deployment |

## Phase 0: Known Issues (fix/known-issues)

This phase addresses the 8 critical items identified in `docs/known-issues.md`. Each commit targets one specific issue:

### Planned Commits

1. **Fix CODEOWNERS placeholders**
   - Update `.github/CODEOWNERS` with real GitHub usernames
   - Update branch protection rules if needed

2. **Implement drift detection baseline loading**
   - Replace placeholder echo with actual S3/artifact retrieval
   - Add error handling for missing baselines

3. **Ensure GitHub workflow labels exist**
   - Pre-create required labels ('oracle', 'drift-detection')
   - Add descriptions for each label

4. **Improve FP store error propagation**
   - Update `packages/mirror-dissonance/src/fp-store/store.ts`
   - Propagate DynamoDB errors instead of returning empty arrays
   - Add proper fallback behavior or fail-fast for critical paths

5. **Add context to rule evaluation errors**
   - Update `packages/mirror-dissonance/src/rules/index.ts`
   - Include rule ID, input context in error messages
   - Consider structured logging/metrics

6. **Enhance nonce loading error context**
   - Update `packages/mirror-dissonance/src/nonce/loader.ts`
   - Wrap errors with SSM parameter name and region

7. **Improve CLI error diagnostics**
   - Update `packages/cli/src/index.ts`
   - Differentiate error types
   - Provide specific troubleshooting guidance

8. **Fix CLI hardcoded path resolution**
   - Use package resolution instead of relative paths
   - Make compatible with global installation

## Phase 1: Adapter Layer (refactor/adapter-layer)

Build a cloud-agnostic abstraction layer for multi-provider support.

### Planned Commits

1. **Define adapter interfaces and types**
   - Create interface definitions for cloud providers
   - Define common types and error structures

2. **Implement local adapter**
   - File-based persistence for development
   - JSON storage for state

3. **Refactor AWS adapter**
   - Implement adapter interface for DynamoDB/SSM
   - Extract AWS-specific code to adapter

4. **Add GCP adapter with proper wiring**
   - Implement Firestore/Secret Manager adapter
   - Connect to orchestrator

5. **Add Oracle Cloud adapter**
   - Implement Oracle-specific persistence
   - Document configuration requirements

6. **Create adapter orchestrator**
   - Provider selection logic
   - Unified error handling
   - Failover support

## Phase 2: Unit Test Coverage (test/unit-coverage)

Achieve 80% code coverage with comprehensive unit tests.

### Planned Commits

1. **Set up Jest configuration and test infrastructure**
   - Configure Jest with TypeScript
   - Set up coverage thresholds
   - Create test utilities

2. **Add L0 invariants unit tests**
   - Test each invariant rule
   - Edge cases and error conditions

3. **Add FP store unit tests**
   - Test persistence operations
   - Mock DynamoDB interactions
   - Error handling scenarios

4. **Add consent store unit tests**
   - Test consent management
   - Nonce validation logic

5. **Add redactor unit tests**
   - Test all redaction patterns
   - Ensure no false positives/negatives

## Phase 3: Integration Tests (test/integration)

End-to-end testing with LocalStack and real workflows.

### Planned Commits

1. **Set up LocalStack test environment**
   - Configure DynamoDB, SSM, S3 emulation
   - Create docker-compose setup
   - Add setup/teardown scripts

2. **Add nonce rotation integration test**
   - Test full nonce lifecycle
   - Verify SSM parameter updates
   - Validate rotation workflow

3. **Add FP workflow integration test**
   - Test complete false positive flow
   - Multi-component interaction
   - State transitions

## Phase 4: Specification Documents (docs/spec-documents)

Formalize the three-plane architecture with detailed specifications.

### Planned Commits

1. **Create SPEC-COMPUTE.md**
   - Computational plane specification
   - L0-L3 invariants formal definitions
   - Performance requirements

2. **Create SPEC-PMD.md**
   - Phase Mirror Dissonance protocol specification
   - State machine diagrams
   - API contracts

3. **Create SPEC-TRUST.md**
   - Trust plane specification
   - Identity verification requirements
   - Reputation algorithms

## Phase 5: Staging Infrastructure (infra/staging-deploy)

Deploy and validate production-ready infrastructure.

### Planned Commits

1. **Deploy backend infrastructure**
   - Terraform apply for staging
   - DynamoDB tables, SSM parameters
   - IAM roles and policies

2. **Create Terraform plan validation**
   - Add automated plan checks
   - Drift detection integration

3. **Set up monitoring and alarms**
   - CloudWatch dashboards
   - Custom metrics emission
   - Alert configurations

4. **Add end-to-end validation tests**
   - Smoke tests against staging
   - Performance benchmarks
   - Failure scenario testing

## Workflow Guidelines

### Before Starting a Commit

1. **Write the commit message first**
   ```bash
   # Create commit-msg.txt
   echo "fix(fp-store): propagate DynamoDB errors instead of returning empty arrays" > commit-msg.txt
   ```

2. **Use the message as your scope boundary**
   - If you find yourself doing work not described in the message, stop
   - That work belongs in a different commit

3. **Make the change**
   - Focus only on what the commit message describes
   - Keep changes minimal and targeted

4. **Verify the commit**
   ```bash
   # Ensure tests pass
   pnpm test
   
   # Ensure build succeeds
   pnpm build
   
   # Commit with your pre-written message
   git commit -F commit-msg.txt
   ```

### Creating a Phase PR

1. **Create the phase branch**
   ```bash
   git checkout -b fix/known-issues
   ```

2. **Make commits following the plan**
   - Each commit is atomic and verifiable
   - Tests pass after each commit
   - Build succeeds after each commit

3. **Write PR description as checklist**
   ```markdown
   ## Phase 0: Fix Known Issues
   
   This PR addresses critical error handling issues identified in docs/known-issues.md
   
   ### Checklist
   - [x] Fix CODEOWNERS placeholders
   - [x] Implement drift detection baseline loading
   - [x] Ensure GitHub workflow labels exist
   - [x] Improve FP store error propagation
   - [x] Add context to rule evaluation errors
   - [x] Enhance nonce loading error context
   - [x] Improve CLI error diagnostics
   - [x] Fix CLI hardcoded path resolution
   ```

4. **Map commits to checklist**
   - Each checklist item corresponds to one commit
   - Reviewers can trace code changes back to blueprint

### Example: Phase 0 Point 4 (FP Store)

**GOOD** - Following the discipline:
```bash
# 1. Write commit message first
echo "fix(fp-store): propagate DynamoDB errors instead of silently returning empty arrays

When DynamoDB operations fail, the error is logged but an empty array is returned,
masking critical failures. This commit updates getRecentEvents and related methods
to re-throw errors with proper context, allowing callers to handle failures appropriately.

Refs: docs/known-issues.md #8" > commit-msg.txt

# 2. Make ONLY the changes described
# - Update error handling in fp-store/store.ts
# - Add error propagation tests
# - Do NOT refactor computeWindow() method (that's Phase 1)

# 3. Verify and commit
pnpm test && pnpm build
git add packages/mirror-dissonance/src/fp-store/store.ts
git add packages/mirror-dissonance/tests/fp-store/error-handling.test.ts
git commit -F commit-msg.txt
```

**BAD** - Scope creep:
```bash
# Making FP store changes AND refactoring computeWindow
# This violates the scope boundary — computeWindow is Phase 1 work
git add packages/mirror-dissonance/src/fp-store/store.ts
git add packages/mirror-dissonance/src/window/compute-window.ts  # ❌ Wrong phase!
```

## Benefits

### For Development
- **Clear progress**: Each commit represents completed work
- **Easy debugging**: `git bisect` can pinpoint exact failure introduction
- **Parallel work**: Multiple developers can work on different phases
- **Rollback safety**: Can revert individual commits without losing phase progress

### For Review
- **Coherent story**: Phase PR shows complete architectural change
- **Manageable chunks**: Reviewers can understand changes commit-by-commit
- **Clear intent**: Commit messages map directly to blueprint
- **Traceable decisions**: Link between issue → commit → PR is explicit

### For History
- **Maintainable**: Future developers see both micro (commit) and macro (PR) views
- **Debuggable**: `git bisect` works perfectly with atomic commits
- **Documentable**: Commit log reflects actual development plan
- **Auditable**: Clear chain from requirement → implementation → deployment

## Anti-Patterns to Avoid

### ❌ Scope Creep
**Problem**: While fixing error handling, also refactoring unrelated code

**Solution**: Create a new commit for the refactoring, or defer to appropriate phase

### ❌ Kitchen Sink Commits
**Problem**: "Fixed multiple issues" commit with unrelated changes

**Solution**: Split into separate commits, one per issue

### ❌ Work-in-Progress Commits
**Problem**: "WIP" or "checkpoint" commits that don't build

**Solution**: Use git stash or local branches; only commit working code

### ❌ Retroactive Commit Messages
**Problem**: Writing commit message after the work is done

**Solution**: Write message first — it defines the scope

### ❌ Cross-Phase Changes
**Problem**: Including Phase 1 adapter work in Phase 0 PR

**Solution**: Stick to the phase plan; file issues for cross-cutting concerns

## Tools and Automation

### Pre-Commit Hooks
```bash
# Ensure tests pass before committing
# .git/hooks/pre-commit
#!/bin/bash
pnpm test:unit || exit 1
```

### Commit Message Template
```bash
# .git/commit-template
# <type>(<scope>): <subject>
#
# <body>
#
# Refs: docs/known-issues.md #<issue-number>

git config commit.template .git/commit-template
```

### PR Template
Create `.github/pull_request_template.md`:
```markdown
## Phase: [Phase Name]

### Summary
Brief description of what this phase accomplishes

### Checklist
Map each commit to a checklist item:
- [ ] Point 1: Description
- [ ] Point 2: Description
...

### Testing
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Manual verification complete

### Related Issues
Refs: docs/known-issues.md, ADR-XXX, etc.
```

## FAQ

**Q: What if I discover an issue while working on a phase?**

A: Document it in `known-issues.md` or create an issue. If it's critical to your current work, add it to the phase plan with team approval.

**Q: Can commits be squashed during merge?**

A: **No**. Squashing defeats the purpose of point-by-point commits. Use merge commits or rebase merge to preserve history.

**Q: What if a commit introduces a test failure?**

A: That commit should not be pushed. Fix the test or adjust the change so the commit is self-contained and passing.

**Q: How do I handle dependencies between phases?**

A: Phases should be designed to be independent where possible. If Phase 2 needs Phase 1 work, complete Phase 1 first, or create a "Phase 1.5" branch.

**Q: Can I work on multiple phases simultaneously?**

A: Yes, but in separate branches. Don't mix phase work in a single branch/PR.

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Bisect Documentation](https://git-scm.com/docs/git-bisect)
- [docs/known-issues.md](./known-issues.md) - Phase 0 source
- [CONTRIBUTING.md](../CONTRIBUTING.md) - General contribution guidelines

---

**Last Updated**: 2026-02-06
**Status**: Active
**Owner**: Development Team
