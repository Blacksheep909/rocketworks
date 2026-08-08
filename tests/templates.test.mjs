import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPERIENCE_MODE_STORAGE_KEY,
  PROJECT_TEMPLATES,
  findProjectTemplate,
} from "../lib/project/templates.ts";
import { validateEditableProjectInputs } from "../lib/project/project-state.ts";

test("template library has unique, validated original configurations", () => {
  assert.equal(EXPERIENCE_MODE_STORAGE_KEY, "kestrel.project.arc54.experience-mode.v1");
  assert.equal(PROJECT_TEMPLATES.length, 4);
  const ids = new Set(PROJECT_TEMPLATES.map((template) => template.id));
  assert.equal(ids.size, PROJECT_TEMPLATES.length);
  for (const template of PROJECT_TEMPLATES) {
    assert.ok(template.name.length > 0);
    assert.ok(template.focus.length >= 3);
    assert.deepEqual(validateEditableProjectInputs(template.inputs), template.inputs);
  }
});

test("template lookup is explicit and rejects unknown IDs", () => {
  assert.equal(findProjectTemplate("first-flight").inputs.recoveryEnabled, true);
  assert.equal(findProjectTemplate("ballistic-check").inputs.recoveryEnabled, false);
  assert.throws(() => findProjectTemplate("missing"), /Unknown project template/);
});
