/**
 * MD-100: Semantic Job Drift
 *
 * Detects when CI/CD job names suggest one purpose but the actual steps
 * perform a different function. This is a governance risk because branch
 * protection rules reference job names — if the name lies, the protection lies.
 *
 * Central Tension: Detection accuracy vs. keyword heuristics. A full
 * semantic analysis engine would be ideal but doesn't exist yet. This is
 * the pragmatic 80% solution: a keyword-to-intent mapping engine that's
 * explicit, testable, and extensible — not ML-based.
 *
 * @license Phase Mirror Pro License v1.0
 */
import type { RuleDefinition, Finding } from '../types.js';
export interface IntentSignal {
    keywords: string[];
    expectedActions: string[];
    expectedCommands: string[];
}
export declare const INTENT_VOCABULARY: IntentSignal[];
export interface WorkflowJob {
    jobKey: string;
    jobName?: string;
    steps: WorkflowStep[];
    filePath: string;
}
export interface WorkflowStep {
    name?: string;
    uses?: string;
    run?: string;
}
export declare function parseWorkflowJobs(content: string, filePath: string): WorkflowJob[];
export interface IntentMatch {
    category: string;
    keywords: string[];
}
export declare function detectJobIntent(jobKey: string, jobName?: string): IntentMatch[];
export declare function stepsMatchIntent(steps: WorkflowStep[], intents: IntentMatch[]): {
    matched: boolean;
    matchedCategories: string[];
    unmatchedCategories: string[];
};
export declare function detectEnvironmentDrift(job: WorkflowJob): Finding | null;
export declare const rule: RuleDefinition;
export default rule;
