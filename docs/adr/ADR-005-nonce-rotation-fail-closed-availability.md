# ADR-005: Nonce Rotation & Fail-Closed Availability

**Status:** Approved  
**Date:** 2026-01-28  
**Decision Authority:** Lead Architect  
**Supersedes:** None  
**Superseded by:** None

---

## Context

Phase Mirror validates claims (e.g., "Rule MD-003 passed") using **nonces** (numbers used once) to prevent replay attacks:
- Client requests a nonce from the oracle
- Client includes the nonce in its claim
- Oracle verifies nonce is fresh (not expired, not already used)
- Oracle accepts or rejects claim

We needed to decide:
1. **Nonce lifetime:** How long is a nonce valid?
2. **Storage:** Where do we store used nonces (to prevent reuse)?
3. **Rotation:** How often do we clear the nonce store?
4. **Availability:** What happens if nonce store is unavailable?

The core tension:
- **Too short lifetime (e.g., 5 minutes):** Clients time out frequently, poor UX
- **Too long lifetime (e.g., 24 hours):** Nonce store grows unbounded, cost explosion
- **Fail-open (accept claims when store is down):** Security risk (replay attacks)
- **Fail-closed (reject claims when store is down):** Availability risk (service disruption)

---

## Decision

**Phase Mirror uses 1-hour nonce lifetime with fail-closed availability.**

### Nonce Lifetime

**Nonces are valid for 1 hour from issuance.**

- Client requests nonce at `T`
- Nonce expires at `T + 1 hour`
- After expiration, nonce is rejected (even if never used)

**Why 1 hour?**
- Long enough for most workflows (typical PR review + CI run = 5-30 minutes)
- Short enough to limit replay attack window
- Keeps nonce store size bounded (only need to track 1 hour of nonces)

### Nonce Store

**Nonces are stored in DynamoDB with TTL.**

- Table: `phase_mirror_nonces`
- Partition key: `nonce` (UUID)
- Attributes: `issuedAt` (timestamp), `usedAt` (timestamp or null), `orgId` (hashed)
- TTL: 1 hour (DynamoDB auto-deletes after TTL expires)

**Write pattern:**
- Issue nonce → INSERT (if not exists)
- Use nonce → UPDATE `usedAt` (if not already used)

**Read pattern:**
- Verify nonce → SELECT by `nonce`, check `issuedAt` < 1 hour ago, check `usedAt` is null

### Rotation

**Nonces are auto-deleted by DynamoDB TTL after 1 hour.**

No manual rotation needed. DynamoDB handles cleanup.

### Availability: Fail-Closed

**If nonce store is unavailable, oracle returns 503 (Service Unavailable).**

Specifically:
- Nonce store health check fails → oracle refuses to validate claims
- Client gets `503` response: "Nonce store unavailable, retry later"
- Client retries with exponential backoff

**Why fail-closed?**
- **Security > Availability:** Accepting unverified claims is worse than temporary downtime
- **Visibility:** 503 is visible (alerts fire, humans investigate). Silent failure (accepting bad claims) is invisible until exploited.

**Mitigation:**
- DynamoDB has 99.99% availability SLA (downtime is rare)
- Oracle retries DynamoDB calls 3 times with exponential backoff
- CloudWatch alarms alert on nonce store errors

---

## Rationale

### Why 1-Hour Nonce Lifetime (Not 5 Minutes or 24 Hours)?

**Too Short (5 minutes):**
- Clients time out frequently (PR review takes >5 minutes)
- Poor UX (constant "nonce expired" errors)
- More nonce requests = more load on oracle

**Too Long (24 hours):**
- Nonce store grows unbounded (millions of rows per day)
- Replay attack window is 24 hours (attacker has all day to reuse stolen nonce)
- Cost: DynamoDB WCU/RCU scales with nonce count

**Just Right (1 hour):**
- Covers typical workflows (CI run = 5-30 minutes)
- Limits replay attack window (attacker has 1 hour, not 24)
- Keeps nonce store size bounded (only 1 hour of nonces in DB at any time)

### Why Fail-Closed (Not Fail-Open)?

**Fail-Open = Security Risk:**

If oracle accepts claims when nonce store is down:
- Attacker waits for nonce store outage (DDoS the store, exploit AWS outage)
- Attacker replays stolen nonces during outage
- Oracle accepts replayed claims (no way to verify freshness)
- Attacker bypasses validation

**Fail-Closed = Visible Failure:**

If oracle rejects claims when nonce store is down:
- Service is temporarily unavailable (bad UX)
- But: Attackers cannot exploit the outage (no bypass)
- Alerts fire, humans investigate and fix root cause
- Downtime is measured in minutes (DynamoDB recovers fast)

**Trade-Off:** We choose security over availability. Temporary 503 errors are better than silent replay attacks.

### Why DynamoDB (Not Redis or PostgreSQL)?

**DynamoDB:**
- ✅ Built-in TTL (auto-delete after 1 hour, no manual cleanup)
- ✅ 99.99% availability SLA
- ✅ Serverless (no infrastructure management)
- ✅ Scales automatically (no capacity planning)

**Redis:**
- ❌ Requires cluster management (ElastiCache)
- ❌ No built-in durability (in-memory)
- ✅ Faster than DynamoDB (sub-ms latency)

