import {
  gravityAtAltitude,
  standardAtmosphere,
  type AtmosphereState,
} from "./atmosphere.ts";
import type {
  AerodynamicCoefficientUncertainty,
  AerodynamicDataProvenance,
} from "./aerodynamic-coefficients.ts";
import type {
  PropulsionLoadEvaluation,
  PropulsionLoadProvider,
} from "./clustered-propulsion.ts";
import {
  interpolateWind,
  thrustAt,
  validateThrustCurve,
  validateWindProfile,
  type ThrustPoint,
  type WindLayer,
} from "./curves.ts";
import type { LaunchEnvironmentProvider } from "./launch-environment.ts";
import {
  ZERO_VECTOR,
  addVectors,
  cross,
  dot,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import {
  quaternionFromAxisAngle,
  rigidBodyPropertiesAt,
  rotateWorldToBody,
  type Quaternion,
  type RigidBodyLoads,
  type RigidBodyModel,
  type RigidBodyState,
} from "./six-dof.ts";

export const PRELIMINARY_ROCKET_LOAD_MODEL_VERSION =
  "kestrel-rocket-loads-0.3.1";

export type RocketLoadApplicabilityCode =
  | "LOW_AIRSPEED"
  | "NON_FORWARD_FLOW"
  | "ANGLE_OF_ATTACK_LIMIT"
  | "MACH_LIMIT"
  | "FIXED_DRAG_COEFFICIENT"
  | "AERODYNAMIC_DAMPING_OMITTED"
  | "AERODYNAMIC_DAMPING_DESTABILIZING"
  | "STAGE_SEPARATION_PROXIMITY"
  | "AERODYNAMIC_TABLE_MACH_RANGE"
  | "AERODYNAMIC_TABLE_REYNOLDS_RANGE"
  | "AERODYNAMIC_TABLE_ANGLE_RANGE"
  | "AERODYNAMIC_FORCE_MOMENT_DATABASE"
  | "COEFFICIENT_UNCERTAINTY_PRESENT";

export type RocketLoadApplicabilityIssue = Readonly<{
  code: RocketLoadApplicabilityCode;
  severity: "info" | "caution" | "unsupported";
  explanation: string;
}>;

export type PreliminaryAerodynamicState = Readonly<{
  referenceAreaM2: number;
  dragCoefficient: number;
  normalForceSlopePerRad: number;
  centerOfPressureMinusCenterOfMassM: number;
  maximumNormalForceMach?: number;
  maximumNormalForceAngleRad?: number;
  minimumNormalForceAirspeedMps?: number;
  modelVersion?: string;
  activeStageIds?: readonly string[];
  centerOfPressureXM?: number;
  centerOfMassXM?: number;
  staticMarginCalibers?: number;
  coefficientBasis?:
    | "constant"
    | "mach-reynolds-table"
    | "mach-reynolds-angle-table"
    | "mach-reynolds-force-moment-table";
  reynoldsNumber?: number;
  dampingDerivativeBody?: Vector3;
  dampingReferenceLengthBodyM?: Vector3;
  forceCoefficientBody?: Vector3;
  momentCoefficientBody?: Vector3;
  momentReferenceLengthBodyM?: Vector3;
  coefficientUncertainty?: AerodynamicCoefficientUncertainty;
  coefficientProvenance?: AerodynamicDataProvenance;
  applicability?: readonly RocketLoadApplicabilityIssue[];
}>;

export type PreliminaryAerodynamicCondition = Readonly<{
  atmosphere: AtmosphereState;
  windWorldMps: Vector3;
  airRelativeVelocityWorldMps: Vector3;
  airRelativeVelocityBodyMps: Vector3;
  airspeedMps: number;
  forwardAirspeedBodyMps: number;
  angleOfAttackRad: number;
  sideslipRad: number;
  mach: number;
  dynamicPressurePa: number;
}>;

export type PreliminaryAerodynamicStateProvider = (
  state: RigidBodyState,
  condition: PreliminaryAerodynamicCondition,
) => PreliminaryAerodynamicState;

export type PreliminaryRocketLoadConfig = Readonly<{
  body: RigidBodyModel;
  thrustCurve?: readonly ThrustPoint[];
  thrustAtTimeS?: (timeS: number) => number;
  propulsion?: PropulsionLoadProvider;
  launchAltitudeM?: number;
  windProfile?: readonly WindLayer[];
  environmentAt?: LaunchEnvironmentProvider;
  thrustAxisBody?: Vector3;
  referenceAreaM2?: number;
  dragCoefficient?: number;
  normalForceSlopePerRad?: number;
  centerOfPressureMinusCenterOfMassM?: number;
  aerodynamicsAt?: PreliminaryAerodynamicStateProvider;
  maximumNormalForceMach?: number;
  maximumNormalForceAngleRad?: number;
  minimumNormalForceAirspeedMps?: number;
}>;

export type PreliminaryRocketLoadDiagnostics = Readonly<{
  altitudeAglM: number;
  altitudeAslM: number;
  densityKgM3: number;
  speedOfSoundMps: number;
  dynamicViscosityPaS: number;
  environmentModelVersion: string | null;
  windWorldMps: Vector3;
  meanWindWorldMps: Vector3;
  turbulenceWindWorldMps: Vector3;
  discreteGustWindWorldMps: Vector3;
  activeGustIds: readonly string[];
  airRelativeVelocityWorldMps: Vector3;
  airRelativeVelocityBodyMps: Vector3;
  airspeedMps: number;
  forwardAirspeedBodyMps: number;
  angleOfAttackRad: number;
  sideslipRad: number;
  mach: number;
  dynamicPressurePa: number;
  thrustN: number;
  propulsionForceBodyN: Vector3;
  propulsionMomentBodyNm: Vector3;
  gravityN: number;
  dragN: number;
  normalForceN: number;
  normalForceApplied: boolean;
  aerodynamicDampingMomentBodyNm: Vector3;
  aerodynamicModelVersion: string | null;
  activeStageIds: readonly string[];
  referenceAreaM2: number;
  dragCoefficient: number;
  normalForceSlopePerRad: number;
  centerOfPressureMinusCenterOfMassM: number;
  centerOfPressureXM: number | null;
  centerOfMassXM: number | null;
  staticMarginCalibers: number | null;
  coefficientBasis:
    | "constant"
    | "mach-reynolds-table"
    | "mach-reynolds-angle-table"
    | "mach-reynolds-force-moment-table"
    | null;
  reynoldsNumber: number | null;
  dampingDerivativeBody: Vector3 | null;
  dampingReferenceLengthBodyM: Vector3 | null;
  directForceCoefficientBody: Vector3 | null;
  directMomentCoefficientBody: Vector3 | null;
  directForceApplied: boolean;
  directMomentApplied: boolean;
  coefficientUncertainty: AerodynamicCoefficientUncertainty | null;
  coefficientProvenance: AerodynamicDataProvenance | null;
  applicability: readonly RocketLoadApplicabilityIssue[];
}>;

export type PreliminaryRocketLoadEvaluation = Readonly<{
  loads: RigidBodyLoads;
  diagnostics: PreliminaryRocketLoadDiagnostics;
}>;

export type PreliminaryRocketLoadModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  evaluate: (state: RigidBodyState) => PreliminaryRocketLoadEvaluation;
  loads: (state: RigidBodyState) => RigidBodyLoads;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function normalizedVector(value: Vector3, label: string): Vector3 {
  const vectorMagnitude = magnitude(value);
  if (!(vectorMagnitude > 0) || !Number.isFinite(vectorMagnitude)) {
    throw new Error(`${label} must be a finite non-zero vector`);
  }
  return scaleVector(value, 1 / vectorMagnitude);
}

/**
 * Body +x follows geometry from nose toward tail, so the nose/forward direction
 * is body -x. This attitude maps body -x to ENU +up.
 */
export function verticalLaunchOrientationBodyToEnu(): Quaternion {
  return quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
}

export function createPreliminaryRocketLoadModel(
  config: PreliminaryRocketLoadConfig,
): PreliminaryRocketLoadModel {
  const thrustCurve = [...(config.thrustCurve ?? [])];
  const windProfile = [...(config.windProfile ?? [])];
  if (
    config.environmentAt &&
    (config.launchAltitudeM !== undefined || config.windProfile !== undefined)
  ) {
    throw new Error(
      "launch environment provider cannot be combined with launch altitude or wind profile",
    );
  }
  const propulsionSourceCount = [
    config.thrustCurve,
    config.thrustAtTimeS,
    config.propulsion,
  ].filter((source) => source !== undefined).length;
  if (propulsionSourceCount !== 1) {
    throw new Error(
      "provide exactly one thrust curve, scalar thrust provider, or propulsion load provider",
    );
  }
  if (config.thrustCurve) validateThrustCurve(thrustCurve);
  validateWindProfile(windProfile);
  const staticAerodynamicValues = [
    config.referenceAreaM2,
    config.dragCoefficient,
    config.normalForceSlopePerRad,
    config.centerOfPressureMinusCenterOfMassM,
  ];
  const suppliedStaticAerodynamicValues = staticAerodynamicValues.filter(
    (value) => value !== undefined,
  ).length;
  if (
    (config.aerodynamicsAt && suppliedStaticAerodynamicValues > 0) ||
    (!config.aerodynamicsAt && suppliedStaticAerodynamicValues !== 4)
  ) {
    throw new Error(
      "provide either one dynamic aerodynamics provider or all four static aerodynamic values",
    );
  }
  if (!config.aerodynamicsAt) {
    assertPositive(config.referenceAreaM2!, "reference area");
    assertPositive(config.dragCoefficient!, "drag coefficient");
    assertPositive(config.normalForceSlopePerRad!, "normal-force slope");
    if (!Number.isFinite(config.centerOfPressureMinusCenterOfMassM)) {
      throw new Error("center-of-pressure offset must be finite");
    }
  }
  const launchAltitudeM = config.launchAltitudeM ?? 0;
  if (!Number.isFinite(launchAltitudeM)) {
    throw new Error("launch altitude must be finite");
  }
  const thrustAxisBody = normalizedVector(
    config.thrustAxisBody ?? { x: -1, y: 0, z: 0 },
    "thrust axis",
  );
  if (config.propulsion && config.thrustAxisBody) {
    throw new Error(
      "thrust axis cannot be supplied with a propulsion load provider",
    );
  }
  const configuredMaximumNormalForceMach = config.maximumNormalForceMach ?? 0.3;
  const configuredMaximumNormalForceAngleRad =
    config.maximumNormalForceAngleRad ?? (10 * Math.PI) / 180;
  const configuredMinimumNormalForceAirspeedMps =
    config.minimumNormalForceAirspeedMps ?? 1;
  assertPositive(configuredMaximumNormalForceMach, "maximum normal-force Mach number");
  assertPositive(configuredMaximumNormalForceAngleRad, "maximum normal-force angle");
  assertPositive(configuredMinimumNormalForceAirspeedMps, "minimum normal-force airspeed");

  const evaluate = (state: RigidBodyState): PreliminaryRocketLoadEvaluation => {
    const body = rigidBodyPropertiesAt(config.body, state);
    const providedEnvironment = config.environmentAt?.(state);
    const altitudeAglM =
      providedEnvironment?.altitudeAglM ?? state.positionWorldM.z;
    const altitudeAslM =
      providedEnvironment?.altitudeAslM ?? launchAltitudeM + altitudeAglM;
    const atmosphere =
      providedEnvironment?.atmosphere ?? standardAtmosphere(altitudeAslM);
    const wind = providedEnvironment
      ? null
      : interpolateWind(windProfile, altitudeAglM);
    const windWorldMps: Vector3 = providedEnvironment?.windWorldMps ?? {
      x: wind!.eastMps,
      y: wind!.northMps,
      z: wind!.upMps,
    };
    const meanWindWorldMps =
      providedEnvironment?.meanWindWorldMps ?? windWorldMps;
    const turbulenceWindWorldMps =
      providedEnvironment?.turbulenceWindWorldMps ?? ZERO_VECTOR;
    const discreteGustWindWorldMps =
      providedEnvironment?.discreteGustWindWorldMps ?? ZERO_VECTOR;
    const airRelativeVelocityWorldMps = subtractVectors(
      state.velocityWorldMps,
      windWorldMps,
    );
    const airRelativeVelocityBodyMps = rotateWorldToBody(
      state.orientationBodyToWorld,
      airRelativeVelocityWorldMps,
    );
    const airspeedMps = magnitude(airRelativeVelocityBodyMps);
    const forwardAirspeedBodyMps = -airRelativeVelocityBodyMps.x;
    const transverseAirspeedMps = Math.hypot(
      airRelativeVelocityBodyMps.y,
      airRelativeVelocityBodyMps.z,
    );
    const angleOfAttackRad =
      airspeedMps > 1e-12
        ? Math.atan2(transverseAirspeedMps, forwardAirspeedBodyMps)
        : 0;
    const sideslipRad =
      airspeedMps > 1e-12
        ? Math.asin(
            Math.min(
              1,
              Math.max(-1, airRelativeVelocityBodyMps.y / airspeedMps),
            ),
          )
        : 0;
    const mach = airspeedMps / atmosphere.speedOfSoundMps;
    const dynamicPressurePa =
      0.5 * atmosphere.densityKgM3 * airspeedMps * airspeedMps;
    const aerodynamicCondition: PreliminaryAerodynamicCondition = {
      atmosphere,
      windWorldMps,
      airRelativeVelocityWorldMps,
      airRelativeVelocityBodyMps,
      airspeedMps,
      forwardAirspeedBodyMps,
      angleOfAttackRad,
      sideslipRad,
      mach,
      dynamicPressurePa,
    };
    const aerodynamics: PreliminaryAerodynamicState = config.aerodynamicsAt
      ? config.aerodynamicsAt(state, aerodynamicCondition)
      : {
          referenceAreaM2: config.referenceAreaM2!,
          dragCoefficient: config.dragCoefficient!,
          normalForceSlopePerRad: config.normalForceSlopePerRad!,
          centerOfPressureMinusCenterOfMassM:
            config.centerOfPressureMinusCenterOfMassM!,
        };
    assertPositive(aerodynamics.referenceAreaM2, "dynamic reference area");
    assertPositive(aerodynamics.dragCoefficient, "dynamic drag coefficient");
    assertPositive(
      aerodynamics.normalForceSlopePerRad,
      "dynamic normal-force slope",
    );
    if (!Number.isFinite(aerodynamics.centerOfPressureMinusCenterOfMassM)) {
      throw new Error("dynamic center-of-pressure offset must be finite");
    }
    const maximumNormalForceMach =
      aerodynamics.maximumNormalForceMach ?? configuredMaximumNormalForceMach;
    const maximumNormalForceAngleRad =
      aerodynamics.maximumNormalForceAngleRad ??
      configuredMaximumNormalForceAngleRad;
    const minimumNormalForceAirspeedMps =
      aerodynamics.minimumNormalForceAirspeedMps ??
      configuredMinimumNormalForceAirspeedMps;
    assertPositive(maximumNormalForceMach, "dynamic maximum normal-force Mach number");
    assertPositive(maximumNormalForceAngleRad, "dynamic maximum normal-force angle");
    assertPositive(minimumNormalForceAirspeedMps, "dynamic minimum normal-force airspeed");
    const applicability: RocketLoadApplicabilityIssue[] = [
      ...(aerodynamics.applicability ?? []),
    ];
    const hasDirectForceCoefficients = aerodynamics.forceCoefficientBody !== undefined;
    if ((aerodynamics.coefficientBasis ?? "constant") === "constant") {
      applicability.push({
        code: "FIXED_DRAG_COEFFICIENT",
        severity: "info",
        explanation:
          "Drag uses the supplied constant coefficient without Reynolds or Mach variation.",
      });
    }
    if (airspeedMps < minimumNormalForceAirspeedMps) {
      applicability.push({
        code: "LOW_AIRSPEED",
        severity: "info",
        explanation: "Normal force is disabled below the configured airspeed threshold.",
      });
    }
    if (forwardAirspeedBodyMps <= 0) {
      applicability.push({
        code: "NON_FORWARD_FLOW",
        severity: "unsupported",
        explanation:
          "The low-angle normal-force relation is disabled when flow is not nose-first.",
      });
    }
    if (!hasDirectForceCoefficients && angleOfAttackRad > maximumNormalForceAngleRad) {
      applicability.push({
        code: "ANGLE_OF_ATTACK_LIMIT",
        severity: "unsupported",
        explanation:
          "Angle of attack exceeds the configured small-angle limit; normal force is bounded at that limit.",
      });
    }
    if (!hasDirectForceCoefficients && mach > maximumNormalForceMach) {
      applicability.push({
        code: "MACH_LIMIT",
        severity: "unsupported",
        explanation:
          "The low-speed normal-force relation is disabled above its configured Mach limit.",
      });
    }

    const directForceCoefficientBody = aerodynamics.forceCoefficientBody;
    const directMomentCoefficientBody = aerodynamics.momentCoefficientBody;
    if (
      directForceCoefficientBody &&
      ![
        directForceCoefficientBody.x,
        directForceCoefficientBody.y,
        directForceCoefficientBody.z,
      ].every(Number.isFinite)
    ) {
      throw new Error("direct aerodynamic force coefficients must be finite");
    }
    if (
      directMomentCoefficientBody &&
      ![
        directMomentCoefficientBody.x,
        directMomentCoefficientBody.y,
        directMomentCoefficientBody.z,
      ].every(Number.isFinite)
    ) {
      throw new Error("direct aerodynamic moment coefficients must be finite");
    }
    const momentReferenceLengthBodyM = aerodynamics.momentReferenceLengthBodyM;
    if (directMomentCoefficientBody && !momentReferenceLengthBodyM) {
      throw new Error(
        "direct aerodynamic moment coefficients require reference lengths",
      );
    }
    if (
      momentReferenceLengthBodyM &&
      ![
        momentReferenceLengthBodyM.x,
        momentReferenceLengthBodyM.y,
        momentReferenceLengthBodyM.z,
      ].every((value) => Number.isFinite(value) && value > 0)
    ) {
      throw new Error(
        "direct aerodynamic moment reference lengths must be positive and finite",
      );
    }
    const directForceApplied =
      directForceCoefficientBody !== undefined &&
      airspeedMps >= minimumNormalForceAirspeedMps &&
      forwardAirspeedBodyMps > 0;
    const directMomentApplied =
      directMomentCoefficientBody !== undefined &&
      airspeedMps >= minimumNormalForceAirspeedMps &&
      forwardAirspeedBodyMps > 0;
    let dragN: number;
    let dragBodyN: Vector3;
    let normalForceApplied: boolean;
    let normalForceN: number;
    let normalBodyN: Vector3;
    let aerodynamicForceBodyN: Vector3;
    if (directForceApplied) {
      const directForceBodyN = scaleVector(
        directForceCoefficientBody!,
        dynamicPressurePa * aerodynamics.referenceAreaM2,
      );
      const airRelativeUnitBody = scaleVector(
        airRelativeVelocityBodyMps,
        1 / airspeedMps,
      );
      const axialForceN = dot(directForceBodyN, airRelativeUnitBody);
      dragN = Math.max(0, -axialForceN);
      dragBodyN = scaleVector(airRelativeUnitBody, -dragN);
      normalBodyN = subtractVectors(
        directForceBodyN,
        scaleVector(airRelativeUnitBody, axialForceN),
      );
      normalForceN = magnitude(normalBodyN);
      normalForceApplied = true;
      aerodynamicForceBodyN = directForceBodyN;
    } else {
      dragN =
        dynamicPressurePa *
        aerodynamics.dragCoefficient *
        aerodynamics.referenceAreaM2;
      dragBodyN =
        airspeedMps > 1e-12
          ? scaleVector(airRelativeVelocityBodyMps, -dragN / airspeedMps)
          : ZERO_VECTOR;
      normalForceApplied =
        airspeedMps >= minimumNormalForceAirspeedMps &&
        forwardAirspeedBodyMps > 0 &&
        mach <= maximumNormalForceMach;
      const boundedAngleRad = Math.min(
        angleOfAttackRad,
        maximumNormalForceAngleRad,
      );
      normalForceN = normalForceApplied
        ? dynamicPressurePa *
          aerodynamics.referenceAreaM2 *
          aerodynamics.normalForceSlopePerRad *
          boundedAngleRad
        : 0;
      normalBodyN =
        normalForceN > 0 && transverseAirspeedMps > 1e-12
          ? {
              x: 0,
              y:
                (-normalForceN * airRelativeVelocityBodyMps.y) /
                transverseAirspeedMps,
              z:
                (-normalForceN * airRelativeVelocityBodyMps.z) /
                transverseAirspeedMps,
            }
          : ZERO_VECTOR;
      aerodynamicForceBodyN = addVectors(dragBodyN, normalBodyN);
    }
    const aerodynamicMomentBodyNm = directMomentApplied
      ? {
          x:
            dynamicPressurePa *
            aerodynamics.referenceAreaM2 *
            directMomentCoefficientBody!.x *
            momentReferenceLengthBodyM!.x,
          y:
            dynamicPressurePa *
            aerodynamics.referenceAreaM2 *
            directMomentCoefficientBody!.y *
            momentReferenceLengthBodyM!.y,
          z:
            dynamicPressurePa *
            aerodynamics.referenceAreaM2 *
            directMomentCoefficientBody!.z *
            momentReferenceLengthBodyM!.z,
        }
      : cross(
          {
            x: aerodynamics.centerOfPressureMinusCenterOfMassM,
            y: 0,
            z: 0,
          },
          normalBodyN,
        );
    const hasDampingDerivatives =
      aerodynamics.dampingDerivativeBody !== undefined;
    const hasDampingLengths =
      aerodynamics.dampingReferenceLengthBodyM !== undefined;
    if (hasDampingDerivatives !== hasDampingLengths) {
      throw new Error(
        "aerodynamic damping derivatives and reference lengths must be supplied together",
      );
    }
    let aerodynamicDampingMomentBodyNm: Vector3 = ZERO_VECTOR;
    if (
      aerodynamics.dampingDerivativeBody &&
      aerodynamics.dampingReferenceLengthBodyM
    ) {
      const derivatives = aerodynamics.dampingDerivativeBody;
      const lengths = aerodynamics.dampingReferenceLengthBodyM;
      if (
        ![derivatives.x, derivatives.y, derivatives.z].every(Number.isFinite) ||
        ![lengths.x, lengths.y, lengths.z].every(
          (value) => Number.isFinite(value) && value > 0,
        )
      ) {
        throw new Error(
          "aerodynamic damping requires finite derivatives and positive reference lengths",
        );
      }
      if (airspeedMps > 1e-12) {
        const scale =
          (dynamicPressurePa * aerodynamics.referenceAreaM2) /
          (2 * airspeedMps);
        aerodynamicDampingMomentBodyNm = {
          x:
            scale *
            derivatives.x *
            state.angularVelocityBodyRadS.x *
            lengths.x ** 2,
          y:
            scale *
            derivatives.y *
            state.angularVelocityBodyRadS.y *
            lengths.y ** 2,
          z:
            scale *
            derivatives.z *
            state.angularVelocityBodyRadS.z *
            lengths.z ** 2,
        };
      }
      if ([derivatives.x, derivatives.y, derivatives.z].some((value) => value > 0)) {
        applicability.push({
          code: "AERODYNAMIC_DAMPING_DESTABILIZING",
          severity: "caution",
          explanation:
            "At least one supplied rotational derivative reinforces rather than damps positive body rate under RocketWorks' sign convention.",
        });
      }
    } else {
      applicability.push({
        code: "AERODYNAMIC_DAMPING_OMITTED",
        severity: "caution",
        explanation:
          "Pitch, yaw, and roll damping derivatives are not included in this load model.",
      });
    }
    const propulsion: PropulsionLoadEvaluation = config.propulsion
      ? config.propulsion(state)
      : (() => {
          const thrustN = config.thrustAtTimeS
            ? config.thrustAtTimeS(state.timeS)
            : thrustAt(thrustCurve, state.timeS);
          if (!Number.isFinite(thrustN) || thrustN < 0) {
            throw new Error(
              "thrust provider must return a finite non-negative value",
            );
          }
          const forceBodyN = scaleVector(thrustAxisBody, thrustN);
          return {
            totalThrustN: thrustN,
            netThrustForceBodyN: forceBodyN,
            netThrustMomentBodyNm: ZERO_VECTOR,
            centerOfMassBodyM: ZERO_VECTOR,
            motors: [],
          };
        })();
    const propulsionVectors = [
      propulsion.netThrustForceBodyN,
      propulsion.netThrustMomentBodyNm,
    ];
    if (
      !Number.isFinite(propulsion.totalThrustN) ||
      propulsion.totalThrustN < 0 ||
      propulsionVectors.some((vector) =>
        [vector.x, vector.y, vector.z].some((entry) => !Number.isFinite(entry)),
      )
    ) {
      throw new Error("propulsion load provider returned invalid force, moment, or thrust");
    }
    const gravityN = body.massKg * gravityAtAltitude(altitudeAslM);

    return {
      loads: {
        forceWorldN: { x: 0, y: 0, z: -gravityN },
        forceBodyN: addVectors(
          propulsion.netThrustForceBodyN,
          aerodynamicForceBodyN,
        ),
        momentBodyNm: addVectors(
          addVectors(aerodynamicMomentBodyNm, aerodynamicDampingMomentBodyNm),
          propulsion.netThrustMomentBodyNm,
        ),
      },
      diagnostics: {
        altitudeAglM,
        altitudeAslM,
        densityKgM3: atmosphere.densityKgM3,
        speedOfSoundMps: atmosphere.speedOfSoundMps,
        dynamicViscosityPaS: atmosphere.dynamicViscosityPaS,
        environmentModelVersion:
          providedEnvironment?.modelVersion ?? null,
        windWorldMps,
        meanWindWorldMps,
        turbulenceWindWorldMps,
        discreteGustWindWorldMps,
        activeGustIds: [...(providedEnvironment?.activeGustIds ?? [])],
        airRelativeVelocityWorldMps,
        airRelativeVelocityBodyMps,
        airspeedMps,
        forwardAirspeedBodyMps,
        angleOfAttackRad,
        sideslipRad,
        mach,
        dynamicPressurePa,
        thrustN: propulsion.totalThrustN,
        propulsionForceBodyN: propulsion.netThrustForceBodyN,
        propulsionMomentBodyNm: propulsion.netThrustMomentBodyNm,
        gravityN,
        dragN,
        normalForceN,
        normalForceApplied,
        aerodynamicDampingMomentBodyNm,
        aerodynamicModelVersion: aerodynamics.modelVersion ?? null,
        activeStageIds: [...(aerodynamics.activeStageIds ?? [])],
        referenceAreaM2: aerodynamics.referenceAreaM2,
        dragCoefficient: aerodynamics.dragCoefficient,
        normalForceSlopePerRad: aerodynamics.normalForceSlopePerRad,
        centerOfPressureMinusCenterOfMassM:
          aerodynamics.centerOfPressureMinusCenterOfMassM,
        centerOfPressureXM: aerodynamics.centerOfPressureXM ?? null,
        centerOfMassXM: aerodynamics.centerOfMassXM ?? null,
        staticMarginCalibers: aerodynamics.staticMarginCalibers ?? null,
        coefficientBasis: aerodynamics.coefficientBasis ?? null,
        reynoldsNumber: aerodynamics.reynoldsNumber ?? null,
        dampingDerivativeBody: aerodynamics.dampingDerivativeBody ?? null,
        dampingReferenceLengthBodyM:
          aerodynamics.dampingReferenceLengthBodyM ?? null,
        directForceCoefficientBody: directForceCoefficientBody ?? null,
        directMomentCoefficientBody: directMomentCoefficientBody ?? null,
        directForceApplied,
        directMomentApplied,
        coefficientUncertainty: aerodynamics.coefficientUncertainty ?? null,
        coefficientProvenance: aerodynamics.coefficientProvenance ?? null,
        applicability,
      },
    };
  };

  return {
    modelVersion: PRELIMINARY_ROCKET_LOAD_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    evaluate,
    loads: (state) => evaluate(state).loads,
    assumptions: [
      "World x/y/z are east/north/up in a non-rotating local tangent approximation",
      ...(config.environmentAt
        ? [
            "Atmosphere, mean wind, turbulence, and discrete gusts come from the supplied launch-environment provider",
          ]
        : []),
      "Body +x runs from nose to tail; forward flight is body -x",
      config.propulsion
        ? "Motor-specific propulsion force and moment supplied by a coupled load provider"
        : "Thrust curve already represents exhaust momentum and pressure thrust",
      config.aerodynamicsAt
        ? "State-dependent aerodynamic geometry and coefficients supplied by a coupled provider"
        : "Constant user-supplied axial drag coefficient",
      config.aerodynamicsAt
        ? "Low-speed, small-angle normal force with a state-dependent CP-to-CG lever arm"
        : "Low-speed, small-angle normal force with a fixed CP-to-CG lever arm",
      config.aerodynamicsAt
        ? "Rotational damping is applied only when the aerodynamic provider supplies derivative and reference-length data"
        : "Rigid vehicle with no aerodynamic damping or launch constraint",
    ],
    warnings: [
      "This coupling is not a validated flight simulation.",
      "Normal force is disabled outside forward low-speed flow and bounded at the small-angle limit.",
      "Atmosphere version 0.4 is limited to -500 m through 20 km geometric altitude; moist-air corrections remain bounded ideal-mixture approximations.",
      "No ground contact, terrain, Coriolis, Earth rotation, curvature, or geodesy is included; launch rail, recovery, and staging require explicitly composed providers.",
    ],
  };
}
