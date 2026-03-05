export declare class ProLicenseRequiredError extends Error {
    readonly code = "PRO_LICENSE_REQUIRED";
    constructor(feature: string);
}
export interface ProLicense {
    orgId: string;
    tier: 'pro' | 'enterprise';
    features: string[];
    expiresAt: Date;
    seats: number;
}
export interface LicenseContext {
    license?: ProLicense | null;
}
/**
 * Gate a Pro feature. Call at the top of every Pro rule/service.
 */
export declare function requirePro(context: LicenseContext, feature: string): void;
/**
 * Check without throwing — for conditional feature display.
 */
export declare function hasPro(context: LicenseContext): boolean;
/**
 * Check for a specific Pro feature.
 */
export declare function hasFeature(context: LicenseContext, feature: string): boolean;
