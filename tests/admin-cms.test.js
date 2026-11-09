/* ============================================================
   Supabase CMS dashboard tests — run with:  npm test
   Boots the real /admin/index.html in jsdom, injects the in-memory
   Supabase double, and drives the UI the way an administrator
   would: sign in, create/edit/publish/delete, upload, delete
   guards, save settings and sign out.

   NOTE: these exercise the UI + adapter against a mock that follows
   the documented schema. They do not prove anything about a live
   Supabase project (no credentials exist in this environment).
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const ADMIN_HTML = stripExternal(fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8'));
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
const SUPABASE_CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'supabase.config.js'), 'utf8');
const SUPABASE_CLIENT_SRC = fs.readFileSync(path.join(ROOT, 'supabase-client.js'), 'utf8');
const CMS_SRC = fs.readFileSync(path.join(ROOT, 'cms.js'), 'utf8');
const ADMIN_CMS_SRC = fs.readFileSync(path.join(ROOT, 'admin/cms.js'), 'utf8');

const { createMockClient } = require('./support/mock-supabase.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripExternal(html) {
  return html
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
    .replace(/<link[^>]*rel="preconnect"[^>]*>/gi, '')
    .replace(/<script[^>]*src=[^>]*><\/script>/gi, '');
}

function baseDatabase() {
  return {
    projects: [
      {
        id: 'p1', title: 'Published One', description: 'First', category: 'design',
        tools: ['Branding'], project_url: '', video_url: '',
        thumbnail_path: 'projects/used.png', thumbnail_url: '',
        featured: true, sort_order: 0, status: 'published'
      },
      {
        id: 'p2', title: 'Draft Two', description: 'Draft', category: 'video',
        tools: ['Video'], project_url: '', video_url: '',
        thumbnail_path: '', thumbnail_url: '',
        featured: false, sort_order: 1, status: 'draft'
      }
    ],
    skills: [{ id: 's1', name: 'VIDEO EDITING', sort_order: 0, status: 'published' }],
    social_links: [{ id: 'l1', platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/x', sort_order: 0, visible: true }],
    site_settings: [
      { key: 'profile', value: { displayName: 'Mahin', heroIntro: 'Intro' } },
      { key: 'seo', value: { title: 'Old title' } }
    ]
  };
}

async function bootAdmin(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});

  const dom = new JSDOM(ADMIN_HTML, {
    url: 'http://localhost/admin/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;

  window.matchMedia = function (query) {
    return {
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return false; }
    };
  };
  window.scrollTo = () => {};
  window.open = () => null;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock';
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
  window.document.execCommand = () => true;
  window.localStorage.clear();

  window.eval(CONFIG_SRC);
  window.eval(SUPABASE_CONFIG_SRC);
  // Point the client at a fake but well-formed project so isConfigured() is true.
  window.MAHIN_SUPABASE.url = 'https://test.supabase.co';
  window.MAHIN_SUPABASE.publishableKey = 'sb_publishable_test_key_123';
  window.eval(SUPABASE_CLIENT_SRC);
  window.eval(CMS_SRC);

  const client = createMockClient({
    database: opts.database || baseDatabase(),
    objects: opts.objects || [{ path: 'projects/used.png', type: 'image/png', size: 100 }],
    users: [{ email: 'admin@example.com', password: 'correct-horse' }],
    session: opts.session || null,
    faults: opts.faults || {},
    buckets: opts.buckets
  });
  window.MahinCMS.setClient(client);
  window.eval(ADMIN_CMS_SRC);

  await sleep(40);
  return { dom, window, client };
}

/* --- tiny DOM helpers ---------------------------------------------------- */
function byLabel(window, text, scope) {
  const root = scope || window.document;
  const labels = Array.from(root.querySelectorAll('label'));
  const label = labels.find((l) => l.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  if (!label) return null;
  if (label.control) return label.control;
  const id = label.getAttribute('for');
  return id ? window.document.getElementById(id) : null;
}

function button(root, text) {
  return Array.from(root.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === text);
}

async function signIn(window) {
  const doc = window.document;
  doc.getElementById('loginEmail').value = 'admin@example.com';
  doc.getElementById('loginPassword').value = 'correct-horse';
  doc.getElementById('loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(80);
}

function go(window, panel) {
  window.document.querySelector('.a-nav-item[data-panel="' + panel + '"]').click();
}

test('shows the real auth screen when there is no session', async () => {
  const { window } = await bootAdmin();
  const doc = window.document;
  assert.strictEqual(doc.getElementById('authScreen').hidden, false);
  assert.strictEqual(doc.getElementById('appScreen').hidden, true);
  assert.ok(doc.getElementById('configState').textContent.match(/connected/i));
  window.close();
});

test('rejects empty and wrong credentials, then accepts the real one', async () => {
  const { window } = await bootAdmin();
  const doc = window.document;

  doc.getElementById('loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(20);
  assert.ok(doc.getElementById('authNotice').textContent.match(/email and password/i));

  doc.getElementById('loginEmail').value = 'admin@example.com';
  doc.getElementById('loginPassword').value = 'nope';
  doc.getElementById('loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(40);
  assert.ok(doc.getElementById('authNotice').textContent.match(/Invalid login credentials/i));

  doc.getElementById('loginPassword').value = 'correct-horse';
  doc.getElementById('loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(100);

  assert.strictEqual(doc.getElementById('appScreen').hidden, false);
  assert.strictEqual(doc.getElementById('authScreen').hidden, true);
  assert.strictEqual(doc.querySelectorAll('#cmsNav .a-nav-item').length, 6);
  window.close();
});

test('a persisted session opens the dashboard directly', async () => {
  const { window } = await bootAdmin({ session: { user: { id: 'u1', email: 'admin@example.com' } } });
  await sleep(60);
  assert.strictEqual(window.document.getElementById('appScreen').hidden, false);
  assert.ok(window.document.getElementById('cmsAccount').textContent.match(/admin@example\.com/));
  window.close();
});

test('dashboard shows live counts and a connected status', async () => {
  const { window } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;
  const text = doc.getElementById('cmsPanels').textContent;
  assert.ok(text.match(/Published One/) || text.match(/Recent projects/));
  assert.ok(doc.getElementById('cmsConnectionText').textContent.match(/Connected/i));
  const stats = Array.from(doc.querySelectorAll('.cms-stat b')).map((n) => n.textContent);
  assert.strictEqual(stats[0], '2', 'two projects');
  assert.strictEqual(stats[1], '1', 'one skill');
  window.close();
});

test('create a project through the UI, then publish and delete it', async () => {
  const { window, client } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;

  go(window, 'projects');
  await sleep(20);
  button(doc, '+ New project').click();
  await sleep(20);

  const form = doc.querySelector('.a-card[data-editor="new"]');
  assert.ok(form, 'new project editor is open');
  byLabel(window, 'Title', form).value = 'UI Created Project';
  byLabel(window, 'Description', form).value = 'Added from the dashboard';
  byLabel(window, 'Tools / software', form).value = 'Video, Color';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(120);

  const created = client.__db.projects.find((p) => p.title === 'UI Created Project');
  assert.ok(created, 'row inserted into projects');
  assert.strictEqual(Array.from(created.tools).join(','), 'Video,Color');
  assert.strictEqual(created.status, 'draft', 'new projects start as drafts');
  assert.strictEqual(created.slug, 'ui-created-project');

  // Publish it.
  const row = Array.from(doc.querySelectorAll('.cms-item')).find((n) => n.textContent.includes('UI Created Project'));
  assert.ok(row, 'new project rendered');
  button(row, 'Publish').click();
  await sleep(120);
  assert.strictEqual(client.__db.projects.find((p) => p.id === created.id).status, 'published');

  // Delete it (confirmation dialog).
  const row2 = Array.from(doc.querySelectorAll('.cms-item')).find((n) => n.textContent.includes('UI Created Project'));
  row2.querySelector('[aria-label="Delete project"]').click();
  await sleep(20);
  assert.strictEqual(doc.getElementById('cmsModalRoot').hidden, false, 'confirmation shown');
  doc.getElementById('cmsModalConfirm').click();
  await sleep(140);
  assert.ok(!client.__db.projects.some((p) => p.id === created.id), 'row deleted');
  window.close();
});

test('adding a skill writes to the skills table', async () => {
  const { window, client } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;

  go(window, 'skills');
  await sleep(20);
  const input = doc.querySelector('input[aria-label="New skill"]');
  assert.ok(input, 'skill input present');
  input.value = 'MOTION DESIGN';
  input.closest('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(120);

  assert.ok(client.__db.skills.some((s) => s.name === 'MOTION DESIGN'));
  window.close();
});

test('adding a social link writes to social_links', async () => {
  const { window, client } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;

  go(window, 'social');
  await sleep(20);
  const form = doc.querySelector('form.a-card');
  byLabel(window, 'Platform', form).value = 'behance';
  byLabel(window, 'URL', form).value = 'https://behance.net/mahin';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(120);

  const link = client.__db.social_links.find((l) => l.url === 'https://behance.net/mahin');
  assert.ok(link);
  assert.strictEqual(link.platform, 'behance');
  window.close();
});

test('saving the Profile tab upserts site_settings', async () => {
  const { window, client } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;

  go(window, 'site');
  await sleep(20);
  const nameInput = byLabel(window, 'Display name');
  assert.ok(nameInput, 'display name field present');
  nameInput.value = 'Mahin Updated';
  nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  button(doc, 'Save profile').click();
  await sleep(140);

  const row = client.__db.site_settings.find((r) => r.key === 'profile');
  assert.strictEqual(row.value.displayName, 'Mahin Updated');
  window.close();
});

test('media upload accepts an image and rejects an invalid type', async () => {
  const { window, client } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(100);
  const doc = window.document;

  go(window, 'media');
  await sleep(80);
  const fileInput = doc.querySelector('input[aria-label="Upload images"]');
  assert.ok(fileInput, 'upload input present');

  const good = new window.File([new Uint8Array([1, 2, 3, 4])], 'shot.png', { type: 'image/png' });
  Object.defineProperty(fileInput, 'files', { value: [good], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(160);

  assert.ok(client.__objects.some((o) => /\.png$/.test(o.path) && o.type === 'image/png'), 'valid image stored');

  const bad = new window.File([new Uint8Array([1])], 'evil.gif', { type: 'image/gif' });
  Object.defineProperty(fileInput, 'files', { value: [bad], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(120);

  assert.ok(!client.__objects.some((o) => o.name === 'evil.gif'), 'gif rejected before upload');
  window.close();
});

test('deleting an image still used by a project is refused', async () => {
  const { window, client } = await bootAdmin({
    session: { user: { email: 'admin@example.com' } },
    objects: [{ path: 'projects/used.png', type: 'image/png', size: 100 }]
  });
  await sleep(100);
  const doc = window.document;

  go(window, 'media');
  await sleep(90);

  const card = Array.from(doc.querySelectorAll('.cms-media-card')).find((c) => c.textContent.includes('used.png'));
  assert.ok(card, 'image listed');
  button(card, 'Delete').click();
  await sleep(20);
  doc.getElementById('cmsModalConfirm').click();
  await sleep(160);

  assert.ok(client.__objects.some((o) => o.path === 'projects/used.png'), 'referenced image kept');
  const toasts = doc.getElementById('cmsToasts').textContent;
  assert.ok(toasts.match(/still used by/i), 'error toast explains the reference');
  window.close();
});

test('sign out returns to the login screen', async () => {
  const { window } = await bootAdmin({ session: { user: { email: 'admin@example.com' } } });
  await sleep(80);
  const doc = window.document;

  doc.getElementById('cmsSignOutBtn').click();
  await sleep(20);
  doc.getElementById('cmsModalConfirm').click();
  await sleep(80);

  assert.strictEqual(doc.getElementById('authScreen').hidden, false);
  assert.strictEqual(doc.getElementById('appScreen').hidden, true);
  window.close();
});

test('a Supabase read error is surfaced instead of failing silently', async () => {
  const { window } = await bootAdmin({
    session: { user: { email: 'admin@example.com' } },
    faults: { projects: 'permission denied for table projects' }
  });
  await sleep(120);
  const text = window.document.getElementById('cmsToasts').textContent;
  assert.ok(/permission denied|Row Level Security/i.test(text), 'error toast shown');
  window.close();
});

test('the recovery form validates matching passwords', async () => {
  const { window } = await bootAdmin();
  const doc = window.document;

  doc.getElementById('forgotLink').click();
  await sleep(10);
  assert.strictEqual(doc.getElementById('forgotForm').hidden, false);

  const back = doc.querySelector('#forgotForm [data-auth-back]');
  back.click();
  await sleep(10);
  assert.strictEqual(doc.getElementById('loginForm').hidden, false);

  // Simulate arriving from a recovery email.
  doc.getElementById('resetForm').hidden = false;
  doc.getElementById('resetPassword').value = 'new-password-1';
  doc.getElementById('resetConfirm').value = 'different';
  doc.getElementById('resetForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(20);
  assert.ok(doc.getElementById('authNotice').textContent.match(/do not match/i));
  window.close();
});

test('dashboard runs the live connection check and renders every probe', async () => {
  const { window } = await bootAdmin();
  await signIn(window);
  const doc = window.document;

  const btn = doc.getElementById('cmsRunConnCheck');
  assert.ok(btn, 'Run live check button exists on the dashboard');
  btn.click();
  await sleep(150);

  const rows = doc.querySelectorAll('#cmsConnResults .cms-conn-row');
  assert.ok(rows.length >= 6, 'expected auth + 4 tables + bucket probes, got ' + rows.length);
  let allOk = true;
  rows.forEach((r) => { if (r.className.indexOf('ok') === -1) allOk = false; });
  assert.strictEqual(allOk, true, 'healthy mock reports every check as ok');
  const text = doc.getElementById('cmsConnResults').textContent;
  assert.ok(text.indexOf('projects') !== -1 && text.indexOf('site_settings') !== -1, text);
  window.close();
});

test('the connection check shows failures for a broken project', async () => {
  const { window } = await bootAdmin({
    session: { user: { email: 'admin@example.com' } },
    faults: { skills: 'Could not find the table public.skills in the schema cache' },
    buckets: []
  });
  await sleep(80);
  const doc = window.document;
  doc.getElementById('cmsRunConnCheck').click();
  await sleep(150);

  const rows = doc.querySelectorAll('#cmsConnResults .cms-conn-row');
  const bad = Array.from(rows).filter((r) => r.className.indexOf('bad') !== -1);
  assert.ok(bad.length >= 2, 'table-missing and bucket-missing both flagged, got ' + bad.length);
  const text = doc.getElementById('cmsConnResults').textContent;
  assert.ok(/schema\.sql/i.test(text), 'schema hint surfaced');
  window.close();
});