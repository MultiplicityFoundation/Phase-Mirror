# Phase Mirror Trust Specification (SPEC-TRUST)

> **Status**: Living document — Phase 5 (Network Layer Governance)
> **Phase**: 5 — Network preparation, governance specs, telemetry scaffolding
> **Scope**: This specification applies **exclusively** to **Plane C (FP Calibration Network)**. It does not govern Plane A (compute) or Plane B (persistence) operations. None of this activates until the network exists (V ≥ 10 verified organizations).

---

## 1. Scope and Applicability

Phase Mirror's architecture separates concerns into three planes:

| Plane | Domain | Spec |
|-------|--------|------|
| **A — Compute** | L0 invariants, rule evaluation, analysis | SPEC-COMPUTE.md |
| **B — Persistence** | FP store, consent store, block counter | Adapter interfaces in `src/adapters/types.ts` |
| **C — Network Trust** | Multi-org FP calibration, reputation, consensus | **This document** |

This spec defines the 6-layer defense architecture that secures aggregate FP calibration across organizations. Every mechanism described here exists to answer one question: *Can we trust the consensus false-positive rate computed from contributions by multiple independent organizations?*

### Interplane Interfaces

- **Plane B → Plane C**: `FPStoreAdapter.getFalsePositivesByRule()` provides raw FP events to the calibration pipeline
- **Plane B → Plane C**: `ConsentStoreAdapter.hasValidConsent()` gates all data sharing
- **Plane A → Plane C**: Consent store mediates; compute never calls trust directly
- **Plane C internal**: `CalibrationStore` orchestrates `ReputationEngine`, `ByzantineFilter`, and `ConsistencyScoreCalculator`

### Implementation References

The trust module implementation lives in `packages/mirror-dissonance/src/trust/` (26 TypeScript source files, 9 test files):

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `trust/identity/` | Identity verification, nonce binding | `github-verifier.ts`, `stripe-verifier.ts`, `nonce-binding.ts` |
| `trust/reputation/` | Reputation scoring, Byzantine filtering | `reputation-engine.ts`, `byzantine-filter.ts`, `consistency-calculator.ts`, `weight-calculator.ts` |
| `trust/adapters/` | Store interfaces and implementations | `types.ts`, `local/index.ts`, `aws/index.ts` |
| `trust/__tests__/` | Unit tests (9 files) | `byzantine-filter.test.ts`, `nonce-binding.test.ts`, etc. |

---

## 2. Layer 1 — Identity Verification

### Purpose
Ensure every organization contributing FP data is a verified, real entity — not a sock-puppet or ephemeral account.

### Verification Methods

#### GitHub Organization Verification
An organization must demonstrate a legitimate GitHub presence:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Organization age | ≥ 90 days | Prevents freshly-minted Sybil orgs |
| Member count | ≥ 3 members | Minimum team attestation |
| Repository activity | Verified public repos | Demonstrates genuine development activity |

Implementation: `GitHubVerifier` in `src/trust/identity/github-verifier.ts`

#### Stripe Payment Verification
Financial identity binding via Stripe customer record:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Customer age | ≥ 30 days | Prevents throwaway payment methods |
| Payment method | Verified on file | Economic skin-in-the-game |

Implementation: `StripeVerifier` in `src/trust/identity/stripe-verifier.ts`

#### Nonce Binding
Every verified identity receives a cryptographic nonce binding that attests to the verification:

```
signature = SHA256(nonce : orgId : publicKey)
```

- **Nonces**: 64-character hex strings, cryptographically random
- **Public keys**: Hex strings, 64–512 characters
- **Rotation**: Supported with chain linking (`previousNonce` field), max depth 100
- **Revocation**: Supported with reason tracking and timestamp
- **Binding**: All `NonceBindingService` operations require a verified `OrganizationIdentity`

Implementation: `NonceBindingService` in `src/trust/identity/nonce-binding.ts` (409 lines)

See also: `docs/NONCE_BINDING_GUIDE.md` for operational procedures.

### Identity Store Adapter

```typescript
interface IIdentityStoreAdapter {
  getIdentity(orgId: string): Promise<OrganizationIdentity | null>;
  storeIdentity(identity: OrganizationIdentity): Promise<void>;
  revokeIdentity(orgId: string, reason: string): Promise<void>;
  getNonceUsageCount(nonce: string): Promise<number>;
  getIdentityByStripeCustomerId(customerId: string): Promise<OrganizationIdentity | null>;
  listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]>;
  getNonceBinding(orgId: string): Promise<NonceBinding | null>;
  storeNonceBinding(binding: NonceBinding): Promise<void>;
  getNonceBindingByNonce(nonce: string): Promise<NonceBinding | null>;
}
```

