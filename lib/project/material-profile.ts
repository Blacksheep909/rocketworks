/**
 * User-authored material values used by the browser's analytical mass and
 * structural preview. Values are intentionally stored in the same display
 * units used by the inspector so a portable project remains inspectable.
 *
 * These profiles are not material certificates. They are bounded inputs for
 * an engineering preview and retain an explicit user-supplied provenance
 * boundary when converted to the physics model.
 */
export const CUSTOM_MATERIAL_PROFILE_MODEL_VERSION =
  "rocketworks-custom-material-profile-0.1.0";

export const CUSTOM_MATERIAL_PROFILE_VALIDATION_STATUS =
  "user-supplied-unvalidated" as const;

export type CustomMaterialProfile = Readonly<{
  label: string;
  densityKgM3: number;
  wallThicknessMm: number;
  youngsModulusGPa: number;
  poissonRatio: number;
  allowableCompressionMPa: number;
  allowableBendingMPa: number;
  allowableShearMPa: number;
}>;

export type ResolvedMaterialModel = Readonly<{
  label: string;
  densityKgM3: number;
  wallThicknessM: number;
  youngsModulusPa: number;
  poissonRatio: number;
  allowableCompressionPa: number;
  allowableBendingPa: number;
  allowableShearPa: number;
  modelVersion?: string;
  validationStatus?: string;
  provenance?: Readonly<{
    sourceName: string;
    sourceKind: "representative-preview" | "user-supplied";
    licenseIdentifier: string;
    validationStatus: string;
  }>;
}>;

export const DEFAULT_CUSTOM_MATERIAL_PROFILE: CustomMaterialProfile = {
  label: "Custom engineering material",
  densityKgM3: 1_100,
  wallThicknessMm: 0.9,
  youngsModulusGPa: 12,
  poissonRatio: 0.3,
  allowableCompressionMPa: 55,
  allowableBendingMPa: 55,
  allowableShearMPa: 22,
};

const PROFILE_LIMITS = {
  densityKgM3: [50, 20_000],
  wallThicknessMm: [0.1, 20],
  youngsModulusGPa: [0.01, 500],
  poissonRatio: [0, 0.49],
  allowableCompressionMPa: [0.01, 2_000],
  allowableBendingMPa: [0.01, 2_000],
  allowableShearMPa: [0.01, 2_000],
} as const;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string, maximumLength = 120): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.trim().length > maximumLength) {
    throw new Error(`${label} must be at most ${maximumLength} characters.`);
  }
  return value.trim();
}

function boundedNumber(
  value: unknown,
  label: string,
  range: readonly [number, number],
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < range[0] || value > range[1]) {
    throw new Error(`${label} must be a finite number from ${range[0]} to ${range[1]}.`);
  }
  return value;
}

export function validateCustomMaterialProfile(
  value: unknown,
  label = "customMaterial",
): CustomMaterialProfile {
  const input = objectValue(value, label);
  const profile: CustomMaterialProfile = {
    label: nonEmptyString(input.label, `${label}.label`),
    densityKgM3: boundedNumber(input.densityKgM3, `${label}.densityKgM3`, PROFILE_LIMITS.densityKgM3),
    wallThicknessMm: boundedNumber(input.wallThicknessMm, `${label}.wallThicknessMm`, PROFILE_LIMITS.wallThicknessMm),
    youngsModulusGPa: boundedNumber(input.youngsModulusGPa, `${label}.youngsModulusGPa`, PROFILE_LIMITS.youngsModulusGPa),
    poissonRatio: boundedNumber(input.poissonRatio, `${label}.poissonRatio`, PROFILE_LIMITS.poissonRatio),
    allowableCompressionMPa: boundedNumber(input.allowableCompressionMPa, `${label}.allowableCompressionMPa`, PROFILE_LIMITS.allowableCompressionMPa),
    allowableBendingMPa: boundedNumber(input.allowableBendingMPa, `${label}.allowableBendingMPa`, PROFILE_LIMITS.allowableBendingMPa),
    allowableShearMPa: boundedNumber(input.allowableShearMPa, `${label}.allowableShearMPa`, PROFILE_LIMITS.allowableShearMPa),
  };
  return profile;
}

export function resolveCustomMaterialProfile(
  profile: CustomMaterialProfile,
): ResolvedMaterialModel {
  return {
    label: profile.label,
    densityKgM3: profile.densityKgM3,
    wallThicknessM: profile.wallThicknessMm / 1_000,
    youngsModulusPa: profile.youngsModulusGPa * 1e9,
    poissonRatio: profile.poissonRatio,
    allowableCompressionPa: profile.allowableCompressionMPa * 1e6,
    allowableBendingPa: profile.allowableBendingMPa * 1e6,
    allowableShearPa: profile.allowableShearMPa * 1e6,
    modelVersion: CUSTOM_MATERIAL_PROFILE_MODEL_VERSION,
    validationStatus: CUSTOM_MATERIAL_PROFILE_VALIDATION_STATUS,
    provenance: {
      sourceName: "User-authored RocketWorks material profile",
      sourceKind: "user-supplied",
      licenseIdentifier: "user-declared",
      validationStatus: CUSTOM_MATERIAL_PROFILE_VALIDATION_STATUS,
    },
  };
}

export function materialProfileLimits(): Readonly<typeof PROFILE_LIMITS> {
  return PROFILE_LIMITS;
}
