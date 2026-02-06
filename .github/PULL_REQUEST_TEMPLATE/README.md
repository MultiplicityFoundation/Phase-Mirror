# Pull Request Templates

This directory contains phase-specific PR templates for the Phase Mirror project's structured development workflow.

## Overview

Phase Mirror uses a **point-by-point commit, phase-level PR** strategy where:
- Each **commit** is an atomic, verifiable unit (bisectable)
- Each **PR** represents a coherent phase with an architectural story

## Available Templates

### Phase 0: Known Issues (`phase-0-known-issues.md`)
**Branch**: `fix/known-issues`  
**Commits**: ~8  
**Purpose**: Address critical error handling and propagation issues

### Phase 1: Adapter Layer (`phase-1-adapter-layer.md`)
**Branch**: `refactor/adapter-layer`  
**Commits**: ~6  
**Purpose**: Introduce cloud-agnostic abstraction for multi-provider support

### Phase 2: Unit Tests (`phase-2-unit-tests.md`)
**Branch**: `test/unit-coverage`  
**Commits**: ~5  
**Purpose**: Achieve 80% unit test coverage across core modules

### Phase 3: Integration Tests (`phase-3-integration-tests.md`)
**Branch**: `test/integration`  
**Commits**: ~3  
**Purpose**: Add integration test suite with LocalStack

### Phase 4: Specification Documents (`phase-4-spec-documents.md`)
**Branch**: `docs/spec-documents`  
**Commits**: 3  
**Purpose**: Formalize three-plane architecture specifications

### Phase 5: Staging Infrastructure (`phase-5-staging-deploy.md`)
**Branch**: `infra/staging-deploy`  
**Commits**: ~4  
**Purpose**: Deploy and validate production-ready infrastructure

## Using Templates

### Automatic Selection
When you create a PR, GitHub will detect these templates. You can choose the appropriate phase template from the dropdown.

### Manual Selection
You can also manually reference a template by adding this to your PR URL:
```
?template=phase-0-known-issues.md
```

### Creating a Phase PR

1. **Create the branch**:
   ```bash
   git checkout -b fix/known-issues
   ```

2. **Make atomic commits** following the phase plan:
   ```bash
   # Write commit message first
   echo "fix(fp-store): propagate DynamoDB errors" > commit-msg.txt
   
   # Make changes
   # ... edit files ...
   
   # Verify
   pnpm test && pnpm build
   
   # Commit
   git commit -F commit-msg.txt
   ```

3. **Open PR** using the appropriate template:
   - Title: Use the PR title from the phase table
   - Description: Use the phase template checklist
   - Map each commit to a checklist item

## Template Structure

Each template includes:
- **Summary**: What this phase accomplishes
- **Checklist**: Maps commits to work items
- **Testing**: Verification requirements
- **Commit Discipline**: Reminds of workflow rules
- **Related Documentation**: Links to specs and guides
- **Review Notes**: What reviewers should look for

## Commit Discipline

All phase work follows these principles:

1. **Write commit message before coding** - defines scope
2. **Each commit passes tests and builds** - bisectable
3. **No scope creep** - stick to what message describes
4. **Conventional Commits format** - `type(scope): subject`

**Full guidelines**: See [docs/COMMIT_DISCIPLINE.md](../../docs/COMMIT_DISCIPLINE.md)

## Phase Dependencies

Phases should be completed in order:
```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Each phase builds on the previous, though some parallel work is possible with care.

## Benefits

### For Developers
- Clear progress tracking with checklists
- Easy debugging with `git bisect`
- Parallel work across phases possible
- Rollback safety (revert individual commits)

### For Reviewers
- Coherent architectural story per phase
- Can review commits individually for detail
- Clear mapping from blueprint to implementation
- Explicit scope boundaries

### For Maintainers
- Clean git history
- Documented decision trail
- Easy to trace bugs to specific changes
- Supports both micro and macro views

## Related Documentation

- [docs/BRANCH_STRATEGY.md](../../docs/BRANCH_STRATEGY.md) - Complete branch strategy
- [docs/COMMIT_DISCIPLINE.md](../../docs/COMMIT_DISCIPLINE.md) - Commit workflow
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - General contribution guidelines
- [docs/known-issues.md](../../docs/known-issues.md) - Phase 0 source

## Questions?

If you're unsure which template to use or how to structure your work:
1. Check if your work fits into an existing phase
2. If not, create a feature branch following standard naming
3. For major architectural work, consider proposing a new phase

---

**Last Updated**: 2026-02-06  
**Maintained By**: Development Team
