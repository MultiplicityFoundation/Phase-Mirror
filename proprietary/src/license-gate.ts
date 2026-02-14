export class ProLicenseRequiredError extends Error {
  readonly code = 'PRO_LICENSE_REQUIRED';

  constructor(feature: string) {
    super(
      `Feature "${feature}" requires a Phase Mirror Pro license. ` +
      `The open-core provides full governance analysis with Tier A rules. ` +
      `Pro adds semantic rules, compliance packs, and cross-org calibration. ` +
      `Details: https://phasemirror.dev/pricing`
    );
    this.name = 'ProLicenseRequiredError';
  }
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
export function requirePro(context: LicenseContext, feature: string): void {
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
export function hasPro(context: LicenseContext): boolean {
  if (!context.license) return false;
  if (new Date() > new Date(context.license.expiresAt)) return false;
  return true;
}

/**
 * Check for a specific Pro feature.
 */
export function hasFeature(context: LicenseContext, feature: string): boolean {
  return hasPro(context) && (context.license?.features.includes(feature) ?? false);
}
