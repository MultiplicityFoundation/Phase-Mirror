// packages/mirror-dissonance/src/adapters/types.ts

export interface CloudConfig {
  provider: 'aws' | 'gcp' | 'local';
  region?: string;
  // AWS-specific
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  nonceParameterName?: string;
  baselineBucket?: string;
  // GCP-specific
  gcpProjectId?: string;
  // Local-specific
  localDataDir?: string;
}

export interface FPEvent {
  eventId: string;
  ruleId: string;
  ruleVersion: string;
  findingId: string;
  outcome: 'block' | 'warn' | 'pass';
  isFalsePositive: boolean;
  timestamp: Date;
  context: {
    repo: string;
    branch: string;
    eventType: 'pullrequest' | 'mergegroup' | 'drift';
  };
}

export interface FPWindow {
  ruleId: string;
  ruleVersion: string;
  windowSize: number;
  events: FPEvent[];
  statistics: {
    total: number;
    falsePositives: number;
    truePositives: number;
    pending: number;
    observedFPR: number; // FP / (total - pending)
  };
}

export interface FPStoreAdapter {
  recordEvent(event: FPEvent): Promise<void>;
  getWindowByCount(ruleId: string, count: number): Promise<FPWindow>;
  getWindowBySince(ruleId: string, since: Date): Promise<FPWindow>;
  markFalsePositive(eventId: string, reviewedBy: string): Promise<void>;
  isFalsePositive(ruleId: string, findingId: string): Promise<boolean>;
  computeWindow(ruleId: string, events: FPEvent[]): FPWindow;
}

export interface ConsentStoreAdapter {
  recordConsent(consent: {
    orgId: string;
    repoId?: string;
    scope: string;
    grantedBy: string;
    expiresAt?: Date;
  }): Promise<void>;
  hasValidConsent(orgId: string, repoId: string, scope: string): Promise<boolean>;
  revokeConsent(orgId: string, scope: string): Promise<void>;
  getConsent(orgId: string): Promise<any>;
}

export interface BlockCounterAdapter {
  increment(ruleId: string, orgId: string): Promise<number>;
  getCount(ruleId: string, orgId: string): Promise<number>;
  isCircuitBroken(ruleId: string, orgId: string, threshold: number): Promise<boolean>;
}

export interface SecretStoreAdapter {
  getNonce(): Promise<string | null>;
  getNonces(): Promise<string[]>; // multi-version for grace period
}

export interface ObjectStoreAdapter {
  getBaseline(repoId: string): Promise<any | null>;
  putBaseline(repoId: string, baseline: any): Promise<void>;
  listBaselineVersions(repoId: string): Promise<Array<{ versionId: string; lastModified: Date }>>;
}

export interface CloudAdapters {
  fpStore: FPStoreAdapter;
  consentStore: ConsentStoreAdapter;
  blockCounter: BlockCounterAdapter;
  secretStore: SecretStoreAdapter;
  objectStore: ObjectStoreAdapter;
}