---

## 3. Layer 2 — Economic Incentives

### Purpose
Align economic interests with honest reporting. Organizations that stake capital have a financial disincentive to submit fraudulent FP data.

### Stake Tiers

| Tier | Stake (USD) | Weight Multiplier | Privileges |
|------|-------------|-------------------|------------|
| Observer | $0 | 0.0 | Read-only access to aggregate FPR |
| Participant | $250 | 0.25 | Contribute FP data, included in aggregation |
| Contributor | $1,000 | 1.0 (cap) | Full voting weight, priority in consensus |
| Steward | $5,000 | 1.0 (cap) | Governance participation, treasury voting |

> **Note**: The stake multiplier is capped at 1.0 (reached at the $1,000 Contributor tier) to prevent plutocratic bias. Above $1,000, additional stake signals commitment but does not increase calibration weight.

### Reputation Score

Every organization maintains a reputation score $R \in [0.0, 1.0]$:

- **New organizations**: $R = 0.5$ (neutral starting point)
- **Score components**: Age score, volume score, consistency score, flagged count
- **Stake status**: `active`, `slashed`, or `withdrawn`

```typescript
interface OrganizationReputation {
  orgId: string;
  reputationScore: number;      // 0.0–1.0
  stakePledge: number;          // USD
  contributionCount: number;
  flaggedCount: number;
  consistencyScore: number;     // 0.0–1.0
  ageScore: number;             // 0.0–1.0
  volumeScore: number;          // 0.0–1.0
  lastUpdated: Date;
  stakeStatus: 'active' | 'slashed' | 'withdrawn';
}
```

### Weight Calculation

Contribution weight determines how much influence an organization's FP data has on consensus:

$$w_i = \min\left( R_{\text{base}} + S_{\text{mult}} + C_{\text{bonus}},\ 1.0 \right)$$

Where:
- $R_{\text{base}}$ = `reputationScore` (0.0–1.0)
- $S_{\text{mult}}$ = $\min\left(\frac{\text{stakePledge}}{\$1000},\ 1.0\right) \times 1.0$
- $C_{\text{bonus}}$ = `consistencyScore` × 0.2 (capped at 0.2)

Implementation: `ReputationEngine.calculateContributionWeight()` in `src/trust/reputation/reputation-engine.ts`

---

## 4. Layer 3 — Cryptographic Proofs

### Purpose
Provide tamper-evident attestation of FP contributions so that no party — including the system operator — can silently alter historical data.

### Mechanisms

#### Digital Signatures
Every FP contribution is signed with the organization's bound public key. The signature chain is:

```
NonceBinding.signature = SHA256(nonce : orgId : publicKey)
contribution.attestation = Sign(privateKey, Hash(contribution))
```

#### Hash Commitments
Before revealing FP data, organizations submit a commitment:

```
commitment = SHA256(fpRate : ruleId : orgId : salt)
```

This prevents front-running where an organization adjusts its report after seeing others.

#### Merkle Tree Attestation (Future)
When V ≥ 10, FP contributions will be organized into a Merkle tree per calibration round:

```
         Root Hash
        /         \
    H(A+B)       H(C+D)
    /    \       /    \
  H(A)  H(B)  H(C)  H(D)
   |     |     |     |
  Org1  Org2  Org3  Org4 ...
```

Each organization receives a Merkle proof of inclusion, enabling independent verification without revealing other organizations' data.

> **Status**: Merkle tree attestation is specified but not yet implemented. It activates when the network reaches V ≥ 10 verified organizations.

---

## 5. Layer 4 — Byzantine Fault Tolerance

### Purpose
Produce accurate consensus FP rates even when up to ~30% of contributing organizations submit incorrect or malicious data.

### Weighted Median Estimator

The consensus FP rate is computed as a weighted median of per-organization FP rates, not a simple average. This makes the estimate robust to outliers:

$$\text{FPR}_{\text{consensus}} = \text{WeightedMedian}\left(\{(r_i, w_i)\}_{i \in \text{trusted}}\right)$$

Implementation: `ByzantineFilter.calculateWeightedConsensus()` in `src/trust/reputation/byzantine-filter.ts`

