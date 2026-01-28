# ADR-001: Foundation-First Entity Architecture

**Status:** Approved  
**Date:** 2026-01-28  
**Decision Authority:** Lead Architect & Board  
**Supersedes:** None  
**Superseded by:** None

---

## Context

Citizen Gardens Foundation needed to choose a legal entity structure that would:
1. Survive the founder (permanence)
2. Protect the public goods mission from privatization
3. Enable tax-advantaged operations
4. Signal commitment to the community
5. Provide trademark protection without creating monopolies

The decision had to balance:
- **Speed:** Need to move quickly in Year 1
- **Governance:** Need accountability without gridlock
- **Permanence:** Need structure that outlives any individual
- **Tax efficiency:** Minimize operational costs to maximize mission impact

---

## Decision

**Citizen Gardens Foundation is organized as a 501(c)(3) nonprofit corporation in the State of Ohio.**

This structure includes:
- Non-stock corporation (no equity or shareholders)
- Board of Directors governance
- Tax-exempt status under Internal Revenue Code §501(c)(3)
- Protected invariants inscribed in Articles of Incorporation (Article V)
- Succession mechanism via Bylaws (Article VIII)

---

## Rationale

### Why 501(c)(3) Nonprofit?

**1. Permanence and Anti-Privatization**
- A 501(c)(3) **cannot be sold**. It has no owners or shareholders.
- If the founder dies, the foundation continues under Board governance.
- Upon dissolution, assets **must** transfer to another 501(c)(3) with similar mission.
- Contrast: An LLC can be sold to a PE firm; a benefit corp can be acquired.

**2. Tax Advantage**
- No federal income tax
- No state income tax (in most states)
- This is a **permanent subsidy** to the mission, worth 21-37% of net income annually
- Donations to the foundation are tax-deductible for donors (encourages support)

**3. Regulatory and Trust Signal**
- "We are a nonprofit" tells enterprises: we optimize for mission, not profit
- Unlocks adoption in regulated industries (government, healthcare, finance)
- Demonstrates commitment to public goods

**4. Trademark Protection with Mission Alignment**
- Foundation owns trademarks (QAGI, Multiplicity, Phase Mirror)
- Trademarks cannot be monetized for private gain
- Trademarks stay public forever (protected by 501(c)(3) constraints)

### Why Ohio?

- Founder residency (simplifies initial filing)
- Clear nonprofit statutes
- Lower filing fees ($99 vs $300+ in Delaware)
- No annual report fees
- Federal 501(c)(3) status is recognized in all 50 states (not state-dependent)

---

## Consequences

### What Gets Easier

✅ **Permanence:** Foundation can outlive founder, current maintainers, and even current technology stacks.

✅ **Trust:** Enterprises and governments trust nonprofits more than for-profits for critical infrastructure.

✅ **Tax Savings:** Operating costs are 21-37% lower (no income tax).

✅ **Community Alignment:** Mission-first governance attracts contributors who care about public goods.

### What Gets Harder

❌ **Speed:** Bylaws amendments require Board votes (not unilateral founder decisions).

❌ **No Profit Distribution:** Founder and maintainers cannot receive equity or profit distributions. Compensation must be "reasonable" per IRS rules.

❌ **Governance Overhead:** Board meetings, minutes, conflict-of-interest policies, annual filings.

❌ **IRS Compliance:** Must file Form 990 annually, maintain charitable purpose, avoid excess political activity.

### What Becomes Risky

⚠️ **Loss of Tax-Exempt Status:** If the foundation operates outside its charitable purpose, IRS can revoke 501(c)(3) status (back taxes + penalties). **Mitigation:** Legal counsel reviews activities annually; Bylaws prohibit non-charitable activities.

⚠️ **Mission Drift:** Future boards might deviate from original mission. **Mitigation:** Protected invariants in Article V of Articles of Incorporation require unanimous Board vote to change.

⚠️ **Succession Failure:** If founder dies without succession plan, leadership vacuum. **Mitigation:** Article VIII of Bylaws establishes detailed succession protocol with named successor.

### Technical Debt Incurred

