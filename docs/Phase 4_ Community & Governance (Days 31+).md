<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Phase 4: Community \& Governance (Days 31+)

## Comprehensive Blueprint \& Exposition


***

## Overview: Why Community Governance Matters

After Weeks 1-3 (foundation locked, code shipped, infrastructure deployed), Week 4+ is about **opening the system to community participation**.

Here's what changes:

**Week 1-3 (Pre-Community):**

- You are the sole decision-maker
- You write all rules
- You decide what gets certified
- You fix all bugs
- Community has no formal input

**Week 4+ (Post-Community):**

- Community proposes rules
- Community reports bugs
- Community votes on proposals (via MIP process)
- You steward, but don't dictate
- Decisions are transparent and documented

**Why this matters:**

1. **Legitimacy** - A protocol controlled by one person is a benevolent dictatorship. A protocol with transparent governance is a public good.
2. **Sustainability** - If you disappear, can the community continue? Only if they know how to participate.
3. **Quality** - The best ideas come from users in production, not from theory.
4. **Trust** - Enterprises adopt open protocols, not closed ones.

***

## The Governance Challenge

**What can go wrong:**

- ❌ **No participation** - You publish CONTRIBUTING.md but nobody reads it → Community doesn't know how to help
- ❌ **Chaotic participation** - Everyone submits random issues → No structure, no prioritization
- ❌ **Hostile takeover** - A well-funded competitor floods the issue tracker with noise → Governance gridlock
- ❌ **Founder bottleneck** - All decisions require your approval → You become the slowest part of the system
- ❌ **Silent drift** - Rules change without documentation → Nobody knows why decisions were made

**Solution:**

1. **CONTRIBUTING.md** - Clear guide to participation (what, why, how)
2. **Issue templates** - Structured input (reduces noise, increases signal)
3. **GitHub Discussions** - Forum for proposals and feedback (asynchronous, permanent record)
4. **MIP Process** - Formal change control (30-day comment period, vote, publication)
5. **Code of Conduct** - Community standards (respect, no harassment, no spam)
6. **Steward contact** - Clear escalation path (who decides what, when)

***

## Phase 4 Detailed Execution (Days 31+)

### **Days 31-33: CONTRIBUTING.md \& Developer Onboarding**

#### **Day 31: Write CONTRIBUTING.md**

This is the **most important document** in the repository. It answers:

- How do I report a bug?
- How do I propose a new rule?
- How do I contribute code?
- Who decides what gets merged?
- What's the review process?

**File: `/CONTRIBUTING.md`**

```markdown
# Contributing to Phase Mirror Dissonance Protocol

Thank you for your interest in contributing! The Mirror Dissonance Protocol is a community-governed project under the stewardship of **Citizen Gardens Foundation**, a 501(c)(3) nonprofit.

This document explains how to participate, what's expected, and how decisions are made.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Contribute](#how-to-contribute)
3. [Reporting Bugs](#reporting-bugs)
4. [Proposing New Rules](#proposing-new-rules)
5. [Proposing Protocol Changes (MIP)](#proposing-protocol-changes-mip)
6. [Code Contributions](#code-contributions)
7. [Review Process](#review-process)
8. [Community Roles](#community-roles)
9. [Governance](#governance)
10. [Getting Help](#getting-help)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. All participants are expected to:

- **Be respectful.** Disagree with ideas, not people.
- **Be constructive.** Criticism should be actionable and specific.
- **Be patient.** Maintainers are volunteers. Reviews take time.
- **Be professional.** No harassment, discrimination, or personal attacks.

**Violations:** Report to [conduct@citizengardens.org](mailto:conduct@citizengardens.org). All reports are confidential.

**Consequences:** Warnings, temporary bans, or permanent bans depending on severity.

For details, see our full [Code of Conduct](CODE_OF_CONDUCT.md).

---

## How to Contribute

There are several ways to contribute:

### 1. Report Bugs
Found a problem? [Open a bug report](https://github.com/citizen-gardens/phase-mirror/issues/new?template=bug_report.md).

### 2. Propose New Rules
Have an idea for detecting a new class of inconsistency? [Open a rule request](https://github.com/citizen-gardens/phase-mirror/issues/new?template=rule_request.md).

### 3. Improve Documentation
See a typo or unclear explanation? Submit a pull request to `/docs/`.

### 4. Contribute Code
Want to fix a bug or implement a feature? Follow the [code contribution workflow](#code-contributions).

### 5. Participate in Discussions
Join the conversation in [GitHub Discussions](https://github.com/citizen-gardens/phase-mirror/discussions).

---

## Reporting Bugs

**Before reporting:**
1. Check [existing issues](https://github.com/citizen-gardens/phase-mirror/issues) to avoid duplicates
2. Verify you're using the latest version
3. Reproduce the bug in a minimal test case

**When reporting, include:**
- **Summary:** One-sentence description
- **Steps to reproduce:** Exact commands or code
- **Expected behavior:** What should happen
- **Actual behavior:** What actually happened
- **Environment:** OS, Node version, library version
- **Logs:** Error messages or stack traces

**Example:**
```

