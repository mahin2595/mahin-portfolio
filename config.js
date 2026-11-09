/* ============================================================
   MAHIN PORTFOLIO — SHARED CONFIGURATION CORE
   ------------------------------------------------------------
   Single source of truth for every editable piece of the site.
   Loaded by BOTH the public page (index.html) and the admin
   panel (admin.html). Works in the browser and in Node (for
   the automated test suite).

   Responsibilities:
     - DEFAULT_CONFIG          the full content + settings tree
     - normalizeConfig()       coerce + validate + sanitize input
     - load() / save()         localStorage persistence (+ memory fallback)
     - exportJSON() / importJSON()
     - applyTheme()            map appearance -> CSS custom properties
     - applyAnimations()       map animation settings -> html data-* flags
     - THEME_PRESETS           dark / light colour presets

   SECURITY NOTE: this file must never contain private secrets.
   Anything stored here lives in the visitor's own browser and is
   publicly readable by anyone who opens the site. See README.md.
   ============================================================ */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MahinConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ----------------------------------------------------------
     CONSTANTS
     ---------------------------------------------------------- */
  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = 'mahin_portfolio_config_v2';
  const LEGACY_KEYS = ['mahin_portfolio_config_v1'];
  const PREVIEW_KEY = 'mahin_portfolio_preview_v2';

  const MAX_STRING = 6000;
  const MAX_SHORT_STRING = 300;
  const MAX_MEDIA_BYTES = 2.5 * 1024 * 1024;   // 2.5 MB per uploaded file
  const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024;   // localStorage safety ceiling
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_PROJECTS = 200;
  const MAX_MEDIA = 120;

  /* ----------------------------------------------------------
     THEME PRESETS
     ---------------------------------------------------------- */
  const THEME_PRESETS = {
    dark: {
      mode: 'dark',
      background: '#080a10',
      text: '#f5f7fb',
      accent: '#c9f27a',
      accent2: '#9be7e4',
      accent3: '#b9a9ff',
      glassOpacity: 0.08,
      blur: 22,
      radius: 25,
      shadow: 22
    },
    light: {
      mode: 'light',
      background: '#eef1f7',
      text: '#0d1119',
      accent: '#5f7d12',
      accent2: '#0d7a78',
      accent3: '#6553d6',
      glassOpacity: 0.55,
      blur: 18,
      radius: 25,
      shadow: 14
    }
  };

  /* ----------------------------------------------------------
     DEFAULT CONFIG
     ---------------------------------------------------------- */
  const DEFAULT_CONFIG = {
    version: SCHEMA_VERSION,
    updatedAt: null,

    profile: {
      logoText: 'MAHIN',
      displayName: 'Mahin',
      title: 'Creative Designer / Video Editor',
      heroEyebrow: 'CREATIVE DESIGNER / VIDEO EDITOR',
      availability: { enabled: true, text: 'OPEN TO CREATIVE PROJECTS' },
      heroHeading: 'MAKING\nIDEAS FEEL\nUNREAL.',
      heroAccentWord: 'UNREAL.',
      heroIntro: "Hey, I'm Mahin. I create visual identities, cinematic edits, and digital experiences that turn a good idea into something people remember.",
      aboutLead: "I'm **Mahin** — a creative designer and video editor focused on visuals that make people **feel something.**",
      aboutBody1: 'From shaping a visual identity to editing a story frame by frame, I enjoy turning raw ideas into polished creative work. My approach combines clean design, strong composition, rhythm, and a constant curiosity to try something new.',
      aboutBody2: 'This is your space to tell your story. Add your background, creative philosophy, and the kind of clients or projects you want to attract.',
      avatar: '',
      avatarAlt: 'Mahin — creative designer and video editor',
      email: 'hello@mahin.design',
      location: 'Available worldwide · Remote',
      footerText: 'MAHIN — MADE WITH INTENTION',
      footerTag: 'DESIGN · EDIT · REPEAT',
      sectionNotes: {
        about: 'Thoughtful visuals. Intentional motion. A little bit of magic in the details.',
        work: 'A preview of the kind of creative work that belongs here. Replace these concept tiles with your real project images and links.',
        journey: 'A simple creative workflow. Edit these steps to reflect how you actually work.',
        contact: "Have a video to bring to life, a visual identity to build, or a creative idea to explore? Let's talk."
      },
      stats: [
        { label: 'Years Creating', value: 3 },
        { label: 'Projects Delivered', value: 50 },
        { label: 'Happy Clients', value: 12 },
        { label: 'Videos Edited', value: 200 }
      ],
      process: [
        { step: '01 / DISCOVER', title: 'Understand the idea', body: 'Get clear on the goal, audience, references, mood, and message before opening the editing timeline or design canvas.' },
        { step: '02 / EXPLORE', title: 'Find the visual direction', body: 'Experiment with composition, typography, color, pacing, and visual references until the concept feels right.' },
        { step: '03 / CREATE', title: 'Make every detail count', body: 'Build, edit, refine, and polish the work while keeping the original idea at the center.' },
        { step: '04 / DELIVER', title: 'Share something memorable', body: 'Prepare the final work for the right platform and make sure it looks and feels intentional everywhere.' }
      ]
    },

    categories: [
      { id: 'design', label: 'Design' },
      { id: 'video', label: 'Video' },
      { id: 'motion', label: 'Motion' },
      { id: 'ai', label: 'AI Art' }
    ],

    projects: [
      {
        id: 'p-visual-identity',
        title: 'Visual Identity',
        description: 'A visual direction built around a clear concept, confident typography, and a memorable look.',
        category: 'design',
        tools: ['Graphic design', 'Branding'],
        url: '',
        videoUrl: '',
        image: '',
        featured: true,
        order: 0,
        indexLabel: 'PROJECT / 001',
        caption: 'VISUAL IDENTITY STUDY'
      },
      {
        id: 'p-cinematic',
        title: 'Cinematic Editing',
        description: 'A rhythm-led edit combining pacing, sound, transitions, and color to create atmosphere.',
        category: 'video',
        tools: ['Video editing', 'Color'],
        url: '',
        videoUrl: '',
        image: '',
        featured: true,
        order: 1,
        indexLabel: 'PROJECT / 002',
        caption: 'CINEMATIC VIDEO EDIT'
      },
      {
        id: 'p-amv-motion',
        title: 'AMV & Motion',
        description: 'An expressive motion experiment built around impact frames, transitions, and music.',
        category: 'motion',
        tools: ['AMV', 'Motion design'],
        url: '',
        videoUrl: '',
        image: '',
        featured: false,
        order: 2,
        indexLabel: 'PROJECT / 003',
        caption: 'AMV / MOTION EXPERIMENT'
      },
      {
        id: 'p-ai-concepts',
        title: 'AI Visual Concepts',
        description: 'Exploring image-making, art direction, and visual storytelling through AI-assisted workflows.',
        category: 'ai',
        tools: ['AI art', 'Art direction'],
        url: '',
        videoUrl: '',
        image: '',
        featured: false,
        order: 3,
        indexLabel: 'PROJECT / 004',
        caption: 'AI-ASSISTED ART DIRECTION'
      }
    ],

    skills: [
      'VIDEO EDITING',
      'AMV EDITING',
      'VISUAL DESIGN',
      'AI ART',
      'MOTION GRAPHICS',
      'BRANDING',
      'COLOR GRADING',
      'STORYTELLING'
    ],

    media: [],

    appearance: {
      mode: 'dark',
      background: '#080a10',
      text: '#f5f7fb',
      accent: '#c9f27a',
      accent2: '#9be7e4',
      accent3: '#b9a9ff',
      glassOpacity: 0.08,
      blur: 22,
      radius: 25,
      shadow: 22,
      fontDisplay: 'Manrope',
      fontBody: 'Manrope',
      fontMono: 'DM Mono',
      fontScale: 1,
      headingScale: 1
    },

    animations: {
      scrollReveal: true,
      duration: 850,
      delay: 0,
      stagger: 80,
      hoverEffects: true,
      pageTransitions: true,
      scrollProgress: true,
      loadingAnimation: true,
      parallax: true,
      magnetic: true,
      cursor: true,
      counters: true,
      reducedMotion: 'system' // 'system' | 'force-off'
    },

    social: {
      email: 'hello@mahin.design',
      instagram: 'https://instagram.com/',
      youtube: '',
      facebook: '',
      behance: '',
      dribbble: '',
      other: []
    },

    seo: {
      title: 'Mahin — Creative Designer & Video Editor',
      description: 'Visual identities, motion, and digital experiences by Mahin.',
      keywords: 'creative designer, video editor, motion graphics, AMV, branding, AI art',
      siteUrl: '',
      ogImage: '',
      favicon: '',
      twitterHandle: ''
    }
  };

  /* ----------------------------------------------------------
     SMALL UTILITIES
     ---------------------------------------------------------- */
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isArr = Array.isArray;

  function deepClone(value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix) {
    const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
    return (prefix || 'id') + '-' + rnd;
  }

  function clampNum(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function sanitizeStr(value, max) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    // Strip control characters (keep \n and \t) — rendering is textContent-safe.
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (s.length > (max || MAX_STRING)) s = s.slice(0, max || MAX_STRING);
    return s;
  }

  function sanitizeShort(value) {
    return sanitizeStr(value, MAX_SHORT_STRING).trim();
  }

  /**
   * Only allow URLs that cannot execute script when placed in href/src.
   * Accepts http(s), mailto, tel, data:image, and site-relative paths.
   */
  function isSafeUrl(value) {
    const s = String(value || '').trim();
    if (!s) return true; // empty is valid
    if (/^(https?:|mailto:|tel:)/i.test(s)) return true;
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(s)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true; // bare email address
    if (/^\.{0,2}\//.test(s)) return true;
    if (/^#/.test(s)) return true;
    // bare domain like example.com -> allow (admin convenience)
    if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return true;
    return false;
  }

  function isSafeColor(value, fallback) {
    const s = String(value || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
    if (/^rgba?\([\d.,\s%]+\)$/i.test(s)) return s;
    if (/^hsla?\([\d.,\s%]+\)$/i.test(s)) return s;
    return fallback;
  }

  function slugify(value, fallback) {
    const s = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return s || (fallback || 'item');
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function estimateBytes(value) {
    try {
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      // UTF-16 code units -> rough UTF-8 size
      return new Blob([s]).size;
    } catch (_) {
      return (JSON.stringify(value) || '').length * 2;
    }
  }

  function dataUrlBytes(dataUrl) {
    const s = String(dataUrl || '');
    const i = s.indexOf(',');
    if (i < 0) return 0;
    const b64 = s.slice(i + 1);
    // Approximate decoded size from base64 length.
    const padding = (b64.match(/=+$/) || [''])[0].length;
    return Math.floor((b64.length * 3) / 4) - padding;
  }

  /* ----------------------------------------------------------
     NORMALIZERS
     ---------------------------------------------------------- */
  function normalizeAvailability(input, base) {
    const out = deepClone(base);
    if (!isObj(input)) return out;
    if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
    if (input.text !== undefined) out.text = sanitizeShort(input.text) || out.text;
    return out;
  }

  function normalizeStats(input, base) {
    const list = isArr(input) ? input : base;
    const out = [];
    list.forEach((item) => {
      if (!isObj(item)) return;
      const label = sanitizeShort(item.label);
      if (!label) return;
      out.push({ label, value: Math.round(clampNum(item.value, 0, 1000000, 0)) });
    });
    return out.length ? out.slice(0, 12) : deepClone(base);
  }

  function normalizeProcess(input, base) {
    const list = isArr(input) ? input : base;
    const out = [];
    list.forEach((item) => {
      if (!isObj(item)) return;
      const title = sanitizeStr(item.title, 200).trim();
      if (!title) return;
      out.push({
        step: sanitizeShort(item.step) || String(out.length + 1).padStart(2, '0'),
        title,
        body: sanitizeStr(item.body, 1200).trim()
      });
    });
    return out.length ? out.slice(0, 16) : deepClone(base);
  }

  function normalizeNotes(input, base) {
    const out = deepClone(base);
    if (!isObj(input)) return out;
    Object.keys(base).forEach((k) => {
      if (input[k] !== undefined) out[k] = sanitizeStr(input[k], 600).trim();
    });
    return out;
  }

  function normalizeProfile(input, base) {
    const b = base || DEFAULT_CONFIG.profile;
    const out = deepClone(b);
    if (!isObj(input)) return out;
    const str = (key, max) => { if (input[key] !== undefined) out[key] = sanitizeStr(input[key], max || MAX_STRING).trim(); };
    str('logoText', 40);
    str('displayName', 80);
    str('title', 160);
    str('heroEyebrow', 120);
    str('heroHeading', 400);
    str('heroAccentWord', 60);
    str('heroIntro', 800);
    str('aboutLead', 800);
    str('aboutBody1', 1500);
    str('aboutBody2', 1500);
    str('avatarAlt', 160);
    str('email', 160);
    str('location', 160);
    str('footerText', 120);
    str('footerTag', 120);
    if (input.avatar !== undefined) out.avatar = safeAsset(input.avatar);
    out.availability = normalizeAvailability(input.availability, b.availability);
    out.sectionNotes = normalizeNotes(input.sectionNotes, b.sectionNotes);
    out.stats = normalizeStats(input.stats, b.stats);
    out.process = normalizeProcess(input.process, b.process);
    return out;
  }

  function safeAsset(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    return isSafeUrl(s) ? s : '';
  }

  /**
   * Resolve a stored asset reference into something usable in src/href.
   * Accepts either a direct (safe) URL or a "media:<id>" pointer into the
   * shared media library, which is stored inline as a data URL.
   * Returns '' when the reference is empty, unsafe or missing.
   */
  function resolveAsset(ref, config) {
    const value = String(ref || '').trim();
    if (!value) return '';
    const match = /^media:(.+)$/.exec(value);
    if (!match) return isSafeUrl(value) ? value : '';
    const cfg = isObj(config) ? config : {};
    const list = isArr(cfg.media) ? cfg.media : [];
    const id = match[1];
    const found = list.filter((m) => m && m.id === id)[0];
    return (found && found.dataUrl) ? String(found.dataUrl) : '';
  }

  function normalizeCategories(input, base) {
    const list = isArr(input) ? input : base;
    const out = [];
    const seen = Object.create(null);
    list.forEach((item) => {
      if (!isObj(item)) return;
      const label = sanitizeShort(item.label);
      let id = sanitizeShort(item.id) || slugify(label);
      if (!label || !id) return;
      id = slugify(id);
      let finalId = id;
      let n = 2;
      while (seen[finalId]) finalId = id + '-' + n++;
      seen[finalId] = true;
      out.push({ id: finalId, label });
    });
    return out.length ? out.slice(0, 24) : deepClone(base);
  }

  function normalizeProjects(input, base) {
    const list = isArr(input) ? input : base;
    const out = [];
    list.slice(0, MAX_PROJECTS).forEach((item) => {
      if (!isObj(item)) return;
      const title = sanitizeStr(item.title, 160).trim();
      if (!title) return;
      const tools = isArr(item.tools)
        ? item.tools.map((t) => sanitizeShort(t)).filter(Boolean).slice(0, 12)
        : [];
      out.push({
        id: sanitizeShort(item.id) || uid('project'),
        title,
        description: sanitizeStr(item.description, 1200).trim(),
        category: slugify(sanitizeShort(item.category) || 'design'),
        tools,
        url: safeAsset(item.url),
        videoUrl: safeAsset(item.videoUrl),
        image: safeAsset(item.image),
        featured: !!item.featured,
        order: Math.round(clampNum(item.order, 0, 9999, out.length)),
        indexLabel: sanitizeShort(item.indexLabel),
        caption: sanitizeShort(item.caption)
      });
    });
    out.sort((a, b) => a.order - b.order);
    out.forEach((p, i) => { p.order = i; });
    return out;
  }

  function normalizeSkills(input, base) {
    const list = isArr(input) ? input : base;
    const out = list.map((s) => sanitizeShort(s)).filter(Boolean);
    return out.length ? Array.from(new Set(out)).slice(0, 40) : deepClone(base);
  }

  function normalizeMedia(input) {
    if (!isArr(input)) return [];
    const out = [];
    input.slice(0, MAX_MEDIA).forEach((item) => {
      if (!isObj(item) || !item.dataUrl) return;
      const type = sanitizeShort(item.type) || 'image/png';
      if (ALLOWED_IMAGE_TYPES.indexOf(type) === -1) return;
      out.push({
        id: sanitizeShort(item.id) || uid('media'),
        name: sanitizeShort(item.name) || 'image',
        type,
        size: Math.round(clampNum(item.size, 0, MAX_MEDIA_BYTES * 4, 0)),
        dataUrl: String(item.dataUrl),
        createdAt: sanitizeShort(item.createdAt) || new Date().toISOString()
      });
    });
    return out;
  }

  function normalizeAppearance(input, base) {
    const b = base || DEFAULT_CONFIG.appearance;
    const out = deepClone(b);
    if (!isObj(input)) return out;
    out.mode = input.mode === 'light' ? 'light' : 'dark';
    out.background = isSafeColor(input.background, b.background);
    out.text = isSafeColor(input.text, b.text);
    out.accent = isSafeColor(input.accent, b.accent);
    out.accent2 = isSafeColor(input.accent2, b.accent2);
    out.accent3 = isSafeColor(input.accent3, b.accent3);
    out.glassOpacity = clampNum(input.glassOpacity, 0, 1, b.glassOpacity);
    out.blur = Math.round(clampNum(input.blur, 0, 40, b.blur));
    out.radius = Math.round(clampNum(input.radius, 0, 40, b.radius));
    out.shadow = Math.round(clampNum(input.shadow, 0, 80, b.shadow));
    out.fontDisplay = sanitizeShort(input.fontDisplay) || b.fontDisplay;
    out.fontBody = sanitizeShort(input.fontBody) || b.fontBody;
    out.fontMono = sanitizeShort(input.fontMono) || b.fontMono;
    out.fontScale = clampNum(input.fontScale, 0.8, 1.4, b.fontScale);
    out.headingScale = clampNum(input.headingScale, 0.7, 1.5, b.headingScale);
    return out;
  }

  function normalizeAnimations(input, base) {
    const b = base || DEFAULT_CONFIG.animations;
    const out = deepClone(b);
    if (!isObj(input)) return out;
    const bools = ['scrollReveal', 'hoverEffects', 'pageTransitions', 'scrollProgress', 'loadingAnimation', 'parallax', 'magnetic', 'cursor', 'counters'];
    bools.forEach((k) => { if (typeof input[k] === 'boolean') out[k] = input[k]; });
    out.duration = Math.round(clampNum(input.duration, 0, 3000, b.duration));
    out.delay = Math.round(clampNum(input.delay, 0, 1000, b.delay));
    out.stagger = Math.round(clampNum(input.stagger, 0, 500, b.stagger));
    out.reducedMotion = input.reducedMotion === 'force-off' ? 'force-off' : 'system';
    return out;
  }

  function normalizeSocial(input, base) {
    const b = base || DEFAULT_CONFIG.social;
    const out = deepClone(b);
    if (!isObj(input)) return out;
    ['email', 'instagram', 'youtube', 'facebook', 'behance', 'dribbble'].forEach((k) => {
      if (input[k] !== undefined) out[k] = sanitizeShort(input[k]);
    });
    if (isArr(input.other)) {
      out.other = input.other.map((item) => {
        if (!isObj(item)) return null;
        const label = sanitizeShort(item.label);
        const url = safeAsset(item.url);
        if (!label || !url) return null;
        return { label, url };
      }).filter(Boolean).slice(0, 12);
    }
    return out;
  }

  function normalizeSeo(input, base) {
    const b = base || DEFAULT_CONFIG.seo;
    const out = deepClone(b);
    if (!isObj(input)) return out;
    ['title', 'description', 'keywords', 'twitterHandle'].forEach((k) => {
      if (input[k] !== undefined) out[k] = sanitizeStr(input[k], 1000).trim();
    });
    if (input.siteUrl !== undefined) out.siteUrl = safeAsset(input.siteUrl);
    if (input.ogImage !== undefined) out.ogImage = safeAsset(input.ogImage);
    if (input.favicon !== undefined) out.favicon = safeAsset(input.favicon);
    return out;
  }

  /**
   * Turn arbitrary input into a guaranteed-valid config tree.
   * Returns { config, errors }. Never throws.
   */
  function normalizeConfig(input) {
    const errors = [];
    const base = deepClone(DEFAULT_CONFIG);
    if (!isObj(input)) {
      return { config: base, errors: ['Configuration must be a JSON object.'] };
    }
    const config = {
      version: SCHEMA_VERSION,
      updatedAt: sanitizeShort(input.updatedAt) || null,
      profile: normalizeProfile(input.profile, base.profile),
      categories: normalizeCategories(input.categories, base.categories),
      projects: normalizeProjects(input.projects, base.projects),
      skills: normalizeSkills(input.skills, base.skills),
      media: normalizeMedia(input.media),
      appearance: normalizeAppearance(input.appearance, base.appearance),
      animations: normalizeAnimations(input.animations, base.animations),
      social: normalizeSocial(input.social, base.social),
      seo: normalizeSeo(input.seo, base.seo)
    };

    // Validate URL-bearing fields against the RAW input and report anything
    // that had to be stripped. The normalizers above already removed unsafe
    // values, so checking the normalized tree would never surface them.
    const rawProfile = isObj(input.profile) ? input.profile : {};
    const rawSocial = isObj(input.social) ? input.social : {};
    const rawSeo = isObj(input.seo) ? input.seo : {};
    const clearPath = (obj, path) => {
      const parts = String(path).split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!isObj(cur[parts[i]])) return;
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = '';
    };
    const urlFields = [
      ['profile.email', rawProfile.email],
      ['profile.avatar', rawProfile.avatar],
      ['social.instagram', rawSocial.instagram],
      ['social.youtube', rawSocial.youtube],
      ['social.facebook', rawSocial.facebook],
      ['social.behance', rawSocial.behance],
      ['social.dribbble', rawSocial.dribbble],
      ['seo.siteUrl', rawSeo.siteUrl],
      ['seo.ogImage', rawSeo.ogImage],
      ['seo.favicon', rawSeo.favicon]
    ];
    urlFields.forEach(([label, value]) => {
      if (value && !isSafeUrl(value)) {
        errors.push('Unsafe URL removed: ' + label);
        clearPath(config, label);
      }
    });
    if (isArr(input.projects)) {
      input.projects.forEach((rawProject) => {
        if (!isObj(rawProject)) return;
        const title = sanitizeStr(rawProject.title, 160).trim() || 'Untitled';
        ['url', 'videoUrl', 'image'].forEach((k) => {
          if (rawProject[k] && !isSafeUrl(rawProject[k])) {
            errors.push('Unsafe URL removed from project "' + title + '" (' + k + ')');
          }
        });
      });
    }


    const totalBytes = estimateBytes(config);
    if (totalBytes > MAX_TOTAL_BYTES) {
      errors.push('Configuration is ' + formatBytes(totalBytes) + ', larger than the recommended ' + formatBytes(MAX_TOTAL_BYTES) + '. Remove some media.');
    }
    return { config, errors };
  }

  /* ----------------------------------------------------------
     STORAGE
     ---------------------------------------------------------- */
  function getStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const probe = '__mahin_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (_) {
      return null;
    }
  }

  const storage = getStorage();
  let memoryStore = null; // fallback when localStorage is unavailable

  function storageAvailable() { return !!storage; }

  function rawGet(key) {
    if (storage) { try { return storage.getItem(key); } catch (_) { return null; } }
    return memoryStore ? (memoryStore[key] || null) : null;
  }

  function rawSet(key, value) {
    if (storage) { storage.setItem(key, value); return; }
    if (!memoryStore) memoryStore = Object.create(null);
    memoryStore[key] = value;
  }

  function rawRemove(key) {
    if (storage) { try { storage.removeItem(key); } catch (_) { /* noop */ } return; }
    if (memoryStore) delete memoryStore[key];
  }

  function load() {
    let raw = rawGet(STORAGE_KEY);
    if (!raw) {
      // One-time migration from the very first schema.
      for (let i = 0; i < LEGACY_KEYS.length && !raw; i++) raw = rawGet(LEGACY_KEYS[i]);
    }
    if (!raw) return deepClone(DEFAULT_CONFIG);
    try {
      const parsed = JSON.parse(raw);
      return normalizeConfig(parsed).config;
    } catch (_) {
      return deepClone(DEFAULT_CONFIG);
    }
  }

  /**
   * Persist a config. Returns { ok, config, errors, bytes, error }.
   */
  function save(input) {
    const { config, errors } = normalizeConfig(input);
    config.updatedAt = new Date().toISOString();
    const json = JSON.stringify(config);
    const bytes = estimateBytes(json);
    try {
      rawSet(STORAGE_KEY, json);
      LEGACY_KEYS.forEach(rawRemove);
      return { ok: true, config, errors, bytes, error: null };
    } catch (err) {
      const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
      return {
        ok: false,
        config,
        errors,
        bytes,
        error: quota
          ? 'Browser storage is full. Remove some media or export a backup, then try again.'
          : 'Could not save to this browser: ' + (err && err.message ? err.message : 'unknown error')
      };
    }
  }

  function clear() {
    rawRemove(STORAGE_KEY);
    LEGACY_KEYS.forEach(rawRemove);
  }

  function resetToDefaults() {
    const config = deepClone(DEFAULT_CONFIG);
    return save(config);
  }

  /* ----------------------------------------------------------
     IMPORT / EXPORT
     ---------------------------------------------------------- */
  function exportJSON(input) {
    const source = input || load();
    const { config } = normalizeConfig(source);
    return JSON.stringify(config, null, 2);
  }

  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return { ok: false, config: null, errors: ['That file is not valid JSON.'] };
    }
    if (!isObj(parsed)) {
      return { ok: false, config: null, errors: ['The JSON must describe an object at the top level.'] };
    }
    // Basic shape check so an unrelated JSON file is rejected clearly.
    const known = ['profile', 'projects', 'skills', 'appearance', 'animations', 'social', 'seo', 'categories', 'media'];
    const hasShape = known.some((k) => parsed[k] !== undefined);
    if (!hasShape) {
      return { ok: false, config: null, errors: ['This JSON does not look like a Mahin portfolio export (no known sections found).'] };
    }
    const { config, errors } = normalizeConfig(parsed);
    return { ok: true, config, errors };
  }

  /* ----------------------------------------------------------
     THEME APPLICATION (browser only)
     ---------------------------------------------------------- */
  function hexToRgb(hex) {
    const s = String(hex || '').replace('#', '');
    if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
    if (s.length === 6 || s.length === 8) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    return null;
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 'rgba(255,255,255,' + alpha + ')';
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function applyTheme(input, root) {
    const doc = (typeof document !== 'undefined') ? document : null;
    const target = root || (doc ? doc.documentElement : null);
    if (!target) return;
    const appearance = normalizeAppearance((isObj(input) && input.appearance) ? input.appearance : input);
    const light = appearance.mode === 'light';
    const o = appearance.glassOpacity;
    const set = (k, v) => target.style.setProperty(k, v);

    target.setAttribute('data-theme', appearance.mode);

    set('--bg', appearance.background);
    set('--ink', appearance.text);
    set('--lime', appearance.accent);
    set('--cyan', appearance.accent2);
    set('--violet', appearance.accent3);

    set('--muted', light ? 'rgba(13,17,25,.62)' : 'rgba(245,247,251,.62)');
    set('--muted2', light ? 'rgba(13,17,25,.42)' : 'rgba(245,247,251,.42)');

    // Glass + strokes derived from the glass-opacity control.
    set('--glass', rgba('#ffffff', light ? clampNum(0.45 + o, 0, 0.95, 0.6) : o));
    set('--glass2', rgba('#ffffff', light ? clampNum(0.6 + o, 0, 0.98, 0.7) : clampNum(o + 0.03, 0, 1, 0.11)));
    set('--glass-a', rgba('#ffffff', light ? clampNum(0.5 + o, 0, 0.96, 0.65) : clampNum(o + 0.025, 0, 1, 0.105)));
    set('--glass-b', rgba('#ffffff', light ? clampNum(0.2 + o, 0, 0.9, 0.4) : clampNum(o - 0.045, 0, 1, 0.035)));
    set('--stroke', light ? 'rgba(13,17,25,.14)' : 'rgba(255,255,255,' + clampNum(o + 0.06, 0.08, 0.5, 0.14) + ')');
    set('--stroke2', light ? 'rgba(13,17,25,.24)' : 'rgba(255,255,255,' + clampNum(o + 0.14, 0.14, 0.6, 0.22) + ')');
    set('--nav-bg', light ? 'rgba(255,255,255,.72)' : 'rgba(16,19,29,.66)');
    set('--input-bg', light ? 'rgba(13,17,25,.045)' : 'rgba(255,255,255,.05)');
    set('--chip-bg', light ? 'rgba(13,17,25,.05)' : 'rgba(255,255,255,.07)');

    set('--glass-blur', appearance.blur + 'px');
    set('--radius-card', appearance.radius + 'px');
    set('--radius-lg', Math.round(appearance.radius * 0.64) + 'px');
    set('--radius-xl', appearance.radius + 'px');
    set('--card-shadow', light
      ? 'inset 0 1px 0 #ffffffcc, 0 ' + Math.round(appearance.shadow * 0.7) + 'px ' + Math.round(appearance.shadow * 2.2) + 'px rgba(20,28,45,.12)'
      : 'inset 0 1px 0 #ffffff12, 0 ' + appearance.shadow + 'px ' + Math.round(appearance.shadow * 3) + 'px #0002');
    set('--card-shadow-hover', light
      ? 'inset 0 1px 0 #ffffffee, 0 ' + Math.round(appearance.shadow) + 'px ' + Math.round(appearance.shadow * 2.8) + 'px rgba(20,28,45,.18)'
      : 'inset 0 1px 0 #ffffff22, 0 ' + Math.round(appearance.shadow * 1.4) + 'px ' + Math.round(appearance.shadow * 4) + 'px #0003');

    set('--font-display', quoteFont(appearance.fontDisplay) + ', system-ui, sans-serif');
    set('--font-body', quoteFont(appearance.fontBody) + ', system-ui, sans-serif');
    set('--font-mono', quoteFont(appearance.fontMono) + ', monospace');
    set('--heading-scale', String(appearance.headingScale));
    // Scale the root font-size so all rem-based sizes follow.
    if (doc) doc.documentElement.style.fontSize = (16 * appearance.fontScale).toFixed(2) + 'px';
  }

  function quoteFont(name) {
    const clean = String(name || '').replace(/["'<>;]/g, '').trim() || 'Manrope';
    return "'" + clean + "'";
  }

  /* Animation settings -> CSS vars + data flags on <html>. */
  function applyAnimations(input, root) {
    const doc = (typeof document !== 'undefined') ? document : null;
    const target = root || (doc ? doc.documentElement : null);
    if (!target) return;
    const anim = normalizeAnimations((isObj(input) && input.animations) ? input.animations : input);
    const set = (k, v) => target.style.setProperty(k, v);
    set('--anim-duration', anim.duration + 'ms');
    set('--anim-delay', anim.delay + 'ms');
    set('--anim-stagger', anim.stagger + 'ms');

    const flags = {
      'data-reveal': anim.scrollReveal,
      'data-hover': anim.hoverEffects,
      'data-page-transitions': anim.pageTransitions,
      'data-progress': anim.scrollProgress,
      'data-loading': anim.loadingAnimation,
      'data-parallax': anim.parallax,
      'data-magnetic': anim.magnetic,
      'data-cursor': anim.cursor,
      'data-counters': anim.counters
    };
    Object.keys(flags).forEach((k) => target.setAttribute(k, flags[k] ? 'on' : 'off'));

    if (anim.reducedMotion === 'force-off') target.setAttribute('data-reduced-motion', 'force-off');
    else target.removeAttribute('data-reduced-motion');

    return anim;
  }

  /* Apply both theme + animations in one call. */
  function applyAll(config, root) {
    applyTheme(config, root);
    return applyAnimations(config, root);
  }

  /* ----------------------------------------------------------
     PUBLIC API
     ---------------------------------------------------------- */
  return {
    // constants
    SCHEMA_VERSION,
    STORAGE_KEY,
    PREVIEW_KEY,
    MAX_MEDIA_BYTES,
    MAX_TOTAL_BYTES,
    MAX_STRING,
    ALLOWED_IMAGE_TYPES,
    THEME_PRESETS,
    DEFAULT_CONFIG,
    // utils
    deepClone,
    uid,
    slugify,
    clampNum,
    sanitizeStr,
    sanitizeShort,
    isSafeUrl,
    isSafeColor,
    resolveAsset,
    escapeHtml,
    formatBytes,
    estimateBytes,
    dataUrlBytes,
    // core
    normalizeConfig,
    load,
    save,
    clear,
    resetToDefaults,
    exportJSON,
    importJSON,
    storageAvailable,
    // theme
    applyTheme,
    applyAnimations,
    applyAll
  };
});