None. This is a legal/governance decision with no technical debt.

---

## Alternatives Considered

### Alternative 1: Founder-Owned LLC with Trademark License to Foundation

**Description:** Founder owns an LLC that holds trademarks. LLC licenses trademarks to a 501(c)(3) foundation for free (or nominal fee).

**Pros:**
- Founder retains control and can pivot quickly
- LLC can generate profit (e.g., consulting, managed services)

**Cons:**
- If founder dies, **heirs inherit LLC and trademarks**
- Heirs could revoke license or demand fees
- LLC can be sold (trademarks go with it)
- Foundation is at mercy of LLC owner

**Why Rejected:** Privatization risk. The public goods could be monetized by heirs or acquirers.

---

### Alternative 2: Benefit Corporation (Delaware B-Corp)

**Description:** A for-profit corporation with a public benefit mandate, chartered in Delaware.

**Pros:**
- Can raise venture capital
- Founder retains equity
- Public benefit is part of charter

**Cons:**
- **State-dependent:** Delaware statute could change (unlikely but possible)
- Can be acquired by another company (even if benefit mission is protected, control changes)
- Subject to income tax (21% federal + state)
- No donor tax deduction (donations are not charitable)

**Why Rejected:** Less permanent than federal 501(c)(3). Can be sold or dissolved without mission transfer requirement.

---

### Alternative 3: Cooperative (Worker or Consumer Co-op)

**Description:** Members own the organization, each with voting rights.

**Pros:**
- Democratic governance
- Member ownership prevents outside acquisition

**Cons:**
- **Voting is slow:** Every decision requires member vote (or delegate vote)
- Bylaws amendments require member approval (high friction)
- Hard to scale governance (what if 1000 members?)
- Not tax-exempt (co-ops pay income tax unless special exemption)

**Why Rejected:** Governance overhead and speed. Year 1 requires fast iteration. Voting slows everything down.

---

### Alternative 4: No Legal Entity (Open Source Project Only)

**Description:** Just maintain open-source repositories. No formal organization.

**Pros:**
- Zero legal/admin overhead
- Maximum speed

**Cons:**
- **No trademark protection:** Anyone can fork and claim the name
- No legal standing to enforce licenses
- No bank account (can't accept donations or pay expenses)
- No succession plan (project dies if founder disappears)

**Why Rejected:** Insufficient for long-term sustainability. Trademarks and legal standing are essential.

---

## References

- [Ohio Revised Code Chapter 1702 (Nonprofit Corporations)](https://codes.ohio.gov/ohio-revised-code/chapter-1702)
- [IRS Publication 557: Tax-Exempt Status for Your Organization](https://www.irs.gov/publications/p557)
- [Articles of Incorporation](/docs/governance/ARTICLES_OF_INCORPORATION_TEMPLATE.md)
- [Bylaws](/docs/governance/BYLAWS_TEMPLATE.md)
- [Formation Decision](/docs/governance/FORMATION_DECISION.md)

---

## Implementation Notes

- [x] Draft Articles of Incorporation (completed)
- [x] Draft Bylaws with Article VIII succession clause (completed)
- [ ] File Articles with Ohio Secretary of State
- [ ] Obtain EIN from IRS (Form SS-4)
- [ ] Hold Organizational Meeting and adopt Bylaws
- [ ] File Form 1023-EZ for 501(c)(3) recognition
- [ ] File trademark Intent-to-Use applications

**Responsible Party:** Lead Architect & Legal Counsel  
**Target Date:** Day 5 of Phase 1

---

## Testability

- [x] Articles of Incorporation include Article V (Protected Invariants)
- [x] Bylaws include Article VIII (Succession and Continuity)
- [ ] Ohio SOS filing receipt received
- [ ] EIN issued by IRS
- [ ] Form 1023-EZ filed with IRS

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-28 | Lead Architect | Initial draft and approval |

---

## Approval

This ADR was approved by the Lead Architect and Incorporator on January 28, 2026, prior to incorporation. It reflects the founding principles of the organization.

**Approved by:** Lead Architect / Incorporator  
**Date:** January 28, 2026
