// packages/mirror-dissonance/src/rules/__tests__/evaluate.test.ts

import { evaluateAllRules, type EvaluationResult } from "../index";
import { RuleEvaluationError } from "../rule-error";
import type { Rule, OracleInput, RuleViolation } from "../../types";

// Helper: create a rule that succeeds with given violations
function successRule(id: string, violations: RuleViolation[] = []): Rule {
  return {
    id,
    version: "1.0.0",
    checker: jest.fn().mockResolvedValue(violations),
  };
}

const mockInput: OracleInput = {
  repo: {
    owner: "test",
    name: "repo",
    defaultBranch: "main",
    visibility: "public",
  },
  pr: {
    number: 123,
    title: "Test PR",
    author: "testuser",
    sourceBranch: "feature",
    targetBranch: "main",
  },
  files: {
    added: [],
    modified: ["README.md"],
    deleted: [],
  },
  workflows: [],
};

describe("evaluateAllRules — fail-closed error propagation", () => {
  it("returns violations from successful rules", async () => {
    const violation: RuleViolation = {
      ruleId: "MD-001",
      ruleVersion: "1.0.0",
      severity: "high",
      message: "Unpinned action detected",
      context: {
        file: "README.md",
        line: 10,
      },
    };

    const result = await evaluateAllRules(mockInput);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.rulesEvaluated).toBeGreaterThan(0);
    expect(result.rulesErrored).toBe(0);
  });

  it("converts throwing rule into synthetic critical violation", async () => {
    // We need to mock a specific rule to throw
    const mockRules = {
      "MD-002": jest.fn().mockRejectedValue(new Error("regex timeout")),
    };
    
    // Temporarily replace RULES
    jest.spyOn(require("../index"), "RULES", "get").mockReturnValue(mockRules);

    const result = await evaluateAllRules(mockInput);

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(1);
    expect(result.rulesErrored).toBe(1);

    const errorViolation = result.violations.find(v => v.context?.isEvaluationError);
    expect(errorViolation).toBeDefined();
    expect(errorViolation?.severity).toBe("critical");
    expect(errorViolation?.ruleId).toBe("MD-002");
    expect(errorViolation?.message).toContain("regex timeout");

    // Restore
    jest.restoreAllMocks();
  });

  it("continues evaluating remaining rules after one fails", async () => {
    const mockRules = {
      "MD-001": jest.fn().mockResolvedValue([{
        ruleId: "MD-001",
        ruleVersion: "1.0.0",
        severity: "medium" as const,
        message: "Test violation",
        context: {},
      }]),
      "MD-002": jest.fn().mockRejectedValue(new Error("null ref")),
      "MD-003": jest.fn().mockResolvedValue([]),
    };

    jest.spyOn(require("../index"), "RULES", "get").mockReturnValue(mockRules);

    const result = await evaluateAllRules(mockInput);

    // Should have violations from MD-001 + error violation from MD-002
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.rulesEvaluated).toBe(2); // MD-001 and MD-003
    expect(result.rulesErrored).toBe(1); // MD-002
    expect(result.errors[0].ruleId).toBe("MD-002");

    // MD-003 was still evaluated (not short-circuited)
    expect(mockRules["MD-003"]).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it("wraps non-RuleEvaluationError throws in structured type", async () => {
    const mockRules = {
      "MD-004": jest.fn().mockRejectedValue(new Error("plain string error")),
    };

    jest.spyOn(require("../index"), "RULES", "get").mockReturnValue(mockRules);

    const result = await evaluateAllRules(mockInput);

    expect(result.errors[0]).toBeInstanceOf(RuleEvaluationError);
    expect(result.errors[0].ruleId).toBe("MD-004");
    expect(result.errors[0].phase).toBe("evaluate");
    expect(result.errors[0].message).toContain("plain string error");

    jest.restoreAllMocks();
  });

  it("preserves RuleEvaluationError if rule throws one directly", async () => {
    const structuredError = new RuleEvaluationError({
      ruleId: "MD-005",
      ruleVersion: "2.1.0",
      phase: "init",
      message: "missing config file",
    });

    const mockRules = {
      "MD-005": jest.fn().mockRejectedValue(structuredError),
    };

    jest.spyOn(require("../index"), "RULES", "get").mockReturnValue(mockRules);

    const result = await evaluateAllRules(mockInput);

    expect(result.errors[0].phase).toBe("init"); // preserved, not overwritten to "evaluate"
    expect(result.errors[0].ruleVersion).toBe("2.1.0");

    jest.restoreAllMocks();
  });

  it("all error violations have severity critical", async () => {
    const mockRules = {
      "MD-001": jest.fn().mockRejectedValue(new Error("err1")),
      "MD-002": jest.fn().mockRejectedValue(new Error("err2")),
      "MD-003": jest.fn().mockRejectedValue(new Error("err3")),
    };

    jest.spyOn(require("../index"), "RULES", "get").mockReturnValue(mockRules);

    const result = await evaluateAllRules(mockInput);

    expect(result.violations.length).toBeGreaterThanOrEqual(3);
    const errorViolations = result.violations.filter(v => v.context?.isEvaluationError);
    expect(errorViolations).toHaveLength(3);
    errorViolations.forEach((v) => {
      expect(v.severity).toBe("critical");
    });

    jest.restoreAllMocks();
  });
});

describe("makeDecision — error violations trigger block", () => {
  const { makeDecision } = require("../../policy/decision");

  it("blocks when error violation exists", () => {
    const violations: RuleViolation[] = [
      {
        ruleId: "MD-001",
        ruleVersion: "1.0.0",
        severity: "critical",
        message: "Rule MD-001 failed during evaluate: timeout",
        context: {
          isEvaluationError: true,
          phase: "evaluate",
        },
      },
    ];

    const decision = makeDecision(violations);

    expect(decision.outcome).toBe("block");
    expect(decision.reasons.join(" ")).toContain("rule evaluation error");
    expect(decision.reasons.join(" ")).toContain("MD-001");
  });

  it("passes when no violations exist", () => {
    const decision = makeDecision([]);
    expect(decision.outcome).toBe("pass");
  });

  it("distinguishes error violations from real violations in reason", () => {
    const violations: RuleViolation[] = [
      {
        ruleId: "MD-002",
        ruleVersion: "1.0.0",
        severity: "critical",
        message: "Rule failed",
        context: {
          isEvaluationError: true,
          phase: "evaluate",
        },
      },
      {
        ruleId: "MD-001",
        ruleVersion: "1.0.0",
        severity: "critical",
        message: "Real vulnerability",
        context: {
          file: "test.yml",
          line: 5,
        },
      },
    ];

    const decision = makeDecision(violations);

    expect(decision.outcome).toBe("block");
    const reasonText = decision.reasons.join(" ");
    expect(reasonText).toContain("2 critical");
    expect(reasonText).toContain("1 rule evaluation error");
  });
});
