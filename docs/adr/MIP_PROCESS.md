# Multiplicity Improvement Proposal (MIP) Process

**Version:** 1.0  
**Last Updated:** January 28, 2026  
**Authority:** Lead Architect & Certification Committee

---

## Purpose

The MIP (Multiplicity Improvement Proposal) process governs how Architecture Decision Records (ADRs) are proposed, reviewed, and adopted. It ensures:
- Community input on significant decisions
- Transparency in decision-making
- Accountability for changes
- Historical record of rationale

---

## When to Use the MIP Process

Create an ADR (and follow the MIP process) when:

✅ **Architectural Decisions**
- Adding or removing a tier (L0, L1, L2)
- Changing the cost model or performance targets
- Modifying core data structures or protocols

✅ **Licensing and Legal**
- Changing license terms
- Adding or removing license restrictions
- Trademark usage policies

✅ **Governance and Policy**
- Modifying bylaws or articles of incorporation
- Changing decision-making authority
- Establishing new committees or roles

✅ **Privacy and Security**
- Changing data retention policies
- Modifying anonymization techniques
- Adding or removing security controls

✅ **API and Protocol Changes**
- Breaking changes to public APIs
- Deprecating features
- Adding new protocol extensions

---

## When NOT to Use the MIP Process

❌ **Bug Fixes**
- Security patches
- Performance optimizations (within existing targets)
- Code refactoring without behavioral changes

❌ **Documentation**
- Typo fixes
- Clarifications
- Example improvements

❌ **Operational Changes**
- Server deployments
- Monitoring adjustments
- Incident response

Use your judgment: *If a change alters expectations, makes promises, or creates technical debt, write an ADR.*

---

## MIP Workflow

### Stage 1: Draft (7 days)

**Who:** Author (usually Lead Architect or co-maintainer)

**Activities:**
1. Create a new ADR using the template
2. Assign it a number (ADR-XXX)
3. Set status to "Draft"
4. Share privately with co-maintainers and advisors
5. Iterate on content

**Exit Criteria:**
- ADR is complete (all sections filled)
- No obvious errors or omissions
- Author is ready for public feedback

**Duration:** Minimum 7 days (can extend if needed)

---

### Stage 2: Public Comment (30 days)

**Who:** Community, stakeholders, implementers

**Activities:**
1. Author opens a GitHub Discussion or Issue
2. Post link to draft ADR
3. Solicit feedback from:
   - Certified implementations
   - Domain experts
   - Community members
   - Enterprises using the specs
4. Respond to questions and concerns

**Exit Criteria:**
- 30 calendar days have passed since posting
- All substantive feedback has been addressed or acknowledged
- Author has updated the ADR based on feedback

**Duration:** Exactly 30 days (non-negotiable)

**Why 30 days?** Because ADRs are binding. Once approved, changing them is difficult. The community needs time to:
- Review implications
- Test in their environments
- Consult with stakeholders
- Raise objections

---

### Stage 3: Lead Architect Review

**Who:** Lead Architect (or Acting Lead Architect)

**Activities:**
1. Review all feedback from public comment period
2. Verify that:
   - ADR aligns with mission and values
   - Trade-offs are clearly stated
   - Consequences are understood
   - Alternatives were considered
3. Make final revisions
4. Update status to "In Review"

**Exit Criteria:**
- Lead Architect approves the ADR for Certification Committee vote
- ADR is updated with final revisions

**Duration:** 5-10 business days

---

### Stage 4: Certification Committee Vote

**Who:** Certification Committee (minimum 2 domain experts)

**Activities:**
1. Each committee member independently reviews the ADR
2. Committee members vote: Approve or Reject
3. If rejected, provide written rationale
4. If approved, record votes in ADR changelog

**Voting Rules:**
- **Quorum:** 2 committee members (minimum)
- **Approval:** Unanimous (all votes must be "Approve")
- **Rejection:** Any "Reject" vote blocks approval

**Exit Criteria:**
- All committee members have voted
- Vote is unanimous "Approve"
- Votes are recorded in ADR

**Duration:** 10 business days maximum

**If Rejected:** Author may revise and resubmit, or withdraw the ADR.

---

### Stage 5: Publication

**Who:** Lead Architect or Secretary

**Activities:**
1. Update ADR status to "Approved"
2. Add approval signatures
3. Merge ADR to `/docs/adr/` in main branch
4. Announce approval in community channels
5. Link ADR from related code files (as comments)

**Exit Criteria:**
- ADR is merged and publicly accessible
- Community has been notified

**Duration:** 1-2 business days

---

## Special Cases

### Emergency ADRs

In cases of:
- Security vulnerabilities requiring immediate action
- Legal compliance deadlines
- Service disruptions

The Lead Architect may approve an ADR with abbreviated process:
- Skip public comment period (but publish ADR immediately)
- Seek retroactive Certification Committee approval within 30 days
- Clearly mark ADR as "Emergency" with justification

**Accountability:** Emergency ADRs are audited annually by the Board to prevent abuse.

---

### Superseding ADRs

When an ADR becomes obsolete:
1. Create a new ADR explaining why the old decision no longer holds
2. Follow full MIP process for new ADR
3. Update old ADR status to "Superseded by ADR-XXX"
4. Do not delete old ADRs (preserve history)

---

### Deprecation

When a decision is being phased out but not immediately replaced:
1. Update ADR status to "Deprecated"
2. Add deprecation notice with timeline
3. Follow full MIP process if deprecation has consequences

---

## Roles and Responsibilities

### Author
- Drafts the ADR
- Responds to feedback
- Revises based on comments
- Shepherds ADR through process

### Lead Architect
- Reviews for alignment with mission
- Approves or rejects for committee vote
- Ensures process is followed

### Certification Committee
- Provides domain expertise
- Votes on approval
- Ensures technical rigor

### Community
- Provides feedback during public comment
- Tests implications in their environments
- Raises concerns or objections

---

## Transparency Requirements

All MIP activity is public:
- Draft ADRs are posted in GitHub Discussions
- Public comments are visible and preserved
- Votes are recorded in ADRs
- Rejection rationale is published

**Exception:** Pre-disclosure security issues may be handled privately until patched, then ADR is published retroactively.

---

## Tools and Templates

- **ADR Template:** `/docs/adr/ADR_TEMPLATE.md`
- **Discussion Board:** GitHub Discussions (category: ADRs)
- **Tracking:** GitHub Project Board for ADR status
- **Notifications:** Community mailing list, Discord, or forum

---

## Frequently Asked Questions

### Can I propose an ADR if I'm not a co-maintainer?
Yes! Anyone can draft an ADR. Work with a co-maintainer to shepherd it through the process.

### What if public comment reveals a fatal flaw?
Withdraw the ADR, revise, and restart the process. It's better to catch issues early.

### How long does the full process take?
Minimum 47 days (7 draft + 30 public comment + 10 vote), but often longer.

### Can we speed it up?
No. The 30-day public comment period is non-negotiable (except for emergencies). Good decisions take time.

### What if the Certification Committee is deadlocked?
A tie (1 Approve, 1 Reject) counts as rejection. Author may revise and resubmit.

### How do I join the Certification Committee?
The Board appoints committee members based on domain expertise and community contributions. Express interest by contributing ADRs and technical reviews.

---

## Governance

This MIP process itself is governed by an ADR (ADR-000: MIP Process). Changes to the process require:
- Full MIP process (yes, meta!)
- Unanimous Board approval
- Notification to all certified implementations

---

**Adopted:** January 28, 2026  
**Authority:** Lead Architect  
**Next Review:** January 28, 2027
