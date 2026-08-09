export const UNCERTAINTY_MODEL_VERSION = "kestrel-uncertainty-0.4.0";
export const UNCERTAINTY_MODEL_STATUS = "engineering-preview-unvalidated";

export type ProbabilityDistribution =
  | { kind: "uniform"; minimum: number; maximum: number }
  | { kind: "triangular"; minimum: number; mode: number; maximum: number }
  | { kind: "bernoulli"; successProbability: number }
  | {
      kind: "normal";
      mean: number;
      standardDeviation: number;
      minimum?: number;
      maximum?: number;
    };

export type UncertainParameter = {
  key: string;
  label: string;
  distribution: ProbabilityDistribution;
};

/**
 * Optional dependence between two uncertain inputs. Coefficients are
 * Pearson correlations in the latent standard-normal space used by the
 * Gaussian copula; the declared marginal distributions remain authoritative.
 */
export type UncertaintyCorrelation = Readonly<{
  firstParameterKey: string;
  secondParameterKey: string;
  coefficient: number;
}>;

export type NumericOutputs = Record<string, number | null>;
export type SamplingMethod = "monte-carlo" | "latin-hypercube";

export type MetricSummary = {
  count: number;
  missingCount: number;
  mean: number | null;
  sampleStandardDeviation: number | null;
  standardError: number | null;
  minimum: number | null;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  maximum: number | null;
};

export type ThresholdDefinition = {
  id: string;
  metric: string;
  comparison: "greater-than" | "greater-than-or-equal" | "less-than" | "less-than-or-equal";
  value: number;
};

export type ThresholdResult = ThresholdDefinition & {
  validSampleCount: number;
  exceedanceCount: number;
  probability: number | null;
  wilson95: { lower: number; upper: number } | null;
};

export type SensitivityResult = {
  parameterKey: string;
  parameterLabel: string;
  spearmanRho: number | null;
  pairedSampleCount: number;
};

export type ConvergenceStatus = "converged" | "watch" | "insufficient-data";

export type QuantileConvergenceDiagnostic = {
  p05: number | null;
  p50: number | null;
  p95: number | null;
};

export type MetricConvergenceDiagnostic = {
  metric: string;
  lowerHalfCount: number;
  upperHalfCount: number;
  quantileRelativeShift: QuantileConvergenceDiagnostic;
  maximumRelativeQuantileShift: number | null;
  status: ConvergenceStatus;
};

export type ThresholdConvergenceDiagnostic = {
  thresholdId: string;
  lowerHalfValidSampleCount: number;
  upperHalfValidSampleCount: number;
  halfProbabilityShift: number | null;
  wilson95Width: number | null;
  status: ConvergenceStatus;
};

export type UncertaintyConvergenceDiagnostic = {
  method: "contiguous-halves";
  successfulSampleCount: number;
  lowerHalfSampleCount: number;
  upperHalfSampleCount: number;
  minimumRecommendedSampleCount: number;
  status: ConvergenceStatus;
  metrics: Record<string, MetricConvergenceDiagnostic>;
  thresholds: ThresholdConvergenceDiagnostic[];
  maximumRelativeQuantileShift: number | null;
  maximumThresholdProbabilityShift: number | null;
  warnings: string[];
  assumptions: string[];
};

export type UncertaintySample = {
  index: number;
  inputs: Record<string, number>;
  outputs: NumericOutputs | null;
  error: string | null;
};

export type UncertaintyAnalysisResult = {
  modelVersion: string;
  validationStatus: string;
  seed: string;
  method: SamplingMethod;
  requestedSampleCount: number;
  successfulSampleCount: number;
  failedSampleCount: number;
  parameters: UncertainParameter[];
  correlations: UncertaintyCorrelation[];
  samples: UncertaintySample[];
  metrics: Record<string, MetricSummary>;
  thresholds: ThresholdResult[];
  convergence: UncertaintyConvergenceDiagnostic;
  sensitivityByMetric: Record<string, SensitivityResult[]>;
  warnings: string[];
  assumptions: string[];
};

