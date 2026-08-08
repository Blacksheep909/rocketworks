export const UNCERTAINTY_MODEL_VERSION = "kestrel-uncertainty-0.1.0";
export const UNCERTAINTY_MODEL_STATUS = "engineering-preview-unvalidated";

export type ProbabilityDistribution =
  | { kind: "uniform"; minimum: number; maximum: number }
  | { kind: "triangular"; minimum: number; mode: number; maximum: number }
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
  samples: UncertaintySample[];
  metrics: Record<string, MetricSummary>;
  thresholds: ThresholdResult[];
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

export function runUncertaintyAnalysis({
  seed,
  method = "latin-hypercube",
  sampleCount,
  parameters,
  evaluator,
  thresholds = [],
}: {
  seed: string;
  method?: SamplingMethod;
  sampleCount: number;
  parameters: UncertainParameter[];
  evaluator: (inputs: Readonly<Record<string, number>>, sampleIndex: number) => NumericOutputs;
  thresholds?: ThresholdDefinition[];
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
  const random = seededRandom(seed);
  const probabilities = new Map<string, number[]>();
  for (const parameter of parameters) {
    const values = Array.from({ length: sampleCount }, (_, index) =>
      method === "latin-hypercube" ? (index + random()) / sampleCount : random(),
    );
    if (method === "latin-hypercube") shuffle(values, random);
    probabilities.set(parameter.key, values);
  }
  const samples: UncertaintySample[] = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const inputs = Object.fromEntries(
      parameters.map((parameter) => [
        parameter.key,
        inverseDistribution(parameter.distribution, probabilities.get(parameter.key)![sampleIndex]!),
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
  return {
    modelVersion: UNCERTAINTY_MODEL_VERSION,
    validationStatus: UNCERTAINTY_MODEL_STATUS,
    seed,
    method,
    requestedSampleCount: sampleCount,
    successfulSampleCount: successful.length,
    failedSampleCount,
    parameters,
    samples,
    metrics,
    thresholds: thresholdResults,
    sensitivityByMetric,
    warnings: [
      ...(failedSampleCount > 0 ? [`${failedSampleCount} sample evaluations failed and remain visible in the result.`] : []),
      "Input distributions are user/model assumptions; they are not inferred from test data.",
      "Spearman rank correlation measures monotonic association, not causation or independent contribution.",
      "Finite-sample quantiles and probabilities have sampling error; only threshold probabilities include a Wilson interval.",
    ],
    assumptions: [
      "Uncertain inputs are sampled independently; correlations are not modeled in version 0.1.",
      "Latin-hypercube sampling places one sample in each equal-probability stratum per parameter.",
      "Reported percentiles use linear interpolation between ordered samples.",
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
