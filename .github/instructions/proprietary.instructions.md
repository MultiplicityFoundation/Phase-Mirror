---
applyTo: "proprietary/**"
---
# Proprietary Code — Phase Mirror Pro

## You are writing PROPRIETARY code.
- This code requires a Phase Mirror Pro license for production use
- It is source-available (visible in the public repo) but NOT open-core
- Always import core types from @mirror-dissonance/core
- NEVER copy types/interfaces from open-core — always import them
- NEVER duplicate schemas

## Every Pro feature must:
1. Call requirePro(context, 'feature-name') at entry point
2. Implement interfaces defined in the open-core package
3. Include tests in proprietary/tests/
4. Document the tension it addresses

## Import pattern:
```typescript
// ✅ Correct
import { RuleDefinition, Finding } from '@mirror-dissonance/core';
import { FPStoreAdapter } from '@mirror-dissonance/core/fp-store/interface';

// ❌ Wrong — never duplicate
interface RuleDefinition { ... }
```
