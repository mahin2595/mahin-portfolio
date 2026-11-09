/* ============================================================
   config.js unit tests — run with:  npm test
   Uses Node's built-in test runner. No browser required.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const C = require('../config.js');

test('DEFAULT_CONFIG is internally consistent and normalizes cleanly', () => {
  const { config, errors } = C.normalizeConfig(C.DEFAULT_CONFIG);
  assert.deepStrictEqual(errors, [], 'defaults should not raise validation errors');
  assert.strictEqual(config.version, C.SCHEMA_VERSION);
  assert.ok(config.projects.length > 0);
  assert.ok(config.skills.length > 0);
  assert.strictEqual(config.profile.displayName, 'Mahin');
});

test('normalizeConfig coerces bad input and fills gaps from defaults', () => {
  const { config } = C.normalizeConfig({
    profile: { displayName: 42, stats: [{ label: 'Real', value: '7' }, { nope: true }] },
    appearance: { blur: 9999, fontScale: -3, mode: 'purple' },
    animations: { duration: -100, reducedMotion: 'nonsense' }
  });
  assert.strictEqual(config.profile.displayName, '42');
  assert.deepStrictEqual(config.profile.stats, [{ label: 'Real', value: 7 }]);
  assert.strictEqual(config.appearance.blur, 40, 'blur clamped to max');
  assert.strictEqual(config.appearance.fontScale, 0.8, 'font scale clamped to min');
  assert.strictEqual(config.appearance.mode, 'dark', 'unknown mode falls back to dark');
  assert.strictEqual(config.animations.duration, 0, 'duration clamped to min');
  assert.strictEqual(config.animations.reducedMotion, 'system');
});

test('normalizeConfig strips unsafe URLs and reports them', () => {
  const { config, errors } = C.normalizeConfig({
    profile: { email: 'me@example.com', avatar: 'javascript:alert(1)' },
    social: { instagram: 'https://instagram.com/me' },
    projects: [{
      title: 'Evil',
      url: 'javascript:alert(1)',
      videoUrl: 'data:text/html,<script>',
      image: 'https://cdn.example.com/a.png'
    }]
  });
  assert.strictEqual(config.profile.avatar, '');
  assert.strictEqual(config.projects[0].url, '');
  assert.strictEqual(config.projects[0].videoUrl, '');
  assert.strictEqual(config.projects[0].image, 'https://cdn.example.com/a.png');
  assert.ok(errors.some((e) => /Unsafe URL/.test(e)));
});

test('escapeHtml neutralizes script markup', () => {
  assert.strictEqual(
    C.escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});

test('resolveAsset maps media ids to data URLs and passes safe URLs through', () => {
  const cfg = {
    media: [{ id: 'm1', dataUrl: 'data:image/png;base64,AAAA', type: 'image/png' }]
  };
  assert.strictEqual(C.resolveAsset('media:m1', cfg), 'data:image/png;base64,AAAA');
  assert.strictEqual(C.resolveAsset('media:missing', cfg), '');
  assert.strictEqual(C.resolveAsset('https://x.test/a.png', cfg), 'https://x.test/a.png');
  assert.strictEqual(C.resolveAsset('javascript:alert(1)', cfg), '');
  assert.strictEqual(C.resolveAsset('', cfg), '');
});

test('save() then load() persists a config (memory fallback in Node)', () => {
  const before = C.load();
  const res = C.save(Object.assign({}, before, {
    profile: Object.assign({}, before.profile, { displayName: 'Persisted Name' })
  }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(C.load().profile.displayName, 'Persisted Name');
  // restore
  C.save(before);
});

test('exportJSON -> importJSON round-trips without loss', () => {
  const original = C.load();
  const text = C.exportJSON(original);
  const back = C.importJSON(text);
  assert.strictEqual(back.ok, true);
  assert.deepStrictEqual(back.config, C.normalizeConfig(original).config);
});

test('importJSON rejects invalid JSON, non-objects, and unrelated JSON', () => {
  assert.strictEqual(C.importJSON('{not json').ok, false);
  assert.strictEqual(C.importJSON('[1,2,3]').ok, false);
  assert.strictEqual(C.importJSON('{"hello":"world"}').ok, false);
  const good = C.importJSON('{"profile":{"displayName":"Imported"}}');
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.config.profile.displayName, 'Imported');
});

test('resetToDefaults produces a clean default config', () => {
  const res = C.resetToDefaults();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.config.profile.displayName, 'Mahin');
});

test('applyTheme / applyAnimations are safe without a DOM (Node)', () => {
  assert.doesNotThrow(() => C.applyTheme(C.DEFAULT_CONFIG, null));
  assert.doesNotThrow(() => C.applyAnimations(C.DEFAULT_CONFIG, null));
});
