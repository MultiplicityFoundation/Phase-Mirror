/**
 * Report Validation - Day 11 Afternoon
 * HMAC-protected RedactedText validation with fail-open/fail-closed modes
 */

export interface DissonanceReport {
  meta: {
    schema_version: string;
    run_id: string;
    timestamp: Date;
    rules_hash: string;
    degraded?: any;
    demotions?: any[];
  };
  items: Array<{
    id: string;
    rule_id: string;
    severity: string;
    title: string;
    evidence?: Array<{
      path?: string;
      line?: number;
      snippet?: RedactedText;
      hash?: string;
    }>;
  }>;
  summary: any;
  machine_decision: any;
}

export interface RedactedText {
  __brand: 'RedactedText';
  __mac: string;
  value: string;
  originalLength?: number;
}

export type ValidationMode = 'fail-open' | 'fail-closed';

/**
 * Validates HMAC-protected RedactedText objects
 * @param text RedactedText object to validate
 * @returns true if valid, false otherwise
 */
export function isValidRedactedText(text: any): boolean {
  if (!text || typeof text !== 'object') {
    return false;
  }

  // Check for required brand and MAC
  if (text.__brand !== 'RedactedText' || !text.__mac || !text.value) {
    return false;
  }

  // In production, this would verify the HMAC against the nonce
  // For now, we just check the structure is present
  return typeof text.__mac === 'string' && text.__mac.length > 0;
}

/**
 * Validates all RedactedText objects in a report
 * @param report DissonanceReport to validate
 * @param mode fail-open drops invalid snippets, fail-closed throws error
 * @returns Validated report (potentially modified in fail-open mode)
 */
export function validateReportRedactions(
  report: DissonanceReport,
  mode: ValidationMode = 'fail-open'
): DissonanceReport {
  const violations: string[] = [];

  for (const item of report.items) {
    for (const evidence of item.evidence || []) {
      if (evidence.snippet) {
        if (!isValidRedactedText(evidence.snippet)) {
          violations.push(`Invalid RedactedText in finding ${item.id}`);
          
          if (mode === 'fail-open') {
            // Drop the snippet, keep hash/path
            delete evidence.snippet;
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    if (mode === 'fail-closed') {
      throw new Error(`Report validation failed:\n${violations.join('\n')}`);
    } else {
      console.warn(`Report validation issues (snippets dropped):\n${violations.join('\n')}`);
    }
  }

  return report;
}