### Filtering Pipeline

The `ByzantineFilter` applies a 6-stage pipeline to separate trusted from untrusted contributors:

| Stage | Filter | Default Threshold | Effect |
|-------|--------|-------------------|--------|
| 1 | Missing weight | — | Exclude orgs with no reputation data |
| 2 | Minimum reputation | $R \geq 0.1$ | Exclude orgs below 10% reputation |
| 3 | Stake check | Configurable | Optionally require active stake |
| 4 | Z-score outlier | $\|z\| > 3.0$ | Exclude statistical outliers (99.7% CI) |
| 5 | Reputation percentile | Bottom 20% | Exclude lowest-reputation contributors |
| 6 | Statistics | — | Compute agreement metrics |

> **Minimum contributors**: Filtering stages 4–5 only activate when there are ≥ 5 contributors. Below that threshold, only stages 1–3 apply.

### Outlier Detection

For each organization's reported FP rate $x_i$, compute deviation from the median $\tilde{x}$:

$$\text{MAD} = \text{median}\left(\left| x_i - \tilde{x} \right|\right)$$

$$z_i = \frac{x_i - \tilde{x}}{1.4826 \times \text{MAD}}$$

Flag as outlier if $|z_i| > 3.0$ (configurable via `zScoreThreshold`).

### Adaptive Consensus Threshold

The consensus threshold adapts based on the average reputation of the contributing cohort:

$$T_{\text{consensus}}(c) = \max\left(0.51,\ 0.66 - 0.15 \cdot \sqrt{\frac{R_{\text{avg}}(c) - 0.5}{0.5}}\right)$$

Where:
- $T_{\text{consensus}}(c)$ = minimum agreement fraction for cohort $c$
- $R_{\text{avg}}(c)$ = average reputation of trusted contributors in cohort $c$
- Range: $[0.51, 0.66]$ — high-reputation cohorts need 51% agreement; low-reputation cohorts need 66%

### Byzantine Filter Configuration

```typescript
interface ByzantineFilterConfig {
  zScoreThreshold: number;              // default: 3.0
  byzantineFilterPercentile: number;    // default: 0.2
  minContributorsForFiltering: number;  // default: 5
  requireStake: boolean;                // default: false
  requireMinimumReputation: boolean;    // default: true
  minimumReputationScore: number;       // default: 0.1
}
```

### Confidence Calculation

Confidence in the consensus FP rate is a weighted composite:

| Factor | Weight | Measures |
|--------|--------|----------|
| Contributor count | 35% | Statistical power |
| Agreement level | 30% | How closely contributors agree |
| Event count | 20% | Data completeness |
| Reputation quality | 15% | Trustworthiness of contributors |

Implementation: `ByzantineFilter.calculateConfidence()` in `src/trust/reputation/byzantine-filter.ts` (421 lines)

---

## 6. Layer 5 — Privacy

### Purpose
Protect individual organizations' FP data while enabling meaningful aggregate analysis. No organization should be identifiable from published aggregate statistics.

### k-Anonymity

Aggregate FP rates are computed only when the contributing cohort meets a minimum size, ensuring individual organizations cannot be singled out:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum k | 5 organizations | Hard floor — below this, no aggregation occurs |
| Recommended k | 10 organizations | Statistical recommendation for meaningful analysis |
| Enforcement | Calibration query layer | `CalibrationStore.aggregateFPsByRule()` checks before computing |

When $k < 5$:
- The system returns a `INSUFFICIENT_K_ANONYMITY` error
- No FP rate is computed or stored
- The requesting organization sees the error code but not other organizations' data

### Differential Privacy (Future)

When the network matures, Laplace noise will be added to aggregate statistics:

$$\hat{r} = r_{\text{true}} + \text{Lap}\left(\frac{\Delta f}{\epsilon}\right)$$

Where:
- $\Delta f$ = sensitivity of the FP rate query (bounded by contribution weight)
- $\epsilon$ = privacy budget per query (configured per calibration round)

> **Status**: Differential privacy is specified but not yet implemented. k-Anonymity enforcement is active.

### Consent Gating

All data sharing is mediated by the consent store. No FP data leaves an organization without explicit consent:

```typescript
// Every calibration participation checks consent first
const hasConsent = await consentStore.hasValidConsent(orgId, repoId, 'fp_metrics');
if (!hasConsent) {
  return; // Data is never shared without consent
}
```

