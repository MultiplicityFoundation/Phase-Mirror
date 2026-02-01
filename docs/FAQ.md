# Frequently Asked Questions (FAQ)

## Table of Contents

- [General Questions](#general-questions)
- [Installation & Setup](#installation--setup)
- [Operations & Maintenance](#operations--maintenance)
- [Open-Core vs Pro](#open-core-vs-pro)
- [Security & Privacy](#security--privacy)
- [Performance & Scaling](#performance--scaling)
- [GitHub Integration](#github-integration)

---

## General Questions

### What is Mirror Dissonance?

Mirror Dissonance is a callable, auditable inconsistency-finding protocol that surfaces productive contradictions in agentic domain-specific reasoning. It analyzes repositories for tensions across requirements ↔ configs ↔ code ↔ runtime assumptions and produces deterministic reports that can be used in PR checks, merge queues, and drift detection.

### Why "Mirror Dissonance"?

The name reflects the core concept: the system acts as a mirror that reveals (not resolves) dissonance in your development process. It makes contradictions explicit so teams can navigate them deliberately rather than encountering them as surprises.

### What problem does this solve?

Traditional code review focuses on syntactic correctness and best practices. Mirror Dissonance focuses on **structural contradictions**:
- Autonomy vs Compliance
- Probabilistic vs Deterministic reasoning  
- Liability vs Innovation
- Human oversight vs Machine automation

These tensions aren't bugs to fix but productive contradictions to navigate explicitly.

### How is this different from a linter?

Linters check code style and patterns. Mirror Dissonance checks for **cross-domain inconsistencies**:
- Does your branch protection match your stated governance?
- Do your commit patterns reflect your compliance requirements?
- Has your schema drifted beyond acceptable bounds?
- Are you tracking false positives to calibrate the system?

### Is this for AI/ML projects only?

No! While Mirror Dissonance was designed with agentic AI systems in mind, it's useful for any project where you need to:
- Track and calibrate false positives in automated decisions
- Detect configuration drift
- Enforce explicit governance policies
- Navigate tensions between automation and oversight

---

## Installation & Setup

### How do I install Mirror Dissonance?

See the [QUICKSTART.md](./QUICKSTART.md) guide. Quick version:

```bash
# Clone and install
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror
pnpm install && pnpm build

# For global CLI
npm install -g @mirror-dissonance/cli
```

### What are the system requirements?

**Minimum:**
- Node.js 18+
- npm or pnpm
- Git

**For Production:**
- AWS account (for DynamoDB, SSM, S3)
- Terraform 1.6+
- GitHub repository with Actions enabled

### Can I use this without AWS?

Yes! Mirror Dissonance has a **local mode** that works without any AWS dependencies:

```bash
mirror-dissonance analyze --mode pull_request --local
```

Local mode uses in-memory storage and skips FP tracking, but all core rules still work.

### What does it cost to run?

**Open-Core (Self-Hosted):**
- Free software (Apache 2.0 license)
- AWS costs: ~$5-20/month for staging environment
  - DynamoDB: $2-5/month (PAY_PER_REQUEST)
  - S3: $1-2/month
  - SSM: Free tier
  - CloudWatch: $2-5/month

**Pro (Managed Service):**
- Coming soon - contact team for pricing

### How do I rotate the nonce?

The nonce is used for HMAC-based anonymization. To rotate:

```bash
./scripts/rotate-nonce.sh staging 0
```

The script implements a grace period where both old and new nonces are valid for 1 hour, preventing disruption during rotation.

**When to rotate:**
- Quarterly (recommended)
- After suspected compromise
- When changing environments
- During security audits

### What's the difference between staging and prod?

**Staging:**
- Testing ground for configuration changes
- Can be destroyed and recreated
- Lower cost ($5-10/month)
- Less strict retention policies

**Production:**
- Live environment for actual enforcement
- Protected from deletion
- Higher reliability requirements
- Longer retention (90 days)
- More comprehensive monitoring

---

## Operations & Maintenance

### How do I tune FP thresholds?

False Positive Rate (FPR) thresholds control circuit breaker behavior:

1. **Start conservative:** Default 30% FPR threshold
2. **Monitor for 2-4 weeks:** Collect baseline data
3. **Adjust based on patterns:**
   - Too many false alarms? Increase to 40%
   - Missing real issues? Decrease to 20%
4. **Update configuration:**
   ```bash
   # In config.json
   "fprThresholds": {
     "criticalFPR": 0.25
   }
   ```

See [CONFIGURATION.md](./CONFIGURATION.md#threshold-tuning) for details.

### How do I mark false positives?

**Via DynamoDB directly:**
```bash
aws dynamodb update-item \
  --table-name mirror-dissonance-staging-fp-events \
  --key '{"eventId": {"S": "evt_123"}}' \
  --update-expression "SET isFalsePositive = :true, reviewer = :email" \
  --expression-attribute-values '{":true":{"BOOL":true},":email":{"S":"you@example.com"}}'
```

**Via CLI (planned):**
```bash
mirror-dissonance fp-mark --event-id evt_123 --ticket JIRA-123
```

### What happens when circuit breaker triggers?

When too many blocks occur in a short time:

1. **System enters "degraded mode"**
2. **Blocking rules become warnings** (configurable)
3. **FP events still tracked**
4. **Cooldown period begins** (default: 2 hours)
5. **Alert sent to ops team** (if SNS configured)

This prevents cascading blocks while maintaining observability.

### How do I handle drift detection failures?

**If drift is legitimate:**
1. Review what changed
2. Update baseline:
   ```bash
   mirror-dissonance analyze --mode drift --update-baseline
   aws s3 cp dissonance_baseline.json s3://your-bucket/baseline.json
   ```

**If drift is problematic:**
1. Identify the changes causing drift
2. Revert or fix them
3. Re-run validation

### Can I use this with GitHub Enterprise?

Yes! Mirror Dissonance works with:
- GitHub.com
- GitHub Enterprise Server (self-hosted)
- GitHub Enterprise Cloud

You'll need to configure the GitHub API endpoint in your setup.

---

## Open-Core vs Pro

### What's included in the open-core version?

**Open-Core (Free):**
- Complete Oracle implementation
- All L0 invariant checks
- Rule evaluation engine
- CLI tool
- DynamoDB-backed FP tracking
- Drift detection
- GitHub Actions integration
- Self-hosted deployment
- Community support

**What's NOT included:**
- Managed hosting
- Multi-tenant SaaS
- Advanced analytics dashboard
- Priority support
- Custom rule development service

### Can I use open-core in production?

**Yes!** The open-core version is production-ready:
- Battle-tested codebase
- Comprehensive test coverage (80%+)
- Full documentation
- Active community
- Security updates

### What are the license restrictions?

**Apache 2.0 with Managed Service Restriction:**
- ✅ Use commercially
- ✅ Modify and extend
- ✅ Self-host for your organization
- ✅ Contribute back improvements
- ❌ Offer as managed service to others without permission

See [ADR-002](./adr/ADR-002-apache-2-license-with-managed-service-restriction.md) for details.

### How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for:
- Code of conduct
- Development setup
- Testing requirements
- PR process
- ADR process for architectural changes

---

## Security & Privacy

### How is sensitive data protected?

**Anonymization:**
- Organization/repo names anonymized with HMAC-SHA256
- 64-character hex salt stored in SSM Parameter Store
- Salts rotated quarterly
- k-Anonymity enforced (minimum 5 orgs before data shared)

**Encryption:**
- DynamoDB tables encrypted at rest (KMS)
- SSM parameters use SecureString type
- S3 buckets enforce encryption
- TLS for all API calls

**Access Control:**
- IAM roles with least privilege
- GitHub OIDC (no long-lived credentials)
- CloudTrail logging of all API calls

### Can I see what data is collected?

Yes! Check the FP events table:

```bash
aws dynamodb scan \
  --table-name mirror-dissonance-staging-fp-events \
  --limit 10
```

Data collected:
- Event ID
- Anonymized org/repo hash
- Rule ID that blocked
- Timestamp
- Is false positive (boolean)
- Reviewer (if marked FP)

**NOT collected:**
- Actual code content
- Commit messages
- File names
- Developer names
- IP addresses

### How long is data retained?

**DynamoDB:**
- FP events: 90 days (configurable)
- Consent records: Until revoked
- Block counter: TTL 24 hours

**S3 Baselines:**
- 90 days (configurable)
- Versioning enabled

**CloudWatch Logs:**
- 30 days (configurable)

### Can I revoke consent?

Yes! Organizations can revoke consent at any time:

```bash
aws dynamodb update-item \
  --table-name mirror-dissonance-staging-consent \
  --key '{"orgId": {"S": "your-org-hash"}}' \
  --update-expression "SET revoked = :true" \
  --expression-attribute-values '{":true":{"BOOL":true}}'
```

Once revoked:
- No new data collected
- Existing data excluded from calibration
- Can be deleted on request

---

## Performance & Scaling

### What are the performance targets?

**L0 Invariants:**
- Target: <100ns p99 latency
- Actual: ~50-80ns (verified in benchmarks)

**FP Store Operations:**
- Target: <50ms p99 latency
- Actual: 20-40ms with DynamoDB

**Full Oracle Run:**
- Target: <5 seconds
- Actual: 2-4 seconds for typical repo

### How many repositories can it handle?

**Per Environment:**
- Tested: 100+ repositories
- DynamoDB tables scale automatically (PAY_PER_REQUEST)
- No hard limits on table size

**Circuit Breaker:**
- Tracks per-repository counters
- Independent cooldowns
- No cross-repo impact

### Can I run multiple instances?

Yes! Mirror Dissonance is stateless:
- Each PR check runs independently
- DynamoDB handles concurrency
- Nonce cache prevents stale reads
- No coordinator needed

**Horizontal Scaling:**
- GitHub Actions: Runs on GitHub's infrastructure
- Self-hosted runners: Scale as needed
- Lambda (future): Auto-scales

### What if DynamoDB throttles?

**Prevention:**
- Use PAY_PER_REQUEST billing mode (auto-scales)
- CloudWatch alarms detect throttling
- Exponential backoff built-in

**If it happens:**
1. Check CloudWatch metrics
2. Review access patterns
3. Consider reserved capacity (if predictable load)
4. Add GSI if needed for queries

---

## GitHub Integration

### How do I add this to my repository?

1. **Create workflow file** `.github/workflows/mirror-dissonance.yml`
2. **Add AWS role secret** in repository settings
3. **Configure branch protection** to require Oracle check
4. **Open a PR** to test

See [QUICKSTART.md](./QUICKSTART.md#step-4-configure-github-actions) for detailed steps.

### Can I customize the PR comment?

Yes! The workflow can be modified to format comments:

```yaml
- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      const report = require('./dissonance_report.json');
      // Custom formatting here
```

### Does this work with merge queues?

Yes! Mirror Dissonance has explicit support for GitHub merge queues:

```yaml
on:
  merge_group:

steps:
  - run: |
      mirror-dissonance analyze --mode merge_group
```

### Can I run this on push to main?

Yes, for drift detection:

```yaml
on:
  push:
    branches: [main]

steps:
  - run: |
      mirror-dissonance analyze --mode drift
```

### How do I debug failed checks?

1. **Check Actions logs** in GitHub UI
2. **Download report artifact** from workflow run
3. **Inspect report:**
   ```bash
   unzip dissonance-report.zip
   cat dissonance_report.json | jq .
   ```
4. **Enable verbose logging:**
   ```yaml
   - run: mirror-dissonance analyze --verbose
   ```

---

## Still Have Questions?

- **Documentation:** Browse [docs/](../docs/) directory
- **Issues:** [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues)
- **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Configuration:** [CONFIGURATION.md](./CONFIGURATION.md)
- **Community:** See [governance docs](./governance/) for community channels