export type ParameterSweepResult = {
  parameterKey: string;
  values: number[];
  samples: Array<{ value: number; outputs: NumericOutputs | null; error: string | null }>;
};

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function validateDistribution(distribution: ProbabilityDistribution, label: string) {
  if (distribution.kind === "uniform") {
    assertFinite(distribution.minimum, `${label} minimum`);
    assertFinite(distribution.maximum, `${label} maximum`);
    if (distribution.maximum <= distribution.minimum) {
      throw new Error(`${label} maximum must exceed its minimum.`);
    }
    return;
  }
  if (distribution.kind === "triangular") {
    assertFinite(distribution.minimum, `${label} minimum`);
    assertFinite(distribution.mode, `${label} mode`);
    assertFinite(distribution.maximum, `${label} maximum`);
    if (
      distribution.maximum <= distribution.minimum ||
      distribution.mode < distribution.minimum ||
      distribution.mode > distribution.maximum
    ) {
      throw new Error(`${label} requires minimum <= mode <= maximum and a non-zero range.`);
    }
    return;
  }
  if (distribution.kind === "bernoulli") {
    assertFinite(distribution.successProbability, `${label} success probability`);
    if (distribution.successProbability < 0 || distribution.successProbability > 1) {
      throw new Error(`${label} success probability must be between 0 and 1.`);
    }
    return;
  }
  assertFinite(distribution.mean, `${label} mean`);
  assertFinite(distribution.standardDeviation, `${label} standard deviation`);
  if (distribution.standardDeviation <= 0) {
    throw new Error(`${label} standard deviation must be positive.`);
  }
  if (distribution.minimum !== undefined) assertFinite(distribution.minimum, `${label} minimum`);
  if (distribution.maximum !== undefined) assertFinite(distribution.maximum, `${label} maximum`);
  if (
    distribution.minimum !== undefined &&
    distribution.maximum !== undefined &&
    distribution.maximum <= distribution.minimum
  ) {
    throw new Error(`${label} maximum must exceed its minimum.`);
  }
}

// FNV-1a plus Mulberry32 gives a compact, deterministic, non-cryptographic stream.
function seededRandom(seed: string) {
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

function standardNormalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t) *
        Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

// Peter J. Acklam's inverse-normal rational approximation.
function inverseStandardNormal(probability: number) {
  const p = Math.min(1 - 1e-15, Math.max(1e-15, probability));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const low = 0.02425;
  const high = 1 - low;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

export function inverseDistribution(distribution: ProbabilityDistribution, probability: number) {
  const p = Math.min(1 - Number.EPSILON, Math.max(0, probability));
  if (distribution.kind === "uniform") {
    return distribution.minimum + p * (distribution.maximum - distribution.minimum);
  }
  if (distribution.kind === "triangular") {
    const range = distribution.maximum - distribution.minimum;
    const split = (distribution.mode - distribution.minimum) / range;
    return p < split
      ? distribution.minimum + Math.sqrt(p * range * (distribution.mode - distribution.minimum))
      : distribution.maximum - Math.sqrt((1 - p) * range * (distribution.maximum - distribution.mode));
  }
  if (distribution.kind === "bernoulli") {
    return p < distribution.successProbability ? 1 : 0;
  }
  const lowerProbability =
    distribution.minimum === undefined
      ? 0
      : standardNormalCdf((distribution.minimum - distribution.mean) / distribution.standardDeviation);
  const upperProbability =
    distribution.maximum === undefined
      ? 1
      : standardNormalCdf((distribution.maximum - distribution.mean) / distribution.standardDeviation);
  const mappedProbability = lowerProbability + p * (upperProbability - lowerProbability);
  return distribution.mean + distribution.standardDeviation * inverseStandardNormal(mappedProbability);
}

function choleskyDecomposition(matrix: readonly (readonly number[])[]): number[][] {
  const lower = matrix.map((row) => row.map(() => 0));
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row]![column]!;
      for (let prior = 0; prior < column; prior += 1) {
        value -= lower[row]![prior]! * lower[column]![prior]!;
      }
      if (row === column) {
        if (!(value > 1e-12) || !Number.isFinite(value)) {
          throw new Error("Uncertainty correlation coefficients must form a positive-definite matrix.");
        }
        lower[row]![column] = Math.sqrt(value);
      } else {
        lower[row]![column] = value / lower[column]![column]!;
      }
    }
  }
  return lower;
}

