# Coverage Gaps - Prioritized

**Target:** 80% global coverage, 90% for critical paths

## Critical Gaps (P0 - Must Fix)

These files are critical and below threshold:

| File | Current | Target | Gap | Priority |
|------|---------|--------|-----|----------|
| `src/l0-invariants/index.ts` | TBD | 90% | TBD | P0 |
| `src/redaction/redactor-v3.ts` | TBD | 85% | TBD | P0 |
| `src/nonce/index.ts` | TBD | 85% | TBD | P0 |

**Action:** Write comprehensive unit tests for these modules.

## High Priority Gaps (P1 - Should Fix)

| File | Current | Target | Gap | Priority |
|------|---------|--------|-----|----------|
| `src/fp-store/dynamodb-store.ts` | TBD | 75% | TBD | P1 |
| `src/consent-store/validator.ts` | TBD | 80% | TBD | P1 |
| `src/block-counter/dynamodb.ts` | TBD | 75% | TBD | P1 |

**Action:** Add integration tests with LocalStack.

## Medium Priority Gaps (P2 - Nice to Have)

| File | Current | Target | Gap | Priority |
|------|---------|--------|-----|----------|
| `src/oracle.ts` | TBD | 80% | TBD | P2 |
| `src/analyzer.ts` | TBD | 80% | TBD | P2 |

**Action:** Add edge case tests and error path coverage.

## Files with Zero Coverage

These files should have tests:

- [ ] `src/utils/crypto.ts`
- [ ] `src/utils/validation.ts`
- [ ] `src/anonymizer/hmac.ts`

## Coverage Improvement Plan

### Week 2 Day 8-10
- [ ] L0 invariants: 65% → 90%
- [ ] Redaction: 70% → 85%
- [ ] Nonce: 68% → 85%

### Week 2 Day 11-12
- [ ] FP Store: 60% → 75%
- [ ] Consent Store: 55% → 80%
- [ ] Block Counter: 50% → 75%

### Week 2 Day 13-14
- [ ] Fill remaining gaps to achieve 80% global
- [ ] Add edge case coverage
- [ ] Document acceptable gaps (if any)

## Update Frequency

This file should be updated after every test run:

```bash
pnpm test:coverage && node scripts/update-coverage-gaps.js
```
