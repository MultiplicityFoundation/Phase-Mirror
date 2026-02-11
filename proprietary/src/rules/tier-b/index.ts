/**
 * Tier B Rule Registry — Proprietary semantic rules
 *
 * @license Phase Mirror Pro License v1.0
 */

export { rule as MD100 } from './MD-100.js';
export { rule as MD101 } from './MD-101.js';
// export { rule as MD102 } from './MD-102';  // Future

import { rule as MD100 } from './MD-100.js';
import { rule as MD101 } from './MD-101.js';
import type { RuleDefinition } from '../types.js';

export const tierBRules: RuleDefinition[] = [MD100, MD101];