Consent resources defined in `src/consent-store/schema.ts`:
- `fp_patterns` — Individual FP pattern sharing
- `fp_metrics` — Aggregate FP rate participation
- `cross_org_benchmarks` — Cross-organization comparison
- `rule_calibration` — Rule-specific calibration participation
- `audit_logs` — Audit trail sharing
- `drift_baselines` — Baseline drift sharing

Consent states: `granted` → `expired` → `revoked` → `pending` → `not_requested`

---

## 7. Layer 6 — Monitoring

### Purpose
Detect coordinated attacks and anomalous behavior patterns that bypass Layers 1–5.

### Collusion Detection

Detect organizations that coordinate their FP reports to manipulate consensus:

#### Temporal Clustering
Flag when multiple organizations submit suspiciously similar reports within a narrow time window:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Identical FP rates from ≥ 3 orgs within 60s | $p < 0.01$ under null hypothesis | Flag for review |
| Synchronized submission patterns | Pearson $\rho > 0.9$ across 5+ rounds | Escalate to governance |

#### Value Alignment
Detect organizations whose FP rate vectors are more correlated than expected:

$$\text{similarity}(A, B) = \frac{\vec{r}_A \cdot \vec{r}_B}{\|\vec{r}_A\| \|\vec{r}_B\|}$$

Flag if $\text{similarity} > 0.95$ across ≥ 10 rules.

### Sybil Detection

Detect sets of organizations that are actually controlled by a single entity:

| Signal | Detection Method | Threshold |
|--------|-----------------|-----------|
| Behavioral pattern similarity | Cosine similarity of submission vectors | > 0.95 |
| Shared infrastructure | IP/ASN clustering (if available) | ≥ 3 orgs, same ASN |
| Social graph density | GitHub org member overlap | > 50% shared members |
| Registration timing | Creation date clustering | ≥ 3 within 7 days |

### Anomaly Detection

Statistical monitoring of system-wide metrics:

| Metric | Expected | Alert |
|--------|----------|-------|
| Consensus FP rate shift | ≤ 5% per calibration round | > 10% shift |
| Contributor churn | ≤ 10% per round | > 25% in a single round |
| Outlier frequency | ≤ 15% of contributors | > 30% flagged as outliers |
| Reputation distribution | Normal-ish around 0.5–0.7 | Bimodal (0.1 and 0.9 clusters) |

> **Status**: Monitoring is specified. Detection algorithms will be implemented when V ≥ 10. Alerting integrates with the existing observability stack.

---

## 8. Cold-Start Probation Tier

### Purpose
Prevent newly verified organizations from immediately influencing FP calibration consensus. A probationary period allows the system to observe behavior before granting voting weight.

### Probation Rules

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Initial reputation | $R = 0.5$ (neutral) | No positive or negative bias |
| Probation length | 20 successful submissions | Enough data points to assess behavior |
| Voting weight during probation | $0.0$ in BFT aggregation | Contributions recorded but do not affect consensus |
| Probation exit criteria | 20 submissions AND zero flagged events AND $R \geq 0.5$ | Must demonstrate sustained good behavior |

### Behavior During Probation

During the probation period:

1. **Contributions are recorded**: All FP data submitted by the probationary organization is stored and available for later analysis
2. **Weight is zero**: The `ByzantineFilter` sets $w_i = 0.0$ for probationary organizations, so their data does not influence the weighted median
3. **Consistency scoring runs**: The `ConsistencyScoreCalculator` processes probationary contributions, building a behavioral profile
4. **Reputation updates apply**: Normal reputation scoring (age, volume, consistency) proceeds — only voting weight is suppressed

### Exit Criteria

An organization exits probation when **all** of the following are satisfied:

1. **Submission count** ≥ 20 successful FP data submissions
2. **Flagged event count** = 0 during probation
3. **Reputation score** $R \geq 0.5$ (has not degraded below neutral)

Upon exit, the organization's voting weight transitions from $0.0$ to its calculated weight per the formula in §3 (Layer 2).

### Early Removal (Slashing)

Probationary organizations exhibiting malicious behavior are removed immediately:

| Condition | Action |
|-----------|--------|
| > 2 flagged events during probation | Immediate removal from calibration network |
| Reputation drops below $R < 0.3$ | Flagged for governance review |
| Identity verification revoked | Immediate removal, nonce invalidated |

### Rationale

