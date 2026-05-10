import assert from "node:assert/strict";
import test from "node:test";

import {
  rememberStudioColorCount,
  syncStudioColorCountState,
} from "../src/web/static/studioColorCountState.js";

test("studio color counts stay separate for official and palette mode across switches", () => {
  let state = {
    colorMode: "mono",
    colorCount: 32,
    colorCountByMode: {
      palette: 32,
      official: 32,
    },
  };

  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 2);

  state = {
    ...state,
    colorMode: "official",
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 32);

  state = {
    ...state,
    colorCount: 64,
    colorCountByMode: rememberStudioColorCount(state.colorCountByMode, "official", 64),
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 64);

  state = {
    ...state,
    colorMode: "palette",
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 32);

  state = {
    ...state,
    colorCount: 18,
    colorCountByMode: rememberStudioColorCount(state.colorCountByMode, "palette", 18),
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 18);

  state = {
    ...state,
    colorMode: "official",
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 64);

  state = {
    ...state,
    colorMode: "mono",
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 2);
  assert.deepEqual(state.colorCountByMode, {
    palette: 18,
    official: 64,
  });

  state = {
    ...state,
    colorMode: "palette",
  };
  state = { ...state, ...syncStudioColorCountState(state) };
  assert.equal(state.colorCount, 18);
});
