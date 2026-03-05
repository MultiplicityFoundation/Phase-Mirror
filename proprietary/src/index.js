"use strict";
/**
 * @phase-mirror/pro — Phase Mirror Pro Extensions
 *
 * Requires a valid Phase Mirror Pro license for production use.
 * @license SEE LICENSE IN LICENSE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrgContext = exports.loadCachedOrgState = exports.persistOrgState = exports.fetchLiveOrgState = exports.RateLimitError = exports.NotFoundError = exports.DynamoDBGovernanceCache = exports.GitHubClient = exports.validateManifest = exports.resolveExpectationsForRepo = exports.evaluateMD102Federated = exports.tierBRules = exports.MD102 = exports.MD101 = exports.MD100 = exports.mergeQueueTrustChainBreak = exports.crossRepoProtectionGap = exports.semanticJobDrift = exports.ProLicenseRequiredError = exports.hasFeature = exports.hasPro = exports.requirePro = void 0;
var license_gate_js_1 = require("./license-gate.js");
Object.defineProperty(exports, "requirePro", { enumerable: true, get: function () { return license_gate_js_1.requirePro; } });
Object.defineProperty(exports, "hasPro", { enumerable: true, get: function () { return license_gate_js_1.hasPro; } });
Object.defineProperty(exports, "hasFeature", { enumerable: true, get: function () { return license_gate_js_1.hasFeature; } });
Object.defineProperty(exports, "ProLicenseRequiredError", { enumerable: true, get: function () { return license_gate_js_1.ProLicenseRequiredError; } });
// Tier B rules
var MD_100_js_1 = require("./rules/tier-b/MD-100.js");
Object.defineProperty(exports, "semanticJobDrift", { enumerable: true, get: function () { return MD_100_js_1.rule; } });
var MD_101_js_1 = require("./rules/tier-b/MD-101.js");
Object.defineProperty(exports, "crossRepoProtectionGap", { enumerable: true, get: function () { return MD_101_js_1.rule; } });
var MD_102_js_1 = require("./rules/tier-b/MD-102.js");
Object.defineProperty(exports, "mergeQueueTrustChainBreak", { enumerable: true, get: function () { return MD_102_js_1.rule; } });
var index_js_1 = require("./rules/tier-b/index.js");
Object.defineProperty(exports, "MD100", { enumerable: true, get: function () { return index_js_1.MD100; } });
Object.defineProperty(exports, "MD101", { enumerable: true, get: function () { return index_js_1.MD101; } });
Object.defineProperty(exports, "MD102", { enumerable: true, get: function () { return index_js_1.MD102; } });
Object.defineProperty(exports, "tierBRules", { enumerable: true, get: function () { return index_js_1.tierBRules; } });
var MD_102_federated_js_1 = require("./rules/tier-b/MD-102-federated.js");
Object.defineProperty(exports, "evaluateMD102Federated", { enumerable: true, get: function () { return MD_102_federated_js_1.evaluateMD102Federated; } });
var policy_manifest_js_1 = require("./rules/tier-b/policy-manifest.js");
Object.defineProperty(exports, "resolveExpectationsForRepo", { enumerable: true, get: function () { return policy_manifest_js_1.resolveExpectationsForRepo; } });
Object.defineProperty(exports, "validateManifest", { enumerable: true, get: function () { return policy_manifest_js_1.validateManifest; } });
var org_aggregator_js_1 = require("./federation/org-aggregator.js");
Object.defineProperty(exports, "GitHubClient", { enumerable: true, get: function () { return org_aggregator_js_1.GitHubClient; } });
Object.defineProperty(exports, "DynamoDBGovernanceCache", { enumerable: true, get: function () { return org_aggregator_js_1.DynamoDBGovernanceCache; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return org_aggregator_js_1.NotFoundError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return org_aggregator_js_1.RateLimitError; } });
Object.defineProperty(exports, "fetchLiveOrgState", { enumerable: true, get: function () { return org_aggregator_js_1.fetchLiveOrgState; } });
Object.defineProperty(exports, "persistOrgState", { enumerable: true, get: function () { return org_aggregator_js_1.persistOrgState; } });
Object.defineProperty(exports, "loadCachedOrgState", { enumerable: true, get: function () { return org_aggregator_js_1.loadCachedOrgState; } });
Object.defineProperty(exports, "buildOrgContext", { enumerable: true, get: function () { return org_aggregator_js_1.buildOrgContext; } });
// Production infrastructure (uncomment as implemented)
// export { DynamoDBFPStore } from './infra/fp-store/dynamodb';
// export { RedisFPStore } from './infra/fp-store/redis';
// export { DynamoDBBlockCounter } from './infra/block-counter/dynamodb';
// Compliance packs (uncomment as implemented)
// export { soc2Pack } from './compliance/soc2';
// export { hipaaPack } from './compliance/hipaa';
// Calibration (uncomment as implemented)
// export { CalibrationAggregator } from './calibration/aggregator';
// export { MultiTenantConsent } from './calibration/consent';
//# sourceMappingURL=index.js.map