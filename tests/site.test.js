/* ============================================================
   Public site tests — run with:  npm test
   Boots the real index.html with config.js + render.js + script.js
   inside jsdom and checks that content, theme and live preview work.
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
const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'render.js'), 'utf8');
const SCRIPT_SRC = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULTS = C.normalizeConfig(C.DEFAULT_CONFIG).config;

function stripExternal(html) {
  return html
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
    .replace(/<link[^>]*rel="preconnect"[^>]*>/gi, '')
    .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
    .replace(/<link[^>]*rel="manifest"[^>]*>/gi, '');
}

async function bootSite(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});

  const dom = new JSDOM(stripExternal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), {
    url: 'http://localhost/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;

  window.matchMedia = function (query) {
    return {
      matches: opts.reducedMotion === true && /prefers-reduced-motion/.test(query),
      media: query,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return false; }
    };
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};

  window.localStorage.clear();
  if (opts.seed) window.localStorage.setItem(C.STORAGE_KEY, JSON.stringify(opts.seed));

  window.eval(CONFIG_SRC);
  window.eval(RENDER_SRC);
  window.eval(SCRIPT_SRC);

  await sleep(35);
  if (!window.__mahinReady) {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    await sleep(15);
  }
  return dom;
}

test('page hydrates every piece of content from the shared config', async () => {
  const { window } = await bootSite();
  const doc = window.document;

  assert.strictEqual(doc.title, DEFAULTS.seo.title);
  assert.strictEqual(
    doc.querySelector('[data-cfg="heroIntro"]').textContent.trim(),
    DEFAULTS.profile.heroIntro
  );
  assert.strictEqual(doc.querySelectorAll('#skillsContainer .chip').length, DEFAULTS.skills.length);
  assert.strictEqual(doc.querySelectorAll('#workGrid .project').length, DEFAULTS.projects.length);
  // "All" + one per category
  assert.strictEqual(
    doc.querySelectorAll('[data-cfg="filters"] .filter-btn').length,
    DEFAULTS.categories.length + 1
  );
  assert.strictEqual(
    doc.querySelectorAll('[data-cfg="process"] .timeline-item').length,
    DEFAULTS.profile.process.length
  );
  assert.ok(doc.querySelector('#year').textContent.match(/^\d{4}$/), 'footer year set');
  window.close();
});

test('theme variables are applied from config', async () => {
  const { window } = await bootSite();
  const root = window.document.documentElement;
  assert.strictEqual(root.getAttribute('data-theme'), 'dark');
  assert.strictEqual(root.style.getPropertyValue('--bg'), DEFAULTS.appearance.background);
  assert.ok(root.getAttribute('data-reveal'), 'animation flags applied');
  window.close();
});

test('an avatar with no image stays hidden', async () => {
  const { window } = await bootSite();
  assert.strictEqual(window.document.querySelector('[data-cfg="avatar"]').hidden, true);
  window.close();
});

test('social row reflects only the links that are set', async () => {
  const seed = C.normalizeConfig(Object.assign({}, DEFAULTS, {
    social: { email: 'hi@example.com', instagram: 'https://instagram.com/x', youtube: 'https://youtube.com/@x', facebook: '', behance: '', dribbble: '', other: [{ label: 'X', url: 'https://x.com/x' }] }
  })).config;
  const { window } = await bootSite({ seed });
  const links = window.document.querySelectorAll('[data-cfg="social"] .social-link');
  assert.strictEqual(links.length, 3, 'instagram + youtube + custom link');
  window.close();
});

test('live preview message re-renders the page and switches theme', async () => {
  const { window } = await bootSite();
  const updated = C.normalizeConfig(Object.assign({}, DEFAULTS, {
    profile: Object.assign({}, DEFAULTS.profile, { heroIntro: 'Edited from the admin preview' }),
    appearance: Object.assign({}, DEFAULTS.appearance, { mode: 'light', background: '#ffffff' }),
    projects: DEFAULTS.projects.slice(0, 1)
  })).config;

  window.dispatchEvent(new window.MessageEvent('message', {
    data: { type: 'mahin:preview-config', config: updated },
    origin: 'http://localhost'
  }));
  await sleep(10);

  assert.strictEqual(
    window.document.querySelector('[data-cfg="heroIntro"]').textContent.trim(),
    'Edited from the admin preview'
  );
  assert.strictEqual(window.document.querySelectorAll('#workGrid .project').length, 1);
  assert.strictEqual(window.document.documentElement.getAttribute('data-theme'), 'light');
  assert.strictEqual(window.document.documentElement.style.getPropertyValue('--bg'), '#ffffff');
  window.close();
});

test('reduced-motion visitors get content revealed immediately', async () => {
  const { window } = await bootSite({ reducedMotion: true });
  const card = window.document.querySelector('#workGrid .project');
  assert.ok(card.classList.contains('visible'), 'project card is revealed without animation');
  window.close();
});
