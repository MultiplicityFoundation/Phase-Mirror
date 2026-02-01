# Steward Role and Responsibilities

**Document Status**: Active  
**Version**: 1.0  
**Last Updated**: 2026-02-01  
**Next Review**: 2026-05-01

---

## Current Steward

**Name**: R. Van Gelder  
**Status**: Interim Steward  
**Term Start**: Project inception  
**Term End**: Until permanent steward elected or succession triggered  
**Contact**: [To be added]

---

## Role Definition

The **Steward** is the primary maintainer and decision-maker for the Phase Mirror project, serving as the bridge between the project's technical direction, community needs, and governance structure.

### Core Responsibilities

#### 1. Technical Direction
- **Architecture Decisions**: Make or approve all significant architectural changes
- **ADR Oversight**: Ensure all major decisions are documented in Architecture Decision Records
- **Code Quality**: Maintain standards for code review, testing, and documentation
- **Performance**: Ensure system meets performance targets (L0 <100ns, FP Store <50ms)
- **Security**: Oversee security practices and vulnerability responses

#### 2. Release Management
- **Version Planning**: Determine release schedule and version bumps
- **Release Notes**: Approve and publish release notes
- **Breaking Changes**: Decide on breaking changes and migration paths
- **Deprecation Policy**: Manage deprecation timelines and communications

#### 3. Community Management
- **Issue Triage**: Ensure timely response to issues (24-hour SLA for critical)
- **PR Review**: Review or delegate review of pull requests
- **Contributor Onboarding**: Welcome and guide new contributors
- **Communication**: Maintain regular updates to community

#### 4. Governance
- **Bylaws Enforcement**: Ensure project follows established bylaws
- **Succession Planning**: Maintain and update succession plan
- **Conflict Resolution**: Mediate disputes within the community
- **Foundation Liaison**: Interface with 501(c)(3) foundation (when established)

#### 5. Strategic Planning
- **Roadmap**: Define and communicate project roadmap
- **Resource Allocation**: Prioritize development efforts
- **Partnerships**: Evaluate and approve partnerships or integrations
- **Open-Core Balance**: Ensure community tier provides value while protecting Pro features

---

## Decision Authority

### Steward HAS Authority To:
✅ Approve or reject pull requests  
✅ Merge code to main branch  
✅ Create releases and tags  
✅ Modify documentation  
✅ Assign roles and permissions  
✅ Set development priorities  
✅ Make architectural decisions  
✅ Resolve contributor disputes  

### Steward MUST Consult Community For:
⚠️ Breaking changes affecting existing users  
⚠️ Major architectural shifts (document in ADR)  
⚠️ Changes to open-core boundaries  
⚠️ License modifications  
⚠️ Governance structure changes  

### Steward CANNOT Unilaterally:
❌ Change the Apache 2.0 license without community consensus  
❌ Violate the 501(c)(3) nonprofit mission  
❌ Transfer stewardship without succession process  
❌ Remove contributor attribution  

---

## Succession Criteria

### When Succession Is Triggered

**Planned Succession**:
- Steward requests to step down (90-day notice preferred)
- Term limit reached (if implemented by future governance)
- Steward promoted to different role in foundation

**Emergency Succession**:
- Steward unable to perform duties for >30 days
- Steward requests immediate succession
- Community vote of no confidence (requires 2/3 majority)

### Succession Process

1. **Announcement**: Current steward announces succession timeline
2. **Nomination Period**: 30-day period for community nominations
3. **Candidate Evaluation**: Review against succession criteria
4. **Community Input**: 14-day comment period on candidates
5. **Selection**: Final selection by current steward or foundation board
6. **Transition**: 30-day knowledge transfer period
7. **Handoff**: New steward takes over with community announcement

### Eligibility Criteria

To be eligible for steward role, candidates should demonstrate:

**Technical Competency** (Required):
- [ ] Deep understanding of Mirror Dissonance architecture
- [ ] Significant contributions to codebase (or equivalent experience)
- [ ] Experience with TypeScript, Node.js, AWS
- [ ] Understanding of nonprofit governance

