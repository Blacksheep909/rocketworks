import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_QUATERNION,
  LAUNCH_ENVIRONMENT_MODEL_VERSION,
  combineRigidBodyLoadProviders,
  commandRecoveryDevice,
  createLaunchEnvironmentModel,
  createAltitudeRecoveryDeploymentEvent,
  createApogeeRecoveryDeploymentEvent,
  createRecoverySystemModel,
  createScheduledRecoveryDeploymentEvent,
  createScheduledRecoveryFailureEvent,
  failRecoveryDevice,
  gravityAtAltitude,
  recoveryCommandTimeKey,
  simulateRigidBody6D,
  standardAtmosphere,
} from "../lib/physics/index.ts";

function recoveryEnvironment() {
  return createLaunchEnvironmentModel({
    site: {
      name: "Recovery fixture",
      latitudeDeg: 0,
      longitudeDeg: 0,
      elevationM: 400,
      datum: "WGS84",
      timeZone: "UTC",
    },
    provenance: {
      sourceName: "Synthetic recovery fixture",
      sourceKind: "synthetic",
      dataVersion: "fixture-1",
      licenseIdentifier: "CC0-1.0",
      attribution: "RocketWorks test fixture",
      validationStatus: "synthetic-unvalidated",
    },
    meanWindProfile: [{ altitudeM: 0, eastMps: 8, northMps: 0, upMps: 0 }],
  });
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const body = {
  massKg: 1,
  inertiaBodyKgM2: [
    [0.1, 0, 0],
    [0, 0.2, 0],
    [0, 0, 0.2],
  ],
};

function state(timeS = 0, overrides = {}) {
  return {
    timeS,
    positionWorldM: { x: 0, y: 0, z: 0 },
    velocityWorldMps: { x: 0, y: 0, z: 0 },
    orientationBodyToWorld: IDENTITY_QUATERNION,
    angularVelocityBodyRadS: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

function device(overrides = {}) {
  return {
    id: "main",
    name: "Main parachute",
    dragCoefficient: 1.5,
    referenceAreaM2: 0.5,
    deploymentDelayS: 0,
    inflationTimeS: 0,
    ...overrides,
  };
}

function model(overrides = {}) {
  return createRecoverySystemModel({ devices: [device()], ...overrides });
}

test("fully inflated canopy matches the vector drag equation", () => {
  const recovery = createRecoverySystemModel({
    devices: [device({ dragCoefficient: 2, referenceAreaM2: 1 })],
  });
  const commanded = commandRecoveryDevice(
    state(0, { velocityWorldMps: { x: 3, y: 4, z: 0 } }),
    "main",
  );
  const result = recovery.evaluate(commanded);
  const density = standardAtmosphere(0).densityKgM3;
  const expectedDragN = 0.5 * density * 5 ** 2 * 2;

  close(result.devices[0].dragN, expectedDragN, 1e-12, "drag magnitude");
  close(result.loads.forceWorldN.x, -expectedDragN * 3 / 5, 1e-12, "drag x");
  close(result.loads.forceWorldN.y, -expectedDragN * 4 / 5, 1e-12, "drag y");
  assert.equal(result.devices[0].phase, "inflated");
});

test("delay and smooth inflation produce the documented effective area", () => {
  const recovery = createRecoverySystemModel({
    devices: [device({ deploymentDelayS: 1, inflationTimeS: 2 })],
  });
  const initial = commandRecoveryDevice(state(0), "main");
  const delayed = recovery.evaluate({ ...initial, timeS: 0.5 });
  const inflating = recovery.evaluate({
    ...initial,
    timeS: 1.5,
    velocityWorldMps: { x: 0, y: 0, z: -10 },
  });

  assert.equal(delayed.devices[0].phase, "delayed");
  close(delayed.devices[0].inflationFraction, 0, 1e-15, "delayed fraction");
  assert.equal(inflating.devices[0].phase, "inflating");
  close(inflating.devices[0].inflationFraction, 0.15625, 1e-15, "smoothstep fraction");
  assert.ok(
    inflating.applicability.some(
      (issue) => issue.code === "INFLATION_APPROXIMATION",
    ),
  );
});

test("reefing stages reduce effective canopy area before full opening", () => {
  const recovery = createRecoverySystemModel({
    devices: [device({
      referenceAreaM2: 2,
      reefingStages: [
        { timeFromInflationS: 0, areaFraction: 0.25 },
        { timeFromInflationS: 2, areaFraction: 1 },
      ],
    })],
  });
  const commanded = commandRecoveryDevice(
    state(0, { velocityWorldMps: { x: 0, y: 0, z: -10 } }),
    "main",
  );
  const reefed = recovery.evaluate({ ...commanded, timeS: 1 });
  const open = recovery.evaluate({ ...commanded, timeS: 2 });

  assert.equal(reefed.devices[0].phase, "reefing");
  close(reefed.devices[0].reefingFraction, 0.625, 1e-15, "reefing fraction");
  close(reefed.devices[0].effectiveAreaM2, 1.25, 1e-15, "reefed area");
  assert.equal(reefed.devices[0].reefingStageIndex, 1);
  assert.ok(reefed.applicability.some((issue) => issue.code === "REEFING_APPROXIMATION"));
  assert.equal(open.devices[0].phase, "inflated");
  close(open.devices[0].reefingFraction, 1, 1e-15, "fully open fraction");
});

test("wind-relative recovery force opposes air motion", () => {
  const recovery = model({
    windProfile: [
      { altitudeM: 0, eastMps: 10, northMps: 0 },
      { altitudeM: 1000, eastMps: 10, northMps: 0 },
    ],
  });
  const result = recovery.evaluate(commandRecoveryDevice(state(), "main"));

  close(result.airRelativeVelocityWorldMps.x, -10, 1e-15, "relative east speed");
  assert.ok(result.loads.forceWorldN.x > 0);
});

test("recovery loads consume the shared launch environment provider", () => {
  const environment = recoveryEnvironment();
  const recovery = model({ environmentAt: environment.at });
  const result = recovery.evaluate(commandRecoveryDevice(
    state(1, { positionWorldM: { x: 0, y: 0, z: 100 } }),
    "main",
  ));

  assert.equal(result.environmentModelVersion, LAUNCH_ENVIRONMENT_MODEL_VERSION);
  assert.deepEqual(result.meanWindWorldMps, { x: 8, y: 0, z: 0 });
  assert.deepEqual(result.turbulenceWindWorldMps, { x: 0, y: 0, z: 0 });
  assert.deepEqual(result.activeGustIds, []);
  close(result.altitudeAslM, 500, 1e-12, "recovery ASL altitude");
  assert.ok(result.loads.forceWorldN.x > 0);
});

test("off-center canopy force creates the expected body moment", () => {
  const recovery = createRecoverySystemModel({
    devices: [device({ applicationPointBodyM: { x: 1, y: 0, z: 0 } })],
    centerOfMassBodyM: () => ({ x: 0, y: 0, z: 0 }),
  });
  const result = recovery.evaluate(
    commandRecoveryDevice(
      state(0, { velocityWorldMps: { x: 0, y: 0, z: -10 } }),
      "main",
    ),
  );

  assert.ok(result.loads.forceWorldN.z > 0);
  close(
    result.loads.momentBodyNm.y,
    -result.loads.forceWorldN.z,
    1e-12,
    "off-center pitch moment",
  );
});

test("failure state suppresses deployment and recovery force", () => {
  const recovery = model();
  const commanded = commandRecoveryDevice(
    state(0, { velocityWorldMps: { x: 0, y: 0, z: -10 } }),
    "main",
  );
  const failed = failRecoveryDevice(commanded, "main");
  const result = recovery.evaluate(failed);

  assert.equal(result.devices[0].phase, "failed");
  close(result.devices[0].inflationFraction, 0, 1e-15, "failed inflation");
  close(result.devices[0].dragN, 0, 1e-15, "failed drag");
});

test("apogee trigger commands recovery at the root-found vertical-speed zero", () => {
  const apogeeEvent = createApogeeRecoveryDeploymentEvent({ deviceId: "main" });
  const gravity = (currentState) => ({
    forceWorldN: {
      x: 0,
      y: 0,
      z: -gravityAtAltitude(currentState.positionWorldM.z),
    },
  });
  const result = simulateRigidBody6D({
    body,
    initialState: state(0, {
      positionWorldM: { x: 0, y: 0, z: 1 },
      velocityWorldMps: { x: 0, y: 0, z: 20 },
    }),
    durationS: 5,
    timeStepS: 0.4,
    loads: gravity,
    stateEvents: [apogeeEvent],
  });
  const event = result.events.find((candidate) => candidate.id === apogeeEvent.id);

  assert.ok(event);
  close(event.stateBefore.velocityWorldMps.z, 0, 2e-8, "apogee vertical speed");
  close(
    event.stateAfter.discreteState[recoveryCommandTimeKey("main")],
    event.timeS,
    1e-15,
    "command time",
  );
});

function simulateDescent(withRecovery) {
  const recovery = model();
  const gravity = (currentState) => ({
    forceWorldN: {
      x: 0,
      y: 0,
      z: -gravityAtAltitude(currentState.positionWorldM.z),
    },
  });
  const loads = withRecovery
    ? combineRigidBodyLoadProviders(gravity, recovery.loads)
    : gravity;
  return simulateRigidBody6D({
    body,
    initialState: withRecovery
      ? commandRecoveryDevice(
          state(0, {
            positionWorldM: { x: 0, y: 0, z: 100 },
            velocityWorldMps: { x: 0, y: 0, z: 0 },
          }),
          "main",
        )
      : state(0, {
          positionWorldM: { x: 0, y: 0, z: 100 },
          velocityWorldMps: { x: 0, y: 0, z: 0 },
        }),
    durationS: 60,
    timeStepS: 0.02,
    loads,
    stateEvents: [
      {
        id: "ground-impact",
        label: "Ground impact",
        direction: "falling",
        terminal: true,
        value: (currentState) => currentState.positionWorldM.z,
      },
    ],
  });
}

test("recovery coupling materially reduces root-found ground impact speed", () => {
  const ballistic = simulateDescent(false);
  const recovered = simulateDescent(true);
  const ballisticSpeed = Math.abs(ballistic.finalState.velocityWorldMps.z);
  const recoveredSpeed = Math.abs(recovered.finalState.velocityWorldMps.z);

  assert.equal(ballistic.termination.id, "ground-impact");
  assert.equal(recovered.termination.id, "ground-impact");
  assert.ok(recoveredSpeed < ballisticSpeed * 0.35);
  close(recovered.finalState.positionWorldM.z, 0, 2e-8, "recovered impact altitude");
});

test("scheduled and altitude helpers preserve deterministic state semantics", () => {
  const scheduled = createScheduledRecoveryDeploymentEvent({
    deviceId: "main",
    timeS: 2,
  });
  const failure = createScheduledRecoveryFailureEvent({
    deviceId: "main",
    timeS: 3,
  });
  const altitude = createAltitudeRecoveryDeploymentEvent({
    deviceId: "main",
    altitudeAglM: 100,
  });
  const commanded = scheduled.apply(state(2));
  const failed = failure.apply({ ...commanded, timeS: 3 });

  close(commanded.discreteState[recoveryCommandTimeKey("main")], 2, 1e-15, "scheduled command");
  assert.equal(failed.discreteState["recovery.main.failed"], true);
  close(altitude.value(state(0, { positionWorldM: { x: 0, y: 0, z: 125 } })), 25, 1e-15, "altitude surface");
  assert.equal(altitude.direction, "falling");
});

test("invalid devices and Mach extrapolation are explainable", () => {
  assert.throws(
    () =>
      createRecoverySystemModel({
        devices: [device(), device()],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      createRecoverySystemModel({
        devices: [device({ id: "invalid id" })],
      }),
    /identifiers/,
  );
  assert.throws(
    () =>
      createRecoverySystemModel({
        devices: [device({ reefingStages: [{ timeFromInflationS: 1, areaFraction: 1 }] })],
      }),
    /start at 0 seconds/,
  );
  const recovery = createRecoverySystemModel({
    devices: [device({ maximumModelMach: 0.1 })],
  });
  const result = recovery.evaluate(
    commandRecoveryDevice(
      state(0, { velocityWorldMps: { x: 0, y: 0, z: -100 } }),
      "main",
    ),
  );
  assert.ok(
    result.applicability.some(
      (issue) =>
        issue.code === "MACH_LIMIT_EXCEEDED" &&
        issue.severity === "unsupported",
    ),
  );
  assert.throws(
    () =>
      recovery.evaluate(
        state(0, {
          discreteState: { [recoveryCommandTimeKey("main")]: "now" },
        }),
      ),
    /command time must be a finite number/,
  );
});

test("interaction warning appears only when multiple canopies are active", () => {
  const recovery = createRecoverySystemModel({
    devices: [device(), device({ id: "drogue", name: "Drogue" })],
  });
  const oneActive = recovery.evaluate(commandRecoveryDevice(state(), "main"));
  const bothActive = recovery.evaluate(
    commandRecoveryDevice(
      commandRecoveryDevice(state(), "main"),
      "drogue",
    ),
  );

  assert.equal(
    oneActive.applicability.filter(
      (issue) => issue.code === "CANOPY_INTERACTION_OMITTED",
    ).length,
    0,
  );
  assert.equal(
    bothActive.applicability.filter(
      (issue) => issue.code === "CANOPY_INTERACTION_OMITTED",
    ).length,
    2,
  );
});
