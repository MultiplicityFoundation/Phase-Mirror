# ADR-032: Executor Identity Trust Root — SPIFFE SVID with Stratified Non-Repudiation

**Status:** PROPOSED  
**Author:** Lead Security Architect  
**Created:** 2026-03-03  
**Supersedes:** Nothing (no prior ADR governs executor identity at Plane A)  
**Amends:** `docs/SPEC-COMPUTE.md` — Plane A compute layer  
**Does NOT amend:** `docs/SPEC-TRUST.md` — see §Plane Boundary below  
**Blocked on ACCEPTED by:**
  1. Human review of `docs/SPEC-COMPUTE.md` against the five contradiction risks enumerated in §SPEC-COMPUTE.md Review Gate
  2. `terraform/modules/spire/` module exists and passes staging latency gate (P99 < 200ms)
  3. `docs/ops/svid-key-archival-runbook.md` exists and verifier replay test passes post-rotation

---

## Context

### Problem Statement

The Phase Mirror token specification currently defines `aud` as a flat `String | Required` field. This encoding cannot distinguish between class-level authorization ("any text-executor may handle this") and instance-level authorization ("cluster-a/exec-001 specifically handled this"). Without that distinction:

1. **Replay attack surface**: a token valid for one executor is valid at any executor of the same class if `aud` encodes only the class.
2. **Non-repudiation gap**: the principal's signature does not commit to which specific executor acted, so the executor can disclaim specific accountability.
3. **Classification oracle attack**: if `intentClass` is a self-declared open string in the payload, a signer can label an actuation operation as `witness` to bypass the instance-binding requirement.

### Derivation Chain

The following decisions are each forced by the previous. They are stated as a chain rather than independent points so that reverting any one forces reconsideration of all downstream decisions.

| Step | Decision | Forcing Argument |
|------|----------|------------------|
| 1 | `aud` is a composite: `{class, instance?, version}` | Flat `aud` cannot encode conditional instance-binding |
| 2 | Instance binding is conditionally required based on `intentClass` | Requiring it always breaks class-routed delegation; never requiring it breaks NR |
| 3 | `intentClass` must be drawn from a closed, registry-versioned enum (ICR) | Open string `intentClass` allows classification oracle attack bypassing Step 2 |
| 4 | ICR version is embedded in the domain separator | Registry version drift silently changes what was signed |
| 5 | Executor identity trust root must be independent of both principal key and executor self-assertion | Any other model allows executor to repudiate specific instance identity |
| 6 | Platform attestation (SPIFFE SVID) is the correct independent trust root | No other mechanism provides cryptographic binding between workload runtime context and key material without trusting the workload itself |
| 7 | SPIFFE is stratified by `NRLevel` per `cap.action`, not universal | Universal SPIFFE requirement breaks deployment portability for operations that do not require instance-level NR |

---

## Plane Boundary — Mandatory Isolation Statement

This ADR governs **Plane A (compute layer)** exclusively.

`docs/SPEC-TRUST.md` governs **Plane C (FP Calibration Network)** and defines organizational participation identity via `SHA256(nonce:orgId:publicKey)` binding, GitHub organization verification, and Stripe payment stake. That identity model is scoped to aggregate FP calibration and is entirely disjoint from executor/workload identity at the actuation layer.

**The following conflation is prohibited and must not appear in any future ADR, code, or specification:**

```
# WRONG — these are different identity concepts on different planes
executor_svid ≡ org_id      // Plane A SVID ≠ Plane C orgId
svid_key_id  ≡ publicKey    // Plane A signing key ≠ Plane C participation key
aud.instance ≡ orgId        // Plane A executor audience ≠ Plane C organization
```

A Phase Mirror deployment where Plane A executor identity and Plane C organizational identity are issued by the same key hierarchy, stored in the same registry, or cross-validated by a single verifier is **non-conformant** with this ADR. The plane boundary is a hard architectural isolation, not a naming convention.

---

## Decision

### D1 — `aud` Field Schema Change

