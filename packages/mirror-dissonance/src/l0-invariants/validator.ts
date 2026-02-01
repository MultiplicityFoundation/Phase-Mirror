/**
 * L0 Validator - Flexible validation API for L0 invariants
 * 
 * Provides a class-based interface for validating individual or multiple
 * L0 invariants with configurable thresholds.
 */

import { createHash } from "crypto";

/**
 * Configuration for L0 Validator
 */
export interface L0ValidatorConfig {
  driftThreshold?: number;
  nonceMaxAgeSeconds?: number;
  contractionWitnessMinEvents?: number;
}

/**
 * Input for L0 validation - all fields optional for selective checking
 */
export interface L0ValidationInput {
  // Schema hash validation
  schemaValidation?: {
    content: string;
    expectedHash: string;
  };
  
  // Workflow file permission validation
  workflowFiles?: Array<{
    path: string;
    content: string;
  }>;
  
  // Drift magnitude validation
  driftCheck?: {
    current: {
      name: string;
      value: number;
    };
    baseline: {
      name: string;
      value: number;
    };
  };
  
  // Nonce freshness validation
  nonceValidation?: {
    nonce: string;
    timestamp: Date;
  };
  
  // Contraction witness validation
  contractionCheck?: {
    previousFPR: number;
    currentFPR: number;
    witnessEvents: Array<{
      eventId: string;
      ruleId: string;
      outcome: "block" | "warn" | "pass";
      isFalsePositive: boolean;
      reviewedBy?: string;
      timestamp: Date;
    }>;
  };
}

/**
 * Result from a single L0 invariant check
 */
export interface L0ValidationResult {
  invariantId: string;
  invariantName: string;
  passed: boolean;
  message: string;
  evidence?: Record<string, unknown>;
  latencyNs?: number;
}

/**
 * L0 Validator class for flexible invariant checking
 */
export class L0Validator {
  private config: Required<L0ValidatorConfig>;
  
  // Expected schema version and hash (from existing implementation)
  private static readonly EXPECTED_SCHEMA_VERSION = '1.0';
  private static readonly EXPECTED_SCHEMA_HASH = 'f7a8b9c0';
  
  // Reserved permission bits mask
  private static readonly RESERVED_PERMISSION_BITS_MASK = 0b1111000000000000;
  
  constructor(config: L0ValidatorConfig = {}) {
    this.config = {
      driftThreshold: config.driftThreshold ?? 0.5,
      nonceMaxAgeSeconds: config.nonceMaxAgeSeconds ?? 3600,
      contractionWitnessMinEvents: config.contractionWitnessMinEvents ?? 10,
    };
  }
  
  /**
   * Validate all applicable L0 invariants based on provided input
   */
  async validateAll(input: L0ValidationInput): Promise<L0ValidationResult[]> {
    const results: L0ValidationResult[] = [];
    
    // Schema hash validation
    if (input.schemaValidation) {
      results.push(await this.validateSchemaHash(
        input.schemaValidation.content,
        input.schemaValidation.expectedHash
      ));
    }
    
    // Workflow permission validation
    if (input.workflowFiles && input.workflowFiles.length > 0) {
      for (const workflow of input.workflowFiles) {
        results.push(await this.validatePermissionBits(workflow));
      }
    }
    
    // Drift magnitude validation
    if (input.driftCheck) {
      results.push(await this.validateDriftMagnitude(
        input.driftCheck.current,
        input.driftCheck.baseline
      ));
    }
    
    // Nonce freshness validation
    if (input.nonceValidation) {
      results.push(await this.validateNonceFreshness(
        input.nonceValidation.nonce,
        input.nonceValidation.timestamp
      ));
    }
    
    // Contraction witness validation
    if (input.contractionCheck) {
      results.push(await this.validateContractionWitness(
        input.contractionCheck.previousFPR,
        input.contractionCheck.currentFPR,
        input.contractionCheck.witnessEvents
      ));
    }
    
    return results;
  }
  
  /**
   * L0-001: Schema Hash Integrity
   */
  async validateSchemaHash(
    schemaContent: string,
    expectedHash: string
  ): Promise<L0ValidationResult> {
    const startNs = process.hrtime.bigint();
    
    const actualHash = createHash('sha256')
      .update(schemaContent)
      .digest('hex')
      .substring(0, 8); // Match the format used in existing implementation
    
    const passed = actualHash === expectedHash;
    const endNs = process.hrtime.bigint();
    
    return {
      invariantId: "L0-001",
      invariantName: "schema_hash",
      passed,
      message: passed 
        ? "Schema hash valid" 
        : `Schema hash mismatch: expected ${expectedHash}, got ${actualHash}`,
      evidence: {
        expected: expectedHash,
        actual: actualHash,
        schemaLength: schemaContent.length,
      },
      latencyNs: Number(endNs - startNs),
    };
  }
  