Without probation, an attacker could:
1. Create multiple verified organizations (Sybil attack)
2. Immediately submit coordinated FP data
3. Influence consensus before monitoring (Layer 6) has enough data to detect collusion

The 20-submission probation period ensures monitoring has at least 20 behavioral data points per new organization before it can affect calibration outcomes.

---

## 9. Dependency Chain: Sybil → QV → Treasury

### Purpose
Define the activation sequence for network governance features. Each stage is blocked on the previous stage being validated. **No premature implementation.**

### Dependency Graph

```
Sybil Detection (V ≥ 10 orgs)
    ↓ validates
Reputation Scoring (convergence proven by submission 50)
    ↓ enables
Quadratic Voting (reputation-weighted, anti-plutocratic)
    ↓ governs
Community Treasury (30% proprietary revenue share)
    ↓ funds
Open-Core Research Grants
```

### Activation Gates

| Stage | Gate | Metric | Data Source |
|-------|------|--------|-------------|
| **Sybil Detection** | V ≥ 10 verified organizations | `calibration-cohort-size` telemetry event | Consent-gated cohort size counter |
| **Reputation Scoring** | EWMA convergence by submission 50 | $\sigma_R < 0.05$ across cohort | `ReputationEngine` internal metrics |
| **Quadratic Voting** | Sybil false-positive rate < 5% | Adversarial red-team validation | External security audit |
| **Treasury Governance** | $500K accumulated, 3+ Stewards | Financial audit + governance vote | Revenue tracking + identity store |

### Stage Details

#### Stage 1: Sybil Detection (V ≥ 10)
- **Prerequisite**: Identity verification (Layer 1) operational for ≥ 10 organizations
- **Validation**: Adversarial testing confirms detection rates against simulated Sybil attacks
- **Output**: Confidence that participating organizations are independent entities
- **Blocks**: Reputation scoring cannot be meaningful with Sybil-contaminated data

#### Stage 2: Reputation Scoring (Convergence)
- **Prerequisite**: Sybil detection validated
- **Validation**: EWMA reputation scores converge (standard deviation < 0.05) by the 50th submission per organization
- **Output**: Stable, meaningful reputation scores for all participating organizations
- **Blocks**: Quadratic voting requires trustworthy weights

#### Stage 3: Quadratic Voting (Anti-Plutocratic)
- **Prerequisite**: Reputation scoring validated, Sybil false-positive rate < 5%
- **Mechanism**: Voting power = $\sqrt{\text{reputation-weighted stake}}$
- **Purpose**: Governance decisions (rule additions, threshold changes) without plutocratic capture
- **Blocks**: Treasury disbursement requires legitimate governance

#### Stage 4: Community Treasury
- **Prerequisite**: Quadratic voting operational, $500K accumulated, 3+ Stewards
- **Revenue share**: 30% of proprietary license revenue directed to community treasury
- **Governance**: Treasury disbursements require quadratic vote approval
- **Purpose**: Fund open-core research grants, community development, security audits

### Anti-Premature-Implementation Policy

> **Critical**: No code for stages 2–4 should be written until the preceding stage's gate metric is met and validated. The dependency chain exists precisely to prevent shipping governance mechanisms that lack the security foundation to operate safely.

Current status (Phase 5):
- Stage 1: **In specification** — identity verification implemented, Sybil detection specified
- Stage 2: **In specification** — reputation engine implemented, convergence not yet measurable (V < 10)
- Stage 3: **Not started** — blocked on Stage 2 validation
- Stage 4: **Not started** — blocked on Stage 3 validation

---

## 10. Telemetry

### Cohort Size Telemetry (Phase 5B)

A single consent-gated telemetry event tracks the k-anonymity cohort size during calibration rounds. This is the minimum viable signal needed to monitor progress toward V ≥ 10.

**Event schema**:
```typescript
{
  event: 'calibration-cohort-size',
  cohortSize: number,   // count of participating orgs (no identifying data)
  ruleId: string,        // which rule was being calibrated
  timestamp: Date
}
```

**Constraints**:
- Emitted **only** when `consentStore.hasValidConsent(orgId, 'telemetry')` returns `true`
- Behind feature flag: `ENABLE_COHORT_TELEMETRY=true` (default: `false`)
- Logs cohort count only — **never** individual org data, FP rates, or identifying information
- Implementation: `CohortTelemetryEmitter` in `src/calibration-store/cohort-telemetry.ts`

---

## 11. Consistency Scoring