function correlationSetup(
  parameters: readonly UncertainParameter[],
  correlations: readonly UncertaintyCorrelation[],
): { normalized: UncertaintyCorrelation[]; cholesky: number[][] | null } {
  if (correlations.length === 0) return { normalized: [], cholesky: null };
  const indices = new Map(parameters.map((parameter, index) => [parameter.key, index]));
  const matrix: number[][] = parameters.map((_, row) =>
    parameters.map((__, column) => (row === column ? 1 : 0)),
  );
  const seen = new Set<string>();
  const normalized = correlations.map((correlation) => {
    if (!correlation.firstParameterKey.trim() || !correlation.secondParameterKey.trim()) {
      throw new Error("Uncertainty correlation parameter keys must be non-empty.");
    }
    if (correlation.firstParameterKey === correlation.secondParameterKey) {
      throw new Error("An uncertainty parameter cannot be correlated with itself.");
    }
    const firstIndex = indices.get(correlation.firstParameterKey);
    const secondIndex = indices.get(correlation.secondParameterKey);
    if (firstIndex === undefined || secondIndex === undefined) {
      throw new Error(`Uncertainty correlation references an unknown parameter: ${correlation.firstParameterKey} / ${correlation.secondParameterKey}.`);
    }
    assertFinite(correlation.coefficient, "Uncertainty correlation coefficient");
    if (correlation.coefficient <= -0.999 || correlation.coefficient >= 0.999) {
      throw new Error("Uncertainty correlation coefficients must be strictly between -0.999 and 0.999.");
    }
    const key = [correlation.firstParameterKey, correlation.secondParameterKey].sort().join("\u0000");
    if (seen.has(key)) throw new Error(`Duplicate uncertainty correlation pair: ${key.replace("\u0000", " / ")}.`);
    seen.add(key);
    matrix[firstIndex]![secondIndex] = correlation.coefficient;
    matrix[secondIndex]![firstIndex] = correlation.coefficient;
    return {
      firstParameterKey: correlation.firstParameterKey,
      secondParameterKey: correlation.secondParameterKey,
      coefficient: correlation.coefficient,
    };
  });
  return { normalized, cholesky: choleskyDecomposition(matrix) };
}

function correlatedProbabilities({
  parameters,
  baseProbabilities,
  sampleCount,
  method,
  cholesky,
}: {
  parameters: readonly UncertainParameter[];
  baseProbabilities: ReadonlyMap<string, number[]>;
  sampleCount: number;
  method: SamplingMethod;
  cholesky: number[][];
}): Map<string, number[]> {
  const scores = parameters.map(() => new Array<number>(sampleCount));
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const independent = parameters.map((parameter) =>
      inverseStandardNormal(baseProbabilities.get(parameter.key)![sampleIndex]!),
    );
    for (let row = 0; row < parameters.length; row += 1) {
      let correlated = 0;
      for (let column = 0; column <= row; column += 1) {
        correlated += cholesky[row]![column]! * independent[column]!;
      }
      scores[row]![sampleIndex] = correlated;
    }
  }
  const probabilities = new Map<string, number[]>();
  parameters.forEach((parameter, parameterIndex) => {
    const base = baseProbabilities.get(parameter.key)!;
    if (method === "monte-carlo") {
      probabilities.set(
        parameter.key,
        scores[parameterIndex]!.map((score) => standardNormalCdf(score)),
      );
      return;
    }
    const order = Array.from({ length: sampleCount }, (_, index) => index).sort(
      (left, right) => scores[parameterIndex]![left]! - scores[parameterIndex]![right]! || left - right,
    );
    const values = new Array<number>(sampleCount);
    order.forEach((sampleIndex, rank) => {
      const baseProbability = base[sampleIndex]!;
      const stratum = Math.min(sampleCount - 1, Math.floor(baseProbability * sampleCount));
      const jitter = Math.min(1 - Number.EPSILON, Math.max(0, baseProbability * sampleCount - stratum));
      values[sampleIndex] = (rank + jitter) / sampleCount;
    });
    probabilities.set(parameter.key, values);
  });
  return probabilities;
}

