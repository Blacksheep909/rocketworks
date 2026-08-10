/**
 * Deterministic mission-event ordering for coupled flight previews.
 *
 * The allocator does not invent trigger times or change event predicates. It
 * only resolves declaration order, priorities, and explicit dependencies so
 * simultaneous transitions are repeatable and explainable. Results remain an
 * engineering preview and are not a flight-safety validation.
 */

export const MISSION_EVENT_ALLOCATOR_MODEL_VERSION =
  "rocketworks-event-allocator-0.1.0";
export const MISSION_EVENT_ALLOCATOR_STATUS =
  "analytical-event-ordering-checks-only" as const;

export type MissionEventKind =
  | "rail"
  | "separation"
  | "ignition"
  | "failure"
  | "recovery"
  | "custom";

export type MissionEventDeclaration = Readonly<{
  id: string;
  label: string;
  kind?: MissionEventKind;
  /** Optional scheduled/root hint. Unknown state-triggered events omit it. */
  timeS?: number | null;
  /** Explicit lower values run first for otherwise simultaneous events. */
  priority?: number;
  /** Event IDs that must be allocated before this event. */
  dependsOn?: readonly string[];
  /** Optional command-group key for detecting competing declarations. */
  mutualExclusionKey?: string;
}>;

export type MissionEventDependency = Readonly<{
  beforeId: string;
  afterId: string;
}>;

export type MissionEventTimeGroup = Readonly<{
  timeS: number;
  eventIds: readonly string[];
}>;

export type MissionEventAllocation = Readonly<{
  modelVersion: typeof MISSION_EVENT_ALLOCATOR_MODEL_VERSION;
  validationStatus: typeof MISSION_EVENT_ALLOCATOR_STATUS;
  status: "allocated" | "watch" | "invalid";
  orderedEventIds: readonly string[];
  priorityByEventId: Readonly<Record<string, number>>;
  dependencies: readonly MissionEventDependency[];
  sameTimeGroups: readonly MissionEventTimeGroup[];
  warnings: readonly string[];
  assumptions: readonly string[];
}>;

export type MissionEventAllocationResult<T extends MissionEventDeclaration> = Readonly<{
  events: readonly T[];
  allocation: MissionEventAllocation;
}>;

const PRIORITY_BY_KIND: Readonly<Record<MissionEventKind, number>> = {
  rail: 0,
  separation: 10,
  ignition: 20,
  failure: 30,
  recovery: 40,
  custom: 100,
};

const EVENT_KINDS = new Set<MissionEventKind>([
  "rail",
  "separation",
  "ignition",
  "failure",
  "recovery",
  "custom",
]);

function uniqueWarnings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function normalizedKind(event: MissionEventDeclaration): MissionEventKind {
  if (event.kind !== undefined) return event.kind;
  const text = `${event.id} ${event.label}`.toLowerCase();
  if (text.includes("rail")) return "rail";
  if (text.includes("separat") || text.includes("staging") || text.includes("discard")) return "separation";
  if (text.includes("ignit") || text.includes("burnout")) return "ignition";
  if (text.includes("recover") || text.includes("apogee") || text.includes("canopy")) return "recovery";
  if (text.includes("fail")) return "failure";
  return "custom";
}

export function inferMissionEventKind(event: Pick<MissionEventDeclaration, "id" | "label">): MissionEventKind {
  return normalizedKind(event);
}

function normalizedPriority(event: MissionEventDeclaration): number {
  return event.priority ?? PRIORITY_BY_KIND[normalizedKind(event)];
}

