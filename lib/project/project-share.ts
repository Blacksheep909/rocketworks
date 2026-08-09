import {
  validateEditableProjectInputs,
  type EditableProjectInputs,
} from "./project-state.ts";
import {
  validateVehicleTopology,
  type LocalVehicleTopology,
} from "./vehicle-topology.ts";

export const PROJECT_SHARE_SCHEMA_ID = "dev.kestrel-lab.project-share";
export const PROJECT_SHARE_SCHEMA_VERSION = 1;
export const PROJECT_SHARE_HASH_PREFIX = "#kestrel-share=";
/** Keep links below common proxy and chat-preview URL limits. */
export const MAX_PROJECT_SHARE_TOKEN_LENGTH = 16_000;

export type ProjectSharePayload = Readonly<{
  projectName: string;
  editableInputs: EditableProjectInputs;
  topology: LocalVehicleTopology;
  selectedMotorId: string;
  selectedAerodynamicTableId: string;
}>;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function nonEmptyString(value: unknown, label: string, maximumLength = 160): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > maximumLength) {
    throw new Error(`${label} is too long`);
  }
  return value;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      output += BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      output += BASE64_ALPHABET[third & 0x3f];
    }
  }
  return output.replaceAll("+", "-").replaceAll("/", "_");
}

function decodeBase64Url(token: string): string {
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token) || token.length % 4 === 1) {
    throw new Error("share link payload is not valid base64url");
  }
  const normalized = token.replaceAll("-", "+").replaceAll("_", "/");
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;
  for (const character of normalized) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("share link payload contains an invalid character");
    buffer = (buffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((buffer >> bitCount) & 0xff);
      buffer &= (1 << bitCount) - 1;
    }
  }
  if (bitCount > 0 && buffer !== 0) {
    throw new Error("share link payload has non-zero trailing bits");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    throw new Error("share link payload is not valid UTF-8");
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateProjectSharePayload(value: unknown): ProjectSharePayload {
  const payload = objectValue(value, "share payload");
  if (payload.schema !== PROJECT_SHARE_SCHEMA_ID) {
    throw new Error("unsupported Kestrel share schema");
  }
  if (payload.schemaVersion !== PROJECT_SHARE_SCHEMA_VERSION) {
    throw new Error("unsupported Kestrel share schema version");
  }
  const projectName = nonEmptyString(payload.projectName, "share project name");
  const selectedMotorId = nonEmptyString(payload.selectedMotorId, "share motor selection");
  const selectedAerodynamicTableId = nonEmptyString(
    payload.selectedAerodynamicTableId,
    "share aerodynamic selection",
  );
  return {
    projectName,
    editableInputs: validateEditableProjectInputs(payload.editableInputs),
    topology: validateVehicleTopology(payload.topology),
    selectedMotorId,
    selectedAerodynamicTableId,
  };
}

/** Encodes only validated design configuration; it never embeds local motor records, aerodynamic tables, or server data. */
export function encodeProjectShare(input: ProjectSharePayload): string {
  const payload = validateProjectSharePayload({
    schema: PROJECT_SHARE_SCHEMA_ID,
    schemaVersion: PROJECT_SHARE_SCHEMA_VERSION,
    ...input,
  });
  const serialized = JSON.stringify({
    schema: PROJECT_SHARE_SCHEMA_ID,
    schemaVersion: PROJECT_SHARE_SCHEMA_VERSION,
    projectName: payload.projectName,
    editableInputs: payload.editableInputs,
    topology: payload.topology,
    selectedMotorId: payload.selectedMotorId,
    selectedAerodynamicTableId: payload.selectedAerodynamicTableId,
  });
  const token = encodeBase64Url(serialized);
  if (token.length > MAX_PROJECT_SHARE_TOKEN_LENGTH) {
    throw new Error("share link is too large for a browser URL");
  }
  return `${PROJECT_SHARE_HASH_PREFIX}${token}`;
}

/** Accepts a hash, bare share token, or full URL containing the Kestrel share hash. */
export function decodeProjectShare(value: string): ProjectSharePayload {
  let candidate = value.trim();
  if (!candidate) throw new Error("share link is empty");
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).hash;
    } catch {
      throw new Error("share link URL is invalid");
    }
  }
  if (candidate.startsWith(PROJECT_SHARE_HASH_PREFIX)) {
    candidate = candidate.slice(PROJECT_SHARE_HASH_PREFIX.length);
  } else if (candidate.startsWith(PROJECT_SHARE_HASH_PREFIX.slice(1))) {
    candidate = candidate.slice(PROJECT_SHARE_HASH_PREFIX.length - 1);
  }
  if (!candidate) throw new Error("share link payload is empty");
  try {
    return validateProjectSharePayload(JSON.parse(decodeBase64Url(candidate)));
  } catch (error) {
    throw new Error(
      `Could not read Kestrel share link: ${error instanceof Error ? error.message : "invalid payload"}`,
    );
  }
}
