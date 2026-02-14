---
applyTo: "src/rules/tier-b/**"
---
# Tier B Rule Development

Tier B rules are PROPRIETARY semantic rules that extend the open-core rule engine.

## Every rule must:
- Implement the `RuleDefinition` interface from @phase-mirror/mirror-dissonance
- Export: id (string, "MD-1XX"), name, description, severity, evaluate(context) → Finding[]
- Return findings with: ruleId, title, severity ("block"|"warn"|"pass"), filePath, lineRange, evidence
- Be version-tagged (ruleVersion field)
- Include at least 5 unit tests covering: true positive, true negative, edge case, performance, error handling
- Document the tension it surfaces (what contradictions does this rule name?)

## Rule definitions:
- MD-100: Semantic Job Drift — detects when CI job names/purposes silently change meaning
- MD-101: Cross-Repo Protection Gap — detects when multi-repo dependencies lack coordinated governance
- MD-102: Runner Trust Chain Break — detects when self-hosted runners lack attestation or verification

## Pattern:
```typescript
export const rule: RuleDefinition = {
  id: 'MD-100',
  name: 'Semantic Job Drift',
  tier: 'B',
  severity: 'warn',
  version: '1.0.0',
  evaluate: async (context: AnalysisContext): Promise<Finding[]> => { ... }
};
```

## FP Store integration
- Every Tier B rule should record its findings in the FP store for calibration
- Use the shared FPStoreAdapter interface — never instantiate DynamoDB/Redis directly
- Rule severity may be auto-demoted by the calibration engine if FPR exceeds threshold

## Testing
- Tests live in `tests/rules/tier-b/`
- Use `@jest/globals` imports (ESM mode)
- Provide realistic workflow YAML fixtures (not minimal stubs)
- Test both single-workflow and multi-workflow scenarios
