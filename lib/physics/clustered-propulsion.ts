import {
  ZERO_VECTOR,
  addVectors,
  cross,
  magnitude,
  scaleVector,
  subtractVectors,
  type Vector3,
} from "./linear-algebra.ts";
import type { ImpulseBasedPropellantModel } from "./propellant-mass.ts";
import type { RigidBodyLoads, RigidBodyState } from "./six-dof.ts";

export const CLUSTERED_PROPULSION_MODEL_VERSION =
  "kestrel-clustered-propulsion-0.1.0";

export type MotorMount = Readonly<{
  motorId: string;
  thrustApplicationPointBodyM: Vector3;
  thrustAxisBody: Vector3;
}>;

export type MotorThrustContribution = Readonly<{
  motorId: string;
  thrustN: number;
  thrustApplicationPointBodyM: Vector3;
  thrustAxisBody: Vector3;
  leverArmFromCenterOfMassBodyM: Vector3;
  forceBodyN: Vector3;
  momentBodyNm: Vector3;
}>;

export type PropulsionLoadEvaluation = Readonly<{
  totalThrustN: number;
  netThrustForceBodyN: Vector3;
  netThrustMomentBodyNm: Vector3;
  centerOfMassBodyM: Vector3;
  motors: readonly MotorThrustContribution[];
}>;

export type PropulsionLoadProvider = (
  state: RigidBodyState,
) => PropulsionLoadEvaluation;

export type ClusteredPropulsionModel = Readonly<{
  modelVersion: string;
  validationStatus: "analytical-component-checks-only";
  evaluate: PropulsionLoadProvider;
  loads: (state: RigidBodyState) => RigidBodyLoads;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

function finiteVector(value: Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function normalized(value: Vector3, label: string): Vector3 {
  const vectorMagnitude = magnitude(value);
  if (!finiteVector(value) || !(vectorMagnitude > 0)) {
    throw new Error(`${label} must be a finite non-zero vector`);
  }
  return scaleVector(value, 1 / vectorMagnitude);
}

export function createClusteredPropulsionModel(input: Readonly<{
  massModel: ImpulseBasedPropellantModel;
  mounts: readonly MotorMount[];
}>): ClusteredPropulsionModel {
  const mounts = input.mounts.map((mount) => {
    if (!mount.motorId.trim()) {
      throw new Error("motor mounts must reference a motor identifier");
    }
    if (!finiteVector(mount.thrustApplicationPointBodyM)) {
      throw new Error(`motor ${mount.motorId} application point must be finite`);
    }
    return {
      ...mount,
      thrustAxisBody: normalized(
        mount.thrustAxisBody,
        `motor ${mount.motorId} thrust axis`,
      ),
    };
  });
  if (new Set(mounts.map((mount) => mount.motorId)).size !== mounts.length) {
    throw new Error("each motor may have only one thrust mount");
  }
  const configuredIds = new Set(input.massModel.motorIds);
  const mountIds = new Set(mounts.map((mount) => mount.motorId));
  const unknownIds = mounts
    .map((mount) => mount.motorId)
    .filter((id) => !configuredIds.has(id));
  const missingIds = input.massModel.motorIds.filter((id) => !mountIds.has(id));
  if (unknownIds.length > 0 || missingIds.length > 0) {
    throw new Error(
      `motor mounts must match mass-model motors exactly; unknown: ${unknownIds.join(", ") || "none"}; missing: ${missingIds.join(", ") || "none"}`,
    );
  }

  const evaluate = (state: RigidBodyState): PropulsionLoadEvaluation => {
    const massState = input.massModel.evaluate(state.timeS);
    const motorStateById = new Map(
      massState.motors.map((motor) => [motor.id, motor]),
    );
    const motors = mounts.map((mount): MotorThrustContribution => {
      const motorState = motorStateById.get(mount.motorId);
      if (!motorState) {
        throw new Error(`motor ${mount.motorId} is absent from the mass state`);
      }
      const forceBodyN = scaleVector(
        mount.thrustAxisBody,
        motorState.thrustN,
      );
      const leverArmFromCenterOfMassBodyM = subtractVectors(
        mount.thrustApplicationPointBodyM,
        massState.massProperties.centerOfMassM,
      );
      const momentBodyNm = cross(
        leverArmFromCenterOfMassBodyM,
        forceBodyN,
      );
      return {
        motorId: mount.motorId,
        thrustN: motorState.thrustN,
        thrustApplicationPointBodyM: mount.thrustApplicationPointBodyM,
        thrustAxisBody: mount.thrustAxisBody,
        leverArmFromCenterOfMassBodyM,
        forceBodyN,
        momentBodyNm,
      };
    });
    const netThrustForceBodyN = motors.reduce(
      (sum, motor) => addVectors(sum, motor.forceBodyN),
      ZERO_VECTOR,
    );
    const netThrustMomentBodyNm = motors.reduce(
      (sum, motor) => addVectors(sum, motor.momentBodyNm),
      ZERO_VECTOR,
    );
    return {
      totalThrustN: motors.reduce((sum, motor) => sum + motor.thrustN, 0),
      netThrustForceBodyN,
      netThrustMomentBodyNm,
      centerOfMassBodyM: massState.massProperties.centerOfMassM,
      motors,
    };
  };

  return {
    modelVersion: CLUSTERED_PROPULSION_MODEL_VERSION,
    validationStatus: "analytical-component-checks-only",
    evaluate,
    loads: (state) => {
      const result = evaluate(state);
      return {
        forceBodyN: result.netThrustForceBodyN,
        momentBodyNm: result.netThrustMomentBodyNm,
      };
    },
    assumptions: [
      "Each motor has one fixed body-frame thrust application point and axis",
      "Motor thrust magnitudes and ignition timing come from the shared propellant mass model",
      "Thrust moments are evaluated about the instantaneous combined center of mass",
      "Thrust curves represent net exhaust momentum and pressure thrust",
    ],
    warnings: [
      "This clustered propulsion model has analytical component checks only and is not flight-safety validated.",
      "Mount compliance, nozzle motion, ignition transients, thrust uncertainty, and motor failures are not modeled.",
      "A motor mount does not alter the mass location; dry and propellant mass properties must use matching body coordinates.",
      "Thrust-axis and application-point measurements require independent verification for real vehicles.",
    ],
  };
}