**Community Involvement** (Preferred):
- [ ] Active participation in discussions
- [ ] History of helping other contributors
- [ ] Clear communication skills
- [ ] Alignment with project values

**Time Commitment** (Required):
- [ ] 10-20 hours/week minimum
- [ ] Availability for urgent issues (24-hour response)
- [ ] Commitment for at least 6 months

---

## Steward Transitions

### Current Transition Status: Interim

**R. Van Gelder** is serving as **Interim Steward** during the MVP phase (Weeks 1-4). This is a temporary appointment to establish the project.

**Next Steps**:
1. Complete MVP (v1.0.0-rc1 → v1.0.0)
2. Establish foundation structure
3. Open formal steward selection process
4. Transition to elected steward by 2026-Q3

---

## Operating Procedures

### Issue Triage SLA
- **Critical**: 24 hours
- **Important**: 72 hours
- **Normal**: 7 days
- **Enhancement**: Best effort

### PR Review SLA
- **Security**: 24 hours
- **Bug fix**: 48 hours
- **Feature**: 7 days
- **Documentation**: 7 days

### Release Cadence
- **Major**: Annually or as needed
- **Minor**: Quarterly
- **Patch**: As needed for bugs
- **RC**: Before each major release

### Communication Channels
- **Issues**: Technical discussion and bug reports
- **Discussions**: Community questions and proposals
- **Email**: Private security reports
- **Meetings**: Monthly community calls (to be established)

---

## Accountability

### Transparency Requirements

The steward must maintain transparency through:
- **Public Decision Log**: All major decisions in GitHub Discussions
- **ADRs**: Architectural decisions documented and published
- **Release Notes**: Detailed notes for each release
- **Monthly Updates**: Project status and roadmap updates

### Community Feedback

The community may provide feedback to the steward through:
- **GitHub Discussions**: General feedback and suggestions
- **Issues**: Concerns about specific decisions
- **Direct Contact**: Private concerns via email
- **Governance Review**: Formal review process (to be established)

### Steward Evaluation

Steward performance is evaluated on:
- **Response Time**: Meeting SLA commitments
- **Code Quality**: Maintaining high standards
- **Community Health**: Growing contributor base
- **Project Progress**: Meeting roadmap milestones
- **Transparency**: Open communication with community

---

## Resources for Steward

### Access and Permissions
- Admin access to GitHub repository
- AWS account access (for production deployments)
- npm publishing permissions
- Domain and hosting access (when applicable)
- Social media accounts (when established)

### Documentation
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contributor guidelines
- [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) - Community standards
- [docs/governance/](.) - All governance documents
- [docs/adr/](../adr/) - Architecture Decision Records

### Tools
- GitHub Projects for roadmap tracking
- GitHub Discussions for community engagement
- GitHub Actions for CI/CD
- AWS Console for infrastructure management

---

## Interim Steward Notes

**R. Van Gelder - Interim Steward**

### MVP Phase Priorities (2026 Q1)
1. Complete v1.0.0 release (80%+ test coverage)
2. Validate production deployment
3. Establish foundation structure
4. Document all processes
5. Prepare for permanent steward transition

### Lessons Learned (To Be Updated)
- [To be documented during MVP completion]

### Recommendations for Next Steward
- [To be documented before transition]

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-01 | Initial version for v1.0.0-rc1 | R. Van Gelder |

---

**Review Schedule**: This document should be reviewed:
- After each steward transition
- Annually on the project anniversary
- When governance structure changes
- After major community feedback

**Next Review Date**: 2026-05-01

---

## See Also

- [SUCCESSOR_DESIGNATION_TEMPLATE.md](./SUCCESSOR_DESIGNATION_TEMPLATE.md) - Succession planning
- [BYLAWS_TEMPLATE.md](./BYLAWS_TEMPLATE.md) - Project bylaws
- [FORMATION_DECISION.md](./FORMATION_DECISION.md) - Why 501(c)(3)
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - How to contribute
