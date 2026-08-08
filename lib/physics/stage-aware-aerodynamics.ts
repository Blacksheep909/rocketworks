import type {
  PreliminaryAerodynamicCondition,
  PreliminaryAerodynamicState,
  PreliminaryAerodynamicStateProvider,
  RocketLoadApplicabilityIssue,
} from "./rocket-loads.ts";
import {
  reynoldsNumber,
} from "./atmosphere.ts";
import type {
  AerodynamicCoefficientEvaluation,
  AerodynamicCoefficientTableModel,
} from "./aerodynamic-coefficients.ts";
import type { Vector3 } from "./linear-algebra.ts";
import {
  computeStaticStability,
  type StaticStabilityResult,
} from "./static-aerodynamics.ts";
import type { MultiStageVehicleModel } from "./multi-stage.ts";
import type { RigidBodyState } from "./six-dof.ts";
import type { VehicleComponent } from "./vehicle-components.ts";

export const STAGE_AWARE_AERODYNAMICS_MODEL_VERSION =
  "kestrel-stage-aware-aero-0.1.0";

export type StageAerodynamicRegime = Readonly<{
  id: string;
  label: string;
  activeStageIds: readonly string[];
  dragCoefficient?: number;
  coefficientTable?: AerodynamicCoefficientTableModel;
  coefficientTableDesignPoint?: Readonly<{
    mach: number;
    reynoldsNumber: number;
  }>;
  referenceDiameterM?: number;
  referenceLengthM?: number;
  dampingReferenceLengthBodyM?: Vector3;
  maximumNormalForceMach?: number;
  maximumNormalForceAngleRad?: number;
  minimumNormalForceAirspeedMps?: number;
}>;

export type StageAwareAerodynamicEvaluation = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  regimeId: string;
  regimeLabel: string;
  activeStageIds: readonly string[];
  activeGeometryStageIds: readonly string[];
  dragCoefficient: number;
  normalForceSlopePerRad: number;
  centerOfPressureXM: number;
  staticMarginCalibers: number;
  reynoldsNumber: number | null;
  coefficientEvaluation: AerodynamicCoefficientEvaluation | null;
  staticStability: StaticStabilityResult;
  centerOfPressureMinusCenterOfMassM: number;
  applicability: readonly RocketLoadApplicabilityIssue[];
}>;

export type StageAwareAerodynamicsModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  regimeIds: readonly string[];
  evaluate: (
    state: RigidBodyState,
    condition?: PreliminaryAerodynamicCondition,
  ) => StageAwareAerodynamicEvaluation;
  aerodynamicsAt: PreliminaryAerodynamicStateProvider;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function validateIdentifier(id: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      `${label} identifiers may contain only letters, numbers, underscores, and hyphens`,
    );
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function topologyKey(stageIds: readonly string[]): string {
  return [...stageIds].sort().join("|");
}

