# ADR-004: FP Anonymization with HMAC + k-Anonymity

**Status:** Approved  
**Date:** 2026-01-28  
**Decision Authority:** Lead Architect  
**Supersedes:** None  
**Superseded by:** None

---

## Context

Phase Mirror needs aggregate false-positive (FP) data to improve detection rules:
- Which rules generate FPs most often?
- Which organizations see FPs for which rules?
- How do FP rates change over time?

But collecting this data creates privacy risks:
- **Individual tracking:** "Org X has 20 FPs for rule MD-003" → reveals that Org X has specific issues
- **Competitive intelligence:** Aggregated data could reveal which orgs use which technologies
- **Data breach risk:** If FP store is compromised, attackers learn org-specific weaknesses

We needed to design a system that:
1. Collects aggregate FP data for calibration
2. Prevents individual org tracking
3. Prevents data breaches from revealing org identities
4. Complies with GDPR, CCPA, and other privacy laws
5. Builds trust with enterprises (no "phone home" for surveillance)

---

## Decision

**Citizen Gardens Foundation uses a privacy-respecting FP anonymization system with two mechanisms:**

### Mechanism 1: HMAC with Rotating Salts

**Org IDs are hashed before storage:**
- Each org has a UUID (e.g., `org-abc123`)
- Before storing FP data, hash the org ID: `HMAC-SHA256(orgId, salt)`
- Result: `fp_store` contains hashed IDs, not raw IDs
- **Salt rotates monthly** (new salt each month, old data re-hashed or deleted)

**Why HMAC?**
- HMAC is a keyed hash (requires secret key to compute)
- Even if attacker steals the database, they can't reverse the hash (without the key)
- Foundation cannot decrypt hashed IDs (one-way function)

**Storage:**
```json
{
  "ruleId": "MD-003",
  "orgIdHash": "a3f5e8c...",
  "timestamp": "2026-01-28T10:00:00Z",
  "isFalsePositive": true
}
```

### Mechanism 2: k-Anonymity (Minimum 10 Orgs)

**All queries enforce k-anonymity:**
- K-anonymity means: "At least k individuals in the result set"
- We set k = 10: every query result must include data from at least 10 orgs
- If a query would return data from fewer than 10 orgs, it's rejected

**Example:**
```sql
-- Query: "How many FPs does rule MD-003 have?"
SELECT ruleId, COUNT(*) FROM fp_store WHERE ruleId = 'MD-003';
-- Only returns result if at least 10 distinct orgIdHash values exist
```

**Why k=10?**
- Research shows k≥10 provides reasonable privacy
- Too high (k=100) → can't answer useful queries
- Too low (k=5) → easier to de-anonymize

**Enforcement:**
- Every query includes `HAVING COUNT(DISTINCT orgIdHash) >= 10`
- Queries that violate k-anonymity return error: "Insufficient data for privacy-preserving query"

---

## Rationale

### Why Anonymize at All?

**Trust:** Enterprises don't want to share data that could be used against them.

**Example:** If Phase Mirror sends raw org IDs to the Foundation, enterprises fear:
- "Will they sell our FP data to our competitors?"
- "Will they use it to identify weak security postures and sell that intel?"
- "Will a breach expose our usage patterns?"

**Solution:** Make it impossible to track individual orgs. Even the Foundation can't decrypt org IDs.

### Why Not Just Aggregate Counts?

**Problem:** Even aggregates can leak information.

**Example:**
```
Total FPs for MD-003: 157
Orgs using MD-003: 15
→ Average FPs/org = 10.5
```

If a query returns "Total FPs: 157" and you know "Org A just reported 50 FPs," you can infer "Other 14 orgs have 107 FPs" → you're learning about competitors.

**Solution:** k-Anonymity prevents queries that reveal small groups.

### Why HMAC (Not Just SHA-256)?

**SHA-256 is not enough:**
- Attacker who steals database can brute-force org IDs (try all UUIDs, hash them, compare)
- UUIDs are guessable (only 128 bits, can enumerate)

**HMAC requires secret key:**
- Attacker needs the key to brute-force
- Key is stored separately (AWS Secrets Manager, encrypted at rest)
- Even if database leaks, attacker can't reverse hashes

### Why Monthly Salt Rotation?

**Forward Secrecy:** If salt leaks in Month 3, attacker can only de-anonymize Month 3 data, not Month 1-2.

**Re-hashing:** When salt rotates, all orgIdHash values change (query logic breaks). Options:
- **Purge old data** (only keep 90 days for calibration)
- **Re-hash with new salt** (if data is still needed)

**Trade-off:** Re-hashing costs compute, but provides continuity.

---

## Consequences

### What Gets Easier

✅ **Trust:** Enterprises trust that their data is anonymous.

✅ **Compliance:** GDPR, CCPA, and other laws are satisfied (anonymized data ≠ personal data).

