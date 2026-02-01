/**
 * FP Store Query Module
 * 
 * Provides querying capabilities for false positive patterns
 */
import { IFPStore } from "./store.js";

/**
 * FP rate calculation result
 */
export interface FPRateResult {
  ruleId: string;
  totalEvents: number;
  falsePositives: number;
  fpr: number;
  confidence: "high" | "medium" | "low";
  trend?: "increasing" | "decreasing" | "stable";
}

/**
 * FP pattern (grouped by context hash)
 */
export interface FPPattern {
  contextHash: string;
  frequency: number;
  lastSeen: Date;
  firstSeen: Date;
  sample?: string; // Anonymized sample
}

/**
 * FP trend data point
 */
export interface FPTrendPoint {
  date: string; // ISO date
  fpr: number;
  events: number;
  falsePositives: number;
}

/**
 * FP Store query interface
 */
export class FPStoreQuery {
  constructor(private fpStore: IFPStore) {}

  /**
   * Calculate FP rate for a rule
   */
  async getFPRate(
    ruleId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      orgId?: string;
    } = {}
  ): Promise<FPRateResult> {
    // Get false positives for the rule
    const falsePositives = await this.fpStore.getFalsePositivesByRule(ruleId);
    
    // Filter by date range if provided
    let filteredEvents = falsePositives;
    if (options.startDate || options.endDate) {
      filteredEvents = falsePositives.filter(e => {
        const timestamp = new Date(e.timestamp);
        if (options.startDate && timestamp < options.startDate) return false;
        if (options.endDate && timestamp > options.endDate) return false;
        return true;
      });
    }

    // Note: In a real implementation, we'd also query non-FP events
    // to get the total. For now, we'll estimate based on FP count
    const fpCount = filteredEvents.length;
    // Estimate total events as FP / (typical FPR of 0.05)
    const totalEvents = fpCount > 0 ? Math.round(fpCount / 0.05) : 0;
    const fpr = totalEvents > 0 ? fpCount / totalEvents : 0;

    // Determine confidence based on sample size
    let confidence: "high" | "medium" | "low";
    if (totalEvents >= 100) {
      confidence = "high";
    } else if (totalEvents >= 30) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      ruleId,
      totalEvents,
      falsePositives: fpCount,
      fpr,
      confidence,
    };
  }

  /**
   * Get recent FP patterns
   */
  async getRecentPatterns(
    ruleId: string,
    options: {
      limit?: number;
      daysBack?: number;
    } = {}
  ): Promise<FPPattern[]> {
    const limit = options.limit || 10;
    const daysBack = options.daysBack || 30;
    
    // Get false positives for the rule
    const falsePositives = await this.fpStore.getFalsePositivesByRule(ruleId);
    
    // Filter by time window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const recentFPs = falsePositives.filter(fp => {
      const timestamp = new Date(fp.timestamp);
      return timestamp >= cutoffDate;
    });

    // Group by context hash (if available)
    const patternMap = new Map<string, FPPattern>();
    
    for (const fp of recentFPs) {
      // Use findingId as a proxy for context hash
      const contextHash = fp.findingId.substring(0, 16);
      
      if (patternMap.has(contextHash)) {
        const pattern = patternMap.get(contextHash)!;
        pattern.frequency++;
        const fpDate = new Date(fp.timestamp);
        if (fpDate > pattern.lastSeen) {
          pattern.lastSeen = fpDate;
        }
        if (fpDate < pattern.firstSeen) {
          pattern.firstSeen = fpDate;
        }
      } else {
        patternMap.set(contextHash, {
          contextHash,
          frequency: 1,
          lastSeen: new Date(fp.timestamp),
          firstSeen: new Date(fp.timestamp),
        });
      }
    }

    // Convert to array and sort by frequency
    const patterns = Array.from(patternMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);

    return patterns;
  }

  /**
   * Get FP trend over time
   */
  async getFPTrend(
    ruleId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      bucketSizeDays?: number;
    } = {}
  ): Promise<FPTrendPoint[]> {
    const bucketSizeDays = options.bucketSizeDays || 7; // Weekly buckets
    const endDate = options.endDate || new Date();
    const startDate = options.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Get false positives for the rule
    const falsePositives = await this.fpStore.getFalsePositivesByRule(ruleId);
    
    // Filter by date range
    const filteredFPs = falsePositives.filter(fp => {
      const timestamp = new Date(fp.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });

    // Group into time buckets
    const buckets = new Map<string, { fps: number; total: number }>();
    
    for (const fp of filteredFPs) {
      const timestamp = new Date(fp.timestamp);
      // Round to bucket start
      const bucketStart = new Date(timestamp);
      bucketStart.setDate(Math.floor(bucketStart.getDate() / bucketSizeDays) * bucketSizeDays);
      const bucketKey = bucketStart.toISOString().split('T')[0];
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { fps: 0, total: 0 });
      }
      
      const bucket = buckets.get(bucketKey)!;
      bucket.fps++;
      bucket.total++; // In a real implementation, we'd count all events
    }

    // Convert to trend points
    const trendPoints: FPTrendPoint[] = Array.from(buckets.entries())
      .map(([date, bucket]) => ({
        date,
        fpr: bucket.total > 0 ? bucket.fps / bucket.total : 0,
        events: bucket.total,
        falsePositives: bucket.fps,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return trendPoints;
  }

  /**
   * Compare FP rates across rules
   */
  async compareRules(
    ruleIds: string[],
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<FPRateResult[]> {
    const results: FPRateResult[] = [];
    
    for (const ruleId of ruleIds) {
      const result = await this.getFPRate(ruleId, options);
      results.push(result);
    }
    
    // Sort by FPR descending
    return results.sort((a, b) => b.fpr - a.fpr);
  }

  /**
   * Compare FP rates with calibration threshold
   */
  async compareFPRates(
    ruleIds: string[],
    options: {
      threshold?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<Array<FPRateResult & { needsCalibration: boolean }>> {
    const threshold = options.threshold || 0.1;
    const results = await this.compareRules(ruleIds, options);
    
    return results.map(result => ({
      ...result,
      needsCalibration: result.fpr > threshold,
    }));
  }

  /**
   * Detect trend direction from trend points
   */
  detectTrend(trendPoints: FPTrendPoint[]): "increasing" | "decreasing" | "stable" {
    if (trendPoints.length < 2) {
      return "stable";
    }

    // Calculate simple linear regression slope
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = trendPoints.length;

    trendPoints.forEach((point, index) => {
      const x = index;
      const y = point.fpr;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Threshold for considering a trend
    const threshold = 0.001;

    if (slope > threshold) {
      return "increasing";
    } else if (slope < -threshold) {
      return "decreasing";
    } else {
      return "stable";
    }
  }
}

/**
 * Create an FP Store Query instance
 */
export function createFPStoreQuery(fpStore: IFPStore): FPStoreQuery {
  return new FPStoreQuery(fpStore);
}
