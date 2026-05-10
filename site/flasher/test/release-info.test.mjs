import test from "node:test";
import assert from "node:assert/strict";

import { buildReleaseTag, createDesktopReleaseUrl } from "../scripts/release-info.mjs";

test("release info derives tag and desktop release URL from the root version", () => {
  assert.equal(buildReleaseTag("0.4.5"), "v0.4.5");
  assert.equal(
    createDesktopReleaseUrl("0.4.5"),
    "https://github.com/zhouxiyu1997/friendmaker/releases/tag/v0.4.5",
  );
});
