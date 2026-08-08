import {
  IDENTITY_MATRIX,
  ZERO_VECTOR,
  addVectors,
  determinant,
  magnitude,
  multiplyMatrices,
  multiplyMatrixVector,
  rotationAboutX,
  scaleVector,
  type Matrix3,
  type Vector3,
} from "./linear-algebra.ts";
import {
  combineMassProperties,
  transformMassProperties,
  type MassProperties,
  type RigidTransform,
} from "./mass-properties.ts";
import {
  componentMassProperties,
  type VehicleComponent,
} from "./vehicle-components.ts";
import type { MotorMount } from "./clustered-propulsion.ts";

export const VEHICLE_ASSEMBLY_MODEL_VERSION = "kestrel-vehicle-assembly-0.1.0";
export const VEHICLE_ASSEMBLY_MODEL_STATUS = "analytical-component-checks-only";

export type RadialPattern = Readonly<{
  count: number;
  radiusM: number;
  angularOffsetRad?: number;
  rotateInstances?: boolean;
}>;

type AssemblyNodeBase = Readonly<{
  id: string;
  name: string;
  enabled?: boolean;
  transform?: RigidTransform;
  repeat?: RadialPattern;
}>;

export type AssemblyComponentNode = AssemblyNodeBase &
  Readonly<{
    kind: "component";
    component: VehicleComponent;
  }>;

export type AssemblyMotorNode = AssemblyNodeBase &
  Readonly<{
    kind: "motor";
    motorId: string;
    thrustApplicationPointM: Vector3;
    thrustAxis: Vector3;
  }>;

export type AssemblyGroupNode = AssemblyNodeBase &
  Readonly<{
    kind: "group";
    role: "pod" | "booster-set" | "motor-cluster" | "equipment-bay" | "custom";
    children: readonly AssemblyNode[];
  }>;

export type AssemblyNode =
  | AssemblyComponentNode
  | AssemblyMotorNode
  | AssemblyGroupNode;

export type AssemblyStageDefinition = Readonly<{
  id: string;
  name: string;
  role: "core" | "upper" | "booster" | "payload";
  attachment: "serial" | "parallel";
  parentStageId?: string;
  enabled?: boolean;
  transform?: RigidTransform;
  repeat?: RadialPattern;
  children: readonly AssemblyNode[];
}>;

export type VehicleAssemblyDefinition = Readonly<{
  id: string;
  name: string;
  stages: readonly AssemblyStageDefinition[];
}>;

export type AssemblyComponentInstance = Readonly<{
  instanceId: string;
  sourceNodeId: string;
  sourceComponentId: string;
  stageId: string;
  stageInstanceIndex: number;
  transform: Required<RigidTransform>;
  massProperties: MassProperties;
}>;

export type AssemblyMotorMountInstance = MotorMount &
  Readonly<{
    sourceNodeId: string;
    sourceMotorId: string;
    stageId: string;
    stageInstanceIndex: number;
  }>;

export type AssemblyStageEvaluation = Readonly<{
  id: string;
  name: string;
  role: AssemblyStageDefinition["role"];
  attachment: AssemblyStageDefinition["attachment"];
  parentStageId: string | null;
  instanceCount: number;
  componentInstanceCount: number;
  motorMountCount: number;
  massProperties: MassProperties;
}>;

export type VehicleAssemblyEvaluation = Readonly<{
  modelVersion: string;
  validationStatus: typeof VEHICLE_ASSEMBLY_MODEL_STATUS;
  definitionId: string;
  activeStageIds: readonly string[];
  massProperties: MassProperties;
  componentInstances: readonly AssemblyComponentInstance[];
  motorMounts: readonly AssemblyMotorMountInstance[];
  stages: readonly AssemblyStageEvaluation[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type VehicleAssemblyModel = Readonly<{
  modelVersion: string;
  validationStatus: typeof VEHICLE_ASSEMBLY_MODEL_STATUS;
  definition: VehicleAssemblyDefinition;
  stageIds: readonly string[];
  evaluate: (options?: Readonly<{ activeStageIds?: readonly string[] }>) => VehicleAssemblyEvaluation;
}>;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function validateId(id: string, label: string) {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`${label} identifiers may contain only letters, numbers, underscores, and hyphens`);
  }
}

