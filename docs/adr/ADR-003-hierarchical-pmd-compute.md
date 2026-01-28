# ADR-003: Hierarchical PMD Compute (L0/L1/L2)

**Status:** Approved  
**Date:** 2026-01-28  
**Decision Authority:** Lead Architect  
**Supersedes:** None  
**Superseded by:** None

---

## Context

Phase Mirror Dissonance (PMD) detection operates at three conceptual levels:
- **Surface-level checks:** Schema validation, permission bits, nonce freshness
- **Mid-level reasoning:** Policy alignment, binding coherence, drift analysis
- **Deep reasoning:** Philosophical coherence, multi-hop inferences, explicit audits

We needed to decide:
1. **Cost model:** How much compute can we afford on every transaction?
2. **Hierarchical structure:** Should checks escalate through tiers, or run flat?
3. **Performance targets:** What latency is acceptable at each tier?
4. **Failure modes:** What happens when a tier is unavailable?

The core tension:
- **Always-on checks must be free** (or cheaper than not running them)
- **Expensive checks must be triggered only when necessary** (to avoid overhead)
- **Explicit deep checks are opt-in** (for audits, not routine validation)

---

## Decision

**Phase Mirror uses a three-tier hierarchical compute model:**

| Tier | Latency Target | Triggered | Checks | Cost |
|------|----------------|-----------|--------|------|
| **L0** | <100ns (p99) | Every state transition | Schema hash, permission bits, drift magnitude, nonce freshness, contraction witness | Free (cheaper than not running) |
| **L1** | <1ms (p99) | On L0 failure or policy trigger | Policy alignment, binding coherence, rule evaluation, FP filtering | Moderate (acceptable for < 5% of transactions) |
| **L2** | <100ms (p99) | Explicit audit request only | Deep incoherence detection, multi-hop reasoning, philosophical consistency | Expensive (acceptable for < 0.1% of transactions) |

**Escalation Logic:**
1. Every state transition runs L0 checks first
2. If L0 passes → transaction proceeds
3. If L0 fails → escalate to L1
4. If L1 fails → transaction blocked, escalate to L2 for diagnostic
5. L2 never runs unless explicitly requested (audit, incident response)

**Invariants:**
- L0 is **always-on** (no configuration to disable it)
- L0 failures are **fail-closed** (halt transaction, never silent)
- L1 is **triggered automatically** by L0 failures
- L2 is **opt-in** only (never automatic)

---

## Rationale

### Why Three Tiers?

**The Insight:** Not all checks cost the same, and not all failures are equally likely.

**L0: Foundation Tier**
- These checks are so cheap that **not running them costs more** (opportunity cost of missing a bug)
- Examples: permission bits = 1 nanosecond (bit masking), nonce freshness = 1 nanosecond (timestamp comparison)
- **Analogy:** Seatbelt sensor in a car. Always on, costs nothing, saves lives.

**L1: Policy Tier**
- These checks cost ~1ms (rule evaluation, policy lookups, false-positive filtering)
- Only run when L0 detects something wrong or policy requires it
- **Analogy:** Airbag deployment. Expensive, but only triggers on collision.

**L2: Deep Reasoning Tier**
- These checks cost ~100ms (graph traversal, SMT solver, multi-hop inference)
- Only run on explicit request (audit, forensics, research)
- **Analogy:** Crash investigation team. Only shows up after the accident.

### Why Not Flat (All Checks Always)?

**Cost:** If you run L2 on every transaction, latency is 100ms → unusable.

**Overkill:** L2 catches rare edge cases (philosophical incoherence). Most transactions don't need it.

### Why Not Just L1 (Skip L0)?

**Opportunity Cost:** L0 is free. Skipping it means you miss bugs that L0 would catch instantly.

**Example:** Nonce expiry check (L0) costs 1ns. Letting an expired nonce through → replay attack → incident response → 1000 hours of engineering time. L0 saves you.

### Why P99 (Not Mean)?

**P99 = 99th percentile latency.**

**Why P99 matters:**
- Mean can be skewed by outliers (one 10ms spike with 1000 <1ms runs = mean is still <1ms)
- P99 tells you: "99 out of 100 times, you'll finish in X or less"
- For always-on checks (L0), worst-case-normal matters more than average

**Example:**
- Mean L0: 45ns (looks great!)
- P99 L0: 500ns (uh oh, sometimes takes 5x longer)

If p99 is high, you have a tail latency problem (GC pause, cache miss, etc.). For always-on checks, p99 must be predictable.

---

## Consequences

### What Gets Easier

✅ **Performance:** L0 is cheap enough to run always, no configuration needed.

