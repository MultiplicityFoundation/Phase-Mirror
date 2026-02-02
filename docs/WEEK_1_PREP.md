# Week 1 Preparation Checklist

**Start Date:** [To be filled]  
**Focus:** Core Implementation Validation & Critical Issue Resolution

---

## Pre-Week 1 Setup

### Environment Verification
- [ ] All systems from Day -2 operational
  - [ ] Node.js, pnpm, Git installed
  - [ ] AWS CLI configured
  - [ ] Terraform initialized
- [ ] Day -1 AWS backend deployed
  - [ ] S3 state bucket exists
  - [ ] DynamoDB lock table active
  - [ ] Terraform backend configured
- [ ] Day 0 tracking systems ready
  - [ ] docs/internal/mvp-completion-tracker.md created
  - [ ] docs/guides/environment.md documented
  - [ ] Progress script tested

### Code Preparation
- [ ] Repository up to date
  ```bash
  git checkout main
  git pull origin main
  ```
- [ ] All dependencies installed
  ```bash
  pnpm install
  ```
- [ ] Build successful
  ```bash
  pnpm build
  ```
- [ ] Baseline test run completed
  ```bash
  pnpm test
  # Capture results for comparison
  ```

### Documentation Review
- [ ] Read `docs/known-issues.md` - familiarize with 24 tracked items
- [ ] Review `docs/adr/ADR-003-hierarchical-pmd-compute.md` - understand L0/L1/L2 architecture
- [ ] Scan `packages/mirror-dissonance/src/oracle.ts` - main implementation
- [ ] Review Phase 2 audit document (if exists)

---

## Week 1 Day 1 Preparation

**Day 1 Focus:** Implementation Audit (FP Store, Consent Store, Anonymizer)

### Files to Review (Pre-Read)

**Morning Session: FP Store**
```bash
# Navigate and review these files tonight
packages/mirror-dissonance/src/fp-store/
├── types.ts              # Interface definitions
├── interface.ts          # IFPStore contract
├── dynamodb-store.ts     # Main implementation (CRITICAL)
├── noop.ts               # Test implementation
└── __tests__/            # Existing tests (if any)
```

**Key Questions to Answer:**
1. Is `DynamoDBFPStore.recordEvent()` fully implemented?
2. Does `getWindowByCount()` correctly query DynamoDB?
3. Are errors properly handled and propagated?
4. Is performance measured (target: 50ms p99)?

**Afternoon Session: Consent Store & Anonymizer**
```bash
packages/mirror-dissonance/src/consent-store/
├── index.ts              # Main implementation
└── __tests__/            # Tests

packages/mirror-dissonance/src/anonymizer/
├── index.ts              # HMAC-SHA256 implementation
└── __tests__/            # Tests
```

### Audit Template Prepared

Create these files to fill in during Day 1:
```bash
touch FP_STORE_AUDIT.md
touch CONSENT_STORE_AUDIT.md
touch ANONYMIZER_AUDIT.md
```

Template structure:
```markdown
# [Component] Implementation Audit

**Date:** [Date]
**Auditor:** [Name]

## Implementation Status

### [Method/Function 1]
- **Status:** ✅ Complete | ⚠️ Partial | ❌ Missing
- **Details:** [Notes]
- **Issues:** [List any problems]

### [Method/Function 2]
...

## Performance

- **Measured:** [Yes/No]
- **Target:** [e.g., 50ms p99]
- **Actual:** [Result]

## Error Handling

- **Adequate:** [Yes/No]
- **Issues:** [List problems]

## Test Coverage

- **Current:** [%]
- **Adequate:** [Yes/No]

## Recommendations

1. [Action item 1]
2. [Action item 2]

## Conclusion

[Overall assessment: Production-ready | Needs work | Critical issues]
```

---

## Tools & Scripts Prepared

### Testing Tools
```bash
# LocalStack for integration testing
docker pull localstack/localstack:latest

# Verify docker works
docker run --rm hello-world
```

### Development Tools
```bash
# Install GitHub CLI for label creation (Day 2)
brew install gh  # macOS
# or: apt install gh  # Linux

# Authenticate GitHub CLI
gh auth login
```

### AWS Tools
```bash
# Verify AWS access
aws sts get-caller-identity

# Check existing DynamoDB tables (should be empty in staging)
aws dynamodb list-tables --region us-east-1

# Check SSM parameters (should be empty in staging)
aws ssm describe-parameters --region us-east-1
```

---

## Time Blocking for Week 1

### Day 1 (Monday)
- **09:00-12:00:** FP Store audit
- **12:00-13:00:** Lunch + document findings
- **13:00-15:00:** Consent Store audit
- **15:00-17:00:** Anonymizer audit
- **17:00-17:30:** Update tracker, commit audit documents

### Day 2 (Tuesday)
- **09:00-11:00:** Fix Issue #1 (CODEOWNERS)
- **11:00-13:00:** Fix Issue #2 (Drift baseline)
- **13:00-14:00:** Lunch
- **14:00-16:00:** Fix Issue #3 (GitHub labels)
- **16:00-17:30:** Test all fixes, commit changes

### Day 3-4 (Wed-Thu)
- **Day 3 AM:** CLI path resolution
- **Day 3 PM:** Nonce automation script
- **Day 4 AM:** FP Store error handling
- **Day 4 PM:** Rule evaluation error handling

### Day 5 (Friday)
- **09:00-12:00:** Oracle integration verification
- **12:00-13:00:** Lunch
- **13:00-17:00:** LocalStack testing, performance benchmarks

### Day 6-7 (Sat-Sun - Optional Weekend Work)
- **Day 6:** Create manual test harness
- **Day 7:** Edge case testing, Week 1 review

---

## Success Criteria for Week 1

By end of Friday (Day 5):
- ✅ All 3 critical issues resolved
- ✅ All 6 important issues resolved
- ✅ Oracle verified with production components
- ✅ Performance benchmarks pass
- ✅ Manual integration tests pass

---

## Emergency Contacts & Resources

**If Blocked:**
- Review `docs/known-issues.md` for context
- Check `docs/TROUBLESHOOTING.md` (to be created Week 4)
- Post in GitHub Discussions
- Create issue with `priority-high` label

**Key Files:**
- MVP Tracker: `docs/internal/mvp-completion-tracker.md`
- Environment: `docs/guides/environment.md`
- Known Issues: `docs/known-issues.md`
- Architecture: `docs/adr/`

---

## Final Checklist Before Week 1 Starts

- [ ] All preparation tasks above completed
- [ ] Environment validated (`./scripts/validate-environment.sh`)
- [ ] Day 0 committed and pushed
- [ ] Calendar blocked for Week 1 work
- [ ] Teammates notified of sprint start (if applicable)
- [ ] Coffee/tea supplies restocked ☕
- [ ] Headphones charged 🎧
- [ ] Ready to ship 🚀

---

**Prepared By:** [Your Name]  
**Date:** [To be filled]

**Let's build.** 💪
