---
applyTo: "packages/mirror-dissonance/src/trust/**"
---
# Trust Module Instructions

- All identity verification flows must end with NonceBindingService.generateAndBindNonce()
- ReputationEngine.calculateContributionWeight uses: baseWeight × (1 + stakeMultiplier) + consistencyBonus
- Cold-start orgs: R=0.5 initial, 20 submissions before voting weight counts
- k-anonymity minimum: 5 orgs (analysis recommends 10)
- Byzantine filtering: exclude bottom 20% by reputation before aggregation
- Outlier detection: flag if |x_i - x̃| > 3 × MAD
- All NonceBinding operations require verified OrganizationIdentity
- Public keys must be hex strings, 64–512 chars
