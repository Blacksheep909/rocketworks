export type Vector3 = Readonly<{ x: number; y: number; z: number }>;

export type Matrix3 = Readonly<[
  Readonly<[number, number, number]>,
  Readonly<[number, number, number]>,
  Readonly<[number, number, number]>,
]>;

export const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };

export const ZERO_MATRIX: Matrix3 = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

export const IDENTITY_MATRIX: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function addVectors(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVector(value: Vector3, scalar: number): Vector3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function addMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1], a[0][2] + b[0][2]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1], a[1][2] + b[1][2]],
    [a[2][0] + b[2][0], a[2][1] + b[2][1], a[2][2] + b[2][2]],
  ];
}

export function scaleMatrix(value: Matrix3, scalar: number): Matrix3 {
  return value.map((row) => row.map((entry) => entry * scalar)) as unknown as Matrix3;
}

export function transpose(value: Matrix3): Matrix3 {
  return [
    [value[0][0], value[1][0], value[2][0]],
    [value[0][1], value[1][1], value[2][1]],
    [value[0][2], value[1][2], value[2][2]],
  ];
}

export function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  const entry = (row: number, column: number) =>
    a[row][0] * b[0][column] +
    a[row][1] * b[1][column] +
    a[row][2] * b[2][column];
  return [
    [entry(0, 0), entry(0, 1), entry(0, 2)],
    [entry(1, 0), entry(1, 1), entry(1, 2)],
    [entry(2, 0), entry(2, 1), entry(2, 2)],
  ];
}

export function multiplyMatrixVector(matrix: Matrix3, value: Vector3): Vector3 {
  return {
    x: matrix[0][0] * value.x + matrix[0][1] * value.y + matrix[0][2] * value.z,
    y: matrix[1][0] * value.x + matrix[1][1] * value.y + matrix[1][2] * value.z,
    z: matrix[2][0] * value.x + matrix[2][1] * value.y + matrix[2][2] * value.z,
  };
}

export function outerProduct(value: Vector3): Matrix3 {
  return [
    [value.x * value.x, value.x * value.y, value.x * value.z],
    [value.y * value.x, value.y * value.y, value.y * value.z],
    [value.z * value.x, value.z * value.y, value.z * value.z],
  ];
}

export function rotationAboutX(angleRad: number): Matrix3 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return [
    [1, 0, 0],
    [0, cosine, -sine],
    [0, sine, cosine],
  ];
}