function finiteVector(value: Vector3) {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function validateRotation(rotation: Matrix3, label: string) {
  if (!rotation.flat().every(Number.isFinite)) {
    throw new Error(`${label} rotation must contain finite values`);
  }
  const transposeTimesRotation = multiplyMatrices(
    [
      [rotation[0][0], rotation[1][0], rotation[2][0]],
      [rotation[0][1], rotation[1][1], rotation[2][1]],
      [rotation[0][2], rotation[1][2], rotation[2][2]],
    ],
    rotation,
  );
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const expected = row === column ? 1 : 0;
      if (Math.abs(transposeTimesRotation[row][column] - expected) > 1e-9) {
        throw new Error(`${label} rotation must be orthonormal`);
      }
    }
  }
  if (Math.abs(determinant(rotation) - 1) > 1e-9) {
    throw new Error(`${label} rotation must be a proper rotation with determinant +1`);
  }
}

function preparedTransform(transform: RigidTransform | undefined, label: string): Required<RigidTransform> {
  const translationM = transform?.translationM ?? ZERO_VECTOR;
  const rotation = transform?.rotation ?? IDENTITY_MATRIX;
  if (!finiteVector(translationM)) throw new Error(`${label} translation must be finite`);
  validateRotation(rotation, label);
  return { translationM, rotation };
}

function composeTransform(parent: Required<RigidTransform>, child: Required<RigidTransform>): Required<RigidTransform> {
  return {
    rotation: multiplyMatrices(parent.rotation, child.rotation),
    translationM: addVectors(parent.translationM, multiplyMatrixVector(parent.rotation, child.translationM)),
  };
}

function patternTransforms(pattern: RadialPattern | undefined, label: string): Required<RigidTransform>[] {
  if (!pattern) return [{ translationM: ZERO_VECTOR, rotation: IDENTITY_MATRIX }];
  if (!Number.isInteger(pattern.count) || pattern.count < 1 || pattern.count > 128) {
    throw new Error(`${label} repeat count must be an integer from 1 through 128`);
  }
  if (!Number.isFinite(pattern.radiusM) || pattern.radiusM < 0) {
    throw new Error(`${label} repeat radius must be a non-negative finite number`);
  }
  const offset = pattern.angularOffsetRad ?? 0;
  if (!Number.isFinite(offset)) throw new Error(`${label} angular offset must be finite`);
  return Array.from({ length: pattern.count }, (_, index) => {
    const angle = offset + (index * 2 * Math.PI) / pattern.count;
    return {
      translationM: { x: 0, y: pattern.radiusM * Math.cos(angle), z: pattern.radiusM * Math.sin(angle) },
      rotation: pattern.rotateInstances === false ? IDENTITY_MATRIX : rotationAboutX(angle),
    };
  });
}

function normalized(vector: Vector3, label: string) {
  const length = magnitude(vector);
  if (!finiteVector(vector) || !(length > 0)) throw new Error(`${label} must be a finite non-zero vector`);
  return scaleVector(vector, 1 / length);
}

function emptyMassLabel(label: string): never {
  throw new Error(`${label} contains no enabled structural component instances`);
}

