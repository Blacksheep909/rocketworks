import {
  impulseThrough,
  massFlowAt,
  massFlowThrough,
  thrustAt,
  totalMassFlow,
  totalImpulse,
  validateMassFlowHistory,
  validateThrustCurve,
  type MassFlowPoint,
  type ThrustPoint,
} from "./curves.ts";
import {
  ZERO_MATRIX,
  addMatrices,
  determinant,
  scaleMatrix,
  type Matrix3,
} from "./linear-algebra.ts";
import {
  combineMassProperties,
  shiftInertia,
  type MassProperties,
} from "./mass-properties.ts";
import type {
  RigidBodyPropertyProvider,
  RigidBodyState,
} from "./six-dof.ts";

export const PROPELLANT_MASS_MODEL_VERSION =
  "kestrel-impulse-propellant-mass-0.2.0";

export type ImpulseBasedMotor = Readonly<{
  id: string;
  name: string;
  ignitionTimeS: number;
  thrustCurve: readonly ThrustPoint[];
  /** Optional positive measured propellant outflow rate relative to ignition. */
  massFlowHistoryKgS?: readonly MassFlowPoint[];
  dryMassProperties: MassProperties;
  initialPropellantMassProperties: MassProperties;
}>;

export type MotorMassState = Readonly<{
  id: string;
  name: string;
  status: "waiting" | "burning" | "burned-out";
  localTimeS: number;
  thrustN: number;
  totalImpulseNs: number;
  deliveredImpulseNs: number;
  consumedFraction: number;
  remainingFraction: number;
  propellantMassKg: number;
  propellantMassRateKgS: number;
  depletionSource: "impulse-proportional" | "measured-mass-flow";
}>;

export type PropellantVehicleMassState = Readonly<{
  timeS: number;
  massProperties: MassProperties;
  inertiaRateBodyKgM2PerS: Matrix3;
  totalThrustN: number;
  totalPropellantMassKg: number;
  totalPropellantMassRateKgS: number;
  motors: readonly MotorMassState[];
}>;

export type ImpulseBasedPropellantModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  motorIds: readonly string[];
  scheduledTimesS: readonly number[];
  evaluate: (timeS: number) => PropellantVehicleMassState;
  body: RigidBodyPropertyProvider;
  thrustAtTimeS: (timeS: number) => number;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function validateMassProperties(
  properties: MassProperties,
  label: string,
  requirePositiveMass: boolean,
): void {
  if (
    !Number.isFinite(properties.massKg) ||
    properties.massKg < 0 ||
    (requirePositiveMass && properties.massKg <= 0)
  ) {
    throw new Error(`${label} mass must be ${requirePositiveMass ? "positive" : "non-negative"} and finite`);
  }
  if (
    [
      properties.centerOfMassM.x,
      properties.centerOfMassM.y,
      properties.centerOfMassM.z,
    ].some((entry) => !Number.isFinite(entry))
  ) {
    throw new Error(`${label} center of mass must be finite`);
  }
  const inertia = properties.inertiaAtCenterKgM2;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (!Number.isFinite(inertia[row][column])) {
        throw new Error(`${label} inertia entries must be finite`);
      }
      if (Math.abs(inertia[row][column] - inertia[column][row]) > 1e-12) {
        throw new Error(`${label} inertia must be symmetric`);
      }
    }
  }
  const principalMinors2 = [
    inertia[0][0] * inertia[1][1] - inertia[0][1] ** 2,
    inertia[0][0] * inertia[2][2] - inertia[0][2] ** 2,
    inertia[1][1] * inertia[2][2] - inertia[1][2] ** 2,
  ];
  if (
    inertia[0][0] < -1e-14 ||
    inertia[1][1] < -1e-14 ||
    inertia[2][2] < -1e-14 ||
    principalMinors2.some((minor) => minor < -1e-14) ||
    determinant(inertia) < -1e-14
  ) {
    throw new Error(`${label} inertia must be positive semidefinite`);
  }
}

function scaledMassProperties(
  properties: MassProperties,
  fraction: number,
): MassProperties {
  return {
    massKg: properties.massKg * fraction,
    centerOfMassM: properties.centerOfMassM,
    inertiaAtCenterKgM2: scaleMatrix(
      properties.inertiaAtCenterKgM2,
      fraction,
    ),
  };
}

