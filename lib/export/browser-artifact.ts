import {
  parseUiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
  type UiExportDestination,
} from "../project/ui-preferences.ts";

export type SaveFileWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

export type SaveFileHandle = {
  createWritable: () => Promise<SaveFileWritable>;
};

/**
 * Minimal File System Access API surface used by the optional session-scoped
 * project-folder destination. The handle is intentionally kept in memory;
 * browsers must re-authorize filesystem access after a reload.
 */
export type ArtifactDirectoryHandle = {
  readonly name?: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<SaveFileHandle>;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type DirectoryPickerOptions = {
  mode?: "read" | "readwrite";
};

type SaveFileWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<ArtifactDirectoryHandle>;
};

export type SaveArtifactResult = "saved" | "cancelled" | "unsupported";

let selectedArtifactDirectory: ArtifactDirectoryHandle | null = null;

/** Set or clear the current session's explicit project-folder destination. */
export function setArtifactDirectory(directory: ArtifactDirectoryHandle | null): void {
  selectedArtifactDirectory = directory;
}

/** Return the user-visible folder name, if a project folder is selected. */
export function getArtifactDirectoryName(): string | null {
  const name = selectedArtifactDirectory?.name?.trim();
  return name || null;
}

export function readExportDestinationPreference(
  storage?: Pick<Storage, "getItem"> | null,
): UiExportDestination {
  if (typeof window === "undefined" && storage === undefined) return "save-dialog";
  try {
    const source = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const serialized = source?.getItem(UI_PREFERENCES_STORAGE_KEY);
    return serialized ? parseUiPreferences(serialized).exportDestination : "save-dialog";
  } catch {
    return "save-dialog";
  }
}

/**
 * Ask the browser to authorize a folder for the current session. This must be
 * called directly from a user gesture so Chromium can honor its permission
 * and activation requirements. No arbitrary filesystem path is accepted.
 */
export async function chooseArtifactDirectory(): Promise<
  ArtifactDirectoryHandle | "cancelled" | "unsupported"
> {
  if (typeof window === "undefined") return "unsupported";
  const picker = (window as SaveFileWindow).showDirectoryPicker;
  if (typeof picker !== "function") return "unsupported";
  try {
    return await picker({ mode: "readwrite" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
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

function triggerFallbackBrowserDownload(
  filename: string,
  mediaType: string,
  content: string,
) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return;
  const confirmed = window.confirm(
    `RocketWorks could not open a save dialog. Download ${filename} to the browser's Downloads folder?`,
  );
  if (confirmed) triggerBrowserDownload(filename, mediaType, content);
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

/** Write an artifact into the explicitly selected project folder. */
export async function saveTextArtifactToDirectory(
  directory: ArtifactDirectoryHandle,
  filename: string,
  mediaType: string,
  content: string,
): Promise<SaveArtifactResult> {
  try {
    const fileHandle = await directory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
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
  if (selectedArtifactDirectory) {
    void saveTextArtifactToDirectory(selectedArtifactDirectory, filename, mediaType, content)
      .then((result) => {
        if (result === "unsupported") triggerFallbackBrowserDownload(filename, mediaType, content);
      })
      .catch(() => {
        // A stale permission or filesystem error must not silently fill
        // Downloads. Ask before using the browser fallback.
        triggerFallbackBrowserDownload(filename, mediaType, content);
      });
    return;
  }
  if (readExportDestinationPreference(storage) !== "save-dialog") {
    triggerBrowserDownload(filename, mediaType, content);
    return;
  }
  void saveTextArtifactWithPicker(filename, mediaType, content)
    .then((result) => {
      if (result === "unsupported") {
        triggerFallbackBrowserDownload(filename, mediaType, content);
      }
    })
    .catch(() => {
      // A browser or permission error should not silently fill Downloads.
      // Ask before using the browser fallback; a cancelled picker does not.
      triggerFallbackBrowserDownload(filename, mediaType, content);
    });
}
