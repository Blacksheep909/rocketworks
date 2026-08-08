import {
  totalImpulse,
  validateThrustCurve,
  type ThrustPoint,
} from "./curves.ts";
import {
  addVectors,
  magnitude,
  scaleVector,
  type Vector3,
} from "./linear-algebra.ts";
import type { MassProperties } from "./mass-properties.ts";
import type { MultiStageMotor } from "./multi-stage.ts";
import type { ImpulseBasedMotor } from "./propellant-mass.ts";

export const MOTOR_DATA_MODEL_VERSION = "kestrel-motor-data-0.1.0";
export const MOTOR_DATA_MODEL_STATUS = "engineering-preview-unvalidated";

const STANDARD_GRAVITY_MPS2 = 9.80665;
const MAX_CSV_BYTES = 2_000_000;
const MAX_CURVE_POINTS = 10_000;

export type MotorDataProvenance = Readonly<{
  sourceName: string;
  sourceKind: "user-supplied" | "manufacturer-published" | "test-lab" | "synthetic";
  dataVersion: string;
  licenseIdentifier: string;
  attribution: string;
  sourceUrl?: string;
  validationStatus:
    | "user-supplied-unvalidated"
    | "manufacturer-published-unvalidated"
    | "certified-test-data"
    | "synthetic-unvalidated";
}>;

export type MotorDataInput = Readonly<{
  id: string;
  manufacturer: string;
  designation: string;
  description?: string;
  diameterM: number;
  lengthM: number;
  launchMassKg: number;
  dryMassKg: number;
  thrustCurve: readonly ThrustPoint[];
  ejectionDelaysS?: readonly number[];
  propellantGeometry?: Readonly<{
    lengthM: number;
    aftInsetM: number;
  }>;
  dryCgFromAftM?: number;
  provenance: MotorDataProvenance;
}>;

export type MotorImpulseClass =
  | "1/8A"
  | "1/4A"
  | "1/2A"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "above-O";

export type MotorPerformanceMetrics = Readonly<{
  totalImpulseNs: number;
  burnDurationS: number;
  averageThrustN: number;
  peakThrustN: number;
  propellantMassKg: number;
  specificImpulseS: number;
  impulseClassEstimate: MotorImpulseClass;
  impulseClassUpperBoundNs: number | null;
  percentOfClassMaximum: number | null;
}>;

export type MotorDataRecord = MotorDataInput &
  Readonly<{
    modelVersion: string;
    validationStatus: typeof MOTOR_DATA_MODEL_STATUS;
    thrustCurve: readonly Readonly<ThrustPoint>[];
    ejectionDelaysS: readonly number[];
    metrics: MotorPerformanceMetrics;
    dryMassPropertiesLocal: MassProperties;
    propellantMassPropertiesLocal: MassProperties;
    warnings: readonly string[];
    assumptions: readonly string[];
  }>;

export type MotorLibrary = Readonly<{
  modelVersion: string;
  validationStatus: typeof MOTOR_DATA_MODEL_STATUS;
  records: readonly MotorDataRecord[];
  getById: (id: string) => MotorDataRecord | null;
  search: (query?: Readonly<{
    text?: string;
    manufacturer?: string;
    minimumImpulseNs?: number;
    maximumDiameterM?: number;
    validationStatus?: MotorDataProvenance["validationStatus"];
  }>) => readonly MotorDataRecord[];
}>;

