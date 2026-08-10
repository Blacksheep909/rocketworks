import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_FLIGHT_DATA_SCHEMA_ID,
  LOCAL_FLIGHT_DATA_STORAGE_KEY,
  MAX_LOCAL_FLIGHT_DATA_CSV_BYTES,
  createLocalFlightDataSnapshot,
  parseLocalFlightDataSnapshot,
  serializeLocalFlightDataSnapshot,
} from "../lib/project/flight-data-state.ts";

test("local measured-flight snapshots round-trip with an explicit schema", () => {
  const snapshot = createLocalFlightDataSnapshot({
    sourceName: "test-flight.csv",
    csv: "time_s,altitude_m\n0,0\n1,12\n",
    savedAtIso: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(snapshot.schema, LOCAL_FLIGHT_DATA_SCHEMA_ID);
  assert.equal(LOCAL_FLIGHT_DATA_STORAGE_KEY, "kestrel.project.arc54.flight-data.v1");
  assert.deepEqual(parseLocalFlightDataSnapshot(serializeLocalFlightDataSnapshot(snapshot)), snapshot);
});

test("local measured-flight snapshots reject malformed or oversized records", () => {
  assert.throws(
    () => parseLocalFlightDataSnapshot(JSON.stringify({ schema: LOCAL_FLIGHT_DATA_SCHEMA_ID, schemaVersion: 1, sourceName: "x.csv", csv: "bad", savedAtIso: "not a date" })),
    /savedAtIso must be an ISO 8601 UTC timestamp/,
  );
  assert.throws(
    () => createLocalFlightDataSnapshot({ sourceName: "x.csv", csv: "x".repeat(MAX_LOCAL_FLIGHT_DATA_CSV_BYTES + 1) }),
    /5 MB local storage limit/,
  );
  assert.throws(
    () => parseLocalFlightDataSnapshot("{not-json"),
    /not valid JSON/,
  );
});
