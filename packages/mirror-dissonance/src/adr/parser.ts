/**
 * ADR Parser - extracts structured data from ADR markdown files
 */
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { ParsedADR, DecisionRule } from "./types.js";

/**
 * ADR Parser class
 */
export class ADRParser {
  /**
   * Parse single ADR file
   */
  async parseADR(filePath: string): Promise<ParsedADR> {
    const content = await readFile(filePath, "utf-8");
    
    // Extract ID from filename or title
    const filename = filePath.split("/").pop() || "";
    const idMatch = filename.match(/ADR-(\d{3})/i) || content.match(/# ADR-(\d{3})/i);
    if (!idMatch) {
      throw new Error(`No ADR ID found in ${filePath}`);
    }
    const id = `ADR-${idMatch[1]}`;

    // Extract title
    const titleMatch = content.match(/# (ADR-\d{3}[:\s]+.+)|# (.+)/m);
    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || id) : id;

    // Extract metadata
    const status = this.extractStatus(content);
    const date = this.extractDate(content);
    const tags = this.extractTags(content);

    // Extract sections
    const context = this.extractSection(content, "Context");
    const decision = this.extractSection(content, "Decision");
    const consequences = this.extractSection(content, "Consequences");
    const complianceChecks = this.extractSection(content, "Compliance Checks");

    // Parse decision rules
    const decisionRules = this.parseDecisionRules(id, decision);

    // Extract references
    const relatedRules = this.extractRelatedRules(content);
    const relatedADRs = this.extractRelatedADRs(content);

    return {
      id,
      title,
      filePath,
      status,
      date,
      tags,
      context,
      decision,
      decisionRules,
      consequences,
      complianceChecks,
      relatedRules,
      relatedADRs,
    };
  }

  /**
   * Parse all ADRs in directory
   */
  async parseADRDirectory(adrPath: string): Promise<ParsedADR[]> {
    const files = await readdir(adrPath);
    const adrFiles = files.filter(f => f.match(/ADR-\d{3}/i) && f.endsWith('.md'));
    
    const parsedADRs: ParsedADR[] = [];
    for (const file of adrFiles) {
      try {
        const adr = await this.parseADR(join(adrPath, file));
        parsedADRs.push(adr);
      } catch (error) {
        console.error(`Failed to parse ${file}:`, error);
        // Continue parsing other ADRs
      }
    }
    
    return parsedADRs;
  }

  /**
   * Extract status from ADR content
   */
  private extractStatus(content: string): ParsedADR["status"] {
    const statusMatch = content.match(/\*\*Status[:\s]*\*\*[:\s]*(\w+)/i);
    if (statusMatch) {
      const status = statusMatch[1].toLowerCase();
      if (status === "approved" || status === "accepted") return "approved";
      if (status === "proposed") return "proposed";
      if (status === "deprecated") return "deprecated";
      if (status === "superseded") return "superseded";
    }
    return "approved"; // Default
  }

  /**
   * Extract date from ADR content
   */
  private extractDate(content: string): string {
    const dateMatch = content.match(/\*\*Date[:\s]*\*\*[:\s]*([\d-]+)/i);
    return dateMatch ? dateMatch[1] : "";
  }

  /**
   * Extract tags from ADR content
   */
  private extractTags(content: string): string[] {
    const tagsMatch = content.match(/\*\*Tags[:\s]*\*\*[:\s]*(.+)/i);
    if (tagsMatch) {
      return tagsMatch[1].split(',').map(t => t.trim());
    }
    return [];
  }

  /**
   * Extract a section from ADR content
   */
  private extractSection(content: string, sectionName: string): string {
    // Match section header (## or ###)
    const sectionRegex = new RegExp(`^##+ ${sectionName}\\s*$`, 'im');
    const match = content.match(sectionRegex);
    
    if (!match || match.index === undefined) {
      return "";
    }

    // Find the start of this section
    const startIndex = match.index + match[0].length;
    
    // Find the next section header (##) or end of content
    const nextSectionRegex = /^##+ /gm;
    nextSectionRegex.lastIndex = startIndex;
    const nextMatch = nextSectionRegex.exec(content);
    
    const endIndex = nextMatch ? nextMatch.index : content.length;
    
    return content.slice(startIndex, endIndex).trim();
  }

  /**
   * Parse decision rules from decision section
   */
  private parseDecisionRules(adrId: string, decision: string): DecisionRule[] {
    const rules: DecisionRule[] = [];
    
    // Look for MUST, MUST NOT, SHALL, SHALL NOT, SHOULD, MAY patterns
    const patterns = [
      { type: "MUST_NOT" as const, regex: /MUST NOT (.+?)(?:\n|$)/gi },
      { type: "MUST" as const, regex: /MUST (.+?)(?:\n|$)/gi },
      { type: "SHALL_NOT" as const, regex: /SHALL NOT (.+?)(?:\n|$)/gi },
      { type: "SHALL" as const, regex: /SHALL (.+?)(?:\n|$)/gi },
      { type: "SHOULD" as const, regex: /SHOULD (.+?)(?:\n|$)/gi },
      { type: "MAY" as const, regex: /MAY (.+?)(?:\n|$)/gi },
    ];

    let ruleIndex = 1;
    for (const { type, regex } of patterns) {
      let match;
      const tempRegex = new RegExp(regex.source, regex.flags);
      while ((match = tempRegex.exec(decision)) !== null) {
        rules.push({
          id: `${adrId}-R${ruleIndex++}`,
          text: match[0].trim(),
          type,
        });
      }
    }

    return rules;
  }

  /**
   * Extract related rule references (MD-###, L0-###)
   */
  private extractRelatedRules(content: string): string[] {
    const rulePattern = /(?:MD|L0)-\d{3}/g;
    const matches = content.match(rulePattern);
    if (!matches) return [];
    
    // Remove duplicates and sort
    return Array.from(new Set(matches)).sort();
  }

  /**
   * Extract related ADR references
   */
  private extractRelatedADRs(content: string): string[] {
    const adrPattern = /ADR-\d{3}/g;
    const matches = content.match(adrPattern);
    if (!matches) return [];
    
    // Remove duplicates, remove self-reference, and sort
    const refs = Array.from(new Set(matches)).sort();
    
    // Try to remove self-reference if we can determine it
    const titleMatch = content.match(/# (ADR-\d{3})/);
    if (titleMatch) {
      const selfId = titleMatch[1];
      return refs.filter(ref => ref !== selfId);
    }
    
    return refs;
  }
}

/**
 * Create a singleton parser instance
 */
export function createADRParser(): ADRParser {
  return new ADRParser();
}
