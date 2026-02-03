# Trust Module

**Cryptographic Trust Architecture for Phase Mirror's Network Effect**

## Overview

The Trust Module provides the foundational infrastructure for establishing trust in Phase Mirror's decentralized false positive calibration network. It addresses critical security threats that emerge when multiple organizations contribute to shared FP rate calculations while maintaining k-anonymity.

## Threat Model

Phase Mirror's network effect creates several attack vectors:

1. **Poisoning Attacks** - Malicious organizations submitting false FP data to corrupt calibration results
2. **Sybil Attacks** - Single organizations creating multiple identities to bypass k-anonymity thresholds
3. **Data Tampering** - Organizations modifying their contributions after submission
4. **Collusion** - Multiple organizations coordinating to manipulate network statistics

The Trust Module addresses these threats through three layers:

### Layer 1: Identity Verification
Prevents Sybil attacks by requiring organizations to verify their identity through trusted authorities.

**Verification Methods:**
- `github_org` - GitHub organization verification (existing org with history)
- `stripe_customer` - Stripe customer verification (payment history)
- `manual` - Manual verification for special cases

**Key Components:**
- `OrganizationIdentity` - Verified identity with bound nonce
- `IGitHubVerifier` - GitHub org verification interface
- `IStripeVerifier` - Stripe customer verification interface
- `NonceBindingService` - Binds nonces to verified identities

### Layer 2: Reputation & Economic Incentives
Provides Byzantine fault tolerance through reputation scoring and economic stakes.

**Key Components:**
- `OrganizationReputation` - Multi-factor reputation scoring
- `StakePledge` - Economic stake that can be slashed
- `ReputationEngine` - Core reputation management
- `ContributionWeight` - Weighted aggregation based on reputation

**Reputation Factors:**
- **Base Reputation Score** (0.0 - 1.0) - Overall trustworthiness
- **Stake Pledge** - Economic commitment (USD)
- **Consistency Score** - Agreement with network consensus
- **Age Score** - Org longevity and history
- **Volume Score** - Amount of legitimate usage
- **Flagged Count** - Times flagged as suspicious

### Layer 3: Byzantine Fault Tolerance (Future)
- Attestation mechanisms for contribution integrity
- Statistical outlier detection
- BFT consensus for high-stakes decisions
- Threat detection and automated response

## Architecture

```
trust/
├── identity/           # Identity verification
│   ├── types.ts       # Core identity types
│   ├── github-verifier.ts
│   ├── stripe-verifier.ts
│   └── nonce-binding.ts
├── reputation/        # Reputation & incentives
│   ├── types.ts       # Reputation types
│   ├── reputation-engine.ts
│   └── weight-calculator.ts
├── adapters/          # Storage adapters
│   ├── types.ts       # Adapter interfaces
│   ├── local/         # Local JSON storage
│   └── aws/           # DynamoDB (stub)
└── index.ts           # Public exports
```

## Usage Examples

### Setting Up Trust Infrastructure

```typescript
import { createLocalTrustAdapters, ReputationEngine } from '@mirror-dissonance/core/trust';

// Create local adapters (for testing/development)
const adapters = createLocalTrustAdapters('.trust-data');

// Initialize reputation engine
const engine = new ReputationEngine(adapters.reputationStore, {
  minStakeForParticipation: 1000,
  stakeMultiplierCap: 1.0,
  consistencyBonusCap: 0.2,
  byzantineFilterPercentile: 0.2,
  outlierZScoreThreshold: 3.0,
});
```

### Verifying Organization Identity

```typescript
import { GitHubVerifier, OrganizationIdentity } from '@mirror-dissonance/core/trust';

// Verify through GitHub
const verifier = new GitHubVerifier(process.env.GITHUB_TOKEN);
const result = await verifier.verifyOrganization('org-123', 'acme-corp');

if (result.verified) {
  // Store verified identity
  const identity: OrganizationIdentity = {
    orgId: 'org-123',
    publicKey: '...',
    verificationMethod: 'github_org',
    verifiedAt: result.verifiedAt!,
    uniqueNonce: 'nonce-abc',
    githubOrgId: 12345,
  };
  
  await adapters.identityStore.storeIdentity(identity);
}
```

### Managing Reputation

```typescript
// Initialize new organization
await engine.updateReputation('org-123', {
  reputationScore: 0.5,  // Start at neutral
  stakePledge: 1000,     // $1000 stake
  contributionCount: 0,
  flaggedCount: 0,
  consistencyScore: 0.5,
  ageScore: 0.3,
  volumeScore: 0.0,
});

// Calculate contribution weight
const weight = await engine.calculateContributionWeight('org-123');
console.log(`Contribution weight: ${weight.weight}`);
console.log(`Factors:`, weight.factors);

// Check if org can participate
const canParticipate = await engine.canParticipateInNetwork('org-123');
```

