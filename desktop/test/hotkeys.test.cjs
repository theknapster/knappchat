// Run with `npm test` (builds first). Exercises the hotkey matcher with
// synthetic hook events; no real input hook involved.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { HotkeyMatcher, sameBinding } = require("../dist/hotkeys.js");

const CTRL = 29, ESC = 1, M = 50, F9 = 67, SPACE = 57;
const ctrlM = { type: "key", keycode: M, ctrl: true, alt: false, shift: false, meta: false };
const f9 = { type: "key", keycode: F9, ctrl: false, alt: false, shift: false, meta: false };
const key = (keycode, mods = {}) => ({
  keycode, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

function setup(bindings) {
  const m = new HotkeyMatcher(new Map([[M, "M"], [F9, "F9"]]), new Set([CTRL]), ESC);
  const events = [];
  m.on("hotkey", (e) => events.push(e));
  m.setBindings(bindings);
  const take = () => events.splice(0);
  return { m, take };
}

test("toggle needs exact modifiers and ignores auto-repeat", () => {
  const { m, take } = setup({ toggle: ctrlM, ptt: null });
  m.onKeyDown(key(M));
  assert.deepEqual(take(), []);
  m.onKeyDown(key(M, { ctrlKey: true }));
  m.onKeyDown(key(M, { ctrlKey: true }));
  m.onKeyUp(key(M));
  assert.deepEqual(take(), ["toggle"]);
  m.onKeyDown(key(M, { ctrlKey: true }));
  assert.deepEqual(take(), ["toggle"]);
});

test("push-to-talk emits down once and up on release", () => {
  const { m, take } = setup({ toggle: null, ptt: f9 });
  m.onKeyDown(key(F9));
  m.onKeyDown(key(F9));
  m.onKeyUp(key(F9));
  assert.deepEqual(take(), ["ptt-down", "ptt-up"]);
});

test("unbinding push-to-talk mid-press releases it", () => {
  const { m, take } = setup({ toggle: null, ptt: f9 });
  m.onKeyDown(key(F9));
  m.setBindings({ toggle: null, ptt: null });
  m.onKeyUp(key(F9));
  assert.deepEqual(take(), ["ptt-down", "ptt-up"]);
});

test("mouse buttons work, left/right click never match", () => {
  const { m, take } = setup({ toggle: null, ptt: { type: "mouse", button: 4 } });
  m.onMouseDown({ button: 1 });
  m.onMouseDown({ button: 4 });
  m.onMouseUp({ button: 4 });
  assert.deepEqual(take(), ["ptt-down", "ptt-up"]);
});

test("recording captures key combos and extra mouse buttons", async () => {
  const { m, take } = setup({ toggle: f9, ptt: null });

  let p = m.record();
  m.onKeyDown(key(CTRL, { ctrlKey: true })); // bare modifier is skipped
  m.onKeyDown(key(SPACE, { ctrlKey: true }));
  assert.deepEqual(await p, { ...ctrlM, keycode: SPACE });

  p = m.record();
  m.onMouseDown({ button: 1 });
  m.onMouseDown({ button: 5 });
  assert.deepEqual(await p, { type: "mouse", button: 5 });

  p = m.record();
  m.onKeyDown(key(F9)); // bound key doesn't fire while recording
  await p;
  assert.deepEqual(take(), []);
});

test("recording ends with null on Escape, cancel and timeout", async () => {
  const { m } = setup({ toggle: null, ptt: null });
  let p = m.record();
  m.onKeyDown(key(ESC));
  assert.equal(await p, null);
  p = m.record();
  m.cancelRecording();
  assert.equal(await p, null);
  assert.equal(await m.record(20), null);
});

test("labels and binding comparison", () => {
  const { m } = setup({ toggle: null, ptt: null });
  assert.equal(m.label(ctrlM), "Ctrl+M");
  assert.equal(m.label({ type: "mouse", button: 3 }), "Middle mouse");
  assert.equal(m.label({ type: "mouse", button: 4 }), "Mouse 4");
  assert.ok(sameBinding(ctrlM, { ...ctrlM }));
  assert.ok(!sameBinding(ctrlM, f9));
  assert.ok(!sameBinding(null, null));
});