**Summary:** Ingest handler returns 500 when orgid contains special characters

**Steps to reproduce:**

1. POST /api/v1/events/ingest with orgid="org@special\#chars"
2. Observe response

**Expected:** 202 Accepted or 400 Bad Request with clear error
**Actual:** 500 Internal Server Error

**Environment:** Node 20.x, phase-mirror v1.2.0
**Logs:** [attach stack trace]

```

**What happens next:**
- Maintainer will label the issue (bug, critical, etc.)
- Maintainer will assign to a milestone (current, next, backlog)
- If critical, maintainer will fix within 48 hours
- If non-critical, maintainer will triage within 7 days

---

## Proposing New Rules

Rules are the heart of the protocol. We welcome proposals, but they require:
1. **Clear specification** - What does the rule detect?
2. **Rationale** - Why is this valuable?
3. **Test cases** - Examples of true positives and false positives
4. **Performance impact** - How much compute does it require?

**How to propose:**
1. Open a [Rule Request issue](https://github.com/citizen-gardens/phase-mirror/issues/new?template=rule_request.md)
2. Fill in the template (required fields: name, category, detection logic, examples)
3. Await community feedback (30-day comment period)
4. If approved, maintainer will create a tracking issue for implementation
5. Implementation can be done by proposer or maintainer

**Approval criteria:**
- ✅ Solves a real problem (not theoretical)
- ✅ Has ≥3 supporters from different organizations
- ✅ Does not duplicate an existing rule
- ✅ Can be implemented with L0/L1/L2 compute model
- ✅ Passes false positive threshold (<10% FP rate on test data)

**Example proposal:**
```markdown
**Rule Name:** JWT Expiry Drift Detection

**Category:** Temporal Consistency

**Problem:**
Services sometimes issue JWTs with expiry times that don't align with 
their configuration (e.g., config says "1 hour" but token expires in 2 hours).

**Detection Logic:**
Compare `exp` claim in JWT against service's configured TTL.
If drift > 10%, flag as inconsistency.

**Test Cases:**
- ✅ True Positive: exp=7200s, config=3600s → drift=100% → MATCH
- ✅ True Negative: exp=3660s, config=3600s → drift=1.6% → NO MATCH
- ❌ False Positive: exp=3500s, config=3600s → drift=2.7% (within tolerance)

**Performance:**
L1 check (requires config lookup). Estimated <1ms.