  /**
   * L0-002: Permission Bits
   * Validates GitHub Actions workflow permissions
   */
  async validatePermissionBits(workflow: {
    path: string;
    content: string;
  }): Promise<L0ValidationResult> {
    const startNs = process.hrtime.bigint();
    
    // Check for excessive permissions patterns
    const excessivePatterns = [
      /permissions:\s*write-all/i,
      /permissions:\s*{\s*\w+:\s*write-all/i,
      /contents:\s*write(?!-)/i, // contents: write (but not write-token, etc.)
    ];
    
    const violations: string[] = [];
    for (const pattern of excessivePatterns) {
      const match = workflow.content.match(pattern);
      if (match) {
        violations.push(match[0]);
      }
    }
    
    const passed = violations.length === 0;
    const endNs = process.hrtime.bigint();
    
    return {
      invariantId: "L0-002",
      invariantName: "permission_bits",
      passed,
      message: passed
        ? `Workflow ${workflow.path} follows least privilege`
        : `Workflow ${workflow.path} has excessive permissions: ${violations.join(", ")}`,
      evidence: {
        workflow: workflow.path,
        violations: violations.length > 0 ? violations : undefined,
      },
      latencyNs: Number(endNs - startNs),
    };
  }
  
  /**
   * L0-003: Drift Magnitude
   */
  async validateDriftMagnitude(
    current: { name: string; value: number },
    baseline: { name: string; value: number }
  ): Promise<L0ValidationResult> {
    const startNs = process.hrtime.bigint();
    
    // Calculate drift as relative change
    const drift = baseline.value === 0 
      ? (current.value === 0 ? 0 : 1) // Avoid division by zero
      : Math.abs(current.value - baseline.value) / baseline.value;
    
    const passed = drift <= this.config.driftThreshold;
    const endNs = process.hrtime.bigint();
    
    return {
      invariantId: "L0-003",
      invariantName: "drift_magnitude",
      passed,
      message: passed
        ? `Drift ${(drift * 100).toFixed(1)}% within acceptable range`
        : `Drift ${(drift * 100).toFixed(1)}% exceeds threshold ${(this.config.driftThreshold * 100).toFixed(1)}%`,
      evidence: {
        drift,
        threshold: this.config.driftThreshold,
        current,
        baseline,
      },
      latencyNs: Number(endNs - startNs),
    };
  }
  
  /**
   * L0-004: Nonce Freshness
   */
  async validateNonceFreshness(
    nonce: string,
    timestamp: Date,
    nowMs?: number
  ): Promise<L0ValidationResult> {
    const startNs = process.hrtime.bigint();
    
    const now = nowMs ?? Date.now();
    const age = (now - timestamp.getTime()) / 1000; // Age in seconds
    
    const passed = age >= 0 && age < this.config.nonceMaxAgeSeconds;
    const endNs = process.hrtime.bigint();
    
    return {
      invariantId: "L0-004",
      invariantName: "nonce_freshness",
      passed,
      message: passed
        ? `Nonce fresh (age: ${age.toFixed(1)}s)`
        : age < 0
          ? `Nonce timestamp is in the future`
          : `Nonce expired (age: ${age.toFixed(1)}s, max: ${this.config.nonceMaxAgeSeconds}s)`,
      evidence: {
        age,
        maxAge: this.config.nonceMaxAgeSeconds,
        nonce,
        timestamp: timestamp.toISOString(),
      },
      latencyNs: Number(endNs - startNs),
    };
  }
  
  /**
   * L0-005: Contraction Witness
   * Validates FPR decrease is legitimate (not gaming)
   */
  async validateContractionWitness(
    previousFPR: number,
    currentFPR: number,
    witnessEvents: Array<{
      eventId: string;
      ruleId: string;
      outcome: "block" | "warn" | "pass";
      isFalsePositive: boolean;
      reviewedBy?: string;
      timestamp: Date;
    }>
  ): Promise<L0ValidationResult> {
    const startNs = process.hrtime.bigint();
    
    const decrease = previousFPR - currentFPR;
    
    // If FPR decreased significantly, verify evidence exists
    if (decrease > 0.01) {
      const hasSufficientEvents = witnessEvents.length >= this.config.contractionWitnessMinEvents;
      const reviewedEvents = witnessEvents.filter(e => e.reviewedBy).length;
      const hasReviewers = reviewedEvents === witnessEvents.length && witnessEvents.length > 0;
      
      const passed = hasSufficientEvents && hasReviewers;
      const endNs = process.hrtime.bigint();
      
      return {
        invariantId: "L0-005",
        invariantName: "contraction_witness",
        passed,
        message: passed
          ? `FPR decrease validated with ${witnessEvents.length} reviewed events`
          : !hasSufficientEvents
            ? `Insufficient evidence: ${witnessEvents.length} events (minimum: ${this.config.contractionWitnessMinEvents})`
            : `Unreviewed events: ${witnessEvents.length - reviewedEvents} of ${witnessEvents.length}`,
        evidence: {
          decrease,
          eventCount: witnessEvents.length,
          reviewedCount: reviewedEvents,
          minRequired: this.config.contractionWitnessMinEvents,
          previousFPR,
          currentFPR,
        },
        latencyNs: Number(endNs - startNs),
      };
    }
    
    // No significant decrease, pass automatically
    const endNs = process.hrtime.bigint();
    return {
      invariantId: "L0-005",
      invariantName: "contraction_witness",
      passed: true,
      message: "No significant FPR decrease to validate",
      evidence: {
        decrease,
        previousFPR,
        currentFPR,
      },
      latencyNs: Number(endNs - startNs),
    };
  }
}
