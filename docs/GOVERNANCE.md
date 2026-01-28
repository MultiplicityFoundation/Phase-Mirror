# Governance

This document describes the governance structure and decision-making processes for the Phase Mirror Dissonance Protocol.

## Governance Model

The Phase Mirror Dissonance Protocol is governed by a combination of:
1. **Citizen Gardens Foundation** - A 501(c)(3) nonprofit organization (stewardship entity)
2. **Lead Architect** - Technical authority for the protocol
3. **Certification Committee** - Domain experts who vote on protocol changes
4. **Community Contributors** - Anyone who participates in the project

## Decision-Making Hierarchy

### Level 1: Day-to-Day Decisions (No MIP Required)

**Scope:**
- Bug fixes
- Documentation updates
- Performance optimizations
- New rules (if approved via Rule Request)

**Decision-Makers:** Maintainer with PR review approval

**Timeline:** 2-7 days

---

### Level 2: Protocol Changes (MIP Required)

**Scope:**
- Architectural changes (L0/L1/L2 model)
- Licensing or trademark policy
- Governance process changes
- New APIs or data stores

**Decision-Makers:** Lead Architect + Certification Committee (2/3 vote)

**Timeline:** 30-day comment + 5-day vote = ~35 days minimum

**Process:** See [MIP Process](adr/MIP_PROCESS.md)

---

### Level 3: Foundation Governance (Board Vote)

**Scope:**
- Changes to Bylaws
- Changes to Protected Invariants (Article V)
- Election of Directors
- Budget approval

**Decision-Makers:** Board of Directors (majority or unanimous depending on issue)

**Timeline:** Quarterly board meetings (emergency meetings within 5 days)

**Reference:** See [Bylaws Template](governance/BYLAWS_TEMPLATE.md)

---

## Community Roles

### 1. Contributor

**Definition:** Anyone who submits an issue, comment, or PR.

**Responsibilities:**
- Follow [Code of Conduct](../CODE_OF_CONDUCT.md)
- Provide constructive feedback
- Respect maintainer decisions

**Privileges:**
- Open issues and PRs
- Comment on discussions
- Vote on community polls (informal, non-binding)

---

### 2. Maintainer

**Definition:** Trusted contributors with write access to the repository.

**Current Maintainers:** See [MAINTAINERS.md](../MAINTAINERS.md)

**Responsibilities:**
- Review PRs within 7 days
- Triage issues (label, assign, close)
- Merge approved PRs
- Participate in MIP votes

**Privileges:**
- Push to main branch (via PR only)
- Merge PRs
- Close duplicate/spam issues

**How to Become a Maintainer:** See [MAINTAINERS.md](../MAINTAINERS.md)

---

### 3. Domain Expert (Certification Committee)

**Definition:** Subject matter experts who vote on MIPs and rule proposals.

**Current Domain Experts:**
- **RyVanGyver** (Lead Architect) - Protocol architecture, distributed systems
- *Additional domain experts to be appointed as community grows*

**Responsibilities:**
- Vote on MIPs (within 5 days of public comment close)
- Review rule proposals (within 30 days)
- Provide technical guidance on architecture decisions

**Privileges:**
- Binding vote on MIPs (2/3 majority required)
- Recommend rule approvals

**How to Become a Domain Expert:**
- Recognized expertise in relevant field (cryptography, distributed systems, policy, etc.)
- Nominated by Lead Architect or existing expert
- Approved by Board of Directors (Citizen Gardens Foundation)

---

### 4. Lead Architect

**Definition:** Technical authority for the protocol.

**Current Lead Architect:** RyVanGyver ([@RyVanGyver](https://github.com/RyVanGyver))

**Responsibilities:**
- Final decision on architectural questions
- Break ties on MIP votes
- Appoint domain experts
- Maintain ADR directory

**Privileges:**
- Veto power on MIPs (rarely exercised, requires public justification)
- Direct push to emergency branches (security patches only)

**Term:** 5 years (per Foundation Bylaws Article IV, Section 2)

---

## Transparency

All governance decisions are documented:

- **ADRs** - Architecture Decision Records in [/docs/adr/](adr/)
- **Meeting minutes** - Board meetings in [/docs/governance/](governance/)
- **Vote records** - MIP votes in GitHub Discussions

### Public vs. Private

**Public record (everything except):**
- Personnel matters (hiring, firing)
- Security vulnerabilities (until patched)
- Legal strategy (attorney-client privileged)

---

## Escalation Path

### Level 1: Maintainer

**For:** Technical questions, PR reviews, or clarifications

**Contact:**
- Post in [GitHub Discussions](https://github.com/RyVanGyver/Phase-Mirror/discussions)
- Tag @maintainers

---

### Level 2: Lead Architect

**For:** Architectural questions or MIP appeals

**Contact:**
- Email: architect@citizengardens.org
- GitHub: [@RyVanGyver](https://github.com/RyVanGyver)

---

### Level 3: Board of Directors

**For:** Governance or foundation matters

**Contact:**
- Email: board@citizengardens.org

---

### Level 4: Independent Compliance Officer

**For:** Code of Conduct violations or concerns about governance

**Contact:**
- Email: conduct@citizengardens.org

---

## Conflict Resolution

### Technical Disputes

1. **Discussion:** Raise concern in GitHub Discussions
2. **Maintainer Review:** Maintainers provide input
3. **Lead Architect Decision:** Final decision if consensus not reached
4. **Appeal:** Can appeal to Board of Directors if process violated

### Code of Conduct Violations

See [Code of Conduct](../CODE_OF_CONDUCT.md) enforcement section.

### Governance Disputes

1. **Informal Resolution:** Direct communication with relevant parties
2. **Formal Escalation:** Contact Lead Architect or Board
3. **Independent Review:** Compliance Officer investigation
4. **Board Resolution:** Final decision by Board of Directors

---

## Amendment Process

This governance document can be amended through:

1. **Minor Changes** (clarifications, corrections):
   - PR approved by Lead Architect
   - 7-day comment period

2. **Major Changes** (roles, processes):
   - MIP required
   - 30-day comment period + vote

3. **Fundamental Changes** (structure, authority):
   - Board vote required
   - Unanimous approval

---

## References

- [Contributing Guidelines](../CONTRIBUTING.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Maintainers List](../MAINTAINERS.md)
- [MIP Process](adr/MIP_PROCESS.md)
- [Foundation Bylaws](governance/BYLAWS_TEMPLATE.md)
- [Architecture Decision Records](adr/)

---

## Questions?

For questions about governance:
- Open a [GitHub Discussion](https://github.com/RyVanGyver/Phase-Mirror/discussions)
- Email: governance@citizengardens.org
- Contact Lead Architect: [@RyVanGyver](https://github.com/RyVanGyver)