**Supporters:**
- @alice (Acme Corp)
- @bob (Beta LLC)
- @charlie (Gamma Inc)
```

**What happens next:**

- Rule proposal is published to Discussions for 30 days
- Community provides feedback (edge cases, alternatives, etc.)
- Lead Architect + 2 Domain Experts vote (majority = approved)
- If approved, assigned to milestone and implemented
- If rejected, proposer can revise and resubmit

---

## Proposing Protocol Changes (MIP)

Major changes to the protocol (architecture, licensing, governance) require a **Multiplicity Improvement Proposal (MIP)**.

**What requires an MIP:**

- Changes to L0/L1/L2 compute model
- Changes to licensing or trademark policy
- Changes to k-anonymity threshold
- Changes to governance process
- Addition of new data stores or APIs

**What doesn't require an MIP:**

- Bug fixes
- Documentation improvements
- New rules (use Rule Request instead)
- Performance optimizations (unless they change behavior)

**MIP Process:**

### Step 1: Draft (1-2 weeks)

- Author writes MIP using [template](docs/mip-template.md)
- MIP includes: Problem, Proposed Solution, Alternatives Considered, Consequences, References
- Author shares draft in private channel (optional) for early feedback


### Step 2: Public Comment (30 days)

- Author publishes MIP to [GitHub Discussions](https://github.com/citizen-gardens/phase-mirror/discussions/categories/mips)
- Community provides feedback (questions, objections, alternatives)
- Author revises MIP based on feedback


### Step 3: Vote (5 days)

- Lead Architect + Certification Committee (2 domain experts) vote
- Voting options: Approve, Reject, Defer (needs more work)
- Requires 2/3 majority (2 of 3 votes) to approve


### Step 4: Publication

- If approved, MIP is merged to `/docs/adr/` as an Architecture Decision Record (ADR)
- MIP number is assigned (sequential, e.g., MIP-001)
- Implementation is tracked in a GitHub issue

**Example MIPs:**

- MIP-001: Foundation-First Entity Architecture (already approved, see ADR-001)
- MIP-002: Apache 2.0 + Managed Service Restriction (already approved, see ADR-002)
- MIP-XXX: Add support for real-time dissonance evaluation (future)

**Current MIPs:** See [MIP Index](docs/mip-index.md)

---

## Code Contributions

Want to contribute code? Follow this workflow:

### 1. **Fork \& Clone**

```bash
git clone https://github.com/YOUR_USERNAME/phase-mirror.git
cd phase-mirror
git remote add upstream https://github.com/citizen-gardens/phase-mirror.git
```


### 2. **Create a Branch**

```bash
git checkout -b fix/my-bug-fix
# or
git checkout -b feat/my-new-feature
```

Branch naming:

- `fix/*` - Bug fixes
- `feat/*` - New features
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring
- `test/*` - Test improvements


### 3. **Make Changes**

- Write code
- Add tests (required for new features and bug fixes)
- Update documentation if needed
- Run tests: `pnpm test`
- Run linter: `pnpm lint`
- Run formatter: `pnpm format`


### 4. **Commit**

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
fix: handle special characters in orgid validation

Previously, orgid with '@' or '#' caused 500 errors. Now we sanitize
input and return 400 Bad Request with clear error message.

Fixes #123
```

Commit format:

```
<type>: <subject>

<body>

<footer>
```

Types: `fix`, `feat`, `docs`, `refactor`, `test`, `chore`

### 5. **Push \& Open PR**

```bash
git push origin fix/my-bug-fix
```

Then open a Pull Request on GitHub.

**PR Template:**

```markdown
## Summary
Brief description of what this PR does.

## Motivation
Why is this change needed? What problem does it solve?

## Changes
- Bullet list of changes
- Include file paths if extensive

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guide
- [ ] Tests pass locally (`pnpm test`)
- [ ] Documentation updated
- [ ] Commit messages follow Conventional Commits
- [ ] No breaking changes (or breaking changes documented)

## Related Issues
Fixes #123
Related to #456
```


### 6. **Review Process**

- Maintainer reviews within 7 days (usually sooner)
- Feedback provided as inline comments
- Author revises based on feedback
- Once approved, maintainer merges

**Approval criteria:**

- ✅ Tests pass (CI must be green)
- ✅ Code follows style guide
- ✅ No security vulnerabilities introduced
- ✅ Documentation updated
- ✅ Commit messages are clear

---

## Review Process

**What maintainers look for:**

1. **Correctness** - Does it solve the problem?
2. **Tests** - Are there tests? Do they cover edge cases?
3. **Style** - Does it follow the codebase conventions?
4. **Security** - Does it introduce vulnerabilities?
5. **Documentation** - Is it documented?
6. **Breaking changes** - Does it break existing APIs?

**Timeline:**

- **Bug fixes:** Reviewed within 2 days, merged within 7 days
- **New features:** Reviewed within 7 days, merged within 14 days
- **MIPs:** 30-day comment period + 5-day vote

**What if my PR is rejected?**

- Maintainer will explain why
- You can revise and resubmit
- If you disagree, escalate to Lead Architect via email

---

## Community Roles

### 1. **Contributor**

Anyone who submits an issue, comment, or PR.

**Responsibilities:**

- Follow Code of Conduct
- Provide constructive feedback
- Respect maintainer decisions

**Privileges:**

- Open issues and PRs
- Comment on discussions
- Vote on community polls (informal, non-binding)


### 2. **Maintainer**

Trusted contributors with write access to the repository.

**Responsibilities:**

- Review PRs within 7 days
- Triage issues (label, assign, close)
- Merge approved PRs
- Participate in MIP votes

**Privileges:**

- Push to main branch (via PR only)
- Merge PRs
- Close duplicate/spam issues

**How to become a maintainer:**

- Make 10+ meaningful contributions (PRs, issue reports, reviews)
- Demonstrate understanding of protocol and codebase
- Nominated by existing maintainer
- Approved by Lead Architect

**Current maintainers:** See [MAINTAINERS.md](MAINTAINERS.md)

### 3. **Domain Expert (Certification Committee)**

Subject matter experts who vote on MIPs and rule proposals.

**Responsibilities:**

- Vote on MIPs (within 5 days of public comment close)
- Review rule proposals (within 30 days)
- Provide technical guidance on architecture decisions

**Privileges:**

- Binding vote on MIPs (2/3 majority required)
- Recommend rule approvals

**How to become a domain expert:**

- Recognized expertise in relevant field (cryptography, distributed systems, policy, etc.)
- Nominated by Lead Architect or existing expert
- Approved by Board of Directors (Citizen Gardens Foundation)

**Current domain experts:** See [GOVERNANCE.md](docs/GOVERNANCE.md)

### 4. **Lead Architect**

Technical authority for the protocol.

**Responsibilities:**

- Final decision on architectural questions
- Break ties on MIP votes
- Appoint domain experts
- Maintain ADR directory

**Privileges:**

- Veto power on MIPs (rarely exercised, requires public justification)
- Direct push to emergency branches (security patches only)

**Term:** 5 years (per Foundation Bylaws Article IV, Section 2)

**Current Lead Architect:** [Your Name]

---

## Governance

### Decision-Making Process

**Level 1: Day-to-Day Decisions (No MIP Required)**

- Bug fixes
- Documentation updates
- Performance optimizations
- New rules (if approved via Rule Request)

**Who decides:** Maintainer with PR review approval

**Timeline:** 2-7 days

---

**Level 2: Protocol Changes (MIP Required)**

- Architectural changes (L0/L1/L2 model)
- Licensing or trademark policy
- Governance process changes
- New APIs or data stores

**Who decides:** Lead Architect + Certification Committee (2/3 vote)

**Timeline:** 30-day comment + 5-day vote = ~35 days minimum

---

**Level 3: Foundation Governance (Board Vote)**

- Changes to Bylaws
- Changes to Protected Invariants (Article V)
- Election of Directors
- Budget approval

**Who decides:** Board of Directors (majority or unanimous depending on issue)

**Timeline:** Quarterly board meetings (emergency meetings within 5 days)

---

### Transparency

All governance decisions are documented:

- **ADRs** - Architecture Decision Records in `/docs/adr/`
- **Meeting minutes** - Board meetings in `/docs/governance/`
- **Vote records** - MIP votes in GitHub Discussions

**Public record:** Everything except:

- Personnel matters (hiring, firing)
- Security vulnerabilities (until patched)
- Legal strategy (attorney-client privileged)

---

### Escalation Path

**Level 1: Maintainer**
For technical questions, PR reviews, or clarifications:

- Post in GitHub Discussions
- Tag @maintainers

**Level 2: Lead Architect**
For architectural questions or MIP appeals:

- Email: [architect@citizengardens.org](mailto:architect@citizengardens.org)
- GitHub: @lead-architect

**Level 3: Board of Directors**
For governance or foundation matters:

- Email: [board@citizengardens.org](mailto:board@citizengardens.org)

**Level 4: Independent Compliance Officer**
For Code of Conduct violations or concerns about governance:

- Email: [conduct@citizengardens.org](mailto:conduct@citizengardens.org)

---

## Getting Help

### Documentation

- **Protocol spec:** [docs/protocol-spec.md](docs/protocol-spec.md)
- **API reference:** [docs/api-reference.md](docs/api-reference.md)
- **ADRs:** [docs/adr/](docs/adr/)
- **FAQ:** [docs/FAQ.md](docs/FAQ.md)


### Community

- **GitHub Discussions:** [Ask questions](https://github.com/citizen-gardens/phase-mirror/discussions)
- **Discord:** [Join our server](https://discord.gg/phase-mirror) (coming soon)
- **Office hours:** First Thursday of each month, 2-3 PM EST ([Zoom link](https://zoom.us/j/...))


### Support

- **Email:** [support@citizengardens.org](mailto:support@citizengardens.org)
- **Issue tracker:** [Report bugs](https://github.com/citizen-gardens/phase-mirror/issues)

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project:

- **Source code:** Apache 2.0 with Managed Service Restriction
- **Documentation:** CC BY 4.0

See [LICENSE](LICENSE) for details.

---

## Thank You!

We appreciate your contributions. Together, we're building transparent, trustworthy AI systems.

**Questions?** Open a [Discussion](https://github.com/citizen-gardens/phase-mirror/discussions) or email [community@citizengardens.org](mailto:community@citizengardens.org).

```

***

#### **Day 32: Issue Templates**

GitHub allows you to create templates for issues, ensuring structured input.

**File: `.github/ISSUE_TEMPLATE/bug_report.md`**

```yaml
---
name: Bug Report
about: Report a problem with the Phase Mirror protocol or implementation
title: '[BUG] '
labels: bug, needs-triage
assignees: ''
---

## Summary
<!-- One-sentence description of the bug -->

## Steps to Reproduce
<!-- Exact steps to trigger the bug -->
1. 
2. 
3. 

## Expected Behavior
<!-- What should happen -->

## Actual Behavior
<!-- What actually happened -->

## Environment
- **OS:** <!-- e.g., Ubuntu 22.04, macOS 14.2, Windows 11 -->
- **Node version:** <!-- e.g., v20.11.0 -->
- **Library version:** <!-- e.g., phase-mirror v1.2.0 -->
- **Deployment:** <!-- e.g., local, AWS Lambda, Docker -->

## Logs / Stack Trace
<!-- Paste error messages or stack traces here -->
```

<!-- If applicable, attach screenshots or config files -->

## Severity

<!-- Choose one: Critical (system down), High (major feature broken), Medium (workaround exists), Low (cosmetic) -->

## Additional Context

<!-- Any other information that might help -->

## Checklist

- [ ] I have searched [existing issues](https://github.com/citizen-gardens/phase-mirror/issues) and this is not a duplicate
- [ ] I have verified this bug exists in the latest version
- [ ] I have included all required information above

```

---

**File: `.github/ISSUE_TEMPLATE/rule_request.md`**

```yaml
***
name: Rule Request
about: Propose a new detection rule for the Phase Mirror protocol
title: '[RULE] '
labels: rule-proposal, needs-discussion
assignees: ''
***

## Rule Name
<!-- e.g., "JWT Expiry Drift Detection" -->

## Category
<!-- Choose: Temporal Consistency, Schema Validation, Permission Coherence, Cryptographic Binding, Other -->

## Problem Statement
<!-- What inconsistency or vulnerability does this rule detect? Why is it important? -->

## Detection Logic
<!-- Describe the algorithm or check. Be specific. -->

**Pseudocode (optional):**
```

if (condition1 \&\& condition2) {
return MATCH;
}

```

## Test Cases

### True Positives (Should Match)
<!-- Examples of inputs that SHOULD trigger the rule -->
1. **Input:** ...
   **Output:** MATCH
   **Reason:** ...

2. **Input:** ...
   **Output:** MATCH
   **Reason:** ...

### True Negatives (Should NOT Match)
<!-- Examples of inputs that should NOT trigger the rule -->
1. **Input:** ...
   **Output:** NO MATCH
   **Reason:** ...

2. **Input:** ...
   **Output:** NO MATCH
   **Reason:** ...

### Potential False Positives
<!-- Are there edge cases where the rule might incorrectly match? -->
1. **Scenario:** ...
   **Mitigation:** ...

## Performance Impact
<!-- Which tier: L0 (always-on, <100ns), L1 (triggered, <1ms), L2 (explicit, <100ms)? -->
- **Compute tier:** L0 / L1 / L2
- **Estimated latency:** <!-- e.g., <1ms -->
- **External dependencies:** <!-- e.g., requires database lookup? -->

## Supporters
<!-- List at least 3 people/organizations who would benefit from this rule -->
1. @username1 (Org Name)
2. @username2 (Org Name)
3. @username3 (Org Name)

## Related Work
<!-- Are there similar rules in other systems? Research papers? -->

## Implementation Notes
<!-- Any technical considerations for implementation? -->

## Checklist
- [ ] I have described the problem clearly
- [ ] I have provided test cases (true positives and negatives)
- [ ] I have identified the compute tier (L0/L1/L2)
- [ ] I have listed ≥3 supporters
- [ ] I have checked that this doesn't duplicate an existing rule
```


---

**File: `.github/ISSUE_TEMPLATE/feature_request.md`**

```yaml
***
name: Feature Request
about: Suggest a new feature or enhancement
title: '[FEATURE] '
labels: enhancement, needs-discussion
assignees: ''
***

## Summary
<!-- One-sentence description of the feature -->

## Problem
<!-- What problem does this solve? Who is affected? -->

## Proposed Solution
<!-- How should this feature work? Include examples if possible. -->

## Alternatives Considered
<!-- What other approaches did you consider? Why is your proposal better? -->

## Use Cases
<!-- Describe 2-3 real-world scenarios where this feature would be valuable -->
1. **Scenario 1:** ...
2. **Scenario 2:** ...

## Implementation Complexity
<!-- Rough estimate: Simple (hours), Medium (days), Complex (weeks) -->

## Breaking Changes
<!-- Would this break existing APIs or behavior? -->
- [ ] Yes, this introduces breaking changes
- [ ] No, this is backward-compatible

## Additional Context
<!-- Anything else we should know? -->

## Checklist
- [ ] I have searched existing issues and this is not a duplicate
- [ ] I have described the problem and proposed solution clearly
- [ ] I have considered alternatives
```


---

**File: `.github/ISSUE_TEMPLATE/config.yml`**

```yaml
blank_issues_enabled: false
contact_links:
  - name: Ask a Question
    url: https://github.com/citizen-gardens/phase-mirror/discussions
    about: For questions or general discussion, use Discussions instead of Issues

  - name: Security Vulnerability
    url: mailto:security@citizengardens.org
    about: Please report security vulnerabilities privately via email

  - name: Community Support
    url: https://discord.gg/phase-mirror
    about: Join our Discord for real-time help
```


---

#### **Day 33: Code of Conduct**

**File: `/CODE_OF_CONDUCT.md`**

```markdown
# Code of Conduct

## Our Pledge

We, as members, contributors, and leaders of the Phase Mirror Dissonance Protocol community, pledge to make participation in our project and our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community.

## Our Standards

**Examples of behavior that contributes to a positive environment:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Examples of unacceptable behavior:**
- The use of sexualized language or imagery, and sexual attention or advances of any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## Enforcement Responsibilities

Community leaders (maintainers, Lead Architect, and Citizen Gardens Foundation Board) are responsible for clarifying and enforcing our standards of acceptable behavior and will take appropriate and fair corrective action in response to any behavior that they deem inappropriate, threatening, offensive, or harmful.

Community leaders have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that are not aligned to this Code of Conduct, and will communicate reasons for moderation decisions when appropriate.

## Scope

This Code of Conduct applies within all community spaces (GitHub, Discord, email lists, office hours, conferences), and also applies when an individual is officially representing the community in public spaces.

## Enforcement
<span style="display:none">[^1][^2]</span>

<div align="center">⁂</div>

[^1]: yes-if-mirror-dissonance-is-yo-vtZAAPZ3QamZaFcNJAm2Lw.md
[^2]: The Phase to Mirror Dissonance.pdf```

