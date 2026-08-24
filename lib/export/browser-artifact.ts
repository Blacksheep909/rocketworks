import {
  parseUiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
  type UiExportDestination,
} from "../project/ui-preferences.ts";

type SaveFileWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type SaveFileHandle = {
  createWritable: () => Promise<SaveFileWritable>;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type SaveFileWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

export type SaveArtifactResult = "saved" | "cancelled" | "unsupported";

export function readExportDestinationPreference(
  storage?: Pick<Storage, "getItem"> | null,
): UiExportDestination {
  if (typeof window === "undefined" && storage === undefined) return "browser-download";
  try {
    const source = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const serialized = source?.getItem(UI_PREFERENCES_STORAGE_KEY);
    return serialized ? parseUiPreferences(serialized).exportDestination : "browser-download";
  } catch {
    return "browser-download";
  }
}

function triggerBrowserDownload(
  filename: string,
  mediaType: string,
  content: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type: mediaType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveTextArtifactWithPicker(
  filename: string,
  mediaType: string,
  content: string,
): Promise<SaveArtifactResult> {
  if (typeof window === "undefined") return "unsupported";
  const picker = (window as SaveFileWindow).showSaveFilePicker;
  if (typeof picker !== "function") return "unsupported";
  const extension = filename.includes(".") ? `.${filename.split(".").at(-1)}` : "";
  const normalizedMediaType = mediaType.split(";", 1)[0] || "application/octet-stream";
  try {
    const handle = await picker({
      suggestedName: filename,
      types: extension
        ? [{
            description: "RocketWorks export",
            accept: { [normalizedMediaType]: [extension] },
          }]
        : undefined,
    });
    const writable = await handle.createWritable();
    try {
      await writable.write(new Blob([content], { type: mediaType }));
    } finally {
      await writable.close();
    }
    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export function downloadTextArtifact(
  filename: string,
  mediaType: string,
  content: string,
  storage?: Pick<Storage, "getItem"> | null,
) {
  if (readExportDestinationPreference(storage) !== "save-dialog") {
    triggerBrowserDownload(filename, mediaType, content);
    return;
  }
  void saveTextArtifactWithPicker(filename, mediaType, content)
    .then((result) => {
      if (result === "unsupported") triggerBrowserDownload(filename, mediaType, content);
    })
    .catch(() => {
      // A browser or permission error should not lose an engineering artifact.
      // Fall back to the existing download path; a cancelled picker does not.
      triggerBrowserDownload(filename, mediaType, content);
    });
}
