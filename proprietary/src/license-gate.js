"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProLicenseRequiredError = void 0;
exports.requirePro = requirePro;
exports.hasPro = hasPro;
exports.hasFeature = hasFeature;
class ProLicenseRequiredError extends Error {
    code = 'PRO_LICENSE_REQUIRED';
    constructor(feature) {
        super(`Feature "${feature}" requires a Phase Mirror Pro license. ` +
            `The open-core provides full governance analysis with Tier A rules. ` +
            `Pro adds semantic rules, compliance packs, and cross-org calibration. ` +
            `Details: https://phasemirror.dev/pricing`);
        this.name = 'ProLicenseRequiredError';
    }
}
exports.ProLicenseRequiredError = ProLicenseRequiredError;
/**
 * Gate a Pro feature. Call at the top of every Pro rule/service.
 */
function requirePro(context, feature) {
    if (!context.license) {
        throw new ProLicenseRequiredError(feature);
    }
    if (new Date() > new Date(context.license.expiresAt)) {
        throw new ProLicenseRequiredError(`${feature} (license expired)`);
    }
}
/**
 * Check without throwing — for conditional feature display.
 */
function hasPro(context) {
    if (!context.license)
        return false;
    if (new Date() > new Date(context.license.expiresAt))
        return false;
    return true;
}
/**
 * Check for a specific Pro feature.
 */
function hasFeature(context, feature) {
    return hasPro(context) && (context.license?.features.includes(feature) ?? false);
}
//# sourceMappingURL=license-gate.js.map