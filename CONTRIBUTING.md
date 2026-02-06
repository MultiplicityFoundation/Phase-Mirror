# Contributing to Phase Mirror

Thank you for your interest in contributing to the Phase Mirror project! This document provides guidelines and processes for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [License](#license)

---

## Code of Conduct

By participating in this project, you agree to:
- Be respectful and inclusive
- Focus on what is best for the community and project
- Show empathy toward other community members
- Accept constructive feedback gracefully
- Report unacceptable behavior to the project maintainers

Unacceptable behavior includes harassment, discrimination, trolling, or any conduct that creates an intimidating, hostile, or offensive environment.

---

## Getting Started

### Prerequisites

- **Node.js:** >= 18.0.0
- **pnpm:** >= 8.0.0
- **Git:** Latest version

### Clone and Install

```bash
git clone https://github.com/RyVanGyver/Phase-Mirror.git
cd Phase-Mirror
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

---

## Development Process

### Branch Strategy and Commit Discipline

Phase Mirror follows a **point-by-point commit, phase-level PR** strategy. This approach provides:
- Clean `git bisect` history with atomic, verifiable commits
- Reviewable narratives through coherent phase-level PRs
- Clear architectural stories that map to project blueprints

**📖 See [docs/BRANCH_STRATEGY.md](docs/BRANCH_STRATEGY.md) for complete guidelines**  
**📖 See [docs/COMMIT_DISCIPLINE.md](docs/COMMIT_DISCIPLINE.md) for commit workflow**

### Quick Reference

#### The Golden Rule
**Write the commit message before you write the code.** The message defines your scope boundary.

#### Phase Branches
Major work is organized into phase branches with multiple atomic commits:
- `fix/known-issues` - Phase 0: Critical error handling fixes
- `refactor/adapter-layer` - Phase 1: Cloud-agnostic abstraction
- `test/unit-coverage` - Phase 2: 80% test coverage
- `test/integration` - Phase 3: Integration test suite
- `docs/spec-documents` - Phase 4: Formal specifications
- `infra/staging-deploy` - Phase 5: Production infrastructure

### 1. Fork and Branch

1. Fork the repository to your GitHub account
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

Use descriptive branch names:
- `feature/add-l1-checks` - New features
- `fix/nonce-validation-bug` - Bug fixes
- `docs/update-adr-003` - Documentation updates
- `refactor/simplify-l0-checks` - Code refactoring

### 2. Make Changes

- Write clean, readable code
- Follow existing code style and conventions
- Add comments for complex logic
- Update or add tests for your changes
- Update documentation as needed

### 3. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat: add L1 policy validation checks"
git commit -m "fix: correct nonce expiry calculation"
git commit -m "docs: update ADR-003 with L0 benchmark results"
```

Commit message format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build, dependencies, tooling

**Important**: For phase-level work, write commit messages *before* coding to maintain scope discipline.

### 4. Push and PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- Clear description of changes
- Reference to related issues (e.g., "Closes #123")
- Screenshots for UI changes (if applicable)
- Test results

---

## Architecture Decision Records (ADRs)

Significant technical decisions require an ADR. See the [MIP Process](/docs/adr/MIP_PROCESS.md) for details.

### When to Write an ADR

Write an ADR when you're proposing changes that:
- ✅ Alter the architecture (add/remove tiers, change data structures)
- ✅ Change licensing or governance
- ✅ Modify privacy, security, or availability guarantees
- ✅ Introduce breaking changes to public APIs
- ✅ Add new dependencies or frameworks

Do NOT write an ADR for:
- ❌ Bug fixes
- ❌ Documentation improvements
- ❌ Code refactoring (without behavioral changes)
- ❌ Performance optimizations (within existing design)

### ADR Process

1. **Draft (7 days):** Use the [ADR Template](/docs/adr/ADR_TEMPLATE.md), share with co-maintainers
2. **Public Comment (30 days):** Open GitHub Discussion, solicit feedback
3. **Lead Architect Review:** Incorporate feedback, finalize
4. **Certification Committee Vote:** 2 domain experts vote (unanimous approval required)
5. **Publication:** Merge to `/docs/adr/`

See [MIP_PROCESS.md](/docs/adr/MIP_PROCESS.md) for full details.

---

## Pull Request Process

### Before Submitting

- [ ] Code builds successfully (`pnpm build`)
- [ ] All tests pass (`pnpm test`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Documentation updated (if needed)
- [ ] ADR created (if significant change)
- [ ] Commit messages follow Conventional Commits format

### PR Template

When opening a PR, include:

```markdown
## Description
[Clear description of what this PR does]

## Motivation
[Why is this change needed?]

## Changes
- [List of changes]
- [Be specific]

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing performed

## Related Issues
Closes #[issue number]

## Checklist
- [ ] Code builds
- [ ] Tests pass
- [ ] Documentation updated
- [ ] ADR created (if needed)
```

### Review Process

1. **Automated Checks:** CI/CD runs tests, linting, build
2. **Code Review:** At least 1 maintainer reviews
3. **Feedback:** Address comments, update PR
4. **Approval:** Maintainer approves
5. **Merge:** Squash and merge to `main`

**Review Criteria:**
- Code quality and readability
- Test coverage
- Documentation completeness
- Adherence to project conventions
- Security and performance considerations

---

## Testing Requirements

### Unit Tests

All new code must have unit tests:
- Test happy path (valid inputs)
- Test edge cases (boundary conditions)
- Test error cases (invalid inputs, failures)

Example:
```typescript
describe('L0 Invariants', () => {
  it('should pass for valid state', () => {
    const state = createValidState();
    const result = checkL0Invariants(state);
    expect(result.passed).toBe(true);
  });
  
  it('should fail when drift exceeds threshold', () => {
    const state = createValidState({ driftMagnitude: 0.5 });
    const result = checkL0Invariants(state);
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain('drift_magnitude');
  });
});
```

### Integration Tests

For features that interact with multiple components, add integration tests.

### Performance Tests

For performance-critical code (L0 checks, hot paths), add benchmark tests.

---

## Documentation

### What to Document

- **Public APIs:** All exported functions, classes, types
- **Complex Logic:** Algorithms, state machines, tricky code
- **Configuration:** Environment variables, config files
- **Architecture:** High-level design, data flow, interactions

### Documentation Style

Use clear, concise language:
- Start with a brief summary
- Explain the "why" (not just "how")
- Provide examples
- Link to related docs and ADRs

Example:
```typescript
/**
 * Check if nonce is fresh (not expired).
 * 
 * Nonces are valid for 1 hour from issuance (see ADR-005).
 * After expiration, they are rejected to prevent replay attacks.
 * 
 * @param state - State containing the nonce to check
 * @param nowMs - Current time in milliseconds (optional, for testing)
 * @returns true if nonce is fresh, false if expired or from future
 */
function checkNonceFreshness(state: State, nowMs?: number): boolean {
  // Implementation...
}
```

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](/LICENSE).

You retain copyright on your contributions, but grant Citizen Gardens Foundation a perpetual, worldwide, non-exclusive, royalty-free license to use, modify, and distribute your contributions as part of the Phase Mirror project.

See [ADR-002](/docs/adr/ADR-002-apache-2-license-with-managed-service-restriction.md) for licensing details.

---

## Reporting Bugs

### Before Reporting

1. **Check existing issues**: Search [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues) to see if the bug has already been reported
2. **Verify it's a bug**: Ensure the issue is reproducible and not a configuration error
3. **Check documentation**: Review [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues

### Bug Report Template

When reporting a bug, include:

```markdown
## Bug Description
[Clear description of the bug]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [And so on...]

## Expected Behavior
[What you expected to happen]

## Actual Behavior
[What actually happened]

## Environment
- OS: [e.g., macOS 13.0, Ubuntu 22.04]
- Node.js version: [e.g., 18.19.0]
- pnpm version: [e.g., 8.15.0]
- Package version: [e.g., @mirror-dissonance/cli@1.0.0-rc1]
- AWS region (if applicable): [e.g., us-east-1]

## Additional Context
- Logs: [Paste relevant logs]
- Configuration: [Relevant config settings]
- Screenshots: [If applicable]

## Possible Solution
[Optional: Your ideas on how to fix it]
```

### Bug Severity Labels

- **critical**: System is unusable, data loss possible, security vulnerability
- **important**: Major functionality broken, workaround exists
- **normal**: Bug affects some users, minor functionality issue
- **low**: Cosmetic issue, typo, minor inconvenience

**Response SLA**:
- Critical: 24 hours
- Important: 72 hours
- Normal: 7 days
- Low: Best effort

---

## Proposing Features

### Before Proposing

1. **Check roadmap**: Review [MVP_COMPLETION_TRACKER.md](./docs/internal/mvp-completion-tracker.md) and GitHub Projects
2. **Search discussions**: See if the feature has been discussed in [GitHub Discussions](https://github.com/PhaseMirror/Phase-Mirror/discussions)
3. **Consider scope**: Is this appropriate for the open-core tier or Pro features?

### Feature Request Template

```markdown
## Feature Description
[Clear description of the proposed feature]

## Problem It Solves
[What user problem does this address?]

## Proposed Solution
[How would you implement this?]

## Alternatives Considered
[What other approaches did you think about?]

## Use Cases
1. [Use case 1]
2. [Use case 2]

## Implementation Complexity
[Low/Medium/High - Your estimate]

## Open-Core vs Pro
[Should this be in open-core or Pro tier?]

## Additional Context
- Related issues/PRs
- Examples from other projects
- Mockups or diagrams
```

### Feature Evaluation Criteria

Features are evaluated based on:
- **Alignment**: Does it fit the project's mission?
- **Value**: How many users will benefit?
- **Complexity**: Implementation and maintenance cost
- **Open-Core Boundary**: Belongs in open-core or Pro?
- **Community Support**: How many community members want this?

### Feature Lifecycle

1. **Proposal**: Submit GitHub Discussion with feature template
2. **Community Feedback**: 14-day comment period
3. **Maintainer Review**: Steward evaluates feasibility
4. **Decision**: Approved, Deferred, or Declined
5. **Roadmap**: If approved, added to roadmap with priority
6. **Implementation**: Assigned to contributor or maintainer
7. **Release**: Shipped in upcoming version

---

## Community

### Communication Channels

- **GitHub Issues:** Bug reports, feature requests
- **GitHub Discussions:** Questions, ideas, ADR feedback
- **Email:** [To be determined]

### Getting Help

- Check existing documentation and ADRs
- Search GitHub Issues
- Ask in GitHub Discussions
- Tag `@RyVanGyver` for maintainer attention

---

## Recognition

Contributors are recognized in:
- Repository README (contributors section)
- Release notes (for significant contributions)
- Annual contributor list

---

## Questions?

If you have questions about contributing, open a GitHub Discussion or contact the maintainers.

Thank you for contributing to Phase Mirror!
