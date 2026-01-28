# MIP Index (Multiplicity Improvement Proposals)

This document tracks all MIPs (Multiplicity Improvement Proposals) for the Phase Mirror Dissonance Protocol.

## What is a MIP?

A MIP is a formal proposal for significant changes to the Phase Mirror protocol. MIPs follow a structured review process with public comment and certification committee approval.

See the [MIP Process](adr/MIP_PROCESS.md) for details on how to propose a MIP.

---

## MIP Status Definitions

- **Draft** - Initial proposal, not yet ready for public comment
- **Public Comment** - Open for community feedback (30 days)
- **Under Review** - Certification Committee reviewing
- **Approved** - Accepted and merged as ADR
- **Rejected** - Not accepted (with explanation)
- **Withdrawn** - Author withdrew proposal
- **Superseded** - Replaced by newer MIP

---

## Active MIPs

### In Public Comment

*No MIPs currently in public comment period*

### Under Review

*No MIPs currently under review*

---

## Approved MIPs

These MIPs have been approved and are now Architecture Decision Records (ADRs).

| MIP # | Title | Status | ADR | Date Approved |
|-------|-------|--------|-----|---------------|
| MIP-001 | Foundation-First Entity Architecture | Approved | [ADR-001](adr/ADR-001-foundation-first-entity-architecture.md) | 2026-01-28 |
| MIP-002 | Apache 2.0 + Managed Service Restriction | Approved | [ADR-002](adr/ADR-002-apache-2-license-with-managed-service-restriction.md) | 2026-01-28 |
| MIP-003 | Hierarchical PMD Compute | Approved | [ADR-003](adr/ADR-003-hierarchical-pmd-compute.md) | 2026-01-28 |
| MIP-004 | FP Anonymization with HMAC k-Anonymity | Approved | [ADR-004](adr/ADR-004-fp-anonymization-with-hmac-k-anonymity.md) | 2026-01-28 |
| MIP-005 | Nonce Rotation Fail-Closed Availability | Approved | [ADR-005](adr/ADR-005-nonce-rotation-fail-closed-availability.md) | 2026-01-28 |

---

## Rejected MIPs

*No rejected MIPs yet*

---

## Withdrawn MIPs

*No withdrawn MIPs yet*

---

## How to Propose a MIP

1. **Check this index** to ensure your proposal isn't a duplicate
2. **Review the [MIP Process](adr/MIP_PROCESS.md)** to understand requirements
3. **Use the [MIP Template](mip-template.md)** to structure your proposal
4. **Open a GitHub Discussion** in the "MIPs" category
5. **Engage with feedback** during the 30-day comment period
6. **Wait for certification committee vote** (5 days after comment period)

### What Requires a MIP?

✅ **Requires MIP:**
- Changes to L0/L1/L2 compute model
- Changes to licensing or trademark policy
- Changes to k-anonymity threshold
- Changes to governance process
- Addition of new data stores or APIs

❌ **Does NOT Require MIP:**
- Bug fixes
- Documentation improvements
- New rules (use Rule Request instead)
- Performance optimizations (unless they change behavior)

---

## MIP Categories

MIPs are categorized to help with organization and review:

- **Architecture** - Changes to system design, compute tiers, data flow
- **Protocol** - Changes to the core dissonance detection protocol
- **Governance** - Changes to decision-making processes
- **Legal** - Changes to licensing, trademark, or legal structure
- **Security** - Changes affecting security guarantees
- **Privacy** - Changes affecting privacy guarantees

---

## Certification Committee

The Certification Committee votes on MIPs:

- **Lead Architect:** RyVanGyver
- **Domain Experts:** *(to be appointed as community grows)*

Votes require 2/3 majority to approve.

---

## Questions?

For questions about the MIP process:
- Review the [MIP Process Documentation](adr/MIP_PROCESS.md)
- Ask in [GitHub Discussions](https://github.com/RyVanGyver/Phase-Mirror/discussions)
- Contact the Lead Architect: [@RyVanGyver](https://github.com/RyVanGyver)
