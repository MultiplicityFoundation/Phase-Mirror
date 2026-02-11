---
applyTo: "packages/mirror-dissonance/src/oracle.ts"
---
# Oracle Instructions

- Oracle is the core wiring: evaluateAllRules → fpStore.isFalsePositive → blockCounter.getCount → makeDecision
- Use adapter factory: `const adapters = await createAdapters(loadCloudConfig())`
- FPStoreError catch → enter degraded mode (reason: 'fp-store-unavailable'), do NOT return empty data
- Rule evaluation errors → synthetic finding with severity 'block' and metadata.error
- A successful query returning no items ≠ a failed query — distinguish honestly
- Degraded mode fields already defined in dissonance-report.schema.json
