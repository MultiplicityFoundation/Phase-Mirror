# ADR-002: Apache 2.0 License with Managed Service Restriction

**Status:** Approved  
**Date:** 2026-01-28  
**Decision Authority:** Lead Architect & Board  
**Supersedes:** None  
**Superseded by:** None

---

## Context

Phase Mirror, QAGI, and Multiplicity are open-source projects. We needed to choose a license that:
1. Allows enterprises to adopt the code without legal friction
2. Protects against free-riding by cloud providers (SaaS clone problem)
3. Aligns with our public goods mission
4. Enables trademark enforcement
5. Permits commercial use (to maximize adoption)

The tension:
- **Too permissive (MIT/Apache):** Cloud providers can fork, rebrand, and compete with no obligation to contribute back
- **Too restrictive (AGPL):** Enterprises hate AGPL and won't adopt it (due to copyleft network effect)
- **Goal:** Maximum adoption + protection against predatory SaaS clones

---

## Decision

**All source code is licensed under Apache License 2.0.**

**Managed service provision requires a separate trademark license agreement** (Managed Service Restriction, or MSR).

Specifically:
- ✅ **You CAN:** Self-host, modify, redistribute, embed in products, use commercially
- ✅ **You CAN:** Run internally for your organization (unlimited scale)
- ❌ **You CANNOT:** Offer Phase Mirror as a managed service to third parties without trademark license

**Trademark policy:**
- QAGI, Multiplicity, and Phase Mirror are trademarks of Citizen Gardens Foundation
- Conforming implementations may use trademarks for compatibility statements (e.g., "Compatible with Phase Mirror 1.0")
- Non-conforming or managed service offerings require explicit trademark license

---

## Rationale

### Why Apache 2.0?

**1. Enterprise-Friendly**
- Permissive license (no copyleft)
- Compatible with proprietary software
- Widely adopted and understood by legal teams
- No "viral" provisions that scare enterprises

**2. Patent Grant**
- Apache 2.0 includes explicit patent license from contributors
- Protects users from patent infringement claims by contributors
- Stronger patent protection than MIT license

**3. Contribution-Friendly**
- No CLA (Contributor License Agreement) required
- Low friction for external contributors
- Still allows Foundation to enforce trademark

**4. Allows Commercial Use**
- Enterprises can embed Phase Mirror in products
- Consultants can build on top of it
- Maximizes reach and impact

### Why Managed Service Restriction (MSR)?

**The Problem:**
Without MSR, a cloud provider could:
1. Fork Phase Mirror
2. Rebrand it (e.g., "CloudCorp Dissonance Detector")
3. Offer it as SaaS at $0.10/API call
4. Undercut Foundation's managed service pricing
5. Contribute nothing back
6. Confuse users about what's "real" Phase Mirror

**The Solution:**
- **Self-hosting:** Unlimited, free, no restrictions
- **Managed service:** Requires trademark license

**Enforcement Mechanism:**
Not through software license (which is Apache 2.0, permissive), but through **trademark**.

If you run Phase Mirror as SaaS and use our trademarks ("Powered by Phase Mirror"), you need a license. If you don't use our trademarks, you're legally compliant—but users will know you're not affiliated.

**Why Not AGPL?**
AGPL requires SaaS providers to open-source modifications. Sounds good, but:
- Enterprises won't adopt AGPL software (legal teams reject it)
- Reduces reach and impact
- Doesn't prevent competition (they can still clone and offer SaaS, just have to share source)

MSR is **softer**: use our code however you want, but don't monetize it as SaaS using our brand.

---

## Consequences

### What Gets Easier

✅ **Adoption:** Enterprises can adopt without legal review nightmares.

✅ **Contributions:** Low friction for external contributors (no CLA).

✅ **Embedding:** Consulting firms can build products on top of Phase Mirror.

✅ **Self-Hosting:** Unlimited free use for organizations running their own instances.

### What Gets Harder

❌ **Enforcement:** We rely on trademark law, not copyright law. Trademark disputes are expensive.

❌ **Forking:** Nothing prevents a clone with a different name. We can't stop it, only prevent brand confusion.