### Purpose
Track how consistently an organization's FP reports align with consensus over time. High consistency increases voting weight; low consistency decreases it.

### Configuration

```typescript
interface ConsistencyScoreConfig {
  decayRate: number;                 // default: 0.01 (~70-day half-life)
  maxContributionAge: number;        // default: 180 days
  minContributionsRequired: number;  // default: 3
  outlierThreshold: number;          // default: 0.3 (30% deviation)
  minEventCount: number;             // default: 1
  excludeOutliersFromScore: boolean; // default: false
  maxConsistencyBonus: number;       // default: 0.2
}
```

### Calculation

Consistency score is an exponentially weighted moving average (EWMA) of the deviation between an organization's reported FP rate and the consensus:

$$C_i = \text{EWMA}\left(1 - \frac{|r_i - r_{\text{consensus}}|}{\max(r_{\text{consensus}}, 0.01)}\right)$$

With exponential decay: contributions older than 180 days are excluded; recent contributions carry more weight (half-life ≈ 70 days at decay rate 0.01).

Implementation: `ConsistencyScoreCalculator` in `src/trust/reputation/consistency-calculator.ts` (400 lines)

---

## 12. Calibration Pipeline

### End-to-End Flow

The `CalibrationStore` orchestrates the full calibration pipeline:

```
1. Fetch FP events for rule         → fpStore.getFalsePositivesByRule(ruleId)
2. Group by organization            → calculateOrgContributions(events)
3. Fetch reputation weights         → reputationEngine.calculateContributionWeight(orgId)
4. Apply Byzantine filtering        → byzantineFilter.filterContributors(contributions, weights)
5. Calculate weighted consensus     → byzantineFilter.calculateWeightedConsensus(trusted)
6. Update consistency scores        → consistencyCalculator.updateScores(contributions, consensus)
7. Store calibration result         → adapter.storeCalibrationResult(result)
```

### Result Schema

```typescript
interface CalibrationResultExtended {
  ruleId: string;
  consensusFpRate: number;
  trustedContributorCount: number;
  totalContributorCount: number;
  totalEventCount: number;
  calculatedAt: Date;
  confidence: {
    level: number;          // 0.0–1.0
    category: string;       // 'low' | 'medium' | 'high' | 'very-high'
  };
  byzantineFilterSummary: {
    filteringApplied: boolean;
    filterRate: number;
    outliersFiltered: number;
    lowReputationFiltered: number;
    zScoreThreshold: number;
    reputationPercentile: number;
  };
}
```

Implementation: `CalibrationStore` in `src/calibration-store/calibration-store.ts` (289 lines)

---

## 13. Security Considerations

### Threat Model

| Threat | Layers Defending | Mitigation |
|--------|-----------------|------------|
| Sybil attack | L1 (Identity), L2 (Economic), L6 (Monitoring) | Verification requirements, stake, pattern detection |
| Data poisoning | L4 (BFT), L5 (Privacy) | Outlier filtering, weighted median |
| Collusion | L6 (Monitoring) | Temporal clustering, value alignment analysis |
| Free-riding | L2 (Economic) | Stake requirement, reputation decay |
| Privacy breach | L5 (Privacy) | k-anonymity, consent gating, differential privacy |
| Front-running | L3 (Cryptographic) | Hash commitments before reveal |

### Fail-Closed Design

The trust system follows the same fail-closed philosophy as Plane A:

- **Identity verification failure** → organization cannot participate (not "assume trusted")
- **Consent check failure** → data is not shared (not "assume consented")
- **k-Anonymity threshold not met** → return error (not "return approximate result")
- **Byzantine filter error** → no consensus produced (not "return unfiltered average")

---

## Decision Record

### 2026-02-11 — Phase 5: Initial SPEC-TRUST.md

**Decision**: Create SPEC-TRUST.md documenting the 6-layer defense architecture scoped exclusively to Plane C.

**Rationale**: The trust architecture has grown to 26 source files and 9 test files across identity, reputation, and adapter subsystems. A unified specification is needed to:
1. Document activation gates that prevent premature implementation
2. Define the dependency chain (Sybil → QV → Treasury)
3. Scope the 6-layer defense model to where it belongs (Plane C, not Plane A/B)
4. Establish the cold-start probation policy
5. Provide a reference for external contributors approaching the trust module

**Constraints**: None of the 6 layers activate until V ≥ 10 verified organizations participate in aggregate calibration. This document is governance specification, not a deployment trigger.