export function createStageAwareAerodynamicsModel(input: Readonly<{
  components: readonly VehicleComponent[];
  staging: MultiStageVehicleModel;
  regimes: readonly StageAerodynamicRegime[];
  alwaysActiveGeometryStageIds?: readonly string[];
  separationTransitionWindowS?: number;
}>): StageAwareAerodynamicsModel {
  if (input.components.length === 0) {
    throw new Error("stage-aware aerodynamics requires vehicle components");
  }
  if (input.regimes.length === 0) {
    throw new Error("stage-aware aerodynamics requires at least one topology regime");
  }
  const stagingIds = new Set(input.staging.stageIds);
  const alwaysActiveGeometryStageIds = [
    ...(input.alwaysActiveGeometryStageIds ?? []),
  ];
  alwaysActiveGeometryStageIds.forEach((stageId) =>
    validateIdentifier(stageId, "always-active geometry stage"),
  );
  if (
    new Set(alwaysActiveGeometryStageIds).size !==
    alwaysActiveGeometryStageIds.length
  ) {
    throw new Error("always-active geometry stage identifiers must be unique");
  }
  const recognizedGeometryStageIds = new Set([
    ...input.staging.stageIds,
    ...alwaysActiveGeometryStageIds,
  ]);
  const unknownComponentStageIds = [
    ...new Set(
      input.components
        .map((component) => component.stageId)
        .filter((stageId) => !recognizedGeometryStageIds.has(stageId)),
    ),
  ];
  if (unknownComponentStageIds.length > 0) {
    throw new Error(
      `component geometry references unknown stages: ${unknownComponentStageIds.join(", ")}`,
    );
  }
  const separationTransitionWindowS = input.separationTransitionWindowS ?? 0.1;
  if (
    !Number.isFinite(separationTransitionWindowS) ||
    separationTransitionWindowS < 0
  ) {
    throw new Error("separation transition window must be a non-negative finite number");
  }

  const regimes = input.regimes.map((regime) => {
    validateIdentifier(regime.id, "aerodynamic regime");
    if (!regime.label.trim()) throw new Error("aerodynamic regimes must have labels");
    if (new Set(regime.activeStageIds).size !== regime.activeStageIds.length) {
      throw new Error(`regime ${regime.id} active stage identifiers must be unique`);
    }
    const unknownStageIds = regime.activeStageIds.filter(
      (stageId) => !stagingIds.has(stageId),
    );
    if (unknownStageIds.length > 0) {
      throw new Error(
        `regime ${regime.id} references unknown stages: ${unknownStageIds.join(", ")}`,
      );
    }
    const coefficientSourceCount = [
      regime.dragCoefficient,
      regime.coefficientTable,
    ].filter((value) => value !== undefined).length;
    if (coefficientSourceCount !== 1) {
      throw new Error(
        `regime ${regime.id} requires exactly one constant drag coefficient or coefficient table`,
      );
    }
    if (regime.dragCoefficient !== undefined) {
      assertPositive(
        regime.dragCoefficient,
        `regime ${regime.id} drag coefficient`,
      );
    }
    if (regime.referenceDiameterM !== undefined) {
      assertPositive(
        regime.referenceDiameterM,
        `regime ${regime.id} reference diameter`,
      );
    }
    if (regime.referenceLengthM !== undefined) {
      assertPositive(
        regime.referenceLengthM,
        `regime ${regime.id} reference length`,
      );
    }
    if (regime.coefficientTableDesignPoint) {
      if (!regime.coefficientTable) {
        throw new Error(
          `regime ${regime.id} cannot define a coefficient-table design point without a table`,
        );
      }
      if (
        !Number.isFinite(regime.coefficientTableDesignPoint.mach) ||
        regime.coefficientTableDesignPoint.mach < 0 ||
        !Number.isFinite(regime.coefficientTableDesignPoint.reynoldsNumber) ||
        regime.coefficientTableDesignPoint.reynoldsNumber <= 0
      ) {
        throw new Error(
          `regime ${regime.id} coefficient-table design point is invalid`,
        );
      }
    }
    if (regime.dampingReferenceLengthBodyM) {
      if (!regime.coefficientTable) {
        throw new Error(
          `regime ${regime.id} cannot define damping reference lengths without a coefficient table`,
        );
      }
      const lengths = regime.dampingReferenceLengthBodyM;
      if (
        ![lengths.x, lengths.y, lengths.z].every(
          (value) => Number.isFinite(value) && value > 0,
        )
      ) {
        throw new Error(
          `regime ${regime.id} damping reference lengths must be positive and finite`,
        );
      }
    }
    if (regime.maximumNormalForceMach !== undefined) {
      assertPositive(
        regime.maximumNormalForceMach,
        `regime ${regime.id} maximum normal-force Mach`,
      );
    }
    if (regime.maximumNormalForceAngleRad !== undefined) {
      assertPositive(
        regime.maximumNormalForceAngleRad,
        `regime ${regime.id} maximum normal-force angle`,
      );
    }
    if (regime.minimumNormalForceAirspeedMps !== undefined) {
      assertPositive(
        regime.minimumNormalForceAirspeedMps,
        `regime ${regime.id} minimum normal-force airspeed`,
      );
    }
    return { ...regime, activeStageIds: [...regime.activeStageIds] };
  });
  if (new Set(regimes.map((regime) => regime.id)).size !== regimes.length) {
    throw new Error("aerodynamic regime identifiers must be unique");
  }
  const regimeByTopology = new Map<string, (typeof regimes)[number]>();
  for (const regime of regimes) {
    const key = topologyKey(regime.activeStageIds);
    if (regimeByTopology.has(key)) {
      throw new Error(
        `multiple aerodynamic regimes describe topology ${key || "<retained-only>"}`,
      );
    }
    regimeByTopology.set(key, regime);
  }

  const evaluate = (
    state: RigidBodyState,
    condition?: PreliminaryAerodynamicCondition,
  ): StageAwareAerodynamicEvaluation => {
    const staging = input.staging.evaluate(state);
    const key = topologyKey(staging.attachedStageIds);
    const regime = regimeByTopology.get(key);
    if (!regime) {
      throw new Error(
        `no aerodynamic regime describes attached-stage topology ${key || "<retained-only>"}`,
      );
    }
    const activeGeometryStageIds = [
      ...staging.attachedStageIds,
      ...alwaysActiveGeometryStageIds,
    ];
    const staticStability = computeStaticStability({
      components: input.components,
      centerOfMassXM: staging.massProperties.centerOfMassM.x,
      referenceDiameterM: regime.referenceDiameterM,
      activeStageIds: activeGeometryStageIds,
    });
    const referenceLengthM =
      regime.referenceLengthM ?? staticStability.vehicleLengthM;
    const tableQuery = regime.coefficientTable
      ? condition
        ? {
            mach: condition.mach,
            reynoldsNumber: reynoldsNumber({
              densityKgM3: condition.atmosphere.densityKgM3,
              speedMps: condition.airspeedMps,
              referenceLengthM,
              dynamicViscosityPaS:
                condition.atmosphere.dynamicViscosityPaS,
            }),
          }
        : regime.coefficientTableDesignPoint
      : undefined;
    if (regime.coefficientTable && !tableQuery) {
      throw new Error(
        `regime ${regime.id} requires a flight condition or coefficient-table design point`,
      );
    }
    const coefficientEvaluation =
      regime.coefficientTable && tableQuery
        ? regime.coefficientTable.evaluate(tableQuery)
        : null;
    const dragCoefficient =
      coefficientEvaluation?.dragCoefficient ?? regime.dragCoefficient!;
    const normalForceSlopePerRad =
      coefficientEvaluation?.normalForceSlopePerRad ??
      staticStability.normalForceSlopePerRad;
    const centerOfPressureXM =
      coefficientEvaluation?.centerOfPressureXM ??
      staticStability.centerOfPressureXM;
    const staticMarginCalibers =
      (centerOfPressureXM - staticStability.centerOfMassXM) /
      staticStability.referenceDiameterM;
    const applicability: RocketLoadApplicabilityIssue[] = [];
    const recentSeparation = staging.stages
      .map((stage) => stage.separationTimeS)
      .filter((timeS): timeS is number => timeS !== null)
      .some(
        (timeS) =>
          state.timeS >= timeS &&
          state.timeS - timeS <= separationTransitionWindowS,
      );
    if (recentSeparation && separationTransitionWindowS > 0) {
      applicability.push({
        code: "STAGE_SEPARATION_PROXIMITY",
        severity: "unsupported",
        explanation:
          "The selected post-separation topology omits transient proximity, plume, and multi-body aerodynamic interference.",
      });
    }
    coefficientEvaluation?.applicability.forEach((issue) => {
      applicability.push({
        code:
          issue.code === "COEFFICIENT_UNCERTAINTY_PRESENT"
            ? "COEFFICIENT_UNCERTAINTY_PRESENT"
            : issue.code.startsWith("MACH_")
              ? "AERODYNAMIC_TABLE_MACH_RANGE"
              : "AERODYNAMIC_TABLE_REYNOLDS_RANGE",
        severity: issue.severity,
        explanation: issue.explanation,
      });
    });
    return {
      modelVersion: STAGE_AWARE_AERODYNAMICS_MODEL_VERSION,
      validationStatus: "analytical-component-checks-only",
      regimeId: regime.id,
      regimeLabel: regime.label,
      activeStageIds: [...staging.attachedStageIds],
      activeGeometryStageIds,
      dragCoefficient,
      normalForceSlopePerRad,
      centerOfPressureXM,
      staticMarginCalibers,
      reynoldsNumber: tableQuery?.reynoldsNumber ?? null,
      coefficientEvaluation,
      staticStability,
      centerOfPressureMinusCenterOfMassM:
        centerOfPressureXM - staticStability.centerOfMassXM,
      applicability,
    };
  };

  const aerodynamicsAt = (
    state: RigidBodyState,
    condition: PreliminaryAerodynamicCondition,
  ): PreliminaryAerodynamicState => {
    const result = evaluate(state, condition);
    const regime = regimeByTopology.get(topologyKey(result.activeStageIds))!;
    return {
      referenceAreaM2: result.staticStability.referenceAreaM2,
      dragCoefficient: result.dragCoefficient,
      normalForceSlopePerRad: result.normalForceSlopePerRad,
      centerOfPressureMinusCenterOfMassM:
        result.centerOfPressureMinusCenterOfMassM,
      maximumNormalForceMach:
        regime.maximumNormalForceMach ?? regime.coefficientTable?.machRange[1],
      maximumNormalForceAngleRad: regime.maximumNormalForceAngleRad,
      minimumNormalForceAirspeedMps: regime.minimumNormalForceAirspeedMps,
      modelVersion: STAGE_AWARE_AERODYNAMICS_MODEL_VERSION,
      activeStageIds: result.activeStageIds,
      centerOfPressureXM: result.centerOfPressureXM,
      centerOfMassXM: result.staticStability.centerOfMassXM,
      staticMarginCalibers: result.staticMarginCalibers,
      coefficientBasis: result.coefficientEvaluation
        ? "mach-reynolds-table"
        : "constant",
      reynoldsNumber: result.reynoldsNumber ?? undefined,
      dampingDerivativeBody:
        result.coefficientEvaluation?.dampingDerivativeBody ?? undefined,
      dampingReferenceLengthBodyM:
        result.coefficientEvaluation?.dampingDerivativeBody
          ? regime.dampingReferenceLengthBodyM ?? {
              x: result.staticStability.referenceDiameterM,
              y: regime.referenceLengthM ?? result.staticStability.vehicleLengthM,
              z: regime.referenceLengthM ?? result.staticStability.vehicleLengthM,
            }
          : undefined,
      coefficientUncertainty:
        result.coefficientEvaluation?.uncertainty,
      coefficientProvenance:
        result.coefficientEvaluation?.provenance,
      applicability: result.applicability,
    };
  };

  return {
    modelVersion: STAGE_AWARE_AERODYNAMICS_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    regimeIds: regimes.map((regime) => regime.id),
    evaluate,
    aerodynamicsAt,
    assumptions: [
      "Each exact attached-stage topology selects one explicit aerodynamic regime",
      "Static CP and normal-force slope are recomputed from only the active geometry",
      "The regime coefficient source uses the active geometry reference area",
      "Mass, center of mass, and attached-stage state come from the shared staging model",
      "Topology coefficients switch instantaneously at the separation event",
    ],
    warnings: [
      "This topology adapter has analytical component checks only and is not flight-safety validated.",
      "Coefficient data are supplied externally and must use the same axes, signs, and reference conventions as the selected topology.",
      "The static aerodynamic method remains low-speed, small-angle, slender-body preliminary analysis.",
      "Proximity flow, plume interaction, and multi-body aerodynamics are explicitly unsupported around separation.",
    ],
  };
}