### Handling Malicious Behavior

```typescript
// Slash stake for detected attack
await engine.slashStake('org-456', 'Submitted false FP data');

// Reputation score is now 0.0, stake status is 'slashed'
```

### Weighted Aggregation

```typescript
import { filterByzantineActors } from '@mirror-dissonance/core/trust';

// Get weights for all contributors
const weights = await Promise.all(
  orgIds.map(id => engine.calculateContributionWeight(id))
);

// Filter out bottom 20% (Byzantine actors)
const trustedWeights = filterByzantineActors(weights, 0.2);

// Use weights in aggregation
const weightedFPRate = contributions.reduce((sum, contrib, i) => {
  return sum + (contrib.fpRate * trustedWeights[i].weight);
}, 0) / trustedWeights.reduce((sum, w) => sum + w.weight, 0);
```

## Integration with FP Calibration

The Trust Module integrates with the existing FP calibration system:

1. **Identity Verification** - Organizations must verify identity before contributing
2. **Reputation Tracking** - Each contribution updates org reputation
3. **Weighted Aggregation** - FP rates weighted by reputation score
4. **Byzantine Filtering** - Outliers filtered before aggregation
5. **Stake Slashing** - Malicious actors lose economic stake

```typescript
// Example integration in calibration store
async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult> {
  const events = await this.fpStore.getFalsePositivesByRule(ruleId);
  
  // Calculate weights for each org
  const orgWeights = new Map();
  for (const orgId of new Set(events.map(e => e.orgIdHash))) {
    const weight = await this.trustEngine.calculateContributionWeight(orgId);
    orgWeights.set(orgId, weight);
  }
  
  // Filter Byzantine actors
  const trustedWeights = filterByzantineActors([...orgWeights.values()], 0.2);
  const trustedOrgs = new Set(trustedWeights.map(w => w.orgId));
  
  // Calculate weighted FP rate
  const trustedEvents = events.filter(e => trustedOrgs.has(e.orgIdHash));
  const totalWeight = trustedWeights.reduce((sum, w) => sum + w.weight, 0);
  
  // ... continue with weighted aggregation
}
```

## Storage Adapters

### Local Adapter (Development/Testing)
JSON file-based storage using atomic writes. No external dependencies.

```typescript
const adapters = createLocalTrustAdapters('.trust-data');
```

Files created:
- `.trust-data/identities.json` - Organization identities
- `.trust-data/reputations.json` - Reputation scores
- `.trust-data/pledges.json` - Stake pledges

### AWS Adapter (Production)
DynamoDB-based storage for production deployments (to be implemented).

```typescript
const adapters = createAWSTrustAdapters({
  tableName: 'trust-identities',
  region: 'us-east-1',
});
```

## Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ Core type definitions
- ✅ ReputationEngine class scaffold
- ✅ Local adapters
- ✅ Module structure

### Phase 2: Identity Verification
- [ ] GitHub org verification implementation
- [ ] Stripe customer verification implementation
- [ ] Nonce binding service
- [ ] Domain ownership verification

### Phase 3: Reputation Algorithms
- [ ] Consistency score calculation
- [ ] Age score algorithms
- [ ] Volume score tracking
- [ ] Byzantine detection

### Phase 4: Economic Incentives
- [ ] Stake pledge integration
- [ ] Slashing mechanisms
- [ ] Reward distribution
- [ ] Stake recovery process

### Phase 5: Advanced Features
- [ ] Attestation mechanisms
- [ ] BFT consensus protocols
- [ ] Automated threat detection
- [ ] Real-time monitoring

## Testing

Basic unit tests are provided for:
- Reputation engine weight calculation
- Local adapter operations
- Byzantine actor filtering

Run tests:
```bash
pnpm test trust
```

## Security Considerations

1. **Nonce Uniqueness** - Each nonce must be bound to exactly one verified identity
2. **Stake Security** - Stake slashing should be irreversible and publicly auditable
3. **Reputation Manipulation** - Prevent reputation score manipulation through gaming
4. **Privacy** - Identity verification must not compromise k-anonymity
5. **Timing Attacks** - Prevent timing-based deanonymization

## References

- Existing adapters: `src/adapters/`
- FP Store: `src/fp-store/`
- Calibration Store: `src/calibration-store/`
- Nonce System: `src/nonce/`