The token payload field `aud: String | Required` is replaced with:

```json
"aud": {
  "class":    "String | Required",
  "instance": "String | Conditionally Required (see D3)",
  "version":  "String | Required"
}
```

- `aud.class` identifies the logical adapter type (e.g., `text-executor`).
- `aud.instance` is the executor's SPIFFE ID in the form `spiffe://<trust-domain>/executor/<class>/<deployment-id>`.
- `aud.version` identifies the adapter API contract version.
- **Backward compatibility**: tokens with flat `aud: String` MUST be rejected at all verifiers after the migration cutover date specified in `SPEC-COMPUTE.md`. No grace period for mixed-format `aud` fields.

### D2 — `intentClass` and the IntentClass Registry (ICR)

`intentClass` is added to the token payload as:

```json
"intentClass": "Enum(ICR) | Required"
```

The ICR is a versioned, closed enum defined in `docs/icr/intent-class-registry.json`. The current valid values are:

| `intentClass` | Description |
|---------------|-------------|
| `actuation` | State-changing operation; executor is the agent of a side effect |
| `witness` | Observation without state change; audit/trace role |
| `receipt` | Acknowledgement of delivery; no independent state change |
| `trace-atom` | Telemetry or provenance record; evidentiary only |

Adding values to the ICR requires a separate ADR. Removing or redefining values is a breaking change requiring a new ICR version.

The ICR version is embedded in the domain separator:

```
"PHASE_MIRROR/WITNESS/v1/icr:<icr_version>"
```

A verifier MUST reject any signature where the domain separator's ICR version does not match the ICR version at which the `cap.action` mapping was resolved. Registry version drift is a hard rejection, not a warning.

### D3 — NRLevel Stratification

The ICR assigns each `cap.action` an `NRLevel` drawn from the following closed enum:

| `NRLevel` | Meaning | SPIFFE `aud.instance` | Audit trail `non_repudiation` |
|-----------|---------|----------------------|-------------------------------|
| `NR_FULL` | Governance-relevant actuation: regulated, multi-party, legal accountability | Required — SVID-backed | `"instance-bound"` |
| `NR_CLASS` | Non-governance actuation: internal, development, non-regulated | Not required | `"class-bound"` |
| `NR_NONE` | Witness, receipt, trace-atom | Not required | `"evidentiary-only"` |

`NRLevel` is a property of `cap.action`, determined by the ICR governance process, not by the signer or executor. A signer cannot declare a lower `NRLevel` than the ICR assigns to the action.

### D4 — Updated Signature Message Shape

```
Sig = Sign_ed25519(
    "PHASE_MIRROR/WITNESS/v1/icr:<icr_version>"   // domain + version + ICR pin
    || intentClass                                  // closed enum, registry-resolved
    || scopeHash                                    // SHA256(RFC8785(scope_object))
                                                    //   scope_object: {tenant, project,
                                                    //   jurisdiction, consent, policyVersion}
    || aud.class || aud.version                     // always required
    || aud.instance                                 // NR_FULL: SPIFFE ID; NR_CLASS/NR_NONE: ""
    || intentHash                                   // SHA256(RFC8785(cap_object))
    || traceHash                                    // SHA256(trace_atom)
    || iat || exp                                   // tight validity window
    || nonce                                        // anti-replay
    || kid                                          // purpose-scoped key ID (see D6)
)
```

`intentClass` is positionally first after the domain separator. The verifier executes `L0-SIG-SCOPE-INTENTCLASS` before DID resolution or SVID validation, enabling fast-path rejection without expensive network operations.

Fields are concatenated as **length-prefixed byte strings** (4-byte big-endian length prefix per field) to prevent boundary ambiguity.

### D5 — Five-Step Verifier Sequence

Verifiers MUST execute these checks in order. Skipping any step, or executing them out of order, is non-conformant.

