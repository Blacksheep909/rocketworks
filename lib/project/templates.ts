import type { EditableProjectInputs } from "./project-state.ts";

export const EXPERIENCE_MODE_STORAGE_KEY = "kestrel.project.arc54.experience-mode.v1";

export type ExperienceMode = "beginner" | "expert";
export type ProjectTemplateId = "first-flight" | "high-power" | "weather-study" | "ballistic-check";

export type ProjectTemplate = Readonly<{
  id: ProjectTemplateId;
  name: string;
  eyebrow: string;
  description: string;
  audience: string;
  inputs: EditableProjectInputs;
  focus: ReadonlyArray<string>;
}>;

export const PROJECT_TEMPLATES: ReadonlyArray<ProjectTemplate> = [
  {
    id: "first-flight",
    name: "First flight",
    eyebrow: "BEGINNER",
    description: "A compact, recovery-equipped vehicle with conservative inputs for learning the design loop.",
    audience: "Start here",
    inputs: {
      lengthMm: 710,
      diameterMm: 54,
      payloadMassKg: 0.16,
      material: "kraft",
      thrustN: 22,
      burnTimeS: 1.65,
      dragCoefficient: 0.52,
      launchAltitudeM: 80,
      windSpeedMps: 4,
      launchRailEnabled: true,
      launchRailLengthM: 1.2,
      recoveryEnabled: true,
      recoveryDelayS: 0,
      recoveryDiameterM: 0.45,
    },
    focus: ["See how CG and CP change with geometry", "Run a first vertical estimate", "Read the uncertainty envelope"],
  },
  {
    id: "high-power",
    name: "High-power study",
    eyebrow: "EXPERT",
    description: "A heavier composite vehicle intended for exploring thrust, dynamic pressure, and recovery tradeoffs.",
    audience: "Trade studies",
    inputs: {
      lengthMm: 1200,
      diameterMm: 75,
      payloadMassKg: 0.45,
      material: "fiberglass",
      thrustN: 95,
      burnTimeS: 2.8,
      dragCoefficient: 0.48,
      launchAltitudeM: 180,
      windSpeedMps: 6,
      launchRailEnabled: true,
      launchRailLengthM: 1.5,
      recoveryEnabled: true,
      recoveryDelayS: 1,
      recoveryDiameterM: 0.75,
    },
    focus: ["Inspect maximum dynamic pressure", "Compare recovery impact speed", "Use bounded optimization with guardrails"],
  },
  {
    id: "weather-study",
    name: "Weather study",
    eyebrow: "ANALYSIS",
    description: "A moderate vehicle with stronger wind inputs for exploring deterministic turbulence and landing dispersion.",
    audience: "Environment work",
    inputs: {
      lengthMm: 900,
      diameterMm: 60,
      payloadMassKg: 0.3,
      material: "carbon",
      thrustN: 42,
      burnTimeS: 2.2,
      dragCoefficient: 0.6,
      launchAltitudeM: 150,
      windSpeedMps: 12,
      launchRailEnabled: true,
      launchRailLengthM: 1.2,
      recoveryEnabled: true,
      recoveryDelayS: 0.5,
      recoveryDiameterM: 0.6,
    },
    focus: ["Read mean wind and turbulence", "Inspect the landing footprint", "Compare sensitivity drivers"],
  },
  {
    id: "ballistic-check",
    name: "Ballistic check",
    eyebrow: "DIAGNOSTIC",
    description: "A recovery-disabled configuration for understanding the descent baseline and warning system.",
    audience: "Model inspection",
    inputs: {
      lengthMm: 500,
      diameterMm: 40,
      payloadMassKg: 0.08,
      material: "kraft",
      thrustN: 12,
      burnTimeS: 1.2,
      dragCoefficient: 0.55,
      launchAltitudeM: 0,
      windSpeedMps: 2,
      launchRailEnabled: true,
      launchRailLengthM: 0.9,
      recoveryEnabled: false,
      recoveryDelayS: 0,
      recoveryDiameterM: 0.4,
    },
    focus: ["See the ballistic descent warning", "Compare recovery and no-recovery states", "Understand model assumptions"],
  },
];

export function findProjectTemplate(id: ProjectTemplateId): ProjectTemplate {
  const template = PROJECT_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown project template: ${id}`);
  return template;
}