const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite number`);
}

function validateProvenance(provenance: MotorDataProvenance) {
  for (const [label, value] of [
    ["source name", provenance.sourceName],
    ["data version", provenance.dataVersion],
    ["license identifier", provenance.licenseIdentifier],
    ["attribution", provenance.attribution],
  ] as const) {
    if (!value.trim()) throw new Error(`motor provenance ${label} cannot be empty`);
  }
  if (provenance.sourceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(provenance.sourceUrl);
    } catch {
      throw new Error("motor provenance source URL must be valid");
    }
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
      throw new Error("motor provenance source URL must use HTTP or HTTPS");
    }
  }
  const compatibleStatus: Record<MotorDataProvenance["sourceKind"], MotorDataProvenance["validationStatus"][]> = {
    "user-supplied": ["user-supplied-unvalidated", "certified-test-data"],
    "manufacturer-published": ["manufacturer-published-unvalidated", "certified-test-data"],
    "test-lab": ["certified-test-data", "user-supplied-unvalidated"],
    synthetic: ["synthetic-unvalidated"],
  };
  if (!compatibleStatus[provenance.sourceKind].includes(provenance.validationStatus)) {
    throw new Error(`motor provenance source kind ${provenance.sourceKind} is incompatible with validation status ${provenance.validationStatus}`);
  }
}

export function estimateMotorImpulseClass(totalImpulseNs: number): Readonly<{
  classEstimate: MotorImpulseClass;
  upperBoundNs: number | null;
}> {
  finitePositive(totalImpulseNs, "total impulse");
  const fractional: Array<readonly [MotorImpulseClass, number]> = [
    ["1/8A", 0.3125],
    ["1/4A", 0.625],
    ["1/2A", 1.25],
  ];
  for (const [classEstimate, upperBoundNs] of fractional) {
    if (totalImpulseNs <= upperBoundNs) return { classEstimate, upperBoundNs };
  }
  const letters = "ABCDEFGHIJKLMNO";
  for (let index = 0; index < letters.length; index += 1) {
    const upperBoundNs = 2.5 * 2 ** index;
    if (totalImpulseNs <= upperBoundNs) {
      return { classEstimate: letters[index] as MotorImpulseClass, upperBoundNs };
    }
  }
  return { classEstimate: "above-O", upperBoundNs: null };
}

function cylinderMassProperties(massKg: number, lengthM: number, diameterM: number, centerFromAftM: number): MassProperties {
  const radiusM = diameterM / 2;
  const axial = 0.5 * massKg * radiusM ** 2;
  const transverse = (massKg * (3 * radiusM ** 2 + lengthM ** 2)) / 12;
  return {
    massKg,
    centerOfMassM: { x: centerFromAftM, y: 0, z: 0 },
    inertiaAtCenterKgM2: [
      [axial, 0, 0],
      [0, transverse, 0],
      [0, 0, transverse],
    ],
  };
}

export function createMotorDataRecord(input: MotorDataInput): MotorDataRecord {
  if (!ID_PATTERN.test(input.id)) throw new Error("motor identifiers may contain only letters, numbers, dots, underscores, and hyphens");
  if (!input.manufacturer.trim() || !input.designation.trim()) {
    throw new Error("motor manufacturer and designation cannot be empty");
  }
  finitePositive(input.diameterM, "motor diameter");
  finitePositive(input.lengthM, "motor length");
  finitePositive(input.launchMassKg, "motor launch mass");
  finitePositive(input.dryMassKg, "motor dry mass");
  if (input.dryMassKg >= input.launchMassKg) throw new Error("motor dry mass must be less than launch mass");
  validateProvenance(input.provenance);
  if (input.thrustCurve.length > MAX_CURVE_POINTS) throw new Error(`motor thrust curves may contain at most ${MAX_CURVE_POINTS} points`);
  const thrustCurve = input.thrustCurve.map((point) => ({ ...point }));
  validateThrustCurve(thrustCurve);
  if (thrustCurve[0]!.timeS !== 0) throw new Error("motor thrust curves must begin at time 0 s");
  if (thrustCurve.at(-1)!.thrustN !== 0) throw new Error("motor thrust curves must end with zero thrust");
  const totalImpulseNs = totalImpulse(thrustCurve);
  finitePositive(totalImpulseNs, "motor total impulse");
  const burnDurationS = thrustCurve.at(-1)!.timeS;
  finitePositive(burnDurationS, "motor burn duration");
  const propellantMassKg = input.launchMassKg - input.dryMassKg;
  const propellantGeometry = input.propellantGeometry ?? { lengthM: input.lengthM, aftInsetM: 0 };
  finitePositive(propellantGeometry.lengthM, "propellant geometry length");
  finiteNonNegative(propellantGeometry.aftInsetM, "propellant geometry aft inset");
  if (propellantGeometry.aftInsetM + propellantGeometry.lengthM > input.lengthM + 1e-12) {
    throw new Error("propellant geometry must remain within the motor case length");
  }
  const dryCgFromAftM = input.dryCgFromAftM ?? input.lengthM / 2;
  finiteNonNegative(dryCgFromAftM, "motor dry CG from aft");
  if (dryCgFromAftM > input.lengthM) throw new Error("motor dry CG must remain within the motor length");
  const ejectionDelaysS = [...(input.ejectionDelaysS ?? [])].sort((a, b) => a - b);
  ejectionDelaysS.forEach((delay) => finiteNonNegative(delay, "motor ejection delay"));
  if (new Set(ejectionDelaysS).size !== ejectionDelaysS.length) throw new Error("motor ejection delays must be unique");
  const peakThrustN = Math.max(...thrustCurve.map((point) => point.thrustN));
  const impulseClass = estimateMotorImpulseClass(totalImpulseNs);
  const dryMassPropertiesLocal = cylinderMassProperties(input.dryMassKg, input.lengthM, input.diameterM, dryCgFromAftM);
  const propellantMassPropertiesLocal = cylinderMassProperties(
    propellantMassKg,
    propellantGeometry.lengthM,
    input.diameterM,
    propellantGeometry.aftInsetM + propellantGeometry.lengthM / 2,
  );
  return {
    ...input,
    modelVersion: MOTOR_DATA_MODEL_VERSION,
    validationStatus: MOTOR_DATA_MODEL_STATUS,
    thrustCurve,
    ejectionDelaysS,
    metrics: {
      totalImpulseNs,
      burnDurationS,
      averageThrustN: totalImpulseNs / burnDurationS,
      peakThrustN,
      propellantMassKg,
      specificImpulseS: totalImpulseNs / (propellantMassKg * STANDARD_GRAVITY_MPS2),
      impulseClassEstimate: impulseClass.classEstimate,
      impulseClassUpperBoundNs: impulseClass.upperBoundNs,
      percentOfClassMaximum:
        impulseClass.upperBoundNs === null ? null : (100 * totalImpulseNs) / impulseClass.upperBoundNs,
    },
    dryMassPropertiesLocal,
    propellantMassPropertiesLocal,
    warnings: [
      ...(input.provenance.validationStatus === "certified-test-data"
        ? []
        : ["The thrust curve is not marked as certified test data and requires independent verification."]),
      "The impulse-class label is a calculated band estimate, not a certification claim.",
      "Specific impulse uses declared wet/dry mass difference as propellant mass; residuals and hardware changes can bias it.",
      "Motor data and geometry are not flight-safety validated by Kestrel Lab.",
    ],
    assumptions: [
      "Thrust is linearly interpolated and integrated by the trapezoidal rule.",
      "The motor local origin is the aft case/nozzle plane and +X points toward the rocket nose.",
      "Dry hardware and propellant each use a uniform solid-cylinder inertia approximation.",
      "The declared thrust curve represents net measured or published thrust under its source conditions.",
    ],
  };
}

export function importMotorThrustCsv(
  csv: string,
  metadata: Omit<MotorDataInput, "thrustCurve">,
): MotorDataRecord {
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) throw new Error("motor CSV exceeds the 2 MB import limit");
  const rows = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((row) => row.line && !row.line.startsWith("#"));
  if (rows.length < 3) throw new Error("motor CSV requires a header and at least two data rows");
  const header = rows.shift()!;
  if (header.line.toLowerCase().replace(/\s/g, "") !== "time_s,thrust_n") {
    throw new Error(`motor CSV line ${header.lineNumber} must be the header time_s,thrust_n`);
  }
  if (rows.length > MAX_CURVE_POINTS) throw new Error(`motor thrust curves may contain at most ${MAX_CURVE_POINTS} points`);
  const thrustCurve = rows.map((row): ThrustPoint => {
    if (row.line.includes('"')) throw new Error(`motor CSV line ${row.lineNumber} must not contain quoted fields`);
    const fields = row.line.split(",").map((field) => field.trim());
    if (fields.length !== 2 || !fields.every((field) => NUMBER_PATTERN.test(field))) {
      throw new Error(`motor CSV line ${row.lineNumber} must contain exactly two decimal numbers`);
    }
    return { timeS: Number(fields[0]), thrustN: Number(fields[1]) };
  });
  return createMotorDataRecord({ ...metadata, thrustCurve });
}

export function exportMotorThrustCsv(record: MotorDataRecord): string {
  return ["time_s,thrust_n", ...record.thrustCurve.map((point) => `${point.timeS},${point.thrustN}`)].join("\n");
}

function translated(properties: MassProperties, originBodyM: Vector3): MassProperties {
  return { ...properties, centerOfMassM: addVectors(properties.centerOfMassM, originBodyM) };
}

function normalized(vector: Vector3, label: string) {
  const vectorMagnitude = magnitude(vector);
  if (!Number.isFinite(vectorMagnitude) || !(vectorMagnitude > 0)) throw new Error(`${label} must be a finite non-zero vector`);
  return scaleVector(vector, 1 / vectorMagnitude);
}

export function motorRecordToImpulseBasedMotor(
  record: MotorDataRecord,
  placement: Readonly<{
    id: string;
    name?: string;
    ignitionTimeS: number;
    originBodyM: Vector3;
  }>,
): ImpulseBasedMotor {
  if (!placement.id.trim()) throw new Error("placed motor identifier cannot be empty");
  if (!Number.isFinite(placement.ignitionTimeS)) throw new Error("placed motor ignition time must be finite");
  if (![placement.originBodyM.x, placement.originBodyM.y, placement.originBodyM.z].every(Number.isFinite)) {
    throw new Error("placed motor origin must be finite");
  }
  return {
    id: placement.id,
    name: placement.name ?? `${record.manufacturer} ${record.designation}`,
    ignitionTimeS: placement.ignitionTimeS,
    thrustCurve: record.thrustCurve,
    dryMassProperties: translated(record.dryMassPropertiesLocal, placement.originBodyM),
    initialPropellantMassProperties: translated(record.propellantMassPropertiesLocal, placement.originBodyM),
  };
}

export function motorRecordToMultiStageMotor(
  record: MotorDataRecord,
  placement: Readonly<{
    id: string;
    name?: string;
    ignitionDelayS?: number;
    originBodyM: Vector3;
    thrustAxisBody?: Vector3;
  }>,
): MultiStageMotor {
  const ignitionDelayS = placement.ignitionDelayS ?? 0;
  finiteNonNegative(ignitionDelayS, "placed motor ignition delay");
  const impulseMotor = motorRecordToImpulseBasedMotor(record, {
    id: placement.id,
    name: placement.name,
    ignitionTimeS: 0,
    originBodyM: placement.originBodyM,
  });
  return {
    id: impulseMotor.id,
    name: impulseMotor.name,
    ignitionDelayS,
    thrustCurve: impulseMotor.thrustCurve,
    dryMassProperties: impulseMotor.dryMassProperties,
    initialPropellantMassProperties: impulseMotor.initialPropellantMassProperties,
    thrustApplicationPointBodyM: placement.originBodyM,
    thrustAxisBody: normalized(placement.thrustAxisBody ?? { x: 1, y: 0, z: 0 }, "placed motor thrust axis"),
  };
}

export function createMotorLibrary(records: readonly MotorDataRecord[]): MotorLibrary {
  const copied = [...records];
  const ids = new Set<string>();
  for (const record of copied) {
    if (ids.has(record.id)) throw new Error(`duplicate motor library identifier ${record.id}`);
    ids.add(record.id);
  }
  const byId = new Map(copied.map((record) => [record.id, record]));
  return {
    modelVersion: MOTOR_DATA_MODEL_VERSION,
    validationStatus: MOTOR_DATA_MODEL_STATUS,
    records: copied,
    getById: (id) => byId.get(id) ?? null,
    search: (query = {}) => {
      const text = query.text?.trim().toLocaleLowerCase();
      const manufacturer = query.manufacturer?.trim().toLocaleLowerCase();
      if (query.minimumImpulseNs !== undefined) finiteNonNegative(query.minimumImpulseNs, "minimum motor impulse");
      if (query.maximumDiameterM !== undefined) finitePositive(query.maximumDiameterM, "maximum motor diameter");
      return copied.filter((record) => {
        const searchable = `${record.manufacturer} ${record.designation} ${record.description ?? ""}`.toLocaleLowerCase();
        return (
          (!text || searchable.includes(text)) &&
          (!manufacturer || record.manufacturer.toLocaleLowerCase() === manufacturer) &&
          (query.minimumImpulseNs === undefined || record.metrics.totalImpulseNs >= query.minimumImpulseNs) &&
          (query.maximumDiameterM === undefined || record.diameterM <= query.maximumDiameterM) &&
          (!query.validationStatus || record.provenance.validationStatus === query.validationStatus)
        );
      });
    },
  };
}
