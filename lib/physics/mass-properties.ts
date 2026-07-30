import {
  IDENTITY_MATRIX,
  ZERO_MATRIX,
  ZERO_VECTOR,
  addMatrices,
  addVectors,
  dot,
  multiplyMatrices,
  multiplyMatrixVector,
  outerProduct,
  scaleMatrix,
  scaleVector,
  subtractVectors,
  transpose,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";

export type MassProperties = Readonly<{
  massKg: number;
  centerOfMassM: Vector3;
  inertiaAtCenterKgM2: Matrix3;
}>;

export type RigidTransform = Readonly<{
  rotation?: Matrix3;
  translationM?: Vector3;
}>;

export function shiftInertia(
  inertiaAtCenterKgM2: Matrix3,
  massKg: number,
  displacementM: Vector3,
): Matrix3 {
  const parallelAxisTerm = scaleMatrix(
    addMatrices(
      scaleMatrix(IDENTITY_MATRIX, dot(displacementM, displacementM)),
      scaleMatrix(outerProduct(displacementM), -1),
    ),
    massKg,
  );
  return addMatrices(inertiaAtCenterKgM2, parallelAxisTerm);
}

export function transformMassProperties(
  properties: MassProperties,
  transform: RigidTransform,
): MassProperties {
  const rotation = transform.rotation ?? IDENTITY_MATRIX;
  const translation = transform.translationM ?? ZERO_VECTOR;
  return {
    massKg: properties.massKg,
    centerOfMassM: addVectors(
      multiplyMatrixVector(rotation, properties.centerOfMassM),
      translation,
    ),
    inertiaAtCenterKgM2: multiplyMatrices(
      multiplyMatrices(rotation, properties.inertiaAtCenterKgM2),
      transpose(rotation),
    ),
  };
}

export function combineMassProperties(
  parts: readonly MassProperties[],
): MassProperties {
  const populated = parts.filter((part) => part.massKg > 0);
  const massKg = populated.reduce((total, part) => total + part.massKg, 0);
  if (!(massKg > 0)) {
    return {
      massKg: 0,
      centerOfMassM: ZERO_VECTOR,
      inertiaAtCenterKgM2: ZERO_MATRIX,
    };
  }

  const weightedCenter = populated.reduce(
    (total, part) =>
      addVectors(total, scaleVector(part.centerOfMassM, part.massKg)),
    ZERO_VECTOR,
  );
  const centerOfMassM = scaleVector(weightedCenter, 1 / massKg);
  const inertiaAtCenterKgM2 = populated.reduce(
    (total, part) =>
      addMatrices(
        total,
        shiftInertia(
          part.inertiaAtCenterKgM2,
          part.massKg,
          subtractVectors(part.centerOfMassM, centerOfMassM),
        ),
      ),
    ZERO_MATRIX,
  );

  return { massKg, centerOfMassM, inertiaAtCenterKgM2 };
}

