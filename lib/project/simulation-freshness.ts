import type { MotorDataRecord } from "../physics/motor-data.ts";
import type { AerodynamicCoefficientTableDefinition } from "../physics/aerodynamic-coefficients.ts";
import type { EditableProjectInputs } from "./project-state.ts";
import type { LocalVehicleTopology } from "./vehicle-topology.ts";

export const SIMULATION_FRESHNESS_MODEL_VERSION =
  "kestrel-simulation-freshness-0.2.0";

export type SimulationFingerprintInput = Readonly<{
  inputs: EditableProjectInputs;
  topology: LocalVehicleTopology;
  selectedMotorId: string;
  motor: MotorDataRecord;
  selectedAerodynamicTableId?: string;
  aerodynamicTable?: AerodynamicCoefficientTableDefinition | null;
  analysisOptions?: Readonly<Record<string, unknown>>;
}>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

/**
 * Creates a deterministic identity for every input that can change a preview
 * calculation or the provenance of the selected motor/aerodynamic source. It
 * is intentionally a browser-local UX contract, not a cryptographic or
 * archival project hash.
 */
export function createSimulationFingerprint(
  input: SimulationFingerprintInput,
): string {
  return JSON.stringify(
    stableValue({
      inputs: input.inputs,
      topology: input.topology,
      selectedMotorId: input.selectedMotorId,
      motor: input.motor,
      selectedAerodynamicTableId: input.selectedAerodynamicTableId ?? "constant",
      aerodynamicTable: input.aerodynamicTable ?? null,
      analysisOptions: input.analysisOptions ?? {},
    }),
  );
}

export function isSimulationFingerprintCurrent(
  lastRunFingerprint: string | null,
  currentFingerprint: string,
): boolean {
  return lastRunFingerprint !== null && lastRunFingerprint === currentFingerprint;
}