function shuffle(values: number[], random: () => number) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
}

function quantile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower]! + fraction * ((sorted[lower + 1] ?? sorted[lower]!) - sorted[lower]!);
}

function summarize(values: Array<number | null>): MetricSummary {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { count: 0, missingCount: values.length, mean: null, sampleStandardDeviation: null, standardError: null, minimum: null, p05: null, p50: null, p95: null, maximum: null };
  }
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const sampleStandardDeviation =
    valid.length > 1
      ? Math.sqrt(valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (valid.length - 1))
      : null;
  return {
    count: valid.length,
    missingCount: values.length - valid.length,
    mean,
    sampleStandardDeviation,
    standardError: sampleStandardDeviation === null ? null : sampleStandardDeviation / Math.sqrt(valid.length),
    minimum: valid[0]!,
    p05: quantile(valid, 0.05),
    p50: quantile(valid, 0.5),
    p95: quantile(valid, 0.95),
    maximum: valid.at(-1)!,
  };
}

function averageRanks(values: number[]) {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let start = 0;
  while (start < ordered.length) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1]!.value === ordered[start]!.value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let index = start; index <= end; index += 1) ranks[ordered[index]!.index] = rank;
    start = end + 1;
  }
  return ranks;
}

function pearson(left: number[], right: number[]) {
  if (left.length < 3 || left.length !== right.length) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]! - leftMean;
    const b = right[index]! - rightMean;
    numerator += a * b;
    leftSquares += a * a;
    rightSquares += b * b;
  }
  return leftSquares === 0 || rightSquares === 0 ? null : numerator / Math.sqrt(leftSquares * rightSquares);
}

function wilson95(successes: number, total: number) {
  if (total === 0) return null;
  const z = 1.959963984540054;
  const observed = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (observed + (z * z) / (2 * total)) / denominator;
  const radius =
    (z / denominator) * Math.sqrt((observed * (1 - observed)) / total + (z * z) / (4 * total * total));
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

const MINIMUM_RECOMMENDED_CONVERGENCE_SAMPLE_COUNT = 32;
const MINIMUM_CONVERGENCE_HALF_COUNT = 8;

function relativeDifference(left: number | null, right: number | null): number | null {
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-12);
}

function convergenceStatus({
  successfulSampleCount,
  lowerHalfCount,
  upperHalfCount,
  maximumShift,
}: {
  successfulSampleCount: number;
  lowerHalfCount: number;
  upperHalfCount: number;
  maximumShift: number | null;
}): ConvergenceStatus {
  if (
    successfulSampleCount < MINIMUM_RECOMMENDED_CONVERGENCE_SAMPLE_COUNT ||
    lowerHalfCount < MINIMUM_CONVERGENCE_HALF_COUNT ||
    upperHalfCount < MINIMUM_CONVERGENCE_HALF_COUNT ||
    maximumShift === null
  ) {
    return "insufficient-data";
  }
  return maximumShift <= 0.1 ? "converged" : "watch";
}

function thresholdMatches(value: number, threshold: ThresholdDefinition): boolean {
  if (threshold.comparison === "greater-than") return value > threshold.value;
  if (threshold.comparison === "greater-than-or-equal") return value >= threshold.value;
  if (threshold.comparison === "less-than") return value < threshold.value;
  return value <= threshold.value;
}

function thresholdRate(
  samples: readonly UncertaintySample[],
  threshold: ThresholdDefinition,
): Readonly<{ validSampleCount: number; exceedanceCount: number; probability: number | null }> {
  const values = samples
    .map((sample) => sample.outputs?.[threshold.metric] ?? null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const exceedanceCount = values.filter((value) => thresholdMatches(value, threshold)).length;
  return {
    validSampleCount: values.length,
    exceedanceCount,
    probability: values.length === 0 ? null : exceedanceCount / values.length,
  };
}

function maximumNonNull(values: readonly (number | null)[]): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length === 0 ? null : Math.max(...valid);
}

