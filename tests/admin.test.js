/* ============================================================
   admin.js integration tests — run with:  npm test
   Boots the real admin.html inside jsdom, injects config.js and
   admin.js, then exercises the UI the way a person would.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const C = require('../config.js');
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
const ADMIN_HTML = stripExternal(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripExternal(html) {
  return html
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
    .replace(/<link[^>]*rel="preconnect"[^>]*>/gi, '')
    .replace(/<script[^>]*src=[^>]*><\/script>/gi, '');
}

/**
 * Boot the admin inside jsdom. `seed` is written to localStorage before the
 * app loads, which is how we simulate a page refresh. `reducedMotion` toggles
 * the matchMedia polyfill so we can exercise that branch.
 */
function bootAdmin(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});

  const dom = new JSDOM(ADMIN_HTML, {
    url: 'http://localhost/admin.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;

  // --- jsdom gaps ---------------------------------------------------------
  window.matchMedia = function (query) {
    return {
      matches: opts.reducedMotion === true && /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
      dispatchEvent() { return false; }
    };
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock';
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
  window.document.execCommand = () => true;

  if (opts.seed) {
    window.localStorage.setItem(C.STORAGE_KEY, JSON.stringify(opts.seed));
  } else {
    window.localStorage.clear();
  }

  window.eval(CONFIG_SRC);
  window.eval(ADMIN_SRC);

  // If jsdom already fired DOMContentLoaded before our eval, fire it again.
  if (!window.document.querySelector('#adminNav .a-nav-item')) {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  }
  return dom;
}

// --- tiny DOM helpers -----------------------------------------------------
function go(window, panel) {
  window.document.querySelector('.a-nav-item[data-panel="' + panel + '"]').click();
}
function findButton(window, text, root) {
  const scope = root || window.document;
  return Array.from(scope.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === text);
}
function fieldByLabel(window, label, root) {
  const scope = root || window.document;
  const fields = Array.from(scope.querySelectorAll('.a-field'));
  return fields.find((f) => {
    const span = f.querySelector('.a-field-label span');
    if (!span) return false;
    return span.textContent.replace(/\s*\*\s*$/, '').trim() === label;
  });
}
function fieldControl(window, label, root) {
  const field = fieldByLabel(window, label, root);
  return field ? field.querySelector('input, textarea, select') : null;
}
function setValue(window, input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function storedConfig(window) {
  return JSON.parse(window.localStorage.getItem(C.STORAGE_KEY));
}

// ==========================================================================
test('boot renders navigation, dashboard stats and saved status', () => {
  const { window } = bootAdmin();
  assert.strictEqual(window.document.querySelectorAll('#adminNav .a-nav-item').length, 10);
  assert.strictEqual(window.document.querySelectorAll('#panel-dashboard .a-stat-card').length, 4);
  assert.strictEqual(window.document.querySelector('#saveStatusText').textContent, 'Saved');
  assert.ok(window.document.querySelector('#previewFrame'), 'dashboard has the live preview iframe');
});

test('mobile drawer opens and closes (button + Escape)', () => {
  const { window } = bootAdmin();
  const sidebar = window.document.querySelector('#aSidebar');
  window.document.querySelector('#drawerBtn').click();
  assert.ok(sidebar.classList.contains('open'), 'drawer opens');
  assert.strictEqual(window.document.querySelector('#aScrim').hidden, false);

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(!sidebar.classList.contains('open'), 'Escape closes the drawer');
});

test('project CRUD: add, edit, persist, then delete via confirmation dialog', async () => {
  const { window } = bootAdmin();
  go(window, 'projects');

  const before = window.document.querySelectorAll('.a-project').length;

  findButton(window, '+ Add project').click();
  const afterAdd = window.document.querySelectorAll('.a-project');
  assert.strictEqual(afterAdd.length, before + 1, 'project added to the list');
  assert.strictEqual(window.document.querySelector('#saveStatusText').textContent, 'Unsaved changes');

  // Newly added projects are expanded, so the title field is in the DOM.
  const newCard = window.document.querySelector('#projectList .a-project:last-child');
  const titleInput = fieldControl(window, 'Project title', newCard);
  assert.ok(titleInput, 'title field is present');
  setValue(window, titleInput, 'My Test Project');

  // Save and verify persistence.
  window.document.querySelector('#saveBtn').click();
  assert.strictEqual(window.document.querySelector('#saveStatusText').textContent, 'Saved');
  const saved = storedConfig(window);
  assert.ok(saved.projects.some((p) => p.title === 'My Test Project'), 'project persisted to storage');

  // Delete it through the confirm dialog.
  const deleteBtn = Array.from(newCard.querySelectorAll('button'))
    .find((b) => b.getAttribute('title') === 'Delete project');
  assert.ok(deleteBtn, 'delete button exists');
  deleteBtn.click();
  assert.strictEqual(window.document.querySelector('#modalRoot').hidden, false, 'confirm dialog opens');
  window.document.querySelector('#modalConfirm').click();
  await sleep(10);

  const titles = Array.from(window.document.querySelectorAll('#projectList .a-project'))
    .map((c) => c.dataset.title);
  assert.ok(!titles.includes('My Test Project'), 'project removed after confirmation');
});

test('profile edits autosave and survive a simulated refresh', async () => {
  const first = bootAdmin();
  go(first.window, 'profile');
  const nameInput = fieldControl(first.window, 'Display name');
  assert.ok(nameInput);
  setValue(first.window, nameInput, 'Mahin Test');

  // autosave debounce is 900ms
  await sleep(1150);
  const persisted = storedConfig(first.window);
  assert.strictEqual(persisted.profile.displayName, 'Mahin Test');
  first.window.close();

  // "Refresh": boot a fresh window seeded with the saved config.
  const second = bootAdmin({ seed: persisted });
  assert.ok(second.window.document.body.textContent.includes('Mahin Test'),
    'edited name renders after refresh');
});

test('appearance colour control updates the live swatch preview', () => {
  const { window } = bootAdmin();
  go(window, 'appearance');
  const accentInput = fieldControl(window, 'Accent (lime slot)');
  assert.ok(accentInput, 'accent colour control exists');
  setValue(window, accentInput, '#ff0000');
  const swatch = window.document.querySelector('[data-swatch-key="accent"]');
  assert.ok(swatch, 'swatch exists');
  assert.match(swatch.getAttribute('style') || swatch.style.background, /255,\s*0,\s*0|#ff0000/i);
});

test('admin light/dark toggle persists its preference', () => {
  const { window } = bootAdmin();
  const root = window.document.documentElement;
  assert.strictEqual(root.getAttribute('data-admin-theme'), 'dark');
  window.document.querySelector('#adminThemeBtn').click();
  assert.strictEqual(root.getAttribute('data-admin-theme'), 'light');
  assert.strictEqual(window.localStorage.getItem('mahin_admin_theme'), 'light');
  window.document.querySelector('#adminThemeBtn').click();
  assert.strictEqual(root.getAttribute('data-admin-theme'), 'dark');
});

test('live preview pushes the working config into the iframe', () => {
  const { window } = bootAdmin();
  const frame = window.document.querySelector('#previewFrame');
  assert.ok(frame, 'preview iframe exists');
  const calls = [];
  frame.contentWindow.postMessage = (msg) => { calls.push(msg); };
  findButton(window, 'Push changes').click();
  assert.ok(calls.length >= 1, 'postMessage called');
  assert.strictEqual(calls[calls.length - 1].type, 'mahin:preview-config');
  assert.ok(calls[calls.length - 1].config.profile, 'message carries the config');
});

test('invalid upload is rejected, valid image is accepted', async () => {
  const { window } = bootAdmin();
  go(window, 'media');
  const input = window.document.querySelector('.a-dropzone input[type="file"]');
  assert.ok(input, 'upload input exists');

  // Invalid type
  const bad = new window.File(['hello'], 'notes.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { value: [bad], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(30);
  assert.strictEqual(window.document.querySelectorAll('.a-media-card').length, 0, 'no media added');
  assert.ok(window.document.querySelector('.a-toast.error'), 'an error toast is shown for a bad file');

  // Valid type
  const good = new window.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'pic.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [good], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(60);
  assert.strictEqual(window.document.querySelectorAll('.a-media-card').length, 1, 'valid image added');
});

test('search finds settings across panels and navigates to one', async () => {
  const { window } = bootAdmin();
  const search = window.document.querySelector('#adminSearch');
  setValue(window, search, 'glass transparency');
  await sleep(220); // debounce is 130ms
  const results = window.document.querySelector('#searchResults');
  assert.strictEqual(results.hidden, false, 'results shown');
  const first = results.querySelector('.a-search-result');
  assert.ok(first, 'at least one result');
  first.click();
  const activeNav = window.document.querySelector('.a-nav-item.active');
  assert.ok(activeNav, 'a panel is active after clicking a result');
  assert.strictEqual(activeNav.dataset.panel, 'appearance',
    'glass transparency lives in the appearance panel');
});

test('data panel reset restores defaults after confirmation', async () => {
  const first = bootAdmin();
  go(first.window, 'profile');
  setValue(first.window, fieldControl(first.window, 'Display name'), 'Temporary');
  first.window.document.querySelector('#saveBtn').click();
  const seeded = storedConfig(first.window);
  assert.strictEqual(seeded.profile.displayName, 'Temporary');
  first.window.close();

  const { window } = bootAdmin({ seed: seeded });
  go(window, 'data');
  findButton(window, 'Reset to defaults').click();
  window.document.querySelector('#modalConfirm').click();
  await sleep(20);
  assert.strictEqual(storedConfig(window).profile.displayName, 'Mahin', 'reset restored defaults');
});

test('import validation rejects an unrelated JSON payload without changing data', async () => {
  const { window } = bootAdmin();
  const before = storedConfig(window);
  // The admin exposes import through the file input; drive it with a bad file.
  go(window, 'data');
  const fileInput = window.document.querySelector('.a-dropzone input[type="file"]');
  const bad = new window.File(['{"totally":"unrelated"}'], 'bad.json', { type: 'application/json' });
  Object.defineProperty(fileInput, 'files', { value: [bad], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(250);
  assert.ok(window.document.querySelector('.a-toast.error'), 'shows an error toast');
  assert.deepStrictEqual(storedConfig(window), before, 'stored data unchanged');
});

test('reduced-motion preference is surfaced in the animations panel', () => {
  const { window } = bootAdmin({ reducedMotion: true });
  go(window, 'animations');
  const warn = window.document.querySelector('#panel-animations .a-note.warn');
  assert.ok(warn, 'reduced-motion notice is shown');
  assert.match(warn.textContent, /reduced motion/i);
});

test('every admin panel renders a header and at least one card', () => {
  const { window } = bootAdmin();
  const ids = Array.from(window.document.querySelectorAll('.a-nav-item')).map((b) => b.dataset.panel);
  assert.strictEqual(ids.length, 10);
  ids.forEach((id) => {
    window.document.querySelector('.a-nav-item[data-panel="' + id + '"]').click();
    const panel = window.document.querySelector('#panel-' + id);
    assert.ok(panel.querySelector('.a-panel-head'), id + ': header rendered');
    assert.ok(panel.querySelector('.a-card'), id + ': at least one card rendered');
  });
});

test('contact email validates and syncs profile + social', () => {
  const { window } = bootAdmin();
  go(window, 'contact');
  const email = fieldControl(window, 'Email address');
  assert.ok(email, 'email field exists');

  setValue(window, email, 'not-an-email');
  email.dispatchEvent(new window.Event('blur'));
  assert.ok(window.document.querySelector('#panel-contact .a-field.invalid'), 'invalid email flagged');

  setValue(window, email, 'studio@example.com');
  window.document.querySelector('#saveBtn').click();
  const saved = storedConfig(window);
  assert.strictEqual(saved.profile.email, 'studio@example.com');
  assert.strictEqual(saved.social.email, 'studio@example.com');
});

test('SEO panel previews the title and description as you type', () => {
  const { window } = bootAdmin();
  go(window, 'seo');
  const title = fieldControl(window, 'Website title');
  assert.ok(title, 'website title field exists');
  setValue(window, title, 'A Custom Site Title');
  const serpTitle = window.document.querySelector('#panel-seo .a-serp-title');
  assert.strictEqual(serpTitle.textContent, 'A Custom Site Title');

  const desc = fieldControl(window, 'Meta description');
  setValue(window, desc, 'A short description for sharing.');
  assert.strictEqual(
    window.document.querySelector('#panel-seo .a-serp-desc').textContent,
    'A short description for sharing.'
  );
});
