# Trust Module Documentation

This directory contains user-facing documentation for Phase Mirror's Trust Module, which provides cryptographic trust architecture and Byzantine fault tolerance for the false positive calibration network.

## Documentation

### [Consistency Scoring](./consistency-scoring.md)

Complete guide to consistency scoring - Phase Mirror's mechanism for Byzantine fault tolerance. Learn how organizations earn reputation by contributing FP rates aligned with network consensus.

**Topics covered:**
- Overview and motivation
- 5-step workflow with examples
- Consistency score formulas and calculations
- Configuration and tuning parameters
- Reputation integration
- Outlier detection
- CLI commands
- Best practices and troubleshooting
- Security considerations
- FAQ

## Trust Module Components

The Trust Module consists of several integrated components:

### 1. Identity Verification

Organizations must verify their identity through:
- **GitHub Organization Verification**: Prove ownership via GitHub API
- **Stripe Customer Verification**: Prove revenue via Stripe API
- **Nonce Binding**: Cryptographic binding of nonces to verified identities

See: [Nonce Binding Guide](../NONCE_BINDING_GUIDE.md)

### 2. Reputation System

Track organization reputation based on:
- **Consistency Score**: Alignment with network consensus (0.0-1.0)
- **Stake Pledge**: Economic commitment (USD)
- **Age Score**: Account longevity
- **Volume Score**: Usage volume
- **Contribution Count**: Number of FP contributions

### 3. Consistency Scoring

Measure how well organizations' FP contributions align with network consensus:
- **Byzantine Fault Tolerance**: Automatic outlier detection and downweighting
- **Feedback Loop**: Consistent orgs gain influence, outliers lose influence
- **Privacy Preservation**: K-anonymity maintained throughout

See: [Consistency Scoring Documentation](./consistency-scoring.md)

### 4. Contribution Weighting

Calculate contribution weights based on reputation factors:

```
contribution_weight = base_reputation × (1 + stake_multiplier) × (1 + consistency_bonus)
```

This ensures high-reputation organizations have more influence in consensus calculations while preventing Byzantine attacks.

## Quick Start

### For Contributors

1. **Verify your organization identity:**
   ```bash
   oracle verify github --org-id your-org --github-org github-username --public-key <key>
   ```

2. **Create a stake pledge:**
   ```bash
   oracle reputation stake pledge --org-id your-org --amount 5000
   ```

3. **Start contributing FP data** (through your CI/CD integration)

4. **Monitor your consistency score:**
   ```bash
   oracle reputation show --org-id your-org --verbose
   ```

### For Operators

1. **Monitor network health:**
   ```bash
   oracle reputation list --min-score 0.5 --sort-by consistency
   ```

2. **Investigate outliers:**
   ```bash
   oracle reputation calculate-consistency --org-id suspect-org --mock-data
   ```

3. **Slash malicious actors:**
   ```bash
   oracle reputation stake slash --org-id malicious-org --reason "Data poisoning"
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Trust Module                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ Identity         │  │ Reputation                    │   │
│  │ Verification     │  │ System                        │   │
│  └──────────────────┘  └──────────────────────────────┘   │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ Consistency      │  │ Contribution                  │   │
│  │ Scoring          │  │ Weighting                     │   │
│  └──────────────────┘  └──────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Calibration Network                             │
│  (Weighted FP rate aggregation with BFT)                    │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Byzantine Fault Tolerance

The Trust Module provides BFT through:
1. **Stake Requirements**: Economic disincentive for malicious behavior
2. **Consistency Scoring**: Automatic outlier detection
3. **Reputation Weighting**: Bad actors lose influence over time
4. **K-Anonymity**: Privacy-preserving aggregation

### Cold Start Problem

New organizations start with:
- Neutral consistency score (0.5)
- Minimum reputation
- Must contribute to 3+ rules before score is reliable
- Gradual reputation building

### Feedback Loop

```
Good Contributions → High Consistency → Higher Weight → More Influence
     ↑                                                          │
     └──────────────────────────────────────────────────────────┘

Bad Contributions → Low Consistency → Lower Weight → Less Influence
     ↑                                                         │
     └─────────────────────────────────────────────────────────┘
```

## Security Properties

### Privacy
- Organization IDs hashed before aggregation
- No identity linking between contributions
- K-anonymity preserved in consensus calculation

### Attack Resistance
- **Minority Attacks**: Cannot skew consensus
- **Collusion**: Detected as outliers
- **Gradual Poisoning**: Time decay prevents
- **Consensus Manipulation**: Requires majority of network weight

### Auditability
- All contributions tracked
- Consistency scores logged
- Outlier patterns visible
- Stake slashing recorded

## Related Documentation

### Implementation
- [Reputation Engine](../../packages/mirror-dissonance/src/trust/reputation/reputation-engine.ts)
- [Consistency Calculator](../../packages/mirror-dissonance/src/trust/reputation/consistency-calculator.ts)
- [Trust Adapters](../../packages/mirror-dissonance/src/trust/adapters/)

### User Guides
- [CLI Reputation Commands](../../packages/cli/docs/REPUTATION_COMMANDS.md)
- [Nonce Binding Guide](../NONCE_BINDING_GUIDE.md)
- [Quick Start Guide](../QUICKSTART.md)

### Technical Details
- [Trust Module Implementation](../../packages/mirror-dissonance/src/trust/CONSISTENCY_SCORING.md)
- [CLI Implementation Summary](../../CLI_IMPLEMENTATION_SUMMARY.md)
- [Integration Tests](../../INTEGRATION_TESTS.md)

## Support

For questions or issues:
- **GitHub Issues**: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Email**: support@phasemirror.com
- **Reputation Issues**: reputation@phasemirror.com
