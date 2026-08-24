import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultUiPreferences,
  serializeUiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
} from "../lib/project/ui-preferences.ts";
import {
  chooseArtifactDirectory,
  downloadTextArtifact,
  getArtifactDirectoryName,
  saveTextArtifactWithPicker,
  saveTextArtifactToDirectory,
  setArtifactDirectory,
} from "../lib/export/browser-artifact.ts";

function storageFor(exportDestination) {
  const value = serializeUiPreferences({
    ...createDefaultUiPreferences(),
    exportDestination,
  });
  return { getItem: (key) => key === UI_PREFERENCES_STORAGE_KEY ? value : null };
}

function installBrowserHarness({ picker, directoryPicker, clicks, confirm = false }) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCreateObjectUrl = URL.createObjectURL;
  const previousRevokeObjectUrl = URL.revokeObjectURL;
  const anchor = {
    href: "",
    download: "",
    click: () => clicks.push(anchor.download),
  };
  globalThis.window = {
    showSaveFilePicker: picker,
    showDirectoryPicker: directoryPicker,
    confirm: () => confirm,
    setTimeout: (callback) => {
      callback();
      return 0;
    },
  };
  globalThis.document = { createElement: () => anchor };
  URL.createObjectURL = () => "blob:rocketworks-test";
  URL.revokeObjectURL = () => {};
  return () => {
    setArtifactDirectory(null);
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    URL.createObjectURL = previousCreateObjectUrl;
    URL.revokeObjectURL = previousRevokeObjectUrl;
  };
}

test("project-folder selection writes exports without creating browser downloads", async () => {
  const clicks = [];
  const writes = [];
  const directory = {
    name: "RocketWorks",
    getFileHandle: async () => ({
      createWritable: async () => ({
        write: async (blob) => writes.push(await blob.text()),
        close: async () => {},
      }),
    }),
  };
  const restore = installBrowserHarness({
    clicks,
    directoryPicker: async () => directory,
  });
  try {
    const selected = await chooseArtifactDirectory();
    assert.equal(selected, directory);
    setArtifactDirectory(selected);
    assert.equal(getArtifactDirectoryName(), "RocketWorks");
    downloadTextArtifact("project.json", "application/json", "{\"ok\":true}");
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.deepEqual(writes, ["{\"ok\":true}"]);
    assert.deepEqual(clicks, []);
  } finally {
    restore();
  }
});

test("project-folder save preserves content and reports cancellation", async () => {
  const writes = [];
  const directory = {
    getFileHandle: async () => ({
      createWritable: async () => ({
        write: async (blob) => writes.push(await blob.text()),
        close: async () => {},
      }),
    }),
  };
  assert.equal(await saveTextArtifactToDirectory(directory, "report.md", "text/markdown", "# report"), "saved");
  assert.deepEqual(writes, ["# report"]);
  const cancelled = await saveTextArtifactToDirectory({
    getFileHandle: async () => { throw new DOMException("user cancelled", "AbortError"); },
  }, "report.md", "text/markdown", "# report");
  assert.equal(cancelled, "cancelled");
});

test("save picker writes the requested artifact and preserves the extension filter", async () => {
  let pickerOptions;
  const writes = [];
  let closed = false;
  const restore = installBrowserHarness({
    clicks: [],
    picker: async (options) => {
      pickerOptions = options;
      return {
        createWritable: async () => ({
          write: async (blob) => writes.push(await blob.text()),
          close: async () => { closed = true; },
        }),
      };
    },
  });
  try {
    const result = await saveTextArtifactWithPicker("review.csv", "text/csv;charset=utf-8", "time_s,altitude_m\n0,0\n");
    assert.equal(result, "saved");
    assert.equal(pickerOptions.suggestedName, "review.csv");
    assert.deepEqual(pickerOptions.types, [{
      description: "RocketWorks export",
      accept: { "text/csv": [".csv"] },
    }]);
    assert.deepEqual(writes, ["time_s,altitude_m\n0,0\n"]);
    assert.equal(closed, true);
  } finally {
    restore();
  }
});

test("cancelled save dialogs do not report a saved artifact", async () => {
  const restore = installBrowserHarness({
    clicks: [],
    picker: async () => { throw new DOMException("user cancelled", "AbortError"); },
  });
  try {
    assert.equal(await saveTextArtifactWithPicker("review.json", "application/json", "{}"), "cancelled");
  } finally {
    restore();
  }
});

test("unsupported save dialogs fall back to the browser download path", async () => {
  const clicks = [];
  const restore = installBrowserHarness({ clicks, picker: undefined, confirm: true });
  try {
    downloadTextArtifact("review.json", "application/json", "{}", storageFor("save-dialog"));
    await Promise.resolve();
    assert.deepEqual(clicks, ["review.json"]);
  } finally {
    restore();
  }
});

test("unsupported save dialogs do not fill Downloads without consent", async () => {
  const clicks = [];
  const restore = installBrowserHarness({ clicks, picker: undefined, confirm: false });
  try {
    downloadTextArtifact("review.json", "application/json", "{}", storageFor("save-dialog"));
    await Promise.resolve();
    assert.deepEqual(clicks, []);
  } finally {
    restore();
  }
});

test("cancelled save dialogs do not create a fallback Downloads artifact", async () => {
  const clicks = [];
  const restore = installBrowserHarness({
    clicks,
    picker: async () => { throw new DOMException("user cancelled", "AbortError"); },
  });
  try {
    downloadTextArtifact("review.json", "application/json", "{}", storageFor("save-dialog"));
    await Promise.resolve();
    assert.deepEqual(clicks, []);
  } finally {
    restore();
  }
});