```
Step 1 — L0-SIG-SCOPE-INTENTCLASS (hot path, no network I/O)
  Resolve intentClass from ICR using cap.action.
  REJECT if: declared intentClass ≠ registry-resolved intentClass.
  REJECT if: domain separator ICR version ≠ current ICR version.

Step 2 — L0-SIG-SCOPE-CLASS (hot path, no network I/O)
  REJECT if: aud.class absent or does not match this verifier's
             registered adapter class.
  REJECT if: aud.version absent or not in the verifier's
             supported version set.

Step 3 — L0-SIG-SCOPE-INSTANCE (NR_FULL only)
  If NRLevel(intentClass, cap.action) == NR_FULL:
    REJECT if: aud.instance absent.
    REJECT if: aud.instance does not match this executor's SPIFFE ID.
    REJECT if: aud.instance SPIFFE trust domain ≠ configured
               platform trust domain.

Step 4 — L0-SIG-SCOPE-SVID (NR_FULL only)
  Validate executor's SVID against the SPIRE trust bundle.
  REJECT if: SVID expired at time of execution (use iat, not now).
  REJECT if: SVID not issued by the configured SPIRE trust domain.
  REJECT if: kid.type ≠ registry.kidPurposeFor(intentClass).
  NOTE: SVID validation uses the key archived at svid_key_id, not
  the current rotation key. See §SVID Key Archival.

Step 5 — Cryptographic verification
  Reconstruct the signed message per D4.
  Verify Ed25519 signature against the key bound to kid.
  REJECT if: signature invalid.
  REJECT if: nonce has been seen (replay store keyed by token CID).
  REJECT if: exp < now or iat > now + clock_skew_tolerance.
```

### D6 — Key Purpose Separation (`kid.type`)

Each `kid` is issued for exactly one purpose. The verifier enforces `kid.type == intentClass` as part of Step 4. A `gate-ack` key is not valid for signing a `witness` token. The key registry must encode purpose at issuance time, not as a convention.

| `kid.type` | Valid for `intentClass` | Rotation cadence | Issuer |
|------------|------------------------|-----------------|--------|
| `gate-ack` | `actuation` | SVID lifetime (≤ 24h for NR_FULL) | SPIRE |
| `witness-key` | `witness`, `receipt` | 30 days | Principal DID key infrastructure |
| `trace-key` | `trace-atom` | 90 days | Principal DID key infrastructure |

### D7 — Executor DID Document Write Prohibition

Executors MUST NOT have write access to their own DID documents. DID document writes for executor-class DIDs require an administrative key held by the platform deployment infrastructure, not the executor.

A SPIRE-issued SVID is the preferred mechanism precisely because the workload cannot self-issue: the SPIRE server controls SVID issuance based on node attestation policy. Any DID-based alternative must enforce the same property at the key management layer.

---

## SVID Key Archival

SVID keys rotate automatically. Audit trail entries signed under an SVID key must be verifiable after rotation. The `AceAuditTrail` execution receipt records:

```json
{
  "svid_id":         "spiffe://phase-mirror/executor/text/cluster-a-001",
  "svid_expiry":     "<ISO-8601 UTC>",
  "svid_key_id":     "<kid of the SVID-bound key at signing time>",
  "delegation_hash": "<SHA256 of the principal's class-scoped delegation token>",
  "nr_level":        "NR_FULL | NR_CLASS | NR_NONE"
}
```

The SPIRE server or an offline trust bundle archive MUST retain historical SVID verification keys for at least the audit window defined in `docs/ops/svid-key-archival-runbook.md`. The verifier replay script accepts `svid_key_id` as an explicit input parameter and resolves the historical key from the archive rather than the current SPIRE bundle.

**Operational definition**: the audit window is the maximum duration between an execution event and a lawful audit replay request. Until `SPEC-COMPUTE.md` specifies a different value, the default is **7 years** (aligned with common financial and regulatory retention requirements).

---

## CI Gate — NR_FULL Deploy Blocker