export function createVehicleAssemblyModel(definition: VehicleAssemblyDefinition): VehicleAssemblyModel {
  validateId(definition.id, "assembly");
  if (!definition.name.trim()) throw new Error("assembly name cannot be empty");
  if (definition.stages.length === 0) throw new Error("an assembly requires at least one stage");
  const stageIds = new Set<string>();
  const nodeIds = new Set<string>();
  const activeObjects = new WeakSet<object>();

  const validateNode = (node: AssemblyNode, path: string) => {
    if (activeObjects.has(node)) throw new Error(`assembly node cycle detected at ${path}`);
    activeObjects.add(node);
    validateId(node.id, "node");
    if (nodeIds.has(node.id)) throw new Error(`duplicate assembly node identifier ${node.id}`);
    nodeIds.add(node.id);
    if (!node.name.trim()) throw new Error(`assembly node ${node.id} name cannot be empty`);
    preparedTransform(node.transform, `node ${node.id}`);
    patternTransforms(node.repeat, `node ${node.id}`);
    if (node.kind === "component") {
      componentMassProperties(node.component);
    } else if (node.kind === "motor") {
      validateId(node.motorId, "motor");
      if (!finiteVector(node.thrustApplicationPointM)) {
        throw new Error(`motor ${node.motorId} thrust application point must be finite`);
      }
      normalized(node.thrustAxis, `motor ${node.motorId} thrust axis`);
    } else {
      if (node.children.length === 0) throw new Error(`group ${node.id} must contain at least one child`);
      node.children.forEach((child) => validateNode(child, `${path}/${child.id}`));
    }
    activeObjects.delete(node);
  };

  definition.stages.forEach((stage) => {
    validateId(stage.id, "stage");
    if (stageIds.has(stage.id)) throw new Error(`duplicate stage identifier ${stage.id}`);
    stageIds.add(stage.id);
    if (!stage.name.trim()) throw new Error(`stage ${stage.id} name cannot be empty`);
    if (stage.children.length === 0) throw new Error(`stage ${stage.id} must contain at least one child`);
    preparedTransform(stage.transform, `stage ${stage.id}`);
    patternTransforms(stage.repeat, `stage ${stage.id}`);
    stage.children.forEach((node) => validateNode(node, `${stage.id}/${node.id}`));
  });

  definition.stages.forEach((stage, index) => {
    if (stage.attachment === "parallel" && !stage.parentStageId) {
      throw new Error(`parallel stage ${stage.id} requires a parent stage`);
    }
    if (stage.parentStageId) {
      if (!stageIds.has(stage.parentStageId)) throw new Error(`stage ${stage.id} references unknown parent ${stage.parentStageId}`);
      if (stage.parentStageId === stage.id) throw new Error(`stage ${stage.id} cannot be its own parent`);
      const parentIndex = definition.stages.findIndex((candidate) => candidate.id === stage.parentStageId);
      if (parentIndex >= index) throw new Error(`stage ${stage.id} parent must appear earlier in the assembly`);
    }
  });

  const evaluate = (options: Readonly<{ activeStageIds?: readonly string[] }> = {}): VehicleAssemblyEvaluation => {
    const requested = options.activeStageIds ? new Set(options.activeStageIds) : null;
    if (requested) {
      const unknown = [...requested].filter((stageId) => !stageIds.has(stageId));
      if (unknown.length) throw new Error(`unknown active stage identifiers: ${unknown.join(", ")}`);
    }
    const enabledStages = definition.stages.filter(
      (stage) => stage.enabled !== false && (!requested || requested.has(stage.id)),
    );
    const componentInstances: AssemblyComponentInstance[] = [];
    const motorMounts: AssemblyMotorMountInstance[] = [];
    const stageEvaluations: AssemblyStageEvaluation[] = [];
    let offAxisStructuralInstances = 0;

    for (const stage of enabledStages) {
      const stageComponents: AssemblyComponentInstance[] = [];
      const stageMotors: AssemblyMotorMountInstance[] = [];
      const stageBase = preparedTransform(stage.transform, `stage ${stage.id}`);
      const stagePatterns = patternTransforms(stage.repeat, `stage ${stage.id}`);

      const visit = (
        node: AssemblyNode,
        parent: Required<RigidTransform>,
        stageInstanceIndex: number,
        path: string,
      ) => {
        if (node.enabled === false) return;
        const local = preparedTransform(node.transform, `node ${node.id}`);
        const repeats = patternTransforms(node.repeat, `node ${node.id}`);
        repeats.forEach((repeatTransform, repeatIndex) => {
          const transform = composeTransform(parent, composeTransform(repeatTransform, local));
          const instanceId = `${stage.id}:${stageInstanceIndex}:${path}:${repeatIndex}`;
          if (node.kind === "component") {
            const instance: AssemblyComponentInstance = {
              instanceId,
              sourceNodeId: node.id,
              sourceComponentId: node.component.id,
              stageId: stage.id,
              stageInstanceIndex,
              transform,
              massProperties: transformMassProperties(componentMassProperties(node.component), transform),
            };
            stageComponents.push(instance);
            componentInstances.push(instance);
            if (Math.hypot(instance.massProperties.centerOfMassM.y, instance.massProperties.centerOfMassM.z) > 1e-12) {
              offAxisStructuralInstances += 1;
            }
          } else if (node.kind === "motor") {
            const sourceAxis = normalized(node.thrustAxis, `motor ${node.motorId} thrust axis`);
            const mount: AssemblyMotorMountInstance = {
              motorId: `${stage.id}:${stageInstanceIndex}:${path}:${repeatIndex}:${node.motorId}`,
              sourceNodeId: node.id,
              sourceMotorId: node.motorId,
              stageId: stage.id,
              stageInstanceIndex,
              thrustApplicationPointBodyM: addVectors(
                transform.translationM,
                multiplyMatrixVector(transform.rotation, node.thrustApplicationPointM),
              ),
              thrustAxisBody: normalized(
                multiplyMatrixVector(transform.rotation, sourceAxis),
                `motor ${node.motorId} transformed thrust axis`,
              ),
            };
            stageMotors.push(mount);
            motorMounts.push(mount);
          } else {
            node.children.forEach((child) => visit(child, transform, stageInstanceIndex, `${path}.${repeatIndex}.${child.id}`));
          }
        });
      };

      stagePatterns.forEach((stagePattern, stageInstanceIndex) => {
        const stageTransform = composeTransform(stagePattern, stageBase);
        stage.children.forEach((node) => visit(node, stageTransform, stageInstanceIndex, node.id));
      });
      if (stageComponents.length === 0) emptyMassLabel(`stage ${stage.id}`);
      stageEvaluations.push({
        id: stage.id,
        name: stage.name,
        role: stage.role,
        attachment: stage.attachment,
        parentStageId: stage.parentStageId ?? null,
        instanceCount: stagePatterns.length,
        componentInstanceCount: stageComponents.length,
        motorMountCount: stageMotors.length,
        massProperties: combineMassProperties(stageComponents.map((instance) => instance.massProperties)),
      });
    }
    if (componentInstances.length === 0) emptyMassLabel("active assembly");
    return {
      modelVersion: VEHICLE_ASSEMBLY_MODEL_VERSION,
      validationStatus: VEHICLE_ASSEMBLY_MODEL_STATUS,
      definitionId: definition.id,
      activeStageIds: enabledStages.map((stage) => stage.id),
      massProperties: combineMassProperties(componentInstances.map((instance) => instance.massProperties)),
      componentInstances,
      motorMounts,
      stages: stageEvaluations,
      warnings: [
        ...(offAxisStructuralInstances > 0
          ? [`${offAxisStructuralInstances} off-axis structural instances affect mass properties; aerodynamic interference and crossflow remain unmodeled.`]
          : []),
        "Stage attachment topology changes mass and motor geometry only; separation transients require the multi-stage event model.",
        "Motor mounts define thrust geometry but do not add dry or propellant mass unless matching structural components are supplied.",
        "Assembly calculations have analytical component checks only and are not flight-safety validated.",
      ],
      assumptions: [
        "All placements are rigid body-frame transforms with the vehicle nose along +X.",
        "Radial patterns are equally spaced about the body X axis and share one stage event state.",
        "Component inertia is rotated and translated with the tensor parallel-axis theorem.",
        "Disabled nodes and inactive stages contribute neither mass nor motor mounts.",
      ],
    };
  };

  return {
    modelVersion: VEHICLE_ASSEMBLY_MODEL_VERSION,
    validationStatus: VEHICLE_ASSEMBLY_MODEL_STATUS,
    definition,
    stageIds: [...stageIds],
    evaluate,
  };
}
