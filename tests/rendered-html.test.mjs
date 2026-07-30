import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Kestrel Lab workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Kestrel Lab/);
  assert.match(html, /Clean-room prototype/);
  assert.match(html, /Run estimate/);
  assert.match(html, /Independent implementation/);
  assert.match(html, /engineering-preview-unvalidated/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /OpenRocket/);
});

test("ships versioned flight results and explainable model UI", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.modelVersion/);
  assert.match(source, /Flight events/);
  assert.match(source, /modelWarning\.explanation/);
  assert.match(source, /result\.assumptions/);
});
