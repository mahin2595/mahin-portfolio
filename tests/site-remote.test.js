/* ============================================================
   Public site + Supabase hydration tests — run with:  npm test
   Boots the real index.html with config.js, cms.js, render.js and
   script.js inside jsdom, backed by the in-memory Supabase double.

   Verifies:
     • published-only projects are rendered
     • profile / skills / social / theme come from the database
     • the graceful fallback keeps local content when Supabase fails
     • an unconfigured project never attempts a fetch
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = stripExternal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
const SUPABASE_CONFIG_SRC = fs.readFileSync(path.join(ROOT, 'supabase.config.js'), 'utf8');
const SUPABASE_CLIENT_SRC = fs.readFileSync(path.join(ROOT, 'supabase-client.js'), 'utf8');
const CMS_SRC = fs.readFileSync(path.join(ROOT, 'cms.js'), 'utf8');
const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'render.js'), 'utf8');
const SCRIPT_SRC = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

const C = require('../config.js');
const { createMockClient } = require('./support/mock-supabase.js');

const DEFAULTS = C.normalizeConfig(C.DEFAULT_CONFIG).config;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripExternal(html) {
  return html
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
    .replace(/<link[^>]*rel="preconnect"[^>]*>/gi, '')
    .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
    .replace(/<link[^>]*rel="manifest"[^>]*>/gi, '');
}

function remoteDatabase() {
  return {
    projects: [
      {
        id: 'rp1', title: 'Remote Published', description: 'Live project', category: 'design',
        tools: ['Branding'], project_url: '', video_url: '', thumbnail_path: '', thumbnail_url: '',
        featured: true, sort_order: 0, status: 'published'
      },
      {
        id: 'rp2', title: 'Remote Draft', description: 'Must stay hidden', category: 'video',
        tools: ['Video'], project_url: '', video_url: '', thumbnail_path: '', thumbnail_url: '',
        featured: false, sort_order: 1, status: 'draft'
      }
    ],
    skills: [
      { id: 'rs1', name: 'REMOTE SKILL', sort_order: 0, status: 'published' },
      { id: 'rs2', name: 'DRAFT SKILL', sort_order: 1, status: 'draft' }
    ],
    social_links: [
      { id: 'rl1', platform: 'youtube', label: 'YouTube', url: 'https://youtube.com/remote', sort_order: 0, visible: true }
    ],
    site_settings: [
      { key: 'profile', value: { displayName: 'Mahin', heroIntro: 'Remote hero intro', email: 'remote@mahin.test' } },
      { key: 'appearance', value: { mode: 'light', background: '#ffffff', accent: '#ff0000' } }
    ]
  };
}

async function bootSite(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});

  const dom = new JSDOM(INDEX_HTML, {
    url: 'http://localhost/index.html',
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
  window.localStorage.clear();

  window.eval(CONFIG_SRC);
  window.eval(SUPABASE_CONFIG_SRC);
  if (opts.configured !== false) {
    window.MAHIN_SUPABASE.url = 'https://test.supabase.co';
    window.MAHIN_SUPABASE.publishableKey = 'sb_publishable_test_key_123';
  }
  window.eval(SUPABASE_CLIENT_SRC);
  window.eval(CMS_SRC);

  if (opts.configured !== false) {
    const client = createMockClient({
      database: opts.database || remoteDatabase(),
      faults: opts.faults || {}
    });
    window.__client = client;
    window.MahinCMS.setClient(client);
  }

  window.eval(RENDER_SRC);
  window.eval(SCRIPT_SRC);

  await sleep(120);
  if (!window.__mahinCmsSettled && opts.configured !== false) await sleep(120);
  return { dom, window };
}

test('public site renders published projects and hides drafts', async () => {
  const { window } = await bootSite();
  const doc = window.document;

  const cards = Array.from(doc.querySelectorAll('#workGrid .project'));
  assert.strictEqual(cards.length, 1, 'only the published project is shown');
  assert.ok(cards[0].textContent.includes('Remote Published'));
  assert.ok(!doc.body.textContent.includes('Remote Draft'), 'draft never rendered');

  assert.strictEqual(
    doc.querySelector('[data-cfg="heroIntro"]').textContent.trim(),
    'Remote hero intro'
  );
  assert.deepStrictEqual(
    Array.from(doc.querySelectorAll('#skillsContainer .chip')).map((n) => n.textContent),
    ['REMOTE SKILL'],
    'only published skills render'
  );
  assert.strictEqual(doc.querySelectorAll('[data-cfg="social"] .social-link').length, 1);
  assert.strictEqual(doc.querySelector('[data-cfg="social"] .social-link').textContent.indexOf('YouTube'), 0);

  assert.strictEqual(doc.documentElement.getAttribute('data-theme'), 'light', 'remote appearance applied');
  assert.strictEqual(doc.documentElement.style.getPropertyValue('--bg'), '#ffffff');
  assert.strictEqual(window.__mahinCmsSettled, true);
  assert.strictEqual(doc.documentElement.hasAttribute('data-cms-loading'), false);
  window.close();
});

test('Supabase failure keeps the local fallback content on screen', async () => {
  const { window } = await bootSite({ faults: { '*': 'permission denied for table projects' } });
  const doc = window.document;

  const cards = doc.querySelectorAll('#workGrid .project');
  assert.strictEqual(cards.length, DEFAULTS.projects.length, 'fallback projects rendered');
  assert.ok(doc.querySelector('[data-cfg="heroIntro"]').textContent.length > 0);
  assert.strictEqual(window.__mahinCmsSettled, true);
  assert.strictEqual(doc.documentElement.hasAttribute('data-cms-loading'), false);
  // The page must still be visible (reveal fallback), never blank.
  assert.ok(doc.body.textContent.includes(DEFAULTS.profile.displayName));
  window.close();
});

test('an unconfigured project renders defaults without fetching', async () => {
  const { window } = await bootSite({ configured: false });
  const doc = window.document;

  assert.strictEqual(doc.querySelectorAll('#workGrid .project').length, DEFAULTS.projects.length);
  assert.strictEqual(window.MahinCMS.isConfigured(), false);
  assert.strictEqual(window.__mahinCmsSettled, undefined, 'no remote attempt was made');
  window.close();
});

test('published content is applied without a page reload', async () => {
  const { window } = await bootSite();
  const doc = window.document;
  const before = doc.querySelectorAll('#workGrid .project').length;

  // Update the database, then re-run the public fetch (a fresh page load).
  window.__client.__db.projects.push({
    id: 'rp3', title: 'Second Published', description: '', category: 'motion',
    tools: [], project_url: '', video_url: '', thumbnail_path: '', thumbnail_url: '',
    featured: false, sort_order: 2, status: 'published'
  });

  const res = await window.MahinCMS.fetchPublicConfig(window.MahinConfig.load());
  window.MahinRender.render(res.config, { remote: true });
  await sleep(30);

  assert.strictEqual(doc.querySelectorAll('#workGrid .project').length, before + 1);
  assert.ok(doc.body.textContent.includes('Second Published'));
  window.close();
});