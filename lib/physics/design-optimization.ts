export const DESIGN_OPTIMIZATION_MODEL_VERSION =
  "kestrel-design-optimization-0.1.0";
export const DESIGN_OPTIMIZATION_MODEL_STATUS =
  "engineering-preview-unvalidated";

export type OptimizationVariable = Readonly<{
  key: string;
  label: string;
  minimum: number;
  maximum: number;
  initial?: number;
}>;

export type OptimizationObjective = Readonly<{
  metricKey: string;
  label: string;
  direction: "minimize" | "maximize";
  weight?: number;
}>;

export type OptimizationConstraint = Readonly<{
  metricKey: string;
  label: string;
  relation: "less-than-or-equal" | "greater-than-or-equal";
  limit: number;
  normalizationScale?: number;
}>;

export type OptimizationConstraintEvaluation = Readonly<{
  metricKey: string;
  label: string;
  relation: OptimizationConstraint["relation"];
  value: number;
  limit: number;
  satisfied: boolean;
  normalizedViolation: number;
}>;

export type OptimizationCandidate = Readonly<{
  id: string;
  evaluationIndex: number;
  variables: Readonly<Record<string, number>>;
  metrics: Readonly<Record<string, number>>;
  constraints: readonly OptimizationConstraintEvaluation[];
  feasible: boolean;
  normalizedConstraintViolation: number;
  paretoRank: number;
  crowdingDistance: number;
  tradeoffScore: number | null;
}>;

export type DesignOptimizationResult = Readonly<{
  modelVersion: string;
  validationStatus: typeof DESIGN_OPTIMIZATION_MODEL_STATUS;
  algorithm: "seeded-constrained-nondominated-evolution";
  seed: string;
  populationSize: number;
  generations: number;
  evaluationCount: number;
  variables: readonly OptimizationVariable[];
  objectives: readonly OptimizationObjective[];
  constraints: readonly OptimizationConstraint[];
  candidates: readonly OptimizationCandidate[];
  paretoFront: readonly OptimizationCandidate[];
  recommendedCandidateId: string | null;
  assumptions: readonly string[];
  warnings: readonly string[];
}>;

type MutableCandidate = {
  id: string;
  evaluationIndex: number;
  variables: Record<string, number>;
  metrics: Record<string, number>;
  constraints: OptimizationConstraintEvaluation[];
  feasible: boolean;
  normalizedConstraintViolation: number;
  paretoRank: number;
  crowdingDistance: number;
  tradeoffScore: number | null;
};

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)) {
    throw new Error(`${label} must start with a letter and contain only letters, numbers, dots, underscores, and hyphens`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(count: number, random: () => number): number[] {
  const result = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function objectiveValue(
  candidate: MutableCandidate,
  objective: OptimizationObjective,
): number {
  const value = candidate.metrics[objective.metricKey];
  return objective.direction === "minimize" ? value : -value;
}

function constrainedDominates(
  left: MutableCandidate,
  right: MutableCandidate,
  objectives: readonly OptimizationObjective[],
): boolean {
  if (left.feasible !== right.feasible) return left.feasible;
  if (!left.feasible) {
    return (
      left.normalizedConstraintViolation <
      right.normalizedConstraintViolation - 1e-14
    );
  }
  let strictlyBetter = false;
  for (const objective of objectives) {
    const leftValue = objectiveValue(left, objective);
    const rightValue = objectiveValue(right, objective);
    if (leftValue > rightValue + 1e-14) return false;
    if (leftValue < rightValue - 1e-14) strictlyBetter = true;
  }
  return strictlyBetter;
}

function rankAndCrowding(
  candidates: MutableCandidate[],
  objectives: readonly OptimizationObjective[],
): MutableCandidate[][] {
  const dominates = candidates.map(() => [] as number[]);
  const dominatedByCount = candidates.map(() => 0);
  const fronts: number[][] = [[]];
  candidates.forEach((candidate, leftIndex) => {
    candidate.crowdingDistance = 0;
    candidates.forEach((other, rightIndex) => {
      if (leftIndex === rightIndex) return;
      if (constrainedDominates(candidate, other, objectives)) {
        dominates[leftIndex].push(rightIndex);
      } else if (constrainedDominates(other, candidate, objectives)) {
        dominatedByCount[leftIndex] += 1;
      }
    });
    if (dominatedByCount[leftIndex] === 0) {
      candidate.paretoRank = 0;
      fronts[0].push(leftIndex);
    }
  });
  let frontIndex = 0;
  while (fronts[frontIndex]?.length) {
    const next: number[] = [];
    for (const candidateIndex of fronts[frontIndex]) {
      for (const dominatedIndex of dominates[candidateIndex]) {
        dominatedByCount[dominatedIndex] -= 1;
        if (dominatedByCount[dominatedIndex] === 0) {
          candidates[dominatedIndex].paretoRank = frontIndex + 1;
          next.push(dominatedIndex);
        }
      }
    }
    if (next.length) fronts.push(next);
    frontIndex += 1;
  }

  const candidateFronts = fronts
    .filter((front) => front.length > 0)
    .map((front) => front.map((index) => candidates[index]));
  for (const front of candidateFronts) {
    if (front.length <= 2) {
      front.forEach((candidate) => {
        candidate.crowdingDistance = Number.POSITIVE_INFINITY;
      });
      continue;
    }
    for (const objective of objectives) {
      const sorted = [...front].sort((left, right) => {
        const difference =
          objectiveValue(left, objective) - objectiveValue(right, objective);
        return difference || left.id.localeCompare(right.id);
      });
      sorted[0].crowdingDistance = Number.POSITIVE_INFINITY;
      sorted[sorted.length - 1].crowdingDistance = Number.POSITIVE_INFINITY;
      const minimum = objectiveValue(sorted[0], objective);
      const maximum = objectiveValue(sorted[sorted.length - 1], objective);
      const range = maximum - minimum;
      if (!(range > 0)) continue;
      for (let index = 1; index < sorted.length - 1; index += 1) {
        if (!Number.isFinite(sorted[index].crowdingDistance)) continue;
        const previous = objectiveValue(sorted[index - 1], objective);
        const next = objectiveValue(sorted[index + 1], objective);
        sorted[index].crowdingDistance += (next - previous) / range;
      }
    }
  }
  return candidateFronts;
}

function preferenceCompare(left: MutableCandidate, right: MutableCandidate) {
  if (left.paretoRank !== right.paretoRank) {
    return left.paretoRank - right.paretoRank;
  }
  if (left.crowdingDistance !== right.crowdingDistance) {
    return right.crowdingDistance - left.crowdingDistance;
  }
  return left.id.localeCompare(right.id);
}

function publicCandidate(candidate: MutableCandidate): OptimizationCandidate {
  return {
    ...candidate,
    variables: { ...candidate.variables },
    metrics: { ...candidate.metrics },
    constraints: candidate.constraints.map((constraint) => ({ ...constraint })),
  };
}

export function runDesignOptimization(input: Readonly<{
  seed: string;
  populationSize: number;
  generations: number;
  variables: readonly OptimizationVariable[];
  objectives: readonly OptimizationObjective[];
  constraints?: readonly OptimizationConstraint[];
  evaluator: (
    variables: Readonly<Record<string, number>>,
  ) => Readonly<Record<string, number>>;
}>): DesignOptimizationResult {
  if (!input.seed.trim()) throw new Error("optimization seed cannot be empty");
  if (
    !Number.isInteger(input.populationSize) ||
    input.populationSize < 8 ||
    input.populationSize > 256 ||
    input.populationSize % 2 !== 0
  ) {
    throw new Error("optimization population size must be an even integer from 8 through 256");
  }
  if (
    !Number.isInteger(input.generations) ||
    input.generations < 1 ||
    input.generations > 500
  ) {
    throw new Error("optimization generations must be an integer from 1 through 500");
  }
  if (input.populationSize * (input.generations + 1) > 100_000) {
    throw new Error("optimization may not exceed 100,000 candidate evaluations");
  }
  if (input.variables.length < 1 || input.variables.length > 16) {
    throw new Error("optimization requires from 1 through 16 variables");
  }
  if (input.objectives.length < 1 || input.objectives.length > 8) {
    throw new Error("optimization requires from 1 through 8 objectives");
  }
  const constraints = [...(input.constraints ?? [])];
  if (constraints.length > 16) {
    throw new Error("optimization supports at most 16 constraints");
  }
  const variableKeys = new Set<string>();
  for (const variable of input.variables) {
    assertIdentifier(variable.key, "optimization variable key");
    if (variableKeys.has(variable.key)) {
      throw new Error(`optimization variable key ${variable.key} is duplicated`);
    }
    variableKeys.add(variable.key);
    if (!variable.label.trim()) throw new Error("optimization variable labels cannot be empty");
    assertFinite(variable.minimum, `variable ${variable.key} minimum`);
    assertFinite(variable.maximum, `variable ${variable.key} maximum`);
    if (!(variable.maximum > variable.minimum)) {
      throw new Error(`variable ${variable.key} maximum must exceed its minimum`);
    }
    if (variable.initial !== undefined) {
      assertFinite(variable.initial, `variable ${variable.key} initial value`);
      if (variable.initial < variable.minimum || variable.initial > variable.maximum) {
        throw new Error(`variable ${variable.key} initial value must lie within its bounds`);
      }
    }
  }
  const objectiveKeys = new Set<string>();
  for (const objective of input.objectives) {
    assertIdentifier(objective.metricKey, "optimization objective metric key");
    if (objectiveKeys.has(objective.metricKey)) {
      throw new Error(`optimization objective metric ${objective.metricKey} is duplicated`);
    }
    objectiveKeys.add(objective.metricKey);
    if (!objective.label.trim()) throw new Error("optimization objective labels cannot be empty");
    const weight = objective.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`objective ${objective.metricKey} weight must be positive and finite`);
    }
  }
  for (const constraint of constraints) {
    assertIdentifier(constraint.metricKey, "optimization constraint metric key");
    if (!constraint.label.trim()) throw new Error("optimization constraint labels cannot be empty");
    assertFinite(constraint.limit, `constraint ${constraint.metricKey} limit`);
    if (
      constraint.normalizationScale !== undefined &&
      (!Number.isFinite(constraint.normalizationScale) ||
        constraint.normalizationScale <= 0)
    ) {
      throw new Error(`constraint ${constraint.metricKey} normalization scale must be positive and finite`);
    }
  }

  const random = seededRandom(input.seed);
  let evaluationCount = 0;
  const evaluate = (variables: Record<string, number>): MutableCandidate => {
    evaluationCount += 1;
    const metrics = { ...input.evaluator({ ...variables }) };
    const requiredMetricKeys = new Set([
      ...input.objectives.map((objective) => objective.metricKey),
      ...constraints.map((constraint) => constraint.metricKey),
    ]);
    for (const metricKey of requiredMetricKeys) {
      if (!Object.hasOwn(metrics, metricKey)) {
        throw new Error(`optimization evaluator omitted required metric ${metricKey}`);
      }
      assertFinite(metrics[metricKey], `optimization metric ${metricKey}`);
    }
    const constraintEvaluations = constraints.map(
      (constraint): OptimizationConstraintEvaluation => {
        const value = metrics[constraint.metricKey];
        const rawViolation =
          constraint.relation === "less-than-or-equal"
            ? Math.max(0, value - constraint.limit)
            : Math.max(0, constraint.limit - value);
        const normalizationScale =
          constraint.normalizationScale ?? Math.max(Math.abs(constraint.limit), 1);
        return {
          metricKey: constraint.metricKey,
          label: constraint.label,
          relation: constraint.relation,
          value,
          limit: constraint.limit,
          satisfied: rawViolation === 0,
          normalizedViolation: rawViolation / normalizationScale,
        };
      },
    );
    const normalizedConstraintViolation = constraintEvaluations.reduce(
      (sum, constraint) => sum + constraint.normalizedViolation,
      0,
    );
    return {
      id: `candidate-${String(evaluationCount).padStart(6, "0")}`,
      evaluationIndex: evaluationCount,
      variables,
      metrics,
      constraints: constraintEvaluations,
      feasible: normalizedConstraintViolation === 0,
      normalizedConstraintViolation,
      paretoRank: Number.POSITIVE_INFINITY,
      crowdingDistance: 0,
      tradeoffScore: null,
    };
  };

  const initialVariables = Object.fromEntries(
    input.variables.map((variable) => [
      variable.key,
      variable.initial ?? (variable.minimum + variable.maximum) / 2,
    ]),
  );
  const sampleCount = input.populationSize - 1;
  const strataByVariable = input.variables.map(() =>
    shuffledIndices(sampleCount, random),
  );
  let population: MutableCandidate[] = [evaluate(initialVariables)];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const variables = Object.fromEntries(
      input.variables.map((variable, variableIndex) => {
        const probability =
          (strataByVariable[variableIndex][sampleIndex] + random()) / sampleCount;
        return [
          variable.key,
          variable.minimum + probability * (variable.maximum - variable.minimum),
        ];
      }),
    );
    population.push(evaluate(variables));
  }

  for (let generation = 0; generation < input.generations; generation += 1) {
    rankAndCrowding(population, input.objectives);
    const tournament = (): MutableCandidate => {
      const left = population[Math.floor(random() * population.length)];
      const right = population[Math.floor(random() * population.length)];
      return preferenceCompare(left, right) <= 0 ? left : right;
    };
    const offspring: MutableCandidate[] = [];
    const cooling = 1 - 0.7 * (generation / Math.max(input.generations - 1, 1));
    while (offspring.length < input.populationSize) {
      const first = tournament();
      const second = tournament();
      const variables = Object.fromEntries(
        input.variables.map((variable) => {
          const range = variable.maximum - variable.minimum;
          let value: number;
          if (random() < 0.1) {
            value = variable.minimum + random() * range;
          } else {
            const blend = random() * 1.5 - 0.25;
            value =
              first.variables[variable.key] * blend +
              second.variables[variable.key] * (1 - blend);
            if (random() < 1 / input.variables.length) {
              value += (random() - random()) * range * 0.15 * cooling;
            }
            value = Math.max(variable.minimum, Math.min(variable.maximum, value));
          }
          return [variable.key, value];
        }),
      );
      offspring.push(evaluate(variables));
    }
    const combined = [...population, ...offspring];
    const fronts = rankAndCrowding(combined, input.objectives);
    const next: MutableCandidate[] = [];
    for (const front of fronts) {
      const remaining = input.populationSize - next.length;
      if (remaining <= 0) break;
      if (front.length <= remaining) {
        next.push(...front);
      } else {
        next.push(...[...front].sort(preferenceCompare).slice(0, remaining));
      }
    }
    population = next;
  }

  rankAndCrowding(population, input.objectives);
  const pareto = population.filter(
    (candidate) => candidate.feasible && candidate.paretoRank === 0,
  );
  if (pareto.length) {
    const extrema = input.objectives.map((objective) => {
      const values = pareto.map((candidate) => objectiveValue(candidate, objective));
      return { minimum: Math.min(...values), maximum: Math.max(...values) };
    });
    const totalWeight = input.objectives.reduce(
      (sum, objective) => sum + (objective.weight ?? 1),
      0,
    );
    for (const candidate of pareto) {
      candidate.tradeoffScore = input.objectives.reduce((sum, objective, index) => {
        const { minimum, maximum } = extrema[index];
        const regret =
          maximum > minimum
            ? (objectiveValue(candidate, objective) - minimum) /
              (maximum - minimum)
            : 0;
        return sum + regret * ((objective.weight ?? 1) / totalWeight);
      }, 0);
    }
  }
  const recommended = [...pareto].sort((left, right) => {
    const scoreDifference = (left.tradeoffScore ?? 1) - (right.tradeoffScore ?? 1);
    return scoreDifference || left.id.localeCompare(right.id);
  })[0];
  const publicCandidates = [...population]
    .sort(preferenceCompare)
    .map(publicCandidate);
  const publicPareto = [...pareto]
    .sort((left, right) =>
      (left.tradeoffScore ?? 1) - (right.tradeoffScore ?? 1) ||
      left.id.localeCompare(right.id),
    )
    .map(publicCandidate);

  return {
    modelVersion: DESIGN_OPTIMIZATION_MODEL_VERSION,
    validationStatus: DESIGN_OPTIMIZATION_MODEL_STATUS,
    algorithm: "seeded-constrained-nondominated-evolution",
    seed: input.seed,
    populationSize: input.populationSize,
    generations: input.generations,
    evaluationCount,
    variables: input.variables.map((variable) => ({ ...variable })),
    objectives: input.objectives.map((objective) => ({ ...objective })),
    constraints: constraints.map((constraint) => ({ ...constraint })),
    candidates: publicCandidates,
    paretoFront: publicPareto,
    recommendedCandidateId: recommended?.id ?? null,
    assumptions: [
      "Decision variables are continuous and bounded by the supplied ranges",
      "Constraint dominance prefers feasible candidates, then lower normalized violation",
      "Feasible candidates use Pareto dominance and normalized crowding distance",
      "The compromise recommendation minimizes the supplied weighted normalized objective regret within the final Pareto front",
      "Identical inputs, evaluator, seed, and JavaScript runtime reproduce the same candidate sequence",
    ],
    warnings: [
      "Evolutionary search does not prove global optimality and can miss narrow or disconnected feasible regions.",
      "The recommendation depends on variable bounds, objective weights, constraints, population size, generations, and every assumption in the evaluator.",
      "Optimization can exploit model errors; independently validate any candidate before manufacturing or flight use.",
      "This optimizer is an engineering preview with analytical and numerical tests only.",
    ],
  };
}