function assessConvergence({
  samples,
  successfulSampleCount,
  metrics,
  thresholds,
}: {
  samples: readonly UncertaintySample[];
  successfulSampleCount: number;
  metrics: Record<string, MetricSummary>;
  thresholds: readonly ThresholdResult[];
}): UncertaintyConvergenceDiagnostic {
  const splitIndex = Math.ceil(samples.length / 2);
  const lowerHalf = samples.filter((sample) => sample.index < splitIndex);
  const upperHalf = samples.filter((sample) => sample.index >= splitIndex);
  const metricDiagnostics = Object.fromEntries(
    Object.keys(metrics).sort().map((metric): [string, MetricConvergenceDiagnostic] => {
      const lowerSummary = summarize(lowerHalf.map((sample) => sample.outputs?.[metric] ?? null));
      const upperSummary = summarize(upperHalf.map((sample) => sample.outputs?.[metric] ?? null));
      const quantileRelativeShift = {
        p05: relativeDifference(lowerSummary.p05, upperSummary.p05),
        p50: relativeDifference(lowerSummary.p50, upperSummary.p50),
        p95: relativeDifference(lowerSummary.p95, upperSummary.p95),
      };
      const maximumRelativeQuantileShift = maximumNonNull(Object.values(quantileRelativeShift));
      return [
        metric,
        {
          metric,
          lowerHalfCount: lowerSummary.count,
          upperHalfCount: upperSummary.count,
          quantileRelativeShift,
          maximumRelativeQuantileShift,
          status: convergenceStatus({
            successfulSampleCount,
            lowerHalfCount: lowerSummary.count,
            upperHalfCount: upperSummary.count,
            maximumShift: maximumRelativeQuantileShift,
          }),
        },
      ];
    }),
  ) as Record<string, MetricConvergenceDiagnostic>;
  const thresholdDiagnostics = thresholds.map((threshold): ThresholdConvergenceDiagnostic => {
    const lowerRate = thresholdRate(lowerHalf, threshold);
    const upperRate = thresholdRate(upperHalf, threshold);
    const halfProbabilityShift = lowerRate.probability === null || upperRate.probability === null
      ? null
      : Math.abs(lowerRate.probability - upperRate.probability);
    const wilson95Width = threshold.wilson95 === null
      ? null
      : threshold.wilson95.upper - threshold.wilson95.lower;
    const maximumShift = maximumNonNull([halfProbabilityShift, wilson95Width]);
    return {
      thresholdId: threshold.id,
      lowerHalfValidSampleCount: lowerRate.validSampleCount,
      upperHalfValidSampleCount: upperRate.validSampleCount,
      halfProbabilityShift,
      wilson95Width,
      status: convergenceStatus({
        successfulSampleCount,
        lowerHalfCount: lowerRate.validSampleCount,
        upperHalfCount: upperRate.validSampleCount,
        maximumShift,
      }),
    };
  });
  const statuses = [
    ...Object.values(metricDiagnostics).map((diagnostic) => diagnostic.status),
    ...thresholdDiagnostics.map((diagnostic) => diagnostic.status),
  ];
  const status: ConvergenceStatus = statuses.length === 0 || statuses.includes("insufficient-data")
    ? "insufficient-data"
    : statuses.includes("watch")
      ? "watch"
      : "converged";
  const maximumRelativeQuantileShift = maximumNonNull(
    Object.values(metricDiagnostics).map((diagnostic) => diagnostic.maximumRelativeQuantileShift),
  );
  const maximumThresholdProbabilityShift = maximumNonNull(
    thresholdDiagnostics.map((diagnostic) => diagnostic.halfProbabilityShift),
  );
  const warnings = [
    "Split-sample convergence is a heuristic finite-sample stability check; it does not address model-form, numerical, or validation error.",
    ...(status === "insufficient-data"
      ? [`At least ${MINIMUM_RECOMMENDED_CONVERGENCE_SAMPLE_COUNT} successful samples and ${MINIMUM_CONVERGENCE_HALF_COUNT} valid samples per half are recommended before interpreting stability.`]
      : []),
    ...(status === "watch"
      ? ["One or more split-sample quantile or threshold-rate shifts exceeded the convergence watch threshold of 10%."]
      : []),
  ];
  const assumptions = [
    "Samples are split by deterministic sample index into lower and upper contiguous halves.",
    "Quantile shifts use absolute half-sample differences normalized by the larger absolute half value.",
    "Threshold-rate stability considers the half-sample probability shift and the full Wilson interval width.",
  ];
  return {
    method: "contiguous-halves",
    successfulSampleCount,
    lowerHalfSampleCount: lowerHalf.length,
    upperHalfSampleCount: upperHalf.length,
    minimumRecommendedSampleCount: MINIMUM_RECOMMENDED_CONVERGENCE_SAMPLE_COUNT,
    status,
    metrics: metricDiagnostics,
    thresholds: thresholdDiagnostics,
    maximumRelativeQuantileShift,
    maximumThresholdProbabilityShift,
    warnings,
    assumptions,
  };
}

