# Release Notes: Mirror Dissonance v1.0.0-rc1

**Release Date**: February 1, 2026  
**Type**: Release Candidate  
**Status**: Pre-release / MVP Feature Complete

---

## 🎉 Welcome to Mirror Dissonance v1.0.0-rc1

This is the first release candidate of the Mirror Dissonance Protocol, an open-core system for detecting productive contradictions in agentic domain-specific reasoning. This MVP release represents 70% → 100% completion of the core functionality, with comprehensive documentation, infrastructure-as-code, and a working demonstration of the open-core model.

---

## 🚀 What's Included

### Core Protocol (`@mirror-dissonance/core`)

**L0 Invariant Validation** (Foundation Tier)
- ✅ Sub-100ns validation of critical invariants
- ✅ Schema hash validation
- ✅ Permission bits checking
- ✅ Drift magnitude detection
- ✅ Nonce freshness validation
- ✅ FPR contraction witness enforcement

**False Positive (FP) Tracking**
- ✅ DynamoDB-backed event storage
- ✅ Window-based FPR calculation
- ✅ Query by count or time range
- ✅ FP marking with attribution (reviewer, ticket)
- ✅ <50ms p99 query performance

**Consent Management**
- ✅ Organization and repository-level consent
- ✅ Consent expiration and revocation
- ✅ Hierarchical consent propagation
- ✅ Privacy-respecting anonymization

**Anonymization System**
- ✅ HMAC-SHA256 based anonymization
- ✅ Nonce rotation with grace period
- ✅ SSM Parameter Store integration
- ✅ Fail-closed security model

**Circuit Breaker**
- ✅ Configurable block threshold
- ✅ Degraded mode activation
- ✅ Automatic cooldown with TTL
- ✅ Prevents cascading blocks

**Rule Engine**
- ✅ MD-001: Branch Protection
- ✅ MD-002: Autonomy vs Compliance
- ✅ MD-003: Probabilistic vs Deterministic
- ✅ MD-004: Liability Framework
- ✅ MD-005: Drift Detection

### CLI Tool (`@mirror-dissonance/cli`)

**Operation Modes**
- ✅ `pull_request`: PR checks with GitHub integration
- ✅ `merge_group`: Merge queue validation
- ✅ `drift`: Baseline drift detection
- ✅ `local`: Testing without AWS dependencies

**Features**
- ✅ Deterministic JSON report output
- ✅ Verbose logging and debugging
- ✅ AWS integration (DynamoDB, SSM, S3)
- ✅ Local mode for development

### Infrastructure

**Terraform Modules**
- ✅ S3 backend with state versioning and locking
- ✅ DynamoDB tables (fp-events, consent, block-counter)
- ✅ SSM Parameter Store for nonce
- ✅ KMS encryption keys
- ✅ CloudWatch alarms (6 configured)
- ✅ S3 baseline bucket for drift detection
- ✅ IAM roles for GitHub Actions OIDC

**Scripts**
- ✅ Nonce rotation with grace period
- ✅ Environment validation
- ✅ Backend validation
- ✅ Workspace management
- ✅ Baseline loading from S3

### Documentation

**Getting Started** (Complete ✅)
- Quick Start Guide (6.3KB)
- Configuration Reference (12.7KB)
- Troubleshooting Guide (12.1KB)
- FAQ (12KB, 45 questions)

**Architecture** (Complete ✅)
- System architecture
- 7 ADRs (Architecture Decision Records)
- L0 performance benchmarks
- Component diagrams

**Operations** (Complete ✅)
- Deployment guides (staging/prod)
- Runbooks (nonce rotation, backup/recovery)
- Monitoring setup
- Security hardening

**Governance** (Complete ✅)
- 501(c)(3) nonprofit foundation
- Bylaws and succession planning
- Code of Conduct
- Contributing guidelines

### GitHub Actions Integration

**Workflows**
- ✅ PR check workflow template
- ✅ Merge queue integration
- ✅ Drift detection workflow
- ✅ OIDC authentication (no long-lived credentials)

---

## 🚫 What's NOT Included (Roadmap)

### Testing (Week 2 Focus - In Progress)
- ⏳ Unit test coverage (currently ~12%, target 80%+)
- ⏳ Integration test suite
- ⏳ E2E test automation
- ⏳ Performance regression tests

### Production Readiness (Week 3-4 Focus)
- ⏳ Production deployment validation
- ⏳ CloudWatch dashboards
- ⏳ Load testing results
- ⏳ Multi-region support

### Advanced Features (Future)
- ⏳ k-Anonymity calibration queries (requires 5+ orgs)
- ⏳ Custom rule development UI
- ⏳ FP analytics dashboard
- ⏳ Advanced reporting and insights
- ⏳ Pro/managed service features

---

## 📦 Installation

### Prerequisites
- Node.js 18+
- pnpm 8+
- AWS CLI (for production deployment)
- Terraform 1.6+ (for infrastructure)

### Quick Install

```bash
# Clone repository
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run locally (no AWS)
pnpm --filter @mirror-dissonance/cli run start analyze --mode local --help
```

### Self-Hosted Deployment

```bash
# Deploy infrastructure
cd infra/terraform
terraform init
terraform workspace new staging
terraform apply -var-file=staging.tfvars

# Generate nonce
cd ../..
./scripts/rotate-nonce.sh staging 0

# Configure GitHub Actions
# Add workflow to .github/workflows/mirror-dissonance.yml
# See docs/QUICKSTART.md for complete setup
```

