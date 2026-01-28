/**
 * Schema definitions for Mirror Dissonance Protocol
 */
export interface MachineDecision {
    outcome: 'allow' | 'block' | 'warn';
    reasons: string[];
    metadata: {
        timestamp: string;
        mode: string;
        rulesEvaluated: string[];
    };
}
export interface RuleViolation {
    ruleId: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    context: Record<string, unknown>;
}
export interface OracleInput {
    mode: 'pull_request' | 'merge_group' | 'drift' | 'calibration';
    strict?: boolean;
    dryRun?: boolean;
    baselineFile?: string;
    context: {
        repositoryName?: string;
        prNumber?: number;
        commitSha?: string;
        branch?: string;
        author?: string;
    };
}
export interface OracleOutput {
    machineDecision: MachineDecision;
    violations: RuleViolation[];
    summary: string;
    report: {
        rulesChecked: number;
        violationsFound: number;
        criticalIssues: number;
    };
}
export interface FalsePositiveEvent {
    id: string;
    findingId: string;
    ruleId: string;
    timestamp: string;
    resolvedBy: string;
    context: Record<string, unknown>;
}
export interface BlockCounterEntry {
    bucketKey: string;
    timestamp: number;
    count: number;
    ttl: number;
}
export interface NonceConfig {
    value: string;
    loadedAt: string;
    source: string;
}
