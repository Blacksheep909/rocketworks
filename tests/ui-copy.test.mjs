import test from "node:test";
import assert from "node:assert/strict";
import { getUiCopy, UI_LOCALES } from "../lib/project/ui-copy.ts";

test("UI copy catalog has complete English and Spanish shell coverage", () => {
  assert.deepEqual(UI_LOCALES, ["en", "es"]);
  const english = getUiCopy("en");
  const spanish = getUiCopy("es");
  assert.equal(english.display, "Display");
  assert.equal(spanish.display, "Pantalla");
  assert.equal(english.accessibilityTitle, "Display & accessibility");
  assert.equal(spanish.accessibilityTitle, "Pantalla y accesibilidad");
  assert.equal(english.traceSample, "Trace sample");
  assert.equal(spanish.traceSample, "Muestra de traza");
  assert.equal(english.traceOf, "of");
  assert.equal(spanish.traceOf, "de");
  assert.deepEqual(Object.keys(english).sort(), Object.keys(spanish).sort());
  assert.ok(Object.values(english).every((value) => value.trim().length > 0));
  assert.ok(Object.values(spanish).every((value) => value.trim().length > 0));
});

test("the catalog defaults non-Spanish runtime values to English", () => {
  assert.equal(getUiCopy("en").runEstimate, "Run estimate");
});