```yaml
# .github/workflows/ace-ci.yml — new job

nr-full-spire-gate:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Identify NR_FULL actions in ICR
      id: icr-check
      run: |
        NR_FULL_COUNT=$(jq '[.actions[] | select(.nr_level=="NR_FULL")] | length' \
          docs/icr/intent-class-registry.json)
        echo "nr_full_count=$NR_FULL_COUNT" >> "$GITHUB_OUTPUT"

    - name: Gate NR_FULL on SPIRE trust bundle reachability
      if: steps.icr-check.outputs.nr_full_count != '0'
      run: |
        ENDPOINT="${SPIRE_TRUST_BUNDLE_ENDPOINT:?DEPLOY_BLOCKED: \
          NR_FULL actions present in ICR but SPIRE_TRUST_BUNDLE_ENDPOINT \
          is not set. Set the endpoint or reclassify all NR_FULL actions \
          to NR_CLASS with an explicit NRLevel amendment ADR.}"
        curl --fail --silent --max-time 5 "$ENDPOINT" > /dev/null \
          || { echo "DEPLOY_BLOCKED: SPIRE trust bundle unreachable at $ENDPOINT"; exit 1; }
        echo "SPIRE trust bundle reachable — NR_FULL gate passed."
```

Deployments with no `NR_FULL` actions in the ICR — edge, air-gapped, or customer-owned environments operating entirely at `NR_CLASS` — pass this gate without a SPIRE dependency. The gate is scoped to the ICR content, not to the environment type.

---

## SPEC-COMPUTE.md Review Gate

This ADR moves from `PROPOSED` to `ACCEPTED` only after a human reviewer has checked `docs/SPEC-COMPUTE.md` for the following five contradictions. The reviewer records findings in this ADR before the status change.

| Risk | Field to check | Contradiction signal |
|------|----------------|---------------------|
| 1 | Any executor, worker, agent identity section | Defines a different trust root (shared secret, bearer token, self-issued cert) |
| 2 | Token payload schema | Already defines `aud` as flat string with a different semantic |
| 3 | DID/key management section | Grants executors write access to their own DID documents |
| 4 | Any NR or audit section | Claims instance-level NR without a platform attestation mechanism |
| 5 | Infrastructure/deployment section | Explicitly states no runtime infrastructure dependencies |

**Reviewer sign-off block (required before `ACCEPTED`):**

```
SPEC-COMPUTE.md reviewed by: _______________  Date: ___________
Contradiction on risk 1: [ ] None found  [ ] Found — see amendment PR ___
Contradiction on risk 2: [ ] None found  [ ] Found — see amendment PR ___
Contradiction on risk 3: [ ] None found  [ ] Found — see amendment PR ___
Contradiction on risk 4: [ ] None found  [ ] Found — see amendment PR ___
Contradiction on risk 5: [ ] None found  [ ] Found — see amendment PR ___
```

---

## Consequences

### Immediate (7 days — required for PROPOSED merge)

- `docs/icr/intent-class-registry.json` v2.0 created with `NRLevel` field and initial `cap.action` mappings
- Token Spec updated: `aud` schema change, `intentClass` field added, Step 1 of verification sequence updated with ICR check
- This ADR merged at `PROPOSED` status after `SPEC-COMPUTE.md` review gate

### Short-term (30 days — required for ACCEPTED status)

- `terraform/modules/spire/` exists and passes staging latency P99 < 200ms
- `docs/ops/svid-key-archival-runbook.md` exists with 7-year retention default, verifier replay script, and historical key archive spec
- CI gate (`nr-full-spire-gate`) green on all environments in the matrix
- `SPEC-COMPUTE.md` §Executor Identity subsection written, cross-referencing this ADR

### Deferred — out of scope for this ADR

- Air-gapped SPIRE deployment topology (Infra scope, separate ticket)
- TPM/HSM-backed attestation as `NR_FULL` fallback in constrained environments without a SPIRE server (ADR-033 if required)
- `NRLevel` assignment governance process for future `cap.action` additions
- CBOR migration for audit trail serialization (ADR-015)
- Plane C organizational identity integration (out of scope by plane boundary statement; any future cross-plane identity claim requires its own ADR with explicit plane-boundary analysis)