✅ **Breach Resilience:** Even if database leaks, attacker can't identify orgs.

### What Gets Harder

❌ **Debugging:** Can't trace FPs back to specific orgs (even when you want to help them).

❌ **Query Complexity:** k-Anonymity enforcement adds `HAVING` clauses to every query.

❌ **Salt Rotation:** Monthly rotation = data migration or purging.

### What Becomes Risky

⚠️ **Key Compromise:** If HMAC key leaks, attacker can brute-force org IDs. **Mitigation:** Store key in AWS Secrets Manager, rotate annually, audit access logs.

⚠️ **De-anonymization via Timing:** If Org A reports FP at 10:00:00, and database shows FP at 10:00:00, attacker can infer it's Org A. **Mitigation:** Batch inserts (delay up to 1 hour), randomize timestamps within batch window.

⚠️ **Insufficient k:** If only 5 orgs use a rare rule, k-Anonymity prevents queries. **Mitigation:** Document that rare rules may have insufficient data.

### Technical Debt Incurred

**Debt 1: Cannot Assist Individual Orgs**
- If Org A says "We're seeing FPs for MD-003," we can't look up their specific FPs (data is hashed)
- **Payoff:** Privacy is worth this trade-off. Orgs can share logs with us if they want help.

**Debt 2: Query Complexity**
- Every query needs k-Anonymity enforcement (adds complexity)
- **Payoff:** Privacy compliance and trust

---

## Alternatives Considered

### Alternative 1: No Anonymization (Raw Org IDs)

**Description:** Store raw org IDs in FP database.

**Pros:**
- Simple
- Can trace FPs to specific orgs (easier debugging)

**Cons:**
- Privacy violation
- Enterprises won't trust us
- GDPR/CCPA violation (org ID = personal data in some jurisdictions)

**Why Rejected:** Kills trust. Enterprises won't adopt if they think we're spying on them.

---

### Alternative 2: Client-Side Aggregation Only (No Server FP Store)

**Description:** Orgs compute FP stats locally, send only aggregates to Foundation (e.g., "Rule MD-003: 10 FPs last week").

**Pros:**
- Maximum privacy (raw data never leaves org)

**Cons:**
- No ability to detect trends across orgs
- Orgs might not bother sending stats (opt-in = low participation)
- Can't enforce k-Anonymity (orgs could send low-k data)

**Why Rejected:** Insufficient data for calibration. Need centralized aggregation to improve rules.

---

### Alternative 3: Differential Privacy (DP)

**Description:** Add noise to query results to prevent inference.

**Pros:**
- Stronger privacy guarantees than k-Anonymity

**Cons:**
- Complex to implement correctly (epsilon, delta, sensitivity)
- Noisy data = harder to improve rules
- DP requires understanding the privacy budget (enterprises don't)

**Why Rejected:** Over-engineered for our use case. k-Anonymity is simpler and sufficient.

---

### Alternative 4: Federated Learning (No Central Store)

**Description:** Orgs train local models, send gradients (not data) to Foundation.

**Pros:**
- No central data storage
- Strong privacy

**Cons:**
- Requires ML infrastructure (overkill for FP counting)
- Gradients can still leak information (privacy attacks exist)
- Complex to implement

**Why Rejected:** Too complex. FP data is simple counts, not ML models.

---

## References

- [HMAC Specification (RFC 2104)](https://tools.ietf.org/html/rfc2104)
- [k-Anonymity Research Paper](https://dataprivacylab.org/dataprivacy/projects/kanonymity/paper3.pdf)
- [GDPR Guidelines on Anonymization](https://gdpr.eu/anonymization/)
- [FP Store Implementation](/packages/mirror-dissonance/src/fp-store/index.ts)

---

## Implementation Notes

- [ ] Implement HMAC hashing in FP store
- [ ] Store HMAC key in AWS Secrets Manager
- [ ] Add k-Anonymity enforcement to query layer
- [ ] Set up monthly salt rotation (automated)
- [ ] Document privacy guarantees in website/docs
- [ ] Add privacy policy explaining anonymization

**Responsible Party:** Lead Architect & Privacy Engineer  
**Target Date:** Phase 2

---

## Testability

**HMAC Verification:**
- [ ] Org IDs are hashed before storage (never raw IDs in database)
- [ ] HMAC key is stored in Secrets Manager (not in code)
- [ ] Same org ID + same salt = same hash (deterministic)
- [ ] Different salt = different hash (rotation works)

**k-Anonymity Verification:**
- [ ] Query with <10 orgs returns error
- [ ] Query with ≥10 orgs returns result
- [ ] Aggregates are correct (no information loss beyond privacy protection)

**Salt Rotation:**
- [ ] Automated job runs monthly
- [ ] Old data is purged or re-hashed
- [ ] No queries break after rotation

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