export function runUncertaintyAnalysis({
  seed,
  method = "latin-hypercube",
  sampleCount,
  parameters,
  evaluator,
  thresholds = [],
  correlations = [],
}: {
  seed: string;
  method?: SamplingMethod;
  sampleCount: number;
  parameters: UncertainParameter[];
  evaluator: (inputs: Readonly<Record<string, number>>, sampleIndex: number) => NumericOutputs;
  thresholds?: ThresholdDefinition[];
  correlations?: readonly UncertaintyCorrelation[];
}): UncertaintyAnalysisResult {
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 5000) {
    throw new Error("Sample count must be an integer from 2 through 5000.");
  }
  if (!seed.trim()) throw new Error("A non-empty reproducibility seed is required.");
  if (parameters.length === 0) throw new Error("At least one uncertain parameter is required.");
  const keys = new Set<string>();
  parameters.forEach((parameter) => {
    if (!parameter.key.trim() || keys.has(parameter.key)) throw new Error("Uncertain parameter keys must be non-empty and unique.");
    keys.add(parameter.key);
    validateDistribution(parameter.distribution, parameter.label);
  });
  const correlation = correlationSetup(parameters, correlations);
  const random = seededRandom(seed);
  const probabilities = new Map<string, number[]>();
  for (const parameter of parameters) {
    const values = Array.from({ length: sampleCount }, (_, index) =>
      method === "latin-hypercube" ? (index + random()) / sampleCount : random(),
    );
    if (method === "latin-hypercube") shuffle(values, random);
    probabilities.set(parameter.key, values);
  }
  const sampledProbabilities = correlation.cholesky === null
    ? probabilities
    : correlatedProbabilities({
        parameters,
        baseProbabilities: probabilities,
        sampleCount,
        method,
        cholesky: correlation.cholesky,
      });
  const samples: UncertaintySample[] = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const inputs = Object.fromEntries(
      parameters.map((parameter) => [
        parameter.key,
        inverseDistribution(parameter.distribution, sampledProbabilities.get(parameter.key)![sampleIndex]!),
      ]),
    );
    try {
      const outputs = evaluator(inputs, sampleIndex);
      for (const [key, value] of Object.entries(outputs)) {
        if (value !== null && !Number.isFinite(value)) throw new Error(`Output ${key} was not finite.`);
      }
      samples.push({ index: sampleIndex, inputs, outputs, error: null });
    } catch (error) {
      samples.push({ index: sampleIndex, inputs, outputs: null, error: error instanceof Error ? error.message : "Unknown evaluator error" });
    }
  }
  const successful = samples.filter((sample) => sample.outputs !== null);
  const metricKeys = [...new Set(successful.flatMap((sample) => Object.keys(sample.outputs!)))].sort();
  const metrics = Object.fromEntries(
    metricKeys.map((metric) => [metric, summarize(successful.map((sample) => sample.outputs![metric] ?? null))]),
  );
  const sensitivityByMetric = Object.fromEntries(
    metricKeys.map((metric) => {
      const results = parameters.map((parameter): SensitivityResult => {
        const pairs = successful
          .map((sample) => ({ input: sample.inputs[parameter.key]!, output: sample.outputs![metric] }))
          .filter((pair): pair is { input: number; output: number } => pair.output !== null && Number.isFinite(pair.output));
        return {
          parameterKey: parameter.key,
          parameterLabel: parameter.label,
          spearmanRho: pearson(averageRanks(pairs.map((pair) => pair.input)), averageRanks(pairs.map((pair) => pair.output))),
          pairedSampleCount: pairs.length,
        };
      });
      results.sort((a, b) => Math.abs(b.spearmanRho ?? 0) - Math.abs(a.spearmanRho ?? 0));
      return [metric, results];
    }),
  );
  const thresholdResults = thresholds.map((threshold): ThresholdResult => {
    assertFinite(threshold.value, `Threshold ${threshold.id}`);
    const values = successful
      .map((sample) => sample.outputs![threshold.metric])
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    const compare = (value: number) => {
      if (threshold.comparison === "greater-than") return value > threshold.value;
      if (threshold.comparison === "greater-than-or-equal") return value >= threshold.value;
      if (threshold.comparison === "less-than") return value < threshold.value;
      return value <= threshold.value;
    };
    const exceedanceCount = values.filter(compare).length;
    return {
      ...threshold,
      validSampleCount: values.length,
      exceedanceCount,
      probability: values.length === 0 ? null : exceedanceCount / values.length,
      wilson95: wilson95(exceedanceCount, values.length),
    };
  });
  const failedSampleCount = samples.length - successful.length;
  const convergence = assessConvergence({
    samples,
    successfulSampleCount: successful.length,
    metrics,
    thresholds: thresholdResults,
  });
  return {
    modelVersion: UNCERTAINTY_MODEL_VERSION,
    validationStatus: UNCERTAINTY_MODEL_STATUS,
    seed,
    method,
    requestedSampleCount: sampleCount,
    successfulSampleCount: successful.length,
    failedSampleCount,
    parameters,
    correlations: correlation.normalized,
    samples,
    metrics,
    thresholds: thresholdResults,
    convergence,
    sensitivityByMetric,
    warnings: [
      ...(failedSampleCount > 0 ? [`${failedSampleCount} sample evaluations failed and remain visible in the result.`] : []),
      "Input distributions are user/model assumptions; they are not inferred from test data.",
      ...(correlation.normalized.length > 0
        ? ["Correlated inputs use a Gaussian copula in latent normal space; tail dependence and empirical joint-distribution validation remain outside this preview."]
        : []),
      "Spearman rank correlation measures monotonic association, not causation or independent contribution.",
      "Finite-sample quantiles and probabilities have sampling error; convergence diagnostics are heuristic split-sample checks and threshold probabilities include a Wilson interval.",
      ...convergence.warnings,
    ],
    assumptions: [
      ...(correlation.normalized.length > 0
        ? [
            "Declared pairwise correlations are applied through a positive-definite Gaussian copula while preserving each declared marginal distribution.",
            "Parameter pairs without a declared correlation are independent in the latent normal construction.",
          ]
        : ["Uncertain inputs are sampled independently because no correlations were declared."]),
      "Latin-hypercube sampling places one sample in each equal-probability stratum per parameter.",
      "Reported percentiles use linear interpolation between ordered samples.",
      ...convergence.assumptions,
      "This propagates configured model uncertainty and is not validation, certification, or a flight-safety assessment.",
    ],
  };
}

export function runParameterSweep({
  parameterKey,
  minimum,
  maximum,
  steps,
  evaluator,
}: {
  parameterKey: string;
  minimum: number;
  maximum: number;
  steps: number;
  evaluator: (inputs: Readonly<Record<string, number>>, index: number) => NumericOutputs;
}): ParameterSweepResult {
  assertFinite(minimum, "Sweep minimum");
  assertFinite(maximum, "Sweep maximum");
  if (maximum <= minimum) throw new Error("Sweep maximum must exceed its minimum.");
  if (!Number.isInteger(steps) || steps < 2 || steps > 1000) throw new Error("Sweep steps must be an integer from 2 through 1000.");
  const values = Array.from({ length: steps }, (_, index) => minimum + (index / (steps - 1)) * (maximum - minimum));
  return {
    parameterKey,
    values,
    samples: values.map((value, index) => {
      try {
        return { value, outputs: evaluator({ [parameterKey]: value }, index), error: null };
      } catch (error) {
        return { value, outputs: null, error: error instanceof Error ? error.message : "Unknown evaluator error" };
      }
    }),
  };
}
