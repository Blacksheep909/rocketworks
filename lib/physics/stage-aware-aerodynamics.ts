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
import {
  ZERO_VECTOR,
  addVectors,
  scaleVector,
  type Vector3,
} from "./linear-algebra.ts";
import {
  computeStaticStability,
  type StaticStabilityResult,
} from "./static-aerodynamics.ts";
import type { MultiStageVehicleModel } from "./multi-stage.ts";
import type { RigidBodyState } from "./six-dof.ts";
import type { VehicleComponent } from "./vehicle-components.ts";
import {
  NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
  type NormalForceModelKind,
} from "./normal-force-compressibility.ts";

export const STAGE_AWARE_AERODYNAMICS_MODEL_VERSION =
  "kestrel-stage-aware-aero-0.3.0";

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
  momentReferenceLengthBodyM?: Vector3;
  maximumNormalForceMach?: number;
  maximumNormalForceAngleRad?: number;
  minimumNormalForceAirspeedMps?: number;
  normalForceModel?: NormalForceModelKind;
}>;

export type StageAerodynamicTableAssignment = Readonly<{
  id: string;
  aerodynamicTableId?: string;
}>;

export type StageAerodynamicTableResolution = Readonly<{
  table: AerodynamicCoefficientTableModel | null;
  warnings: readonly string[];
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
  forceCoefficientBody: Vector3 | null;
  momentCoefficientBody: Vector3 | null;
  dampingDerivativeBody: Vector3 | null;
  momentReferenceLengthBodyM: Vector3 | null;
  staticStability: StaticStabilityResult;
  centerOfPressureMinusCenterOfMassM: number;
  normalForceModel: NormalForceModelKind;
  normalForceModelVersion: string;
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

/**
 * Resolves stage-level table selections for one exact attached-stage set.
 * A single available source is safe to select; mixed or missing sources fall
 * back to the caller's global table instead of blending incompatible data.
 */
export function resolveStageAerodynamicTable(input: Readonly<{
  activeStageIds: readonly string[];
  stages: readonly StageAerodynamicTableAssignment[];
  aerodynamicTableModels: Readonly<Record<string, AerodynamicCoefficientTableModel>>;
  globalTable: AerodynamicCoefficientTableModel | null;
}>): StageAerodynamicTableResolution {
  const stageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const assignedTableIds = [...new Set(
    input.activeStageIds
      .map((stageId) => stageById.get(stageId)?.aerodynamicTableId)
      .filter((tableId): tableId is string => Boolean(tableId)),
  )];
  const assignedTables = assignedTableIds
    .map((tableId) => input.aerodynamicTableModels[tableId])
    .filter((table): table is AerodynamicCoefficientTableModel => Boolean(table));
  const warnings: string[] = [];
  const topologyLabel = input.activeStageIds.join(" + ") || "retained payload";
  const hasUnavailableAssignment = assignedTableIds.length > 0 && assignedTables.length !== assignedTableIds.length;
  if (hasUnavailableAssignment) {
    warnings.push(
      `${topologyLabel} references an unavailable aerodynamic table; the global source was used.`,
    );
  }
  const hasConflictingAssignments = assignedTableIds.length > 1;
  if (hasConflictingAssignments) {
    warnings.push(
      `${topologyLabel} assigns multiple aerodynamic tables; combined-stage interference is not represented, so the global source was used.`,
    );
  }
  return {
    table:
      !hasUnavailableAssignment && !hasConflictingAssignments && assignedTables.length === 1
        ? assignedTables[0]
        : input.globalTable,
    warnings,
  };
}

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

function applyCoefficientUncertainty(
  nominal: number,
  absoluteUncertainty: number,
  sigma: number,
  label: string,
  requirePositive: boolean,
): number {
  const value = nominal + sigma * absoluteUncertainty;
  if (
    !Number.isFinite(value) ||
    (requirePositive && value <= 0)
  ) {
    throw new Error(
      `${label} became non-physical after coefficient uncertainty perturbation`,
    );
  }
  return value;
}

function perturbCoefficientVector(
  nominal: Vector3 | null,
  absoluteUncertainty: Vector3 | null,
  sigma: number,
  label: string,
): Vector3 | null {
  if (!nominal) return null;
  const perturbation = absoluteUncertainty ?? ZERO_VECTOR;
  const value = addVectors(nominal, scaleVector(perturbation, sigma));
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new Error(
      `${label} became non-physical after coefficient uncertainty perturbation`,
    );
  }
  return value;
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
  /** Multiplicative drag-only uncertainty applied after the selected source is evaluated. */
  dragCoefficientScale?: number;
  /** Multiplicative scale applied to direct body-axis force coefficients. */
  directForceCoefficientScale?: number;
  /** Multiplicative scale applied to direct body-axis static moment coefficients. */
  directMomentCoefficientScale?: number;
  /** Signed common-sigma multiplier applied to declared absolute table uncertainties. */
  coefficientUncertaintyScale?: number;
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
  const dragCoefficientScale = input.dragCoefficientScale ?? 1;
  if (!Number.isFinite(dragCoefficientScale) || dragCoefficientScale <= 0) {
    throw new Error("drag coefficient scale must be positive and finite");
  }
  const directForceCoefficientScale = input.directForceCoefficientScale ?? 1;
  if (!Number.isFinite(directForceCoefficientScale) || directForceCoefficientScale <= 0) {
    throw new Error("direct force coefficient scale must be positive and finite");
  }
  const directMomentCoefficientScale = input.directMomentCoefficientScale ?? 1;
  if (!Number.isFinite(directMomentCoefficientScale) || directMomentCoefficientScale <= 0) {
    throw new Error("direct moment coefficient scale must be positive and finite");
  }
  const coefficientUncertaintyScale = input.coefficientUncertaintyScale ?? 0;
  if (!Number.isFinite(coefficientUncertaintyScale)) {
    throw new Error("coefficient uncertainty scale must be finite");
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
    if (regime.momentReferenceLengthBodyM) {
      const lengths = regime.momentReferenceLengthBodyM;
      if (
        ![lengths.x, lengths.y, lengths.z].every(
          (value) => Number.isFinite(value) && value > 0,
        )
      ) {
        throw new Error(
          `regime ${regime.id} moment reference lengths must be positive and finite`,
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
  const anyCoefficientUncertaintyAvailable = regimes.some((regime) =>
    Boolean(regime.coefficientTable?.uncertaintyAvailable),
  );
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
            angleOfAttackRad: condition.angleOfAttackRad,
            sideslipRad: condition.sideslipRad,
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
    const nominalDragCoefficient =
      coefficientEvaluation?.dragCoefficient ?? regime.dragCoefficient!;
    const coefficientUncertainty = coefficientEvaluation?.uncertainty ?? {
      dragCoefficient: 0,
      normalForceSlopePerRad: 0,
      centerOfPressureXM: 0,
      forceCoefficientBody: null,
      momentCoefficientBody: null,
      dampingDerivativeBody: null,
    };
    const tableDragCoefficient = coefficientEvaluation
      ? applyCoefficientUncertainty(
          nominalDragCoefficient,
          coefficientUncertainty.dragCoefficient,
          coefficientUncertaintyScale,
          "drag coefficient",
          true,
        )
      : nominalDragCoefficient;
    const nominalNormalForceSlopePerRad =
      coefficientEvaluation?.normalForceSlopePerRad ??
      staticStability.normalForceSlopePerRad;
    const normalForceSlopePerRad = coefficientEvaluation
      ? applyCoefficientUncertainty(
          nominalNormalForceSlopePerRad,
          coefficientUncertainty.normalForceSlopePerRad,
          coefficientUncertaintyScale,
          "normal-force slope",
          true,
        )
      : nominalNormalForceSlopePerRad;
    const nominalCenterOfPressureXM =
      coefficientEvaluation?.centerOfPressureXM ??
      staticStability.centerOfPressureXM;
    const centerOfPressureXM = coefficientEvaluation
      ? applyCoefficientUncertainty(
          nominalCenterOfPressureXM,
          coefficientUncertainty.centerOfPressureXM,
          coefficientUncertaintyScale,
          "center of pressure",
          false,
        )
      : nominalCenterOfPressureXM;
    const dragCoefficient = tableDragCoefficient * dragCoefficientScale;
    const perturbedForceCoefficientBody = perturbCoefficientVector(
      coefficientEvaluation?.forceCoefficientBody ?? null,
        coefficientUncertainty.forceCoefficientBody,
      coefficientUncertaintyScale,
      "direct force coefficient",
    );
    const forceCoefficientBody = perturbedForceCoefficientBody
      ? scaleVector(perturbedForceCoefficientBody, directForceCoefficientScale)
      : null;
    const perturbedMomentCoefficientBody = perturbCoefficientVector(
      coefficientEvaluation?.momentCoefficientBody ?? null,
      coefficientUncertainty.momentCoefficientBody,
      coefficientUncertaintyScale,
      "direct moment coefficient",
    );
    const momentCoefficientBody = perturbedMomentCoefficientBody
      ? scaleVector(perturbedMomentCoefficientBody, directMomentCoefficientScale)
      : null;
    const dampingDerivativeBody = perturbCoefficientVector(
      coefficientEvaluation?.dampingDerivativeBody ?? null,
      coefficientUncertainty.dampingDerivativeBody,
      coefficientUncertaintyScale,
      "damping derivative",
    );
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
          : issue.code === "FORCE_MOMENT_DATABASE_PRESENT"
            ? "AERODYNAMIC_FORCE_MOMENT_DATABASE"
          : issue.code.startsWith("MACH_")
            ? "AERODYNAMIC_TABLE_MACH_RANGE"
            : issue.code.startsWith("REYNOLDS_")
              ? "AERODYNAMIC_TABLE_REYNOLDS_RANGE"
              : "AERODYNAMIC_TABLE_ANGLE_RANGE",
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
      forceCoefficientBody,
      momentCoefficientBody,
      dampingDerivativeBody,
      momentReferenceLengthBodyM: momentCoefficientBody
        ? regime.momentReferenceLengthBodyM ?? {
            x: staticStability.referenceDiameterM,
            y: referenceLengthM,
            z: referenceLengthM,
          }
        : null,
      staticStability,
      centerOfPressureMinusCenterOfMassM:
        centerOfPressureXM - staticStability.centerOfMassXM,
      normalForceModel: regime.normalForceModel ?? "low-speed",
      normalForceModelVersion: NORMAL_FORCE_COMPRESSIBILITY_MODEL_VERSION,
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
      normalForceModel: regime.normalForceModel,
      modelVersion: STAGE_AWARE_AERODYNAMICS_MODEL_VERSION,
      activeStageIds: result.activeStageIds,
      centerOfPressureXM: result.centerOfPressureXM,
      centerOfMassXM: result.staticStability.centerOfMassXM,
      staticMarginCalibers: result.staticMarginCalibers,
      coefficientBasis: result.coefficientEvaluation
        ? result.coefficientEvaluation.forceCoefficientBody !== null ||
          result.coefficientEvaluation.momentCoefficientBody !== null
          ? "mach-reynolds-force-moment-table"
          : result.coefficientEvaluation.evaluatedAngleOfAttackRad === null
            ? "mach-reynolds-table"
            : "mach-reynolds-angle-table"
        : "constant",
      reynoldsNumber: result.reynoldsNumber ?? undefined,
      dampingDerivativeBody:
        result.dampingDerivativeBody ?? undefined,
      dampingReferenceLengthBodyM:
        result.dampingDerivativeBody
          ? regime.dampingReferenceLengthBodyM ?? {
              x: result.staticStability.referenceDiameterM,
              y: regime.referenceLengthM ?? result.staticStability.vehicleLengthM,
              z: regime.referenceLengthM ?? result.staticStability.vehicleLengthM,
            }
          : undefined,
      forceCoefficientBody: result.forceCoefficientBody ?? undefined,
      momentCoefficientBody: result.momentCoefficientBody ?? undefined,
      momentReferenceLengthBodyM: result.momentReferenceLengthBodyM ?? undefined,
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
      "Radial component instances are projected into the current axial static-aerodynamic representation",
      ...(dragCoefficientScale === 1
        ? []
        : [`A multiplicative drag-only scale of ${dragCoefficientScale} is applied after the selected coefficient source; normal-force and damping terms remain nominal.`]),
      ...(directForceCoefficientScale === 1
        ? []
        : [`A multiplicative direct-force coefficient scale of ${directForceCoefficientScale} is applied after the selected force database; static drag and normal-force relation terms remain nominal.`]),
      ...(directMomentCoefficientScale === 1
        ? []
        : [`A multiplicative direct-moment coefficient scale of ${directMomentCoefficientScale} is applied after the selected moment database; damping derivatives remain nominal.`]),
      ...(coefficientUncertaintyScale === 0
        ? []
        : [
            `A common signed coefficient-uncertainty sigma of ${coefficientUncertaintyScale} is applied to declared absolute table cells; empirical per-coefficient covariance and time correlation are not modeled.`,
          ]),
    ],
    warnings: [
      "This topology adapter has analytical component checks only and is not flight-safety validated.",
      "Coefficient data are supplied externally and must use the same axes, signs, and reference conventions as the selected topology.",
      "The static aerodynamic method remains low-speed, small-angle, slender-body preliminary analysis.",
      "The selected compressibility trend applies only to relation-based normal force; transonic flow remains an explicit unsupported gap and direct coefficient tables remain authoritative.",
      "Lateral booster interference, asymmetric crossflow, and radial fin-to-fin flow are not modeled.",
      "Proximity flow, plume interaction, and multi-body aerodynamics are explicitly unsupported around separation.",
      ...(coefficientUncertaintyScale !== 0 && !anyCoefficientUncertaintyAvailable
        ? [
            "A coefficient-uncertainty sigma was supplied, but no selected aerodynamic table declares absolute uncertainty cells; the factor has no effect.",
          ]
        : []),
    ],
  };
}
