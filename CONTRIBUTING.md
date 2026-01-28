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
