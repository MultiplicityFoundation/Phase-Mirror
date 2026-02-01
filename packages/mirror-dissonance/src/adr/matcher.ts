/**
 * ADR Matcher - matches files to relevant ADRs
 */
import { ParsedADR, FilePattern } from "./types.js";

/**
 * File patterns that map to specific ADRs
 * These patterns help identify which ADRs are relevant to which files
 */
const FILE_PATTERNS: FilePattern[] = [
  {
    pattern: /\.github\/workflows\/.*\.ya?ml$/,
    adrIds: ["ADR-001"], // If there's a GitHub Actions ADR
    description: "GitHub Actions workflow files",
  },
  {
    pattern: /package\.json$/,
    adrIds: ["ADR-002"], // License-related ADR
    description: "Package manifest files",
  },
  {
    pattern: /\.ts$/,
    adrIds: [], // TypeScript files - depends on content
    description: "TypeScript source files",
  },
];

/**
 * ADR Matcher class
 */
export class ADRMatcher {
  /**
   * Match files to relevant ADRs
   */
  matchFilesToADRs(files: string[], adrs: ParsedADR[]): Map<string, ParsedADR[]> {
    const fileToADRs = new Map<string, ParsedADR[]>();

    for (const file of files) {
      const relevantADRs = this.findRelevantADRs(file, adrs);
      if (relevantADRs.length > 0) {
        fileToADRs.set(file, relevantADRs);
      }
    }

    return fileToADRs;
  }

  /**
   * Find relevant ADRs for a specific file
   */
  private findRelevantADRs(file: string, adrs: ParsedADR[]): ParsedADR[] {
    const relevant: ParsedADR[] = [];

    // Check file patterns
    for (const pattern of FILE_PATTERNS) {
      if (pattern.pattern.test(file)) {
        // Add ADRs matched by pattern
        for (const adrId of pattern.adrIds) {
          const adr = adrs.find(a => a.id === adrId);
          if (adr && !relevant.includes(adr)) {
            relevant.push(adr);
          }
        }
      }
    }

    // Check for explicit ADR references in file path or name
    const adrIdPattern = /ADR-\d{3}/i;
    const match = file.match(adrIdPattern);
    if (match) {
      const adrId = match[0].toUpperCase();
      const adr = adrs.find(a => a.id === adrId);
      if (adr && !relevant.includes(adr)) {
        relevant.push(adr);
      }
    }

    // If no specific ADRs matched, return only "approved" ADRs for general checks
    // This can be refined based on file type
    if (relevant.length === 0) {
      // For now, return all approved ADRs as potentially relevant
      // In a real implementation, this would be more sophisticated
      return adrs.filter(adr => adr.status === "approved");
    }

    return relevant;
  }

  /**
   * Get all unique ADRs from a file-to-ADR mapping
   */
  getUniqueADRs(fileToADRs: Map<string, ParsedADR[]>): ParsedADR[] {
    const adrSet = new Set<ParsedADR>();
    for (const adrs of fileToADRs.values()) {
      adrs.forEach(adr => adrSet.add(adr));
    }
    return Array.from(adrSet);
  }
}

/**
 * Create a matcher instance
 */
export function createADRMatcher(): ADRMatcher {
  return new ADRMatcher();
}