**PostgreSQL:**
- ❌ Requires RDS management
- ❌ No built-in TTL (requires manual cleanup job)
- ✅ ACID guarantees

**Why Not Redis?** We don't need sub-ms latency for nonce checks. DynamoDB's ~10ms latency is acceptable.

**Why Not PostgreSQL?** DynamoDB's built-in TTL is simpler than manual cleanup jobs.

---

## Consequences

### What Gets Easier

✅ **Security:** Replay attacks are prevented (nonces expire after 1 hour).

✅ **Visibility:** Nonce store failures are loud (503 errors, alerts fire).

✅ **Maintenance:** DynamoDB TTL auto-deletes expired nonces (no manual cleanup).

✅ **Cost Control:** Nonce store size is bounded (only 1 hour of nonces at any time).

### What Gets Harder

❌ **Availability:** Nonce store failure = service downtime (fail-closed).

❌ **Debugging:** 503 errors are vague ("nonce store unavailable" doesn't say why).

### What Becomes Risky

⚠️ **DynamoDB Outage:** AWS region outage → nonce store unavailable → oracle returns 503. **Mitigation:** Multi-region replication (future), retry logic in clients.

⚠️ **DDoS on Nonce Store:** Attacker floods nonce table with requests → throttling → 503. **Mitigation:** DynamoDB auto-scaling, rate limiting on nonce issuance.

⚠️ **Clock Skew:** If oracle clock is wrong, nonces expire early/late. **Mitigation:** Use NTP, monitor clock drift, log timestamps for debugging.

### Technical Debt Incurred

**Debt 1: Single Point of Failure**
- Nonce store is single region (no multi-region yet)
- **Payoff:** Multi-region replication in Phase 3 (overkill for MVP)

**Debt 2: Fail-Closed = Availability Risk**
- Accepting temporary downtime for security
- **Payoff:** Security > Availability for validation systems

---

## Alternatives Considered

### Alternative 1: Longer Nonce Lifetime (24 hours)

**Description:** Nonces valid for 24 hours.

**Pros:**
- Fewer nonce expirations
- Better UX (clients don't time out)

**Cons:**
- Nonce store grows 24x larger
- Replay attack window = 24 hours (worse security)
- Cost: 24x more DynamoDB WCU/RCU

**Why Rejected:** Cost and security. 24 hours is too long.

---

### Alternative 2: Fail-Open (Accept Unverified Claims)

**Description:** When nonce store is down, accept claims without verification.

**Pros:**
- Higher availability (no 503 errors)

**Cons:**
- **Security vulnerability:** Attacker can replay claims during outage
- **Silent failure:** No alerts (system looks healthy, but validation is bypassed)

**Why Rejected:** Security > Availability. Silent failures are worse than visible failures.

---

### Alternative 3: In-Memory Nonce Store (No Database)

**Description:** Store nonces in oracle process memory (e.g., Node.js Map).

**Pros:**
- Fastest (no network latency)
- Simplest (no DynamoDB setup)

**Cons:**
- **No persistence:** If oracle restarts, all nonces are lost (clients see "invalid nonce" errors)
- **No horizontal scaling:** Can't run multiple oracle instances (nonces not shared)
- **No replay protection across instances:** Attacker can replay nonce to different instance

**Why Rejected:** Not production-ready. Need persistence and horizontal scaling.

---

### Alternative 4: Stateless Nonces (JWT with Expiration)

**Description:** Nonce is a signed JWT with expiration timestamp. Oracle verifies signature, no database needed.

**Pros:**
- No nonce store (stateless)
- No database dependency
- Scales infinitely (no shared state)

**Cons:**
- **No replay protection:** JWT can be reused (no "used" tracking)
- **Signing key management:** Need to rotate keys, distribute to oracles
- **JWT overhead:** Larger than UUID (hundreds of bytes vs 16 bytes)

**Why Rejected:** No replay protection. Nonces must be used once (hence "nonce"). JWT doesn't enforce this.

---

## References

- [Nonce Implementation](/packages/mirror-dissonance/src/nonce/index.ts)
- [DynamoDB TTL Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [Replay Attack (Wikipedia)](https://en.wikipedia.org/wiki/Replay_attack)
- [Circuit Breaker Pattern](/docs/ops/runbook.md)

---

## Implementation Notes

- [x] Implement nonce issuance endpoint
- [x] Implement nonce verification logic
- [ ] Set up DynamoDB table with TTL
- [ ] Add health check for nonce store
- [ ] Implement fail-closed logic (503 on store failure)
- [ ] Add CloudWatch alarms for nonce store errors
- [ ] Document client retry logic

**Responsible Party:** Lead Architect & DevOps  
**Target Date:** Phase 2

---

## Testability

**Nonce Lifecycle:**
- [ ] Issue nonce → stored in DB
- [ ] Use nonce → `usedAt` updated
- [ ] Use nonce twice → rejected (already used)
- [ ] Use expired nonce → rejected (expired)

**Fail-Closed Behavior:**
- [ ] Nonce store unavailable → oracle returns 503
- [ ] 503 includes retry-after header
- [ ] Alerts fire on nonce store failure

**TTL:**
- [ ] Nonces auto-delete after 1 hour
- [ ] Nonce store size stays bounded (no memory leak)

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