function validTimeHint(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function compareNodes(
  left: { id: string; timeS?: number | null; priority: number; index: number },
  right: { id: string; timeS?: number | null; priority: number; index: number },
): number {
  const leftTime = validTimeHint(left.timeS) ? left.timeS : Infinity;
  const rightTime = validTimeHint(right.timeS) ? right.timeS : Infinity;
  return leftTime - rightTime || left.priority - right.priority || left.index - right.index || left.id.localeCompare(right.id);
}

/**
 * Allocate a stable order for scheduled and state-triggered event
 * declarations. The returned event objects preserve their original identity.
 */
export function allocateMissionEventPlan<T extends MissionEventDeclaration>(
  inputEvents: readonly T[],
): MissionEventAllocationResult<T> {
  const warnings: string[] = [];
  const assumptions = [
    "The allocator resolves ordering only; it does not alter trigger predicates or root-found times.",
    "Unknown state-triggered times are ordered by priority and declaration order until the simulator locates their roots.",
    "Same-time event groups use lower numeric priority first, then explicit dependencies, then declaration order.",
  ];
  const nodes = inputEvents.map((event, index) => ({
    event,
    id: event.id,
    index,
    priority: normalizedPriority(event),
  }));
  const statusErrors: string[] = [];
  const byId = new Map<string, (typeof nodes)[number]>();
  for (const node of nodes) {
    if (typeof node.id !== "string" || node.id.trim().length === 0) {
      statusErrors.push("Every mission event must have a non-empty identifier.");
      continue;
    }
    if (typeof node.event.label !== "string" || node.event.label.trim().length === 0) {
      statusErrors.push(`Event ${node.id} must have a non-empty label.`);
    }
    if (node.event.kind !== undefined && !EVENT_KINDS.has(node.event.kind)) {
      statusErrors.push(`Event ${node.id} has an unsupported event kind.`);
    }
    if (!Number.isFinite(node.priority)) {
      statusErrors.push(`Event ${node.id} priority must be finite.`);
    }
    if (node.event.timeS !== undefined && node.event.timeS !== null && !Number.isFinite(node.event.timeS)) {
      statusErrors.push(`Event ${node.id} time hint must be finite when supplied.`);
    }
    if (byId.has(node.id)) {
      statusErrors.push(`Duplicate mission event identifier: ${node.id}.`);
    } else {
      byId.set(node.id, node);
    }
  }

  const dependencies: MissionEventDependency[] = [];
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.id, 0);
  for (const node of nodes) {
    const dependencyIds = node.event.dependsOn ?? [];
    const uniqueDependencyIds = new Set<string>();
    for (const dependencyId of dependencyIds) {
      if (typeof dependencyId !== "string" || dependencyId.trim().length === 0) {
        statusErrors.push(`Event ${node.id} has an empty dependency identifier.`);
        continue;
      }
      if (uniqueDependencyIds.has(dependencyId)) {
        statusErrors.push(`Event ${node.id} repeats dependency ${dependencyId}.`);
        continue;
      }
      uniqueDependencyIds.add(dependencyId);
      if (dependencyId === node.id) {
        statusErrors.push(`Event ${node.id} cannot depend on itself.`);
        continue;
      }
      if (!byId.has(dependencyId)) {
        statusErrors.push(`Event ${node.id} depends on missing event ${dependencyId}.`);
        continue;
      }
      dependencies.push({ beforeId: dependencyId, afterId: node.id });
      const dependents = outgoing.get(dependencyId) ?? [];
      dependents.push(node.id);
      outgoing.set(dependencyId, dependents);
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const before = byId.get(dependencyId)!;
      if (validTimeHint(before.event.timeS) && validTimeHint(node.event.timeS) && before.event.timeS > node.event.timeS) {
        warnings.push(`Dependency ${dependencyId} → ${node.id} requests an order that conflicts with the supplied time hints; trigger timing remains authoritative.`);
      }
    }
  }

  const sameTimeGroups: MissionEventTimeGroup[] = [];
  const timeGroups = new Map<number, string[]>();
  for (const node of nodes) {
    if (!validTimeHint(node.event.timeS)) continue;
    const group = timeGroups.get(node.event.timeS);
    if (group) group.push(node.id);
    else timeGroups.set(node.event.timeS, [node.id]);
  }
  for (const [timeS, eventIds] of timeGroups.entries()) {
    if (eventIds.length < 2) continue;
    const orderedIds = [...eventIds].sort((leftId, rightId) => compareNodes(
      byId.get(leftId)!,
      byId.get(rightId)!,
    ));
    sameTimeGroups.push({ timeS, eventIds: orderedIds });
    warnings.push(`Simultaneous event group at ${timeS.toFixed(6)} s allocated deterministically: ${orderedIds.join(", ")}.`);
    const groupKeys = new Map<string, string[]>();
    for (const eventId of eventIds) {
      const key = byId.get(eventId)!.event.mutualExclusionKey?.trim();
      if (!key) continue;
      const members = groupKeys.get(key);
      if (members) members.push(eventId);
      else groupKeys.set(key, [eventId]);
    }
    for (const [key, members] of groupKeys.entries()) {
      if (members.length > 1) {
        warnings.push(`Mutually exclusive event group ${key} contains simultaneous declarations: ${members.join(", ")}.`);
      }
    }
  }
  sameTimeGroups.sort((left, right) => left.timeS - right.timeS);

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0);
  const orderedNodes: typeof nodes = [];
  const pushQueue = (node: (typeof nodes)[number]) => {
    queue.push(node);
    queue.sort(compareNodes);
  };
  queue.sort(compareNodes);
  while (queue.length > 0) {
    const node = queue.shift()!;
    orderedNodes.push(node);
    for (const dependentId of outgoing.get(node.id) ?? []) {
      const nextDegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextDegree);
      if (nextDegree === 0) pushQueue(byId.get(dependentId)!);
    }
  }
  if (orderedNodes.length !== nodes.length) {
    statusErrors.push("Mission event dependencies contain a cycle; no safe allocation exists.");
  }

  const priorityByEventId = Object.fromEntries(
    nodes.map((node) => [node.id, node.priority]),
  );
  const allocationWarnings = uniqueWarnings([...statusErrors, ...warnings]);
  const allocation: MissionEventAllocation = {
    modelVersion: MISSION_EVENT_ALLOCATOR_MODEL_VERSION,
    validationStatus: MISSION_EVENT_ALLOCATOR_STATUS,
    status: statusErrors.length > 0 ? "invalid" : allocationWarnings.length > 0 ? "watch" : "allocated",
    orderedEventIds: orderedNodes.length === nodes.length
      ? orderedNodes.map((node) => node.id)
      : nodes.slice().sort(compareNodes).map((node) => node.id),
    priorityByEventId,
    dependencies,
    sameTimeGroups,
    warnings: allocationWarnings,
    assumptions,
  };
  const events = orderedNodes.length === nodes.length
    ? orderedNodes.map((node) => node.event)
    : nodes.slice().sort(compareNodes).map((node) => node.event);
  return { events, allocation };
}