### Global CLI Installation

```bash
# When published to npm
npm install -g @mirror-dissonance/cli
mirror-dissonance --help
```

---

## 🔄 Breaking Changes from Pre-Release

None - this is the first official release candidate.

**Note**: If you were using unreleased development versions, the following changes may affect you:
- Table naming convention changed to `{project}-{resource}-{environment}`
- Environment variables standardized (see docs/CONFIGURATION.md)
- CLI commands follow new structure (breaking from earlier prototypes)

---

## 🐛 Known Issues

### Critical (Must Fix Before 1.0.0)
None currently identified.

### Important (Should Fix Before 1.0.0)
- Test coverage below 80% target
- E2E tests not comprehensive
- Production deployment not validated
- CloudWatch dashboards not created

### Nice-to-Have (Post-1.0.0)
- Multi-region support
- Advanced analytics UI
- Custom rule development interface
- Performance optimization beyond targets

**See**: [CHANGELOG.md](./CHANGELOG.md) for full list of known limitations.

---

## 📊 Performance Benchmarks

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| L0 Invariants (p99) | <100ns | 50-80ns | ✅ Exceeded |
| FP Store Query (p99) | <50ms | 20-40ms | ✅ Exceeded |
| Consent Check (p99) | <20ms | <20ms | ✅ Met |
| Full Oracle Run | <5s | 2-4s | ✅ Exceeded |

---

## 💰 Cost Estimates

**Self-Hosted (AWS)**
- **Development**: <$5/month
- **Staging**: $5-20/month  
- **Production**: $50-100/month (scales with usage)

**Open-Core (Free)**
- Software: Apache 2.0 licensed
- No subscription fees
- Self-host on your infrastructure

**Pro/Managed Service (Coming Soon)**
- Contact team for pricing
- Managed infrastructure
- Priority support
- Advanced features

---

## 🤝 Contributors

This release was made possible by:
- **R. Van Gelder** - Interim Steward, Architecture, Implementation
- **copilot-swe-agent[bot]** - Documentation, Testing, Infrastructure

Special thanks to the broader community for feedback and inspiration.

---

## 🔐 Security

**Security Model**
- HMAC-SHA256 anonymization
- Quarterly nonce rotation
- Fail-closed design (no nonce = error)
- All data encrypted at rest (KMS)
- TLS for all API calls
- OIDC for GitHub Actions (no long-lived credentials)

**Reporting Security Issues**
Please report security vulnerabilities privately:
- Email: [security contact - TBD]
- GitHub Security Advisories: [Preferred method]

Do NOT report security issues in public GitHub issues.

---

## 📝 License

**Open-Core Model**
- **Core Library**: Apache 2.0 + Managed Service Restriction
- **CLI**: Apache 2.0
- **Documentation**: Apache 2.0

✅ **You CAN**:
- Use commercially
- Modify and extend
- Self-host for your organization
- Contribute improvements

❌ **You CANNOT**:
- Offer as managed SaaS to others without permission

See [LICENSE](./LICENSE) and [ADR-002](./docs/adr/ADR-002-apache-2-license-with-managed-service-restriction.md) for details.

---

## 🔗 Resources

- **Documentation**: https://github.com/PhaseMirror/Phase-Mirror/tree/main/docs
- **Quick Start**: [docs/QUICKSTART.md](./docs/QUICKSTART.md)
- **Configuration**: [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
- **Troubleshooting**: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
- **FAQ**: [docs/FAQ.md](./docs/FAQ.md)
- **Issues**: https://github.com/PhaseMirror/Phase-Mirror/issues
- **Discussions**: https://github.com/PhaseMirror/Phase-Mirror/discussions

---

## 🚀 Getting Help

- **Documentation**: Browse [docs/](./docs/) directory
- **FAQ**: See [FAQ.md](./docs/FAQ.md) for common questions
- **Troubleshooting**: Detailed guide in [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/PhaseMirror/Phase-Mirror/discussions)

---

## 🎯 Next Steps

**For Users**
1. Follow [Quick Start Guide](./docs/QUICKSTART.md)
2. Deploy to staging environment
3. Configure GitHub Actions
4. Start detecting dissonance!

**For Contributors**
1. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
2. Check [open issues](https://github.com/PhaseMirror/Phase-Mirror/issues)
3. Join discussions
4. Submit your first PR

**For Maintainers**
1. Validate in production-like environment
2. Complete Week 2 testing (80% coverage goal)
3. Monitor community adoption
4. Prepare for v1.0.0 final release

---

## 📅 Roadmap to v1.0.0

**Week 2 (Days 8-14)**: Testing Infrastructure
- Achieve 80%+ unit test coverage
- Complete integration test suite
- Validate nonce rotation under load
- E2E test automation

**Week 3 (Days 15-21)**: Infrastructure & Deployment
- Production environment deployment
- Monitoring dashboard creation
- Security hardening validation
- Backup/recovery testing

**Week 4 (Days 22-28)**: Polish & Launch
- Documentation validation by external users
- Performance benchmarking at scale
- Community value confirmation
- v1.0.0 final release

---

**Release Tag**: `v1.0.0-rc1`  
**Release Date**: 2026-02-01  
**Status**: Pre-release / Release Candidate  

---

*This is a pre-release version. While feature-complete for MVP, it has not been validated in production environments. Use in staging/test environments is recommended. Production deployment should wait for v1.0.0 final release after validation testing.*
