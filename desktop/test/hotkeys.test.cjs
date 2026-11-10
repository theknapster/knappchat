// Run with `npm test` (builds first). Exercises the hotkey matcher with
// synthetic hook events; no real input hook involved.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { HotkeyMatcher, sameBinding } = require("../dist/hotkeys.js");

const CTRL = 29, ALT = 56, ALT_RIGHT = 3640, ESC = 1, M = 50, F9 = 67, SPACE = 57;
const ctrlM = { type: "key", keycode: M, ctrl: true, alt: false, shift: false, meta: false };
const f9 = { type: "key", keycode: F9, ctrl: false, alt: false, shift: false, meta: false };
const key = (keycode, mods = {}) => ({
  keycode, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

function setup(bindings) {
  const m = new HotkeyMatcher(
    new Map([[M, "M"], [F9, "F9"], [ALT, "Alt"], [ALT_RIGHT, "AltRight"]]),
    new Set([CTRL, ALT, ALT_RIGHT]),
    ESC
  );
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
  m.onKeyDown(key(CTRL, { ctrlKey: true })); // modifier waits for the next key
  m.onKeyDown(key(SPACE, { ctrlKey: true }));
  assert.deepEqual(await p, { ...ctrlM, keycode: SPACE });
  m.onKeyUp(key(CTRL)); // releasing it afterwards records nothing new

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

const alt = { type: "key", keycode: ALT, ctrl: false, alt: false, shift: false, meta: false };

test("a modifier pressed and released alone records as a hotkey", async () => {
  const { m } = setup({ toggle: null, ptt: null });
  let p = m.record();
  m.onKeyDown(key(ALT, { altKey: true }));
  m.onKeyDown(key(ALT, { altKey: true })); // auto-repeat
  m.onKeyUp(key(ALT));
  assert.deepEqual(await p, alt);

  // two modifiers together aren't a lone modifier; keep waiting
  p = m.record();
  m.onKeyDown(key(CTRL, { ctrlKey: true }));
  m.onKeyDown(key(ALT, { ctrlKey: true, altKey: true }));
  m.onKeyUp(key(ALT, { ctrlKey: true }));
  m.onKeyUp(key(CTRL));
  m.onKeyDown(key(ALT_RIGHT, { altKey: true }));
  m.onKeyUp(key(ALT_RIGHT));
  assert.deepEqual(await p, { ...alt, keycode: ALT_RIGHT });
});

test("a lone modifier works as push-to-talk, with or without other keys", () => {
  const { m, take } = setup({ toggle: null, ptt: alt });
  m.onKeyDown(key(ALT, { altKey: true }));
  m.onKeyDown(key(ALT, { altKey: true }));
  m.onKeyUp(key(ALT));
  assert.deepEqual(take(), ["ptt-down", "ptt-up"]);
  m.onKeyDown(key(CTRL, { ctrlKey: true }));
  m.onKeyDown(key(ALT, { ctrlKey: true, altKey: true }));
  m.onKeyUp(key(ALT, { ctrlKey: true }));
  assert.deepEqual(take(), ["ptt-down", "ptt-up"]);
  m.onKeyDown(key(ALT_RIGHT, { altKey: true })); // left and right are separate keys
  assert.deepEqual(take(), []);
  assert.equal(m.label(alt), "Alt");
  assert.equal(m.label({ ...alt, keycode: ALT_RIGHT }), "Right Alt");
});