✅ **Debugging:** When L0 fails, you know immediately what's wrong (no silent corruption).

✅ **Cost Control:** L1 and L2 only run when needed (not on every transaction).

✅ **Auditing:** L2 provides deep analysis for forensics and research without slowing production.

### What Gets Harder

❌ **Complexity:** Three tiers = more code paths, more testing, more documentation.

❌ **Tuning:** Each tier has its own performance budget and failure modes.

❌ **Monitoring:** Need separate metrics for L0, L1, L2 latencies and failure rates.

### What Becomes Risky

⚠️ **L0 Performance Regression:** If L0 latency drifts above 100ns, it becomes noticeable overhead. **Mitigation:** Benchmark L0 in CI/CD, alert on regression.

⚠️ **L1 Overuse:** If L0 triggers L1 too often (>5% of transactions), L1 becomes a bottleneck. **Mitigation:** Tune L0 thresholds to minimize false positives.

⚠️ **L2 Abuse:** If users start running L2 on every transaction (misunderstanding its purpose), performance collapses. **Mitigation:** Clear documentation, rate limiting on L2 API.

### Technical Debt Incurred

**Debt 1: Three Code Paths**
- Maintaining three tiers = more code, more tests
- **Payoff:** Better performance and cost control

**Debt 2: Escalation Logic**
- When should L0 trigger L1? Requires tuning over time.
- **Payoff:** Adaptive system that learns from real-world usage

---

## Alternatives Considered

### Alternative 1: Flat Model (All Checks Always)

**Description:** Run L0, L1, and L2 on every transaction.

**Pros:**
- Simplest model
- No escalation logic
- Maximum detection

**Cons:**
- Latency = L0 + L1 + L2 = ~100ms per transaction
- Unusable for high-throughput systems
- Cost prohibitive

**Why Rejected:** Too slow. 100ms latency kills adoption.

---

### Alternative 2: Two Tiers (L0 + L1, No L2)

**Description:** Just foundation and policy tiers. No deep reasoning.

**Pros:**
- Simpler than three tiers
- Still fast (<1ms p99)

**Cons:**
- No deep coherence checks for audits
- Research/forensics requires external tools

**Why Rejected:** L2 is valuable for incident response and research. Skipping it would require building ad-hoc tools later (more debt).

---

### Alternative 3: On-Demand Only (No Always-On L0)

**Description:** All checks are opt-in. No always-on validation.

**Pros:**
- Zero overhead when not needed

**Cons:**
- Silent failures (bugs go undetected)
- Incident response is reactive, not preventive
- Users must remember to enable checks (they won't)

**Why Rejected:** L0 is free, so there's no reason to make it opt-in. Always-on is better.

---

### Alternative 4: Single Tier, Configurable Depth

**Description:** One check engine, users choose depth (fast/medium/deep).

**Pros:**
- Flexible
- No hard-coded tiers

**Cons:**
- Users don't know what depth to choose
- Fast mode might skip critical checks
- Deep mode might run unnecessarily

**Why Rejected:** Explicit tiers with clear contracts are easier to reason about than configurable depth.

---

## References

- [L0 Invariants Implementation](/packages/mirror-dissonance/src/l0-invariants/index.ts)
- [L0 Benchmark Results](/docs/benchmarks/l0-invariants-benchmark.md)
- [Policy Tier (L1)](/packages/mirror-dissonance/src/policy/index.ts)
- [Architecture Documentation](/docs/architecture.md)

---

## Implementation Notes

- [x] Implement L0 invariant checks (schema, permissions, drift, nonce, witness)
- [x] Write L0 unit tests (100% coverage)
- [x] Benchmark L0 (verify p99 <100ns)
- [x] Integrate L0 into state machine
- [ ] Implement L1 policy tier
- [ ] Implement L2 deep reasoning tier
- [ ] Add escalation logic (L0 → L1 trigger)
- [ ] Document tier contracts in architecture.md

**Responsible Party:** Lead Architect & Engineering Team  
**Target Date:** L0 complete by Day 7, L1/L2 in Phase 2

---

## Testability

**L0 Verification:**
- [x] Unit tests pass (100% coverage)
- [x] Benchmark shows p99 <100ns
- [x] Invalid states are rejected (not just logged)
- [x] L0 runs on every state transition in integration tests

**L1 Verification (future):**
- [ ] L1 triggers only when L0 fails or policy requires
- [ ] L1 latency p99 <1ms

**L2 Verification (future):**
- [ ] L2 is opt-in only (never auto-triggered)
- [ ] L2 latency p99 <100ms

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
