/**
 * ADR Validator - validates file content against ADR rules
 */
import { readFile } from "fs/promises";
import { ParsedADR, ADRViolation } from "./types.js";

/**
 * ADR Validator class
 */
export class ADRValidator {
  /**
   * Validate a file against relevant ADRs
   */
  async validateFile(
    filePath: string,
    adrs: ParsedADR[]
  ): Promise<ADRViolation[]> {
    const violations: ADRViolation[] = [];

    try {
      const content = await readFile(filePath, "utf-8");

      for (const adr of adrs) {
        const adrViolations = await this.checkADRCompliance(
          filePath,
          content,
          adr
        );
        violations.push(...adrViolations);
      }
    } catch (error) {
      // If file can't be read, log but don't fail
      console.error(`Failed to read ${filePath}:`, error);
    }

    return violations;
  }

  /**
   * Check compliance with a specific ADR
   */
  private async checkADRCompliance(
    filePath: string,
    content: string,
    adr: ParsedADR
  ): Promise<ADRViolation[]> {
    const violations: ADRViolation[] = [];

    // Check each decision rule
    for (const rule of adr.decisionRules) {
      const ruleViolations = this.checkRule(filePath, content, adr, rule);
      violations.push(...ruleViolations);
    }

    return violations;
  }

  /**
   * Check a specific rule against file content
   */
  private checkRule(
    filePath: string,
    content: string,
    adr: ParsedADR,
    rule: ParsedADR["decisionRules"][0]
  ): ADRViolation[] {
    const violations: ADRViolation[] = [];

    // For MUST_NOT rules, look for prohibited patterns
    if (rule.type === "MUST_NOT") {
      // Extract key terms from the rule text to search for
      const violation = this.checkMustNotRule(filePath, content, adr, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    // For MUST rules, look for required patterns
    if (rule.type === "MUST") {
      const violation = this.checkMustRule(filePath, content, adr, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Check MUST_NOT rule
   */
  private checkMustNotRule(
    filePath: string,
    content: string,
    adr: ParsedADR,
    rule: ParsedADR["decisionRules"][0]
  ): ADRViolation | null {
    // Extract patterns from rule text
    // This is a simplified implementation - real implementation would be more sophisticated
    
    // Example: Look for common patterns
    if (rule.text.toLowerCase().includes("write-all") && content.includes("write-all")) {
      return {
        adrId: adr.id,
        ruleId: rule.id,
        file: filePath,
        line: this.findLineNumber(content, "write-all"),
        message: `Violation of ${adr.id}: ${rule.text}`,
        severity: "high",
        remediation: "Remove prohibited pattern as specified in ADR",
      };
    }

    return null;
  }

  /**
   * Check MUST rule
   */
  private checkMustRule(
    filePath: string,
    content: string,
    adr: ParsedADR,
    rule: ParsedADR["decisionRules"][0]
  ): ADRViolation | null {
    // For MUST rules, we'd check if required patterns are present
    // This is a placeholder - real implementation would be more sophisticated
    // and would depend on the specific ADR and rule
    return null;
  }

  /**
   * Find line number of a pattern in content
   */
  private findLineNumber(content: string, pattern: string): number {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * Validate multiple files against ADRs
   */
  async validateFiles(
    fileToADRs: Map<string, ParsedADR[]>
  ): Promise<ADRViolation[]> {
    const allViolations: ADRViolation[] = [];

    for (const [file, adrs] of fileToADRs.entries()) {
      const violations = await this.validateFile(file, adrs);
      allViolations.push(...violations);
    }

    return allViolations;
  }
}

/**
 * Create a validator instance
 */
export function createADRValidator(): ADRValidator {
  return new ADRValidator();
}