❌ **Revenue:** MSR doesn't generate automatic revenue—requires negotiating individual agreements.

### What Becomes Risky

⚠️ **Predatory Clones:** A well-funded competitor could fork, rebrand, and outspend us on marketing. **Mitigation:** Build strong community and brand; make Foundation the authoritative source.

⚠️ **Trademark Dilution:** If we don't enforce trademark, we lose it. **Mitigation:** Active monitoring and enforcement policy.

⚠️ **Community Perception:** Some FOSS purists may view MSR as "not truly open source." **Mitigation:** Transparent communication about rationale; source code is still 100% open.

### Technical Debt Incurred

None. This is a legal decision with no technical debt.

---

## Alternatives Considered

### Alternative 1: Pure Apache 2.0 (No MSR)

**Description:** Fully permissive, no restrictions on SaaS.

**Pros:**
- Maximum openness
- No enforcement needed
- Simplest model

**Cons:**
- Cloud providers can clone and compete freely
- No revenue model for Foundation
- Hard to sustain long-term

**Why Rejected:** Unsustainable. Foundation needs a path to sustainability (grants, managed service revenue, donations). Pure open source without revenue model = burnout.

---

### Alternative 2: AGPL (Copyleft for SaaS)

**Description:** AGPL requires SaaS providers to open-source modifications.

**Pros:**
- Prevents proprietary clones
- Forces contributions back

**Cons:**
- **Enterprises hate AGPL** (legal teams reject it due to copyleft network effect)
- Reduces adoption by 90%+
- Still doesn't prevent competition (they can offer SaaS, just have to share code)

**Why Rejected:** Kills adoption. Our mission is **impact**, not ideology. If enterprises won't use it, we've failed.

---

### Alternative 3: Dual License (Open Core)

**Description:** Core is Apache 2.0, proprietary extensions require paid license.

**Pros:**
- Clear revenue model
- Common in open-source businesses

**Cons:**
- Creates tiering: "hobbled open source" vs "real features"
- Community backlash ("not truly open")
- Misaligned with public goods mission

**Why Rejected:** Violates Article V of Articles of Incorporation ("all core specifications publicly accessible at no cost"). We're a **foundation**, not a startup.

---

### Alternative 4: Business Source License (BSL)

**Description:** Eventually becomes open source after X years, but restricted use before then.

**Pros:**
- Prevents competition during early stage
- Transitions to open source later

**Cons:**
- Not OSI-approved (many enterprises reject non-OSI licenses)
- Complex legal terms
- Doesn't align with "open from day 1" mission

**Why Rejected:** Not truly open source. BSL is a marketing trick, not a public good.

---

## References

- [Apache License 2.0 Full Text](https://www.apache.org/licenses/LICENSE-2.0)
- [LICENSE file in repository](/LICENSE)
- [Trademark Usage Policy](/docs/governance/TRADEMARK_POLICY.md) (to be created)
- [OSI Approved Licenses](https://opensource.org/licenses)
- [Articles of Incorporation Article V](/docs/governance/ARTICLES_OF_INCORPORATION_TEMPLATE.md)

---

## Implementation Notes

- [x] Add LICENSE file with Apache 2.0 text to repository
- [x] Add license header to all source files
- [ ] Draft Trademark Usage Policy
- [ ] File Intent-to-Use trademark applications for QAGI, Multiplicity, Phase Mirror
- [ ] Create Managed Service License Agreement template
- [ ] Add licensing info to README and website

**Responsible Party:** Lead Architect & Legal Counsel  
**Target Date:** Day 7 of Phase 1

---

## Testability

- [x] LICENSE file exists in repository root
- [x] All `.ts`, `.js`, `.py` files have Apache 2.0 header comment
- [ ] README includes licensing section
- [ ] Trademark policy published
- [ ] ITU trademark applications filed

Verification command:
```bash
# Check for license headers
grep -r "Licensed under the Apache License" packages/*/src/*.ts | wc -l
# Should match number of source files
```

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-28 | Lead Architect | Initial draft and approval |

---

## Approval

This ADR was approved by the Lead Architect on January 28, 2026.

**Approved by:** Lead Architect  
**Date:** January 28, 2026