export function createImpulseBasedPropellantModel(input: Readonly<{
  fixedVehicleMassProperties: MassProperties;
  motors: readonly ImpulseBasedMotor[];
}>): ImpulseBasedPropellantModel {
  validateMassProperties(
    input.fixedVehicleMassProperties,
    "fixed vehicle",
    input.motors.length === 0,
  );
  if (input.motors.length === 0 && input.fixedVehicleMassProperties.massKg <= 0) {
    throw new Error("vehicle mass must be positive");
  }
  type PreparedMotor = ImpulseBasedMotor & Readonly<{
    thrustCurve: ThrustPoint[];
    massFlowHistoryKgS?: readonly MassFlowPoint[];
    totalImpulseNs: number;
    totalMassFlowKg?: number;
  }>;
  const motors: PreparedMotor[] = input.motors.map((motor) => {
    if (!motor.id.trim() || !motor.name.trim()) {
      throw new Error("motors must have identifiers and names");
    }
    if (!Number.isFinite(motor.ignitionTimeS)) {
      throw new Error(`motor ${motor.id} ignition time must be finite`);
    }
    const thrustCurve = [...motor.thrustCurve];
    validateThrustCurve(thrustCurve);
    const impulseNs = totalImpulse(thrustCurve);
    if (!(impulseNs > 0)) {
      throw new Error(`motor ${motor.id} thrust curve must have positive total impulse`);
    }
    validateMassProperties(motor.dryMassProperties, `motor ${motor.id} dry`, true);
    validateMassProperties(
      motor.initialPropellantMassProperties,
      `motor ${motor.id} propellant`,
      true,
    );
    const massFlowHistoryKgS = motor.massFlowHistoryKgS === undefined
      ? undefined
      : [...motor.massFlowHistoryKgS];
    const totalMassFlowKg = massFlowHistoryKgS
      ? totalMassFlow(massFlowHistoryKgS)
      : undefined;
    if (massFlowHistoryKgS) {
      validateMassFlowHistory(massFlowHistoryKgS);
      if (!(totalMassFlowKg! > 0)) {
        throw new Error(`motor ${motor.id} mass-flow history must consume positive mass`);
      }
      if (totalMassFlowKg! > motor.initialPropellantMassProperties.massKg * (1 + 1e-9)) {
        throw new Error(`motor ${motor.id} mass-flow history exceeds initial propellant mass`);
      }
    }
    return {
      ...motor,
      thrustCurve,
      ...(massFlowHistoryKgS ? { massFlowHistoryKgS, totalMassFlowKg } : {}),
      totalImpulseNs: impulseNs,
    };
  });
  if (new Set(motors.map((motor) => motor.id)).size !== motors.length) {
    throw new Error("motor identifiers must be unique");
  }

  const scheduledTimesS = [
    ...new Set(
      motors.flatMap((motor) =>
        [
          motor.ignitionTimeS,
          ...motor.thrustCurve.map(
            (point) => motor.ignitionTimeS + point.timeS,
          ),
          ...(motor.massFlowHistoryKgS?.map(
            (point) => motor.ignitionTimeS + point.timeS,
          ) ?? []),
        ],
      ),
    ),
  ].sort((a, b) => a - b);

  const evaluate = (timeS: number): PropellantVehicleMassState => {
    if (!Number.isFinite(timeS)) throw new Error("mass-state time must be finite");
    const motorStates = motors.map((motor): MotorMassState => {
      const localTimeS = timeS - motor.ignitionTimeS;
      const firstTimeS = motor.thrustCurve[0].timeS;
      const lastTimeS = motor.thrustCurve.at(-1)!.timeS;
      const deliveredImpulseNs = Math.min(
        motor.totalImpulseNs,
        Math.max(0, impulseThrough(motor.thrustCurve, localTimeS)),
      );
      const measuredMassFlowKg = motor.massFlowHistoryKgS
        ? Math.min(
            motor.initialPropellantMassProperties.massKg,
            Math.max(0, massFlowThrough(motor.massFlowHistoryKgS, localTimeS)),
          )
        : null;
      const consumedFraction = measuredMassFlowKg === null
        ? deliveredImpulseNs / motor.totalImpulseNs
        : measuredMassFlowKg / motor.initialPropellantMassProperties.massKg;
      const remainingFraction = Math.max(0, 1 - consumedFraction);
      const curveThrustN = thrustAt(motor.thrustCurve, localTimeS);
      const thrustN = remainingFraction > 1e-14 ? curveThrustN : 0;
      const propellantMassRateKgS = measuredMassFlowKg === null
        ? localTimeS >= firstTimeS &&
          localTimeS < lastTimeS &&
          remainingFraction > 1e-14
            ? (-motor.initialPropellantMassProperties.massKg * thrustN) /
              motor.totalImpulseNs
            : 0
        : remainingFraction > 1e-14
          ? -massFlowAt(motor.massFlowHistoryKgS!, localTimeS)
          : 0;
      return {
        id: motor.id,
        name: motor.name,
        status:
          localTimeS < firstTimeS
            ? "waiting"
            : localTimeS >= lastTimeS || remainingFraction <= 1e-14
              ? "burned-out"
              : "burning",
        localTimeS,
        thrustN,
        totalImpulseNs: motor.totalImpulseNs,
        deliveredImpulseNs,
        consumedFraction,
        remainingFraction,
        propellantMassKg:
          motor.initialPropellantMassProperties.massKg * remainingFraction,
        propellantMassRateKgS,
        depletionSource: measuredMassFlowKg === null
          ? "impulse-proportional"
          : "measured-mass-flow",
      };
    });

    const parts: MassProperties[] = [input.fixedVehicleMassProperties];
    motors.forEach((motor, index) => {
      parts.push(motor.dryMassProperties);
      const fraction = motorStates[index].remainingFraction;
      if (fraction > 0) {
        parts.push(scaledMassProperties(motor.initialPropellantMassProperties, fraction));
      }
    });
    const massProperties = combineMassProperties(parts);
    let inertiaRateBodyKgM2PerS: Matrix3 = ZERO_MATRIX;
    motors.forEach((motor, index) => {
      const massRateKgS = motorStates[index].propellantMassRateKgS;
      if (massRateKgS === 0) return;
      const displacement = {
        x:
          motor.initialPropellantMassProperties.centerOfMassM.x -
          massProperties.centerOfMassM.x,
        y:
          motor.initialPropellantMassProperties.centerOfMassM.y -
          massProperties.centerOfMassM.y,
        z:
          motor.initialPropellantMassProperties.centerOfMassM.z -
          massProperties.centerOfMassM.z,
      };
      inertiaRateBodyKgM2PerS = addMatrices(
        inertiaRateBodyKgM2PerS,
        shiftInertia(
          scaleMatrix(
            motor.initialPropellantMassProperties.inertiaAtCenterKgM2,
            massRateKgS /
              motor.initialPropellantMassProperties.massKg,
          ),
          massRateKgS,
          displacement,
        ),
      );
    });

    return {
      timeS,
      massProperties,
      inertiaRateBodyKgM2PerS,
      totalThrustN: motorStates.reduce(
        (sum, motor) => sum + motor.thrustN,
        0,
      ),
      totalPropellantMassKg: motorStates.reduce(
        (sum, motor) => sum + motor.propellantMassKg,
        0,
      ),
      totalPropellantMassRateKgS: motorStates.reduce(
        (sum, motor) => sum + motor.propellantMassRateKgS,
        0,
      ),
      motors: motorStates,
    };
  };

  const body = (state: RigidBodyState) => {
    const massState = evaluate(state.timeS);
    return {
      massKg: massState.massProperties.massKg,
      inertiaBodyKgM2: massState.massProperties.inertiaAtCenterKgM2,
      inertiaRateBodyKgM2PerS: massState.inertiaRateBodyKgM2PerS,
    };
  };

  return {
    modelVersion: PROPELLANT_MASS_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    motorIds: motors.map((motor) => motor.id),
    scheduledTimesS,
    evaluate,
    body,
    thrustAtTimeS: (timeS) => evaluate(timeS).totalThrustN,
    assumptions: [
      "Thrust-curve time is relative to each configured ignition time",
      ...(motors.some((motor) => motor.massFlowHistoryKgS)
        ? [
            "When supplied, positive measured mass-flow history directly drives propellant depletion; thrust remains an independent measured curve",
            "Measured mass-flow history is linearly interpolated and integrated between its supplied knots",
          ]
        : ["Propellant consumption is proportional to delivered impulse"]),
      "Remaining propellant preserves its initial normalized spatial mass distribution",
      "Dry motor and fixed vehicle mass properties remain constant",
      "The rigid-body state origin follows the instantaneous combined center of mass",
    ],
    warnings: [
      "This mass-state model has analytical component checks only and is not flight-safety validated.",
      ...(motors.some((motor) => motor.massFlowHistoryKgS)
        ? [
            "Measured mass-flow history is accepted as user-supplied evidence; sensor calibration, phase lag, residual propellant, and sample uncertainty are not independently validated.",
            ...(motors.some(
              (motor) =>
                motor.totalMassFlowKg! <
                motor.initialPropellantMassProperties.massKg * (1 - 1e-9),
            )
              ? [
                  "At least one measured mass-flow history integrates below its declared initial propellant mass; residual propellant remains attached after the supplied history ends.",
                ]
              : []),
          ]
        : [
            "Impulse-proportional depletion is an approximation unless thrust is proportional to propellant mass flow with effectively constant exhaust velocity.",
          ]),
      "Grain regression, erosive burning, residue, slosh, nozzle ablation, and moving internal hardware are not modeled.",
      "Use measured or appropriately licensed motor data and measured mass properties for real vehicles.",
    ],
  };
}
