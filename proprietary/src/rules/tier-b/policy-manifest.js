"use strict";
/**
 * Organization Policy Manifest
 *
 * Declares expected governance posture per repository or per-group.
 * MD-101 compares actual repo state against this manifest to detect gaps.
 *
 * @license Phase Mirror Pro License v1.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveExpectationsForRepo = resolveExpectationsForRepo;
exports.matchesRepo = matchesRepo;
exports.matchGlob = matchGlob;
exports.validateManifest = validateManifest;
// ─── Manifest Utilities ──────────────────────────────────────────────
/**
 * Resolve which expectations apply to a specific repo.
 * Priority: classification overrides > defaults, minus exemptions.
 */
function resolveExpectationsForRepo(manifest, repoName, repoMeta) {
    // Start with defaults
    let expectations = [...manifest.defaults];
    // Find matching classifications
    for (const classification of manifest.classifications) {
        if (matchesRepo(classification.match, repoName, repoMeta)) {
            // Classification expectations ADD to defaults (not replace)
            expectations = [...expectations, ...classification.expectations];
        }
    }
    // Remove exempted expectations
    const activeExemptions = manifest.exemptions.filter(e => {
        if (e.repo !== repoName)
            return false;
        // Check if exemption has expired
        if (new Date(e.expiresAt) < new Date())
            return false;
        return true;
    });
    const exemptedIds = new Set(activeExemptions.flatMap(e => e.expectationIds));
    expectations = expectations.filter(e => !exemptedIds.has(e.id));
    // Deduplicate by ID (later entries win)
    const deduped = new Map();
    for (const exp of expectations) {
        deduped.set(exp.id, exp);
    }
    return {
        expectations: Array.from(deduped.values()),
        exemptions: activeExemptions,
    };
}
/**
 * Check if a repo matches the given matcher criteria.
 */
function matchesRepo(matcher, repoName, meta) {
    // Explicit repo list
    if (matcher.repos && matcher.repos.includes(repoName))
        return true;
    // Pattern matching
    if (matcher.patterns) {
        for (const pattern of matcher.patterns) {
            if (matchGlob(pattern, repoName))
                return true;
        }
    }
    if (!meta)
        return false;
    // Topic matching
    if (matcher.topics && meta.topics) {
        if (matcher.topics.some(t => meta.topics.includes(t)))
            return true;
    }
    // Language matching
    if (matcher.languages && meta.language) {
        if (matcher.languages.includes(meta.language))
            return true;
    }
    // Visibility matching
    if (matcher.visibility && meta.visibility === matcher.visibility)
        return true;
    // Archive matching
    if (matcher.archived !== undefined && meta.archived === matcher.archived)
        return true;
    return false;
}
/**
 * Simple glob matching: supports * as wildcard, ? as single-char wildcard.
 */
function matchGlob(pattern, value) {
    const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(value);
}
/**
 * Validate a policy manifest for completeness.
 */
function validateManifest(manifest) {
    const errors = [];
    const warnings = [];
    if (!manifest.schemaVersion)
        errors.push('Missing schemaVersion');
    if (!manifest.orgId)
        errors.push('Missing orgId');
    if (!manifest.updatedAt)
        errors.push('Missing updatedAt');
    if (!manifest.approvedBy)
        errors.push('Missing approvedBy');
    // Check for duplicate expectation IDs
    const allExpectationIds = new Set();
    const allExpectations = [
        ...manifest.defaults,
        ...manifest.classifications.flatMap(c => c.expectations),
    ];
    for (const exp of allExpectations) {
        if (allExpectationIds.has(exp.id)) {
            warnings.push(`Duplicate expectation ID: ${exp.id}`);
        }
        allExpectationIds.add(exp.id);
    }
    // Check exemptions reference valid expectation IDs
    for (const exemption of manifest.exemptions) {
        for (const id of exemption.expectationIds) {
            if (!allExpectationIds.has(id)) {
                errors.push(`Exemption for ${exemption.repo} references unknown expectation: ${id}`);
            }
        }
        if (!exemption.reason) {
            errors.push(`Exemption for ${exemption.repo} missing required reason`);
        }
        if (!exemption.expiresAt) {
            errors.push(`Exemption for ${exemption.repo} missing expiration date`);
        }
        else if (new Date(exemption.expiresAt) < new Date()) {
            warnings.push(`Exemption for ${exemption.repo} has expired (${exemption.expiresAt})`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=policy-manifest.js.map