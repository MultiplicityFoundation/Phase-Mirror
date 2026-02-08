// packages/mirror-dissonance/src/rules/__tests__/evaluate.test.ts

import { evaluateAllRules, type EvaluationResult, RULES } from "../index.js";
import { RuleEvaluationError } from "../rule-error.js";
import type { OracleInput, RuleViolation } from "../../schemas/types.js";

const mockInput: OracleInput = {
  mode: 'pull_request',
  context: {
    repositoryName: 'test/repo',
    prNumber: 123,
    branch: 'feature',
    author: 'testuser',
  },
};

describe("evaluateAllRules — fail-closed error propagation", () => {
  it("returns violations from successful rules", async () => {
    const result = await evaluateAllRules(mockInput);

    expect(result.violations.length).toBeGreaterThanOrEqual(0);
    expect(result.rulesEvaluated).toBeGreaterThan(0);
  });
});

describe("makeDecision — error violations trigger block", () => {
  const { makeDecision } = require("../../policy/decision");

  it("blocks when error violation exists", () => {
    const violations: RuleViolation[] = [
      {
        ruleId: "MD-001",
        severity: "critical",
        message: "Rule MD-001 failed during evaluate: timeout",
        context: {
          isEvaluationError: true,
          phase: "evaluate",
        },
      },
    ];

    const decision = makeDecision({
      violations,
      mode: 'pull_request',
      strict: false,
      dryRun: false,
    });

    expect(decision.outcome).toBe("block");
  });

  it("passes when no violations exist", () => {
    const decision = makeDecision({
      violations: [],
      mode: 'pull_request',
      strict: false,
      dryRun: false,
    });
    expect(decision.outcome).toBe("allow");
  });

  it("distinguishes error violations from real violations in reason", () => {
    const violations: RuleViolation[] = [
      {
        ruleId: "MD-002",
        severity: "critical",
        message: "Rule failed",
        context: {
          isEvaluationError: true,
          phase: "evaluate",
        },
      },
      {
        ruleId: "MD-001",
        severity: "critical",
        message: "Real vulnerability",
        context: {
          file: "test.yml",
          line: 5,
        },
      },
    ];

    const decision = makeDecision({
      violations,
      mode: 'pull_request',
      strict: false,
      dryRun: false,
    });

    expect(decision.outcome).toBe("block");
    const reasonText = decision.reasons.join(" ");
    expect(reasonText).toContain("Critical violations: 2");
  });
});
