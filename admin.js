/* ============================================================
   MAHIN STUDIO — ADMIN CONTROL PANEL LOGIC
   ------------------------------------------------------------
   Vanilla JS. No dependencies. All content is stored in the
   shared configuration (config.js) and persisted to this
   browser's localStorage.

   IMPORTANT: this is a LOCAL tool, not an authenticated server.
   There is no login and no global publishing. See the "Data &
   backup" panel for the full security notes.
   ============================================================ */
(function () {
  'use strict';

  var C = window.MahinConfig;
  if (!C) {
    document.body.innerHTML = '<div style="padding:40px;font-family:system-ui;color:#fff;background:#0a0d14;min-height:100vh">config.js failed to load. Make sure it sits next to admin.html.</div>';
    return;
  }

  /* ==========================================================
     DOM HELPERS
     ========================================================== */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // trusted icon markup only
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined) return;
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    });
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function getPath(obj, path) {
    return String(path).split('.').reduce(function (acc, key) {
      return (acc === null || acc === undefined) ? undefined : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function toHex(value) {
    var s = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    if (/^#[0-9a-f]{6,8}$/i.test(s)) return s.slice(0, 7);
    return '#000000';
  }

  function contrastColor(hex) {
    var s = toHex(hex).replace('#', '');
    var r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#0a0d14' : '#ffffff';
  }

  function slugifyWithFallback(value, fallback) {
    var s = String(value || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return s || fallback || 'item';
  }

  function isReducedMotion() {
    return (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      document.documentElement.getAttribute('data-admin-reduced') === 'true';
  }

  /* ==========================================================
     ICONS (trusted inline SVG)
     ========================================================== */
  var ICON = {
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    projects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    media: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5-9 9"/></svg>',
    skills: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/></svg>',
    appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4 5 5 0 0 0-5-4Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="9.5" cy="6.5" r="1"/></svg>',
    animations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h3l2-7 4 14 3-9 2 2h6"/></svg>',
    contact: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    seo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    data: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>'
  };

  /* ==========================================================
     SECTION DEFINITIONS
     ========================================================== */
  var NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: ICON.dashboard, eyebrow: 'Overview', title: 'Dashboard', note: 'Everything at a glance. Save status, quick actions and a live preview of the public site.' },
    { id: 'profile', label: 'Profile', icon: ICON.profile, eyebrow: '01 / Identity', title: 'Profile', note: 'Name, hero copy, about text, statistics and the process timeline shown on the site.' },
    { id: 'projects', label: 'Projects', icon: ICON.projects, eyebrow: '02 / Work', title: 'Projects', note: 'Create, edit, reorder and delete project cards. Upload thumbnails from the media library.' },
    { id: 'media', label: 'Media library', icon: ICON.media, eyebrow: '03 / Assets', title: 'Media library', note: 'Upload JPG, PNG or WebP images and reuse them anywhere. Files are stored in this browser.' },
    { id: 'skills', label: 'Skills', icon: ICON.skills, eyebrow: '04 / Toolkit', title: 'Skills', note: 'The chips shown in the Creative Toolkit panel. Reorder with the arrow buttons.' },
    { id: 'appearance', label: 'Appearance', icon: ICON.appearance, eyebrow: '05 / Design system', title: 'Appearance', note: 'Colours, glass, blur, radius, shadows and typography — with a live preview.' },
    { id: 'animations', label: 'Animations', icon: ICON.animations, eyebrow: '06 / Motion', title: 'Animations', note: 'Control scroll reveal, timing, hover effects and the self-building intro.' },
    { id: 'contact', label: 'Contact & social', icon: ICON.contact, eyebrow: '07 / Reach', title: 'Contact & social', note: 'Email address and social profiles shown on the public contact section.' },
    { id: 'seo', label: 'SEO', icon: ICON.seo, eyebrow: '08 / Discoverability', title: 'SEO & sharing', note: 'Titles, description, keywords, sharing image and favicon.' },
    { id: 'data', label: 'Data & backup', icon: ICON.data, eyebrow: '09 / Storage', title: 'Data & backup', note: 'Save, export, import, reset and understand exactly where your data lives.' }
  ];

  function navItem(id) { return NAV.filter(function (n) { return n.id === id; })[0]; }

  /* ==========================================================
     STATE
     ========================================================== */
  var working = C.load();
  var savedSignature = signature(working);
  var dirty = false;
  var activePanel = 'dashboard';
  var autosaveTimer = null;
  var expandedProjects = {};
  var stalePanels = {};
  var fieldSeq = 0;
  var searchQuery = '';
  var allPanelsBuilt = false;

  /* ==========================================================
     SIGNATURE / DIRTY STATE / SAVE
     ========================================================== */
  function signature(cfg) {
    var clone = C.deepClone(cfg);
    delete clone.updatedAt;
    return JSON.stringify(C.normalizeConfig(clone).config);
  }

  function updateStatus(state, text) {
    var box = $('#saveStatus');
    var label = $('#saveStatusText');
    if (!box || !label) return;
    var map = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' };
    box.dataset.state = state;
    label.textContent = text || map[state] || 'Saved';
  }

  function markDirty() {
    dirty = signature(working) !== savedSignature;
    updateStatus(dirty ? 'dirty' : 'saved');
    scheduleAutosave();
    pushPreviewSoon();
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    if (!dirty) return;
    autosaveTimer = setTimeout(function () { saveNow({ auto: true, silent: true }); }, 900);
  }

  function saveNow(opts) {
    opts = opts || {};
    updateStatus('saving');
    var res = C.save(working);
    if (res.ok) {
      working.updatedAt = res.config.updatedAt;
      savedSignature = signature(working);
      dirty = false;
      updateStatus('saved');
      if (!opts.silent) toast(opts.auto ? 'Autosaved in this browser' : 'All changes saved', 'success');
      if (res.errors.length) toast(res.errors[0], 'warn', 5000);
      updateStorageMeter();
      pushPreview();
    } else {
      updateStatus('error');
      toast(res.error || 'Could not save.', 'error', 6000);
    }
    return res;
  }

  /* ==========================================================
     TOASTS
     ========================================================== */
  var TOAST_ICON = { success: '✓', error: '✕', warn: '!', info: 'i' };

  function toast(message, type, ms) {
    type = type || 'info';
    var host = $('#toasts');
    if (!host) return;
    var node = h('div', { class: 'a-toast ' + type, role: 'status' }, [
      h('span', { class: 'a-toast-ico', 'aria-hidden': 'true', text: TOAST_ICON[type] || 'i' }),
      h('span', { text: message })
    ]);
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, ms || 3200);
  }

  /* ==========================================================
     CONFIRM DIALOG
     ========================================================== */
  function confirmDialog(options) {
    return new Promise(function (resolve) {
      var root = $('#modalRoot');
      var title = $('#modalTitle');
      var body = $('#modalBody');
      var confirmBtn = $('#modalConfirm');
      var lastFocus = document.activeElement;

      title.textContent = options.title || 'Confirm';
      body.textContent = options.message || '';
      confirmBtn.textContent = options.confirmLabel || 'Confirm';
      confirmBtn.className = 'a-btn ' + (options.danger === false ? 'primary' : 'danger');
      root.hidden = false;
      confirmBtn.focus();

      function finish(value) {
        root.hidden = true;
        document.removeEventListener('keydown', onKey, true);
        root.removeEventListener('click', onClick);
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Tab') trapFocus(root, e);
      }
      function onClick(e) {
        if (e.target.hasAttribute('data-close-modal')) finish(false);
        else if (e.target === confirmBtn) finish(true);
      }
      document.addEventListener('keydown', onKey, true);
      root.addEventListener('click', onClick);
    });
  }

  function trapFocus(container, e) {
    var focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ==========================================================
     ASSET HELPERS
     ========================================================== */
  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file selected.')); return; }
      if (C.ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        reject(new Error('Unsupported file type: ' + (file.type || 'unknown') + '. Use JPG, PNG or WebP.'));
        return;
      }
      if (file.size > C.MAX_MEDIA_BYTES) {
        reject(new Error('“' + file.name + '” is ' + C.formatBytes(file.size) + '. The limit is ' + C.formatBytes(C.MAX_MEDIA_BYTES) + '.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
      };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  function ensureSpace(asset) {
    var projected = C.estimateBytes(working) + (asset.dataUrl ? asset.dataUrl.length : 0);
    if (projected > C.MAX_TOTAL_BYTES) {
      throw new Error('Browser storage limit reached. Delete some media or export a backup, then try again.');
    }
  }

  function addMediaObject(asset) {
    var item = {
      id: C.uid('media'),
      name: asset.name || 'image',
      type: asset.type,
      size: asset.size,
      dataUrl: asset.dataUrl,
      createdAt: new Date().toISOString()
    };
    working.media.push(item);
    return item;
  }

  function findMediaReferences(mediaId) {
    var ref = 'media:' + mediaId;
    var refs = [];
    if (working.profile.avatar === ref) refs.push('Profile image');
    (working.projects || []).forEach(function (p) { if (p.image === ref) refs.push('Project: ' + p.title); });
    if (working.seo.ogImage === ref) refs.push('SEO sharing image');
    if (working.seo.favicon === ref) refs.push('Favicon');
    return refs;
  }

  function clearMediaReference(mediaId) {
    var ref = 'media:' + mediaId;
    if (working.profile.avatar === ref) working.profile.avatar = '';
    working.projects.forEach(function (p) { if (p.image === ref) p.image = ''; });
    if (working.seo.ogImage === ref) working.seo.ogImage = '';
    if (working.seo.favicon === ref) working.seo.favicon = '';
  }

  function markStale(ids) { ids.forEach(function (id) { stalePanels[id] = true; }); }

  function updateStorageMeter() {
    var bytes = C.estimateBytes(working);
    var pct = Math.min(100, (bytes / C.MAX_TOTAL_BYTES) * 100);
    $$('[data-storage-meter]').forEach(function (meter) {
      meter.style.width = pct.toFixed(1) + '%';
    });
    $$('[data-storage-text]').forEach(function (label) {
      label.textContent = C.formatBytes(bytes) + ' of ' + C.formatBytes(C.MAX_TOTAL_BYTES) + ' used';
    });
    var dash = $('#dashStorage');
    if (dash) dash.textContent = C.formatBytes(bytes);
  }

  /* ==========================================================
     MEDIA PICKER (reusable control)
     ========================================================== */
  function mediaPicker(value, onChange, opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'a-media-picker' });
    var preview = h('div', { class: 'a-media-picker-preview' });
    var body = h('div', { class: 'a-media-picker-body' });
    var select = h('select', { class: 'a-select', 'aria-label': (opts.label || 'Image') + ' from library' });
    var urlInput = h('input', {
      type: 'text', class: 'a-input', placeholder: '…or paste an image URL',
      'aria-label': (opts.label || 'Image') + ' URL'
    });
    var fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'a-file-input' });
    var uploadBtn = h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Upload new' });
    var clearBtn = h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Remove' });

    function fillSelect() {
      clear(select);
      select.appendChild(h('option', { value: '', text: opts.emptyLabel || '— No image —' }));
      working.media.forEach(function (m) {
        select.appendChild(h('option', { value: 'media:' + m.id, text: m.name }));
      });
      var isMedia = /^media:/.test(value || '');
      select.value = isMedia ? value : '';
    }

    function renderPreview() {
      clear(preview);
      var src = C.resolveAsset(value, working);
      if (src) preview.appendChild(h('img', { src: src, alt: opts.label || 'Selected image' }));
      else preview.appendChild(h('span', { text: 'No image' }));
      urlInput.value = /^media:/.test(value || '') ? '' : (value || '');
    }

    select.addEventListener('change', function () {
      value = select.value;
      renderPreview();
      onChange(value);
    });

    urlInput.addEventListener('input', function () {
      value = urlInput.value.trim();
      if (value && !C.isSafeUrl(value)) {
        urlInput.setAttribute('aria-invalid', 'true');
        return;
      }
      urlInput.removeAttribute('aria-invalid');
      select.value = '';
      renderPreview();
      onChange(value);
    });

    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      readImageFile(file).then(function (asset) {
        ensureSpace(asset);
        var item = addMediaObject(asset);
        value = 'media:' + item.id;
        fillSelect();
        select.value = value;
        renderPreview();
        onChange(value);
        updateNavCounts();
        markStale(['media']);
        toast('“' + item.name + '” added to the media library', 'success');
      }).catch(function (err) {
        toast(err.message, 'error', 5200);
      });
      fileInput.value = '';
    });

    clearBtn.addEventListener('click', function () {
      value = '';
      fillSelect();
      renderPreview();
      onChange('');
    });

    body.appendChild(h('div', { class: 'a-media-picker-row' }, [select]));
    body.appendChild(h('div', { class: 'a-media-picker-row' }, [urlInput]));
    body.appendChild(h('div', { class: 'a-media-picker-row' }, [uploadBtn, clearBtn]));
    body.appendChild(fileInput);
    wrap.appendChild(preview);
    wrap.appendChild(body);

    fillSelect();
    renderPreview();
    return wrap;
  }

  /* ==========================================================
     FORM FIELD ENGINE
     ========================================================== */
  function addField(grid, opts) {
    var field = buildField(opts);
    grid.appendChild(field);
    return field;
  }

  function buildField(opts) {
    var id = opts.id || ('field-' + (++fieldSeq));
    var value = typeof opts.getValue === 'function'
      ? opts.getValue()
      : (opts.path ? getPath(working, opts.path) : opts.value);

    var wrap = h('div', {
      class: 'a-field' + (opts.full ? ' full' : ''),
      dataset: { search: [opts.label, opts.hint, opts.path].filter(Boolean).join(' ').toLowerCase() }
    });

    function commit(v) {
      if (typeof opts.setValue === 'function') opts.setValue(v);
      else if (opts.path) setPath(working, opts.path, v);
      if (typeof opts.onChange === 'function') opts.onChange(v);
      markDirty();
    }

    if (opts.type === 'toggle') {
      var sw = h('button', {
        class: 'a-switch', type: 'button', role: 'switch',
        'aria-checked': String(!!value), 'aria-label': opts.label
      });
      sw.addEventListener('click', function () {
        var next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(next));
        commit(next);
      });
      wrap.appendChild(h('div', { class: 'a-toggle-row' }, [
        h('div', { class: 'a-toggle-copy' }, [
          h('strong', { text: opts.label }),
          opts.desc ? h('span', { text: opts.desc }) : null
        ]),
        sw
      ]));
      if (opts.hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: opts.hint }));
      return wrap;
    }

    var counter = opts.counter ? h('span', { class: 'a-char-count' }) : null;
    wrap.appendChild(h('label', { class: 'a-field-label', for: id }, [
      h('span', null, [opts.label, opts.required ? h('span', { class: 'a-req', text: ' *' }) : null]),
      counter
    ]));

    var control;

    if (opts.type === 'textarea') {
      control = h('textarea', {
        class: 'a-textarea' + (opts.code ? ' code' : ''),
        id: id,
        rows: opts.rows || 4,
        placeholder: opts.placeholder || ''
      });
      control.value = value === null || value === undefined ? '' : String(value);
    } else if (opts.type === 'select') {
      control = h('select', { class: 'a-select', id: id });
      (opts.options || []).forEach(function (o) {
        control.appendChild(h('option', {
          value: o.value, text: o.label,
          selected: String(o.value) === String(value)
        }));
      });
    } else if (opts.type === 'range') {
      var row = h('div', { class: 'a-range-row' });
      control = h('input', {
        type: 'range', class: 'a-range', id: id,
        min: opts.min, max: opts.max, step: opts.step || 1
      });
      control.value = value;
      var badge = h('span', { class: 'a-range-value', text: opts.format ? opts.format(value) : String(value) });
      control.addEventListener('input', function () {
        var v = Number(control.value);
        badge.textContent = opts.format ? opts.format(v) : String(v);
        commit(v);
      });
      row.appendChild(control);
      row.appendChild(badge);
      wrap.appendChild(row);
      if (opts.hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: opts.hint }));
      return wrap;
    } else if (opts.type === 'color') {
      var colorRow = h('div', { class: 'a-color-row' });
      control = h('input', { type: 'color', class: 'a-color', id: id });
      control.value = toHex(value);
      var textInput = h('input', {
        type: 'text', class: 'a-input', value: value || control.value,
        'aria-label': opts.label + ' value', maxlength: 9
      });
      control.addEventListener('input', function () {
        textInput.value = control.value;
        commit(control.value);
      });
      textInput.addEventListener('input', function () {
        var v = textInput.value.trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
          control.value = toHex(v);
          commit(v);
        }
      });
      colorRow.appendChild(control);
      colorRow.appendChild(textInput);
      wrap.appendChild(colorRow);
      if (opts.hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: opts.hint }));
      return wrap;
    } else if (opts.type === 'media') {
      wrap.appendChild(mediaPicker(value, function (v) { commit(v); }, opts));
      if (opts.hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: opts.hint }));
      return wrap;
    } else {
      control = h('input', {
        type: opts.type || 'text',
        class: 'a-input',
        id: id,
        placeholder: opts.placeholder || '',
        autocomplete: 'off'
      });
      control.value = value === null || value === undefined ? '' : String(value);
    }

    if (opts.maxlength) control.setAttribute('maxlength', String(opts.maxlength));
    if (opts.min !== undefined && opts.type === 'number') control.setAttribute('min', opts.min);
    if (opts.max !== undefined && opts.type === 'number') control.setAttribute('max', opts.max);
    if (opts.required) control.setAttribute('required', 'required');

    if (counter) {
      var max = opts.maxlength || 0;
      var updateCounter = function () {
        counter.textContent = control.value.length + (max ? ' / ' + max : '');
      };
      updateCounter();
      control.addEventListener('input', updateCounter);
    }

    control.addEventListener('input', function () {
      var v = opts.type === 'number' ? Number(control.value) : control.value;
      commit(v);
    });

    wrap.appendChild(control);

    if (opts.hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: opts.hint }));

    var errorNode = h('p', { class: 'a-field-error', id: id + '-error' });
    wrap.appendChild(errorNode);

    function validate() {
      if (typeof opts.validate !== 'function') return true;
      var msg = opts.validate(control.value);
      wrap.classList.toggle('invalid', !!msg);
      errorNode.textContent = msg || '';
      control.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    if (typeof opts.validate === 'function') {
      control.setAttribute('aria-describedby', id + '-error');
      control.addEventListener('blur', validate);
      control.addEventListener('input', function () {
        if (wrap.classList.contains('invalid')) validate();
      });
    }

    return wrap;
  }

  function urlValidator(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    return C.isSafeUrl(v) ? '' : 'Use an http(s) link, a site-relative path, or leave it empty.';
  }

  function emailValidator(value) {
    var v = String(value || '').trim();
    if (!v) return 'Email is required.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.';
  }

  /* ==========================================================
     REPEATABLE LIST ENGINE
     ========================================================== */
  function miniBtn(label, title, onClick, opts) {
    opts = opts || {};
    var btn = h('button', {
      class: 'a-mini-btn' + (opts.danger ? ' danger' : ''),
      type: 'button', title: title, 'aria-label': title,
      text: label, disabled: opts.disabled
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function listEditor(container, opts) {
    function render() {
      clear(container);
      var arr = opts.items();
      var max = opts.max || 30;

      if (!arr.length) {
        container.appendChild(h('div', { class: 'a-empty' }, [
          h('strong', { text: 'Nothing here yet' }),
          h('span', { text: 'Use the button below to add the first item.' })
        ]));
      }

      arr.forEach(function (item, index) {
        var row = h('div', { class: 'a-list-item' });
        row.appendChild(h('span', { class: 'a-list-index', 'aria-hidden': 'true', text: String(index + 1).padStart(2, '0') }));

        var fields = h('div', { class: 'a-list-fields' });
        opts.renderItem(fields, item, index);
        row.appendChild(fields);

        var actions = h('div', { class: 'a-list-actions' });
        actions.appendChild(miniBtn('↑', 'Move up', function () { move(index, -1); }, { disabled: index === 0 }));
        actions.appendChild(miniBtn('↓', 'Move down', function () { move(index, 1); }, { disabled: index === arr.length - 1 }));
        actions.appendChild(miniBtn('✕', 'Remove', function () { remove(index); }, { danger: true }));
        row.appendChild(actions);
        container.appendChild(row);
      });

      var addBtn = h('button', {
        class: 'a-btn tiny ghost', type: 'button',
        text: '+ ' + (opts.addLabel || 'Add item'),
        disabled: arr.length >= max
      });
      addBtn.addEventListener('click', function () {
        if (arr.length >= max) return;
        arr.push(opts.addItem());
        markDirty();
        render();
        if (typeof opts.onMutate === 'function') opts.onMutate();
      });
      container.appendChild(h('div', { class: 'a-list-foot' }, [addBtn]));
    }

    function move(index, dir) {
      var arr = opts.items();
      var target = index + dir;
      if (target < 0 || target >= arr.length) return;
      var tmp = arr[index];
      arr[index] = arr[target];
      arr[target] = tmp;
      markDirty();
      render();
      if (typeof opts.onMutate === 'function') opts.onMutate();
    }

    function remove(index) {
      opts.items().splice(index, 1);
      markDirty();
      render();
      if (typeof opts.onMutate === 'function') opts.onMutate();
    }

    render();
    return render;
  }

  function listInput(attrs, onInput) {
    var input = h('input', Object.assign({ class: 'a-input', type: 'text' }, attrs));
    input.addEventListener('input', function () { onInput(input.value); });
    return input;
  }

  /* ==========================================================
     CARD / PANEL HELPERS
     ========================================================== */
  function card(title, meta, actions, children) {
    var head = h('div', { class: 'a-card-head' }, [
      h('h2', { text: title }),
      meta ? h('span', { class: 'a-muted', text: meta }) : null,
      actions ? h('div', { class: 'a-toolbar-actions' }, actions) : null
    ]);
    return h('section', { class: 'a-card' }, [head, h('div', { class: 'a-card-body' }, children)]);
  }

  function panelHead(meta) {
    return h('header', { class: 'a-panel-head' }, [
      h('div', null, [
        h('p', { class: 'a-eyebrow', text: meta.eyebrow }),
        h('h1', { class: 'a-title', id: 'h-' + meta.id, text: meta.title })
      ]),
      h('p', { class: 'a-panel-note', text: meta.note })
    ]);
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    buildNav();
    buildPanels();
    bindChrome();
    renderPanel('dashboard');
    restoreAdminTheme();
    updateStatus('saved');
    updateNavCounts();
    var hash = (location.hash || '').replace('#', '');
    if (hash && navItem(hash)) activatePanel(hash, true);

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
  });

  /* ==========================================================
     NAVIGATION
     ========================================================== */
  function buildNav() {
    var nav = $('#adminNav');
    clear(nav);
    NAV.forEach(function (item) {
      var btn = h('button', {
        class: 'a-nav-item', type: 'button',
        dataset: { panel: item.id }, 'aria-current': 'false'
      }, [
        h('span', { class: 'a-nav-ico', html: item.icon }),
        h('span', { class: 'a-nav-label', text: item.label }),
        h('span', { class: 'a-nav-count', dataset: { count: item.id }, hidden: true })
      ]);
      btn.addEventListener('click', function () { activatePanel(item.id); });
      nav.appendChild(btn);
    });
  }

  function updateNavCounts() {
    var counts = {
      projects: working.projects.length,
      skills: working.skills.length,
      media: working.media.length
    };
    $$('.a-nav-count').forEach(function (node) {
      var id = node.dataset.count;
      if (counts[id] === undefined) { node.hidden = true; return; }
      node.hidden = false;
      node.textContent = String(counts[id]);
    });
  }

  function buildPanels() {
    var host = $('#panels');
    clear(host);
    NAV.forEach(function (item) {
      host.appendChild(h('section', {
        class: 'a-panel',
        id: 'panel-' + item.id,
        dataset: { panel: item.id },
        'aria-labelledby': 'h-' + item.id
      }));
      // Panels are built lazily the first time they are opened.
      stalePanels[item.id] = true;
    });
  }

  function renderPanel(id) {
    var section = $('#panel-' + id);
    if (!section) return;
    stalePanels[id] = false;
    clear(section);
    section.appendChild(panelHead(navItem(id)));
    var body = h('div');
    section.appendChild(body);
    BUILDERS[id](body);
    if (id === 'appearance') updateAppearancePreview();
    if (searchQuery) applyFieldFilter(searchQuery);
  }

  function rebuildPanel(id) {
    if (!navItem(id)) return;
    stalePanels[id] = false;
    renderPanel(id);
    if (id === 'dashboard') setupPreview();
    updateNavCounts();
  }

  function rebuildAllPanels() {
    NAV.forEach(function (item) { renderPanel(item.id); });
    allPanelsBuilt = true;
    updateNavCounts();
    setupPreview();
  }

  /**
   * Search inspects the rendered fields of every panel, so make sure each
   * panel has been built at least once before searching across them.
   */
  function ensureAllPanelsBuilt() {
    if (allPanelsBuilt) return;
    NAV.forEach(function (item) {
      if (stalePanels[item.id] || !$('#panel-' + item.id + ' .a-panel-head')) renderPanel(item.id);
    });
    allPanelsBuilt = true;
  }

  function activatePanel(id, silent) {
    if (!navItem(id)) return;
    activePanel = id;
    if (stalePanels[id]) { stalePanels[id] = false; renderPanel(id); }
    $$('.a-nav-item').forEach(function (btn) {
      var on = btn.dataset.panel === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    });
    $$('.a-panel').forEach(function (p) { p.classList.toggle('active', p.dataset.panel === id); });
    if (!silent) {
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
      window.scrollTo({ top: 0, behavior: isReducedMotion() ? 'auto' : 'smooth' });
    }
    closeDrawer();
    if (searchQuery) applyFieldFilter(searchQuery);
    if (id === 'dashboard') { setupPreview(); pushPreview(); }
    if (id === 'appearance') updateAppearancePreview();
  }

  /* ==========================================================
     CHROME
     ========================================================== */
  function bindChrome() {
    $('#saveBtn').addEventListener('click', function () { saveNow({ silent: false }); });
    $('#exportTopBtn').addEventListener('click', exportNow);
    $('#adminThemeBtn').addEventListener('click', toggleAdminTheme);
    $('#drawerBtn').addEventListener('click', toggleDrawer);
    $('#aScrim').addEventListener('click', closeDrawer);

    var search = $('#adminSearch');
    search.addEventListener('input', debounce(function () { runSearch(search.value); }, 130));
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; runSearch(''); search.blur(); }
      if (e.key === 'Enter') {
        var first = $('#searchResults .a-search-result');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.a-search-wrap')) hideSearchResults();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
    window.addEventListener('resize', debounce(function () {
      if (window.innerWidth > 900) closeDrawer();
    }, 150));
  }

  function toggleDrawer() {
    var sidebar = $('#aSidebar');
    var btn = $('#drawerBtn');
    var open = sidebar.classList.toggle('open');
    $('#aScrim').hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeDrawer() {
    var sidebar = $('#aSidebar');
    if (!sidebar || !sidebar.classList.contains('open')) return;
    sidebar.classList.remove('open');
    var btn = $('#drawerBtn');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open navigation'); }
    var scrim = $('#aScrim');
    if (scrim) scrim.hidden = true;
    document.body.style.overflow = '';
  }

  function restoreAdminTheme() {
    var saved = null;
    try { saved = localStorage.getItem('mahin_admin_theme'); } catch (e) { /* ignore */ }
    if (saved === 'light' || saved === 'dark') setAdminTheme(saved);
  }

  function setAdminTheme(theme) {
    document.documentElement.setAttribute('data-admin-theme', theme);
    var btn = $('#adminThemeBtn');
    if (btn) {
      btn.textContent = theme === 'light' ? '☾' : '☀';
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch admin to dark appearance' : 'Switch admin to light appearance');
    }
  }

  function toggleAdminTheme() {
    var next = document.documentElement.getAttribute('data-admin-theme') === 'light' ? 'dark' : 'light';
    setAdminTheme(next);
    try { localStorage.setItem('mahin_admin_theme', next); } catch (e) { /* ignore */ }
  }

  /* ==========================================================
     SEARCH
     ========================================================== */
  function runSearch(raw) {
    searchQuery = String(raw || '').trim().toLowerCase();
    var results = $('#searchResults');
    if (!searchQuery) {
      hideSearchResults();
      applyFieldFilter('');
      return;
    }

    ensureAllPanelsBuilt();

    var matches = [];
    NAV.forEach(function (nav) {
      $$('#panel-' + nav.id + ' .a-field').forEach(function (field) {
        var labelNode = field.querySelector('.a-field-label span');
        var labelText = labelNode ? labelNode.textContent.replace(/\s*\*\s*$/, '').trim() : 'Setting';
        var haystack = (field.dataset.search || '') + ' ' + labelText.toLowerCase();
        if (haystack.indexOf(searchQuery) !== -1) {
          matches.push({ panel: nav.id, panelLabel: nav.label, label: labelText, field: field });
        }
      });
    });

    clear(results);
    results.hidden = false;
    if (!matches.length) {
      results.appendChild(h('div', { class: 'a-search-empty', text: 'No settings match “' + raw.trim() + '”.' }));
    } else {
      matches.slice(0, 14).forEach(function (m) {
        var btn = h('button', { class: 'a-search-result', type: 'button' }, [
          h('strong', { text: m.label }),
          h('span', { text: m.panelLabel })
        ]);
        btn.addEventListener('click', function () {
          activatePanel(m.panel);
          hideSearchResults();
          setTimeout(function () {
            if (!m.field.isConnected) return;
            m.field.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'center' });
            var control = m.field.querySelector('input, textarea, select, button');
            if (control) control.focus({ preventScroll: true });
          }, 120);
        });
        results.appendChild(btn);
      });
    }
    applyFieldFilter(searchQuery);
  }

  function hideSearchResults() {
    var results = $('#searchResults');
    if (results) results.hidden = true;
  }

  function applyFieldFilter(query) {
    var panel = $('#panel-' + activePanel);
    if (!panel) return;
    $$('.a-field', panel).forEach(function (field) {
      if (!query) { field.classList.remove('hidden'); return; }
      field.classList.toggle('hidden', (field.dataset.search || '').indexOf(query) === -1);
    });
  }

  /* ==========================================================
     LIVE PREVIEW
     ========================================================== */
  function setupPreview() {
    var frame = $('#previewFrame');
    if (!frame) return;
    if (frame.dataset.bound === 'true') { pushPreview(); return; }
    frame.dataset.bound = 'true';
    frame.addEventListener('load', function () { pushPreview(); });
    pushPreview();
  }

  function pushPreview() {
    var frame = $('#previewFrame');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: 'mahin:preview-config', config: working }, '*');
    } catch (e) { /* iframe not ready */ }
  }

  var pushPreviewSoon = debounce(pushPreview, 650);

  /* ==========================================================
     PANEL BUILDERS (defined in the next section)
     ========================================================== */
  var BUILDERS = {
    dashboard: function () {}, profile: function () {}, projects: function () {},
    media: function () {}, skills: function () {}, appearance: function () {},
    animations: function () {}, contact: function () {}, seo: function () {}, data: function () {}
  };

/* ==========================================================
     DASHBOARD
     ========================================================== */
  function buildDashboard(root) {
    var featured = working.projects.filter(function (p) { return p.featured; }).length;
    var mediaBytes = working.media.reduce(function (sum, m) { return sum + (m.size || 0); }, 0);

    root.appendChild(h('div', { class: 'a-stat-grid' }, [
      statCard('Total projects', String(working.projects.length), featured + ' featured'),
      statCard('Total skills', String(working.skills.length), 'Creative toolkit'),
      statCard('Media assets', String(working.media.length), C.formatBytes(mediaBytes) + ' stored'),
      statCard('Local storage', null, 'Browser-only', 'dashStorage')
    ]));

    var quickCard = card('Quick actions', null, null, [
      h('div', { class: 'a-quick-grid' }, [
        quickAction('Edit profile', 'Name, hero, about', function () { activatePanel('profile'); }),
        quickAction('Add a project', 'New work card', function () { activatePanel('projects'); addProject(); }),
        quickAction('Upload media', 'Images & thumbnails', function () { activatePanel('media'); }),
        quickAction('Appearance', 'Colours, glass, type', function () { activatePanel('appearance'); }),
        quickAction('Preview site', 'Open in a new tab', function () { window.open('index.html', '_blank', 'noopener'); }),
        quickAction('Export backup', 'Download JSON', exportNow)
      ])
    ]);

    var previewCard = card('Website preview', 'Live', [
      h('button', {
        class: 'a-btn tiny ghost', type: 'button', text: 'Refresh',
        onClick: function () { var f = $('#previewFrame'); if (f) f.src = 'index.html?preview=1&t=' + Date.now(); }
      }),
      h('button', {
        class: 'a-btn tiny ghost', type: 'button', text: 'Push changes',
        onClick: function () { pushPreview(); toast('Preview updated with unsaved changes', 'info'); }
      })
    ], [
      h('div', { class: 'a-preview-frame' }, [
        h('iframe', { id: 'previewFrame', title: 'Live website preview', src: 'index.html?preview=1', loading: 'lazy' })
      ]),
      h('div', { class: 'a-preview-bar' }, [
        h('span', { class: 'a-preview-dots', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i')]),
        h('span', { class: 'a-muted', text: 'Updates as you edit' })
      ])
    ]);

    root.appendChild(h('div', { class: 'a-grid-2' }, [quickCard, previewCard]));

    var p = working.profile;
    root.appendChild(card('Profile at a glance', null, [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Edit profile', onClick: function () { activatePanel('profile'); } })
    ], [
      h('dl', { class: 'a-kv' }, [
        kv('Display name', p.displayName || '—'),
        kv('Title', p.title || '—'),
        kv('Email', p.email || '—'),
        kv('Availability', p.availability.enabled ? p.availability.text : 'Hidden'),
        kv('Projects', working.projects.length + ' total'),
        kv('Categories', working.categories.map(function (c) { return c.label; }).join(', '))
      ])
    ]));

    setupPreview();
    updateStorageMeter();
  }

  function statCard(label, value, foot, id) {
    return h('div', { class: 'a-stat-card' }, [
      h('span', { class: 'a-stat-label', text: label }),
      h('strong', { class: 'a-stat-value', id: id || null, text: value === null ? '—' : String(value) }),
      h('span', { class: 'a-stat-foot', text: foot || '' })
    ]);
  }

  function quickAction(title, sub, onClick) {
    var btn = h('button', { class: 'a-quick', type: 'button' }, [
      h('strong', { text: title }),
      h('span', { text: sub })
    ]);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function kv(label, value) {
    return h('div', null, [h('dt', { text: label }), h('dd', { text: String(value) })]);
  }

  /* ==========================================================
     PROFILE
     ========================================================== */
  function buildProfile(root) {
    var p = working.profile;

    var identity = h('div', { class: 'a-fields' });
    addField(identity, {
      label: 'Display name', path: 'profile.displayName', value: p.displayName,
      required: true, maxlength: 80, counter: true,
      hint: 'Used in the browser title, image alt text and metadata.'
    });
    addField(identity, {
      label: 'Professional title', path: 'profile.title', value: p.title, maxlength: 160,
      hint: 'Example: Creative Designer / Video Editor'
    });
    addField(identity, { label: 'Logo text', path: 'profile.logoText', value: p.logoText, maxlength: 40 });
    addField(identity, {
      label: 'Contact email', path: 'profile.email', type: 'email', value: p.email,
      required: true, validate: emailValidator,
      onChange: function (v) { working.social.email = v; },
      hint: 'Used by the mailto links on the public site.'
    });
    addField(identity, { label: 'Location / note', path: 'profile.location', value: p.location, full: true });
    addField(identity, {
      label: 'Profile image', path: 'profile.avatar', type: 'media', value: p.avatar, full: true,
      hint: 'JPG, PNG or WebP up to 2.5 MB. Appears at the top of the About panel.'
    });
    addField(identity, { label: 'Image alt text', path: 'profile.avatarAlt', value: p.avatarAlt, full: true });
    root.appendChild(card('Identity', 'Public profile', null, [identity]));

    var hero = h('div', { class: 'a-fields' });
    addField(hero, { label: 'Hero eyebrow', path: 'profile.heroEyebrow', value: p.heroEyebrow, maxlength: 120, full: true });
    addField(hero, {
      label: 'Hero heading', path: 'profile.heroHeading', type: 'textarea', rows: 3, maxlength: 400,
      value: p.heroHeading, full: true,
      hint: 'Press Enter for a new line. Example: MAKING / IDEAS FEEL / UNREAL.'
    });
    addField(hero, {
      label: 'Accent word', path: 'profile.heroAccentWord', value: p.heroAccentWord, maxlength: 60,
      hint: 'This word in the heading gets the gradient treatment.'
    });
    addField(hero, {
      label: 'Hero introduction', path: 'profile.heroIntro', type: 'textarea', rows: 3,
      value: p.heroIntro, full: true, maxlength: 800
    });
    addField(hero, {
      type: 'toggle', label: 'Availability badge', value: p.availability.enabled, full: true,
      desc: 'Show the pulsing availability pill under the eyebrow.',
      onChange: function (v) { working.profile.availability.enabled = v; }
    });
    addField(hero, {
      label: 'Availability text', path: 'profile.availability.text', value: p.availability.text,
      maxlength: 80, full: true
    });
    root.appendChild(card('Hero section', 'Above the fold', null, [hero]));

    var about = h('div', { class: 'a-fields' });
    addField(about, {
      label: 'About lead', path: 'profile.aboutLead', type: 'textarea', rows: 3, value: p.aboutLead,
      full: true, maxlength: 800,
      hint: 'Wrap words in **double asterisks** to highlight them in the accent colour.'
    });
    addField(about, { label: 'About paragraph 1', path: 'profile.aboutBody1', type: 'textarea', rows: 3, value: p.aboutBody1, full: true, maxlength: 1500 });
    addField(about, { label: 'About paragraph 2', path: 'profile.aboutBody2', type: 'textarea', rows: 3, value: p.aboutBody2, full: true, maxlength: 1500 });
    root.appendChild(card('About section', 'Story & philosophy', null, [about]));

    var notes = h('div', { class: 'a-fields' });
    addField(notes, { label: 'About note', path: 'profile.sectionNotes.about', value: p.sectionNotes.about, type: 'textarea', rows: 2, maxlength: 600 });
    addField(notes, { label: 'Work note', path: 'profile.sectionNotes.work', value: p.sectionNotes.work, type: 'textarea', rows: 2, maxlength: 600 });
    addField(notes, { label: 'Journey note', path: 'profile.sectionNotes.journey', value: p.sectionNotes.journey, type: 'textarea', rows: 2, maxlength: 600 });
    addField(notes, { label: 'Contact note', path: 'profile.sectionNotes.contact', value: p.sectionNotes.contact, type: 'textarea', rows: 2, maxlength: 600 });
    root.appendChild(card('Section notes', 'Small intro lines', null, [notes]));

    var statsHost = h('div', { class: 'a-list' });
    root.appendChild(card('Statistics', 'Counters animate on scroll', null, [statsHost]));
    listEditor(statsHost, {
      items: function () { return working.profile.stats; },
      addLabel: 'Add statistic',
      addItem: function () { return { label: 'New statistic', value: 0 }; },
      max: 8,
      renderItem: function (fields, item) {
        fields.appendChild(listInput({ value: item.label, placeholder: 'Label', 'aria-label': 'Statistic label' }, function (v) { item.label = v; markDirty(); }));
        var num = h('input', { class: 'a-input', type: 'number', min: '0', max: '1000000', value: String(item.value), 'aria-label': 'Statistic value' });
        num.addEventListener('input', function () { item.value = Number(num.value) || 0; markDirty(); });
        fields.appendChild(num);
      },
      onMutate: function () { markStale(['dashboard']); }
    });

    var processHost = h('div', { class: 'a-list' });
    root.appendChild(card('Process timeline', 'Shown in Journey', null, [processHost]));
    listEditor(processHost, {
      items: function () { return working.profile.process; },
      addLabel: 'Add process step',
      addItem: function () { return { step: 'NEW / STEP', title: 'New step', body: '' }; },
      max: 10,
      renderItem: function (fields, item) {
        fields.appendChild(listInput({ value: item.step, placeholder: '01 / DISCOVER', 'aria-label': 'Step label' }, function (v) { item.step = v; markDirty(); }));
        fields.appendChild(listInput({ value: item.title, placeholder: 'Step title', 'aria-label': 'Step title' }, function (v) { item.title = v; markDirty(); }));
        var body = h('textarea', { class: 'a-textarea', rows: 2, placeholder: 'What happens in this step?', 'aria-label': 'Step description', style: { gridColumn: '1 / -1' } });
        body.value = item.body || '';
        body.addEventListener('input', function () { item.body = body.value; markDirty(); });
        fields.appendChild(body);
      }
    });

    var footer = h('div', { class: 'a-fields' });
    addField(footer, { label: 'Footer text', path: 'profile.footerText', value: p.footerText, maxlength: 120 });
    addField(footer, { label: 'Footer tagline', path: 'profile.footerTag', value: p.footerTag, maxlength: 120 });
    root.appendChild(card('Footer', 'Bottom of the page', null, [footer]));
  }

  /* ==========================================================
     PROJECTS
     ========================================================== */
  function buildProjects(root) {
    var filterInput = h('input', { class: 'a-input', type: 'search', placeholder: 'Filter projects…', 'aria-label': 'Filter projects' });
    filterInput.addEventListener('input', function () {
      var q = filterInput.value.trim().toLowerCase();
      $$('.a-project').forEach(function (card) {
        var title = (card.dataset.title || '').toLowerCase();
        card.classList.toggle('hidden', q.length > 0 && title.indexOf(q) === -1);
      });
    });

    root.appendChild(h('div', { class: 'a-toolbar' }, [
      h('div', { class: 'a-toolbar-actions' }, [filterInput]),
      h('div', { class: 'a-toolbar-actions' }, [
        h('button', { class: 'a-btn primary', type: 'button', text: '+ Add project', onClick: addProject })
      ])
    ]));

    var list = h('div', { class: 'a-projects', id: 'projectList' });
    root.appendChild(list);

    if (!working.projects.length) {
      list.appendChild(h('div', { class: 'a-empty' }, [
        h('strong', { text: 'No projects yet' }),
        h('span', { text: 'Add your first project to populate the public Work grid.' })
      ]));
    } else {
      working.projects.forEach(function (project, index) {
        list.appendChild(projectCard(project, index));
      });
    }

    root.appendChild(buildCategoriesCard());
  }

  function addProject() {
    var project = {
      id: C.uid('project'),
      title: 'Untitled project',
      description: '',
      category: (working.categories[0] && working.categories[0].id) || 'design',
      tools: [],
      url: '',
      videoUrl: '',
      image: '',
      featured: false,
      order: working.projects.length,
      indexLabel: 'PROJECT / ' + String(working.projects.length + 1).padStart(3, '0'),
      caption: ''
    };
    working.projects.push(project);
    expandedProjects[project.id] = true;
    markDirty();
    rebuildPanel('projects');
    updateNavCounts();
    toast('Project added — fill in the details', 'success');
    setTimeout(function () {
      var node = document.querySelector('[data-project-id="' + project.id + '"]');
      if (node) node.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }, 90);
  }

  function categoryLabel(id) {
    var found = working.categories.filter(function (c) { return c.id === id; })[0];
    return found ? found.label : id;
  }

  function projectCard(project, index) {
    var expanded = !!expandedProjects[project.id];
    var article = h('article', {
      class: 'a-project' + (expanded ? ' expanded' : '') + (project.featured ? ' is-featured' : ''),
      dataset: { projectId: project.id, title: project.title }
    });

    var thumb = h('div', { class: 'a-project-thumb' });
    var titleEl = h('strong', { text: project.title || 'Untitled project' });
    var categoryBadge = h('span', { class: 'a-badge', text: categoryLabel(project.category) });
    var orderBadge = h('span', { class: 'a-badge', text: 'Order ' + (index + 1) });
    var featuredBadge = h('span', { class: 'a-badge featured', text: 'Featured' });
    featuredBadge.hidden = !project.featured;

    function renderThumb() {
      clear(thumb);
      var src = C.resolveAsset(project.image, working);
      if (src) thumb.appendChild(h('img', { src: src, alt: '' }));
      else thumb.appendChild(h('span', { text: 'NO IMG' }));
    }
    renderThumb();

    function refreshMeta() {
      categoryBadge.textContent = categoryLabel(project.category);
      featuredBadge.hidden = !project.featured;
      article.classList.toggle('is-featured', !!project.featured);
      article.dataset.title = project.title || '';
    }

    var expandBtn = miniBtn(expanded ? '▾' : '▸', expanded ? 'Collapse project' : 'Expand project', function () {
      var open = article.classList.toggle('expanded');
      expandedProjects[project.id] = open;
      expandBtn.textContent = open ? '▾' : '▸';
      expandBtn.setAttribute('aria-expanded', String(open));
      expandBtn.setAttribute('aria-label', open ? 'Collapse project' : 'Expand project');
    });
    expandBtn.setAttribute('aria-expanded', String(expanded));

    var upBtn = miniBtn('↑', 'Move project up', function () {
      if (index === 0) return;
      var arr = working.projects;
      var tmp = arr[index - 1]; arr[index - 1] = arr[index]; arr[index] = tmp;
      arr.forEach(function (p, i) { p.order = i; });
      markDirty();
      rebuildPanel('projects');
    }, { disabled: index === 0 });

    var downBtn = miniBtn('↓', 'Move project down', function () {
      if (index === working.projects.length - 1) return;
      var arr = working.projects;
      var tmp = arr[index + 1]; arr[index + 1] = arr[index]; arr[index] = tmp;
      arr.forEach(function (p, i) { p.order = i; });
      markDirty();
      rebuildPanel('projects');
    }, { disabled: index === working.projects.length - 1 });

    var deleteBtn = miniBtn('✕', 'Delete project', function () {
      confirmDialog({
        title: 'Delete this project?',
        message: '“' + (project.title || 'Untitled project') + '” will be removed from the portfolio. Export a backup first if you might need it again.',
        confirmLabel: 'Delete project'
      }).then(function (ok) {
        if (!ok) return;
        var idx = working.projects.indexOf(project);
        if (idx !== -1) working.projects.splice(idx, 1);
        working.projects.forEach(function (p, i) { p.order = i; });
        delete expandedProjects[project.id];
        markDirty();
        rebuildPanel('projects');
        updateNavCounts();
        markStale(['dashboard']);
        toast('Project deleted', 'success');
      });
    }, { danger: true });

    article.appendChild(h('div', { class: 'a-project-head' }, [
      thumb,
      h('div', { class: 'a-project-title' }, [
        titleEl,
        h('div', { class: 'a-project-meta' }, [categoryBadge, orderBadge, featuredBadge])
      ]),
      h('div', { class: 'a-project-head-actions' }, [upBtn, downBtn, expandBtn, deleteBtn])
    ]));

    var body = h('div', { class: 'a-project-body' });
    var grid = h('div', { class: 'a-fields' });

    addField(grid, {
      label: 'Project title', value: project.title, required: true, maxlength: 160,
      onChange: function (v) { project.title = v; titleEl.textContent = v || 'Untitled project'; refreshMeta(); }
    });
    addField(grid, {
      label: 'Category', type: 'select', value: project.category,
      options: working.categories.map(function (c) { return { value: c.id, label: c.label }; }),
      onChange: function (v) { project.category = v; refreshMeta(); }
    });
    addField(grid, {
      label: 'Description', type: 'textarea', rows: 3, value: project.description,
      full: true, maxlength: 1200,
      onChange: function (v) { project.description = v; }
    });
    addField(grid, {
      label: 'Tools / software', type: 'text', full: true,
      getValue: function () { return project.tools.join(', '); },
      setValue: function (v) {
        project.tools = String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12);
      },
      hint: 'Comma separated, e.g. Premiere Pro, After Effects, Photoshop.'
    });
    addField(grid, {
      label: 'Project URL', type: 'url', value: project.url, validate: urlValidator,
      onChange: function (v) { project.url = v; }
    });
    addField(grid, {
      label: 'Video preview URL', type: 'url', value: project.videoUrl, validate: urlValidator,
      onChange: function (v) { project.videoUrl = v; }
    });
    addField(grid, {
      label: 'Thumbnail image', type: 'media', full: true, value: project.image,
      onChange: function (v) { project.image = v; renderThumb(); },
      hint: 'Pick from the media library, paste a URL, or upload a new file.'
    });
    addField(grid, {
      label: 'Index label', value: project.indexLabel, maxlength: 60, placeholder: 'PROJECT / 001',
      onChange: function (v) { project.indexLabel = v; }
    });
    addField(grid, {
      label: 'Caption', value: project.caption, maxlength: 80,
      onChange: function (v) { project.caption = v; }
    });
    addField(grid, {
      label: 'Order', type: 'number', value: project.order, min: 0, max: 9999,
      hint: 'Ties are resolved by the arrow buttons above.',
      onChange: function (v) { project.order = Number(v) || 0; }
    });
    addField(grid, {
      type: 'toggle', label: 'Featured project', full: true,
      desc: 'Adds a FEATURED badge to the public card.',
      value: project.featured,
      onChange: function (v) { project.featured = v; refreshMeta(); markStale(['dashboard']); }
    });

    body.appendChild(grid);
    article.appendChild(body);
    return article;
  }

  function nextCategoryId() {
    var base = 'category';
    var id = base;
    var n = 2;
    while (working.categories.some(function (c) { return c.id === id; })) { id = base + '-' + n++; }
    return id;
  }

  function reconcileCategories() {
    if (!working.categories.length) working.categories.push({ id: 'design', label: 'Design' });
    var ids = working.categories.map(function (c) { return c.id; });
    working.projects.forEach(function (p) {
      if (ids.indexOf(p.category) === -1) p.category = ids[0];
    });
  }

  function buildCategoriesCard() {
    var host = h('div', { class: 'a-list' });
    var wrap = card('Categories', 'Filter buttons', null, [
      h('p', { class: 'a-field-hint', style: { marginTop: '0', marginBottom: '12px' }, text: 'Category IDs stay stable so projects keep their filter. Edit the label freely.' }),
      host
    ]);
    listEditor(host, {
      items: function () { return working.categories; },
      addLabel: 'Add category',
      addItem: function () { return { id: nextCategoryId(), label: 'New category' }; },
      max: 12,
      renderItem: function (fields, item) {
        fields.appendChild(listInput({ value: item.label, placeholder: 'Category name', 'aria-label': 'Category name' }, function (v) { item.label = v; markDirty(); }));
        fields.appendChild(h('span', { class: 'a-badge', style: { alignSelf: 'center', justifySelf: 'start' }, text: 'id: ' + item.id }));
      },
      onMutate: function () {
        reconcileCategories();
        markDirty();
        markStale(['dashboard']);
        toast('Categories updated', 'info', 2200);
      }
    });
    return wrap;
  }

  BUILDERS.dashboard = buildDashboard;
  BUILDERS.profile = buildProfile;
  BUILDERS.projects = buildProjects;

/* ==========================================================
     MEDIA LIBRARY
     ========================================================== */
  function buildMedia(root) {
    var fileInput = h('input', { type: 'file', class: 'a-file-input', accept: 'image/jpeg,image/png,image/webp', multiple: true });
    var drop = h('div', { class: 'a-dropzone', role: 'button', tabindex: '0', 'aria-label': 'Upload images: JPG, PNG or WebP' }, [
      h('span', { class: 'a-drop-ico', 'aria-hidden': 'true', text: '⇪' }),
      h('strong', { text: 'Drop images here or click to browse' }),
      h('span', { text: 'JPG · PNG · WebP · max 2.5 MB each' })
    ]);

    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); });
    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });
    drop.appendChild(fileInput);

    root.appendChild(card('Upload images', 'JPG / PNG / WebP', null, [drop]));

    root.appendChild(card('Storage', 'Browser quota', null, [
      h('div', { class: 'a-meter' }, [h('span', { 'data-storage-meter': '' })]),
      h('p', { class: 'a-field-hint', 'data-storage-text': '', text: '' }),
      h('p', { class: 'a-field-hint', text: 'Images are saved as data URLs inside this browser. Large libraries slow the admin down and can hit the storage quota — export a backup before adding a lot.' })
    ]));
    updateStorageMeter();

    var grid = h('div', { class: 'a-media-grid' });
    if (!working.media.length) {
      grid.appendChild(h('div', { class: 'a-empty', style: { gridColumn: '1 / -1' } }, [
        h('strong', { text: 'Library is empty' }),
        h('span', { text: 'Upload an image to reuse it in projects, your profile and SEO.' })
      ]));
    } else {
      working.media.forEach(function (m) { grid.appendChild(mediaCard(m)); });
    }

    root.appendChild(card('Library', working.media.length + ' image' + (working.media.length === 1 ? '' : 's'), null, [grid]));
  }

  function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var uploaded = 0;
    var chain = Promise.resolve();

    list.forEach(function (file) {
      chain = chain.then(function () {
        return readImageFile(file).then(function (asset) {
          ensureSpace(asset);
          addMediaObject(asset);
          uploaded++;
        }).catch(function (err) {
          toast(err.message, 'error', 5200);
        });
      });
    });

    chain.then(function () {
      if (!uploaded) return;
      markDirty();
      rebuildPanel('media');
      updateNavCounts();
      markStale(['profile', 'projects', 'seo', 'dashboard']);
      toast(uploaded + ' image' + (uploaded === 1 ? '' : 's') + ' uploaded', 'success');
      pushPreview();
    });
  }

  function mediaCard(m) {
    var el = h('div', { class: 'a-media-card' });
    el.appendChild(h('div', { class: 'a-media-thumb' }, [
      h('img', { src: m.dataUrl, alt: m.name, loading: 'lazy' })
    ]));
    el.appendChild(h('div', { class: 'a-media-meta' }, [
      h('span', { class: 'a-media-name', title: m.name, text: m.name }),
      h('span', { class: 'a-media-sub', text: String(m.type || '').replace('image/', '').toUpperCase() + ' · ' + C.formatBytes(m.size) })
    ]));

    var replaceInput = h('input', { type: 'file', class: 'a-file-input', accept: 'image/jpeg,image/png,image/webp' });
    replaceInput.addEventListener('change', function () {
      var file = replaceInput.files && replaceInput.files[0];
      if (!file) return;
      readImageFile(file).then(function (asset) {
        m.dataUrl = asset.dataUrl;
        m.name = asset.name;
        m.type = asset.type;
        m.size = asset.size;
        markDirty();
        rebuildPanel('media');
        markStale(['profile', 'projects', 'seo', 'dashboard']);
        toast('Image replaced — links update automatically', 'success');
      }).catch(function (err) { toast(err.message, 'error', 5200); });
      replaceInput.value = '';
    });

    var replaceBtn = h('button', { class: 'a-mini-btn', type: 'button', title: 'Replace file', 'aria-label': 'Replace ' + m.name, text: '⇄' });
    replaceBtn.addEventListener('click', function () { replaceInput.click(); });

    var delBtn = miniBtn('✕', 'Delete ' + m.name, function () { deleteMedia(m); }, { danger: true });

    var actions = h('div', { class: 'a-media-actions' });
    actions.appendChild(replaceBtn);
    actions.appendChild(delBtn);
    actions.appendChild(replaceInput);
    el.appendChild(actions);
    return el;
  }

  function deleteMedia(m) {
    var refs = findMediaReferences(m.id);
    var message = '“' + m.name + '” will be permanently removed from this browser.';
    if (refs.length) {
      message += ' It is currently used by: ' + refs.join(', ') + '. Those references will be cleared.';
    }
    confirmDialog({ title: 'Delete image?', message: message, confirmLabel: 'Delete image' }).then(function (ok) {
      if (!ok) return;
      var idx = working.media.indexOf(m);
      if (idx !== -1) working.media.splice(idx, 1);
      clearMediaReference(m.id);
      markDirty();
      rebuildPanel('media');
      updateNavCounts();
      markStale(['profile', 'projects', 'seo', 'dashboard']);
      toast('Image deleted', 'success');
    });
  }

  /* ==========================================================
     SKILLS
     ========================================================== */
  function buildSkills(root) {
    var input = h('input', { class: 'a-input', type: 'text', placeholder: 'e.g. Colour grading', 'aria-label': 'New skill', maxlength: '40' });
    var addBtn = h('button', { class: 'a-btn primary', type: 'button', text: 'Add skill' });

    function addSkill() {
      var v = input.value.trim();
      if (!v) { toast('Type a skill first', 'warn'); input.focus(); return; }
      if (working.skills.some(function (s) { return s.toLowerCase() === v.toLowerCase(); })) {
        toast('That skill already exists', 'warn');
        return;
      }
      if (working.skills.length >= 40) { toast('Skill limit reached (40)', 'warn'); return; }
      working.skills.push(v);
      input.value = '';
      markDirty();
      rebuildPanel('skills');
      updateNavCounts();
      toast('Skill added', 'success');
    }

    addBtn.addEventListener('click', addSkill);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addSkill(); }
    });

    root.appendChild(card('Add a skill', 'Toolkit chips', null, [
      h('div', { class: 'a-skill-add' }, [input, addBtn])
    ]));

    var wrap = h('div', { class: 'a-skills' });
    working.skills.forEach(function (skill, index) {
      var chip = h('div', { class: 'a-skill' });
      var nameInput = h('input', { class: 'a-skill-input', type: 'text', value: skill, 'aria-label': 'Skill name', maxlength: '40' });
      nameInput.addEventListener('input', function () { working.skills[index] = nameInput.value; markDirty(); });
      nameInput.addEventListener('blur', function () {
        if (!nameInput.value.trim()) {
          working.skills.splice(index, 1);
          markDirty();
          rebuildPanel('skills');
          updateNavCounts();
        }
      });
      chip.appendChild(nameInput);

      var acts = h('span', { class: 'a-skill-actions' });
      acts.appendChild(miniBtn('↑', 'Move up', function () {
        if (index === 0) return;
        var a = working.skills;
        var t = a[index - 1]; a[index - 1] = a[index]; a[index] = t;
        markDirty();
        rebuildPanel('skills');
      }, { disabled: index === 0 }));
      acts.appendChild(miniBtn('↓', 'Move down', function () {
        if (index === working.skills.length - 1) return;
        var a = working.skills;
        var t = a[index + 1]; a[index + 1] = a[index]; a[index] = t;
        markDirty();
        rebuildPanel('skills');
      }, { disabled: index === working.skills.length - 1 }));
      acts.appendChild(miniBtn('✕', 'Delete skill', function () {
        working.skills.splice(index, 1);
        markDirty();
        rebuildPanel('skills');
        updateNavCounts();
        toast('Skill removed', 'success');
      }, { danger: true }));
      chip.appendChild(acts);
      wrap.appendChild(chip);
    });

    if (!working.skills.length) {
      wrap.appendChild(h('div', { class: 'a-empty' }, [
        h('strong', { text: 'No skills yet' }),
        h('span', { text: 'Add the tools and disciplines you want to show.' })
      ]));
    }
    root.appendChild(card('Current skills', working.skills.length + ' items', null, [wrap]));
  }

  /* ==========================================================
     APPEARANCE
     ========================================================== */
  function buildAppearance(root) {
    var a = working.appearance;

    var modeSeg = h('div', { class: 'a-seg', role: 'group', 'aria-label': 'Appearance mode' });
    ['dark', 'light'].forEach(function (mode) {
      var btn = h('button', { type: 'button', text: mode === 'dark' ? 'Dark' : 'Light', 'aria-pressed': String(a.mode === mode) });
      btn.addEventListener('click', function () { applyPreset(mode); });
      modeSeg.appendChild(btn);
    });

    var preview = h('div', { class: 'a-theme-preview', id: 'appearancePreview' }, [
      h('div', { class: 'tp-eyebrow', text: 'LIVE PREVIEW' }),
      h('h3', null, ['MAKING IDEAS ', h('em', { text: 'UNREAL.' })]),
      h('p', { text: 'Glass, colour and typography update as you edit.' }),
      h('div', { class: 'tp-actions' }, [
        h('span', { class: 'tp-btn solid', text: 'Explore work' }),
        h('span', { class: 'tp-btn', text: "Let's talk" })
      ]),
      h('div', { class: 'tp-card', text: 'A glass panel with your border radius, blur and shadow.' })
    ]);

    var swatches = h('div', { class: 'a-swatches' }, [
      swatch('Background', 'background'), swatch('Text', 'text'), swatch('Accent', 'accent'),
      swatch('Cyan', 'accent2'), swatch('Violet', 'accent3')
    ]);

    root.appendChild(card('Live preview', 'Instant', [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Push to site preview', onClick: function () { pushPreview(); toast('Appearance pushed to the preview', 'info'); } })
    ], [modeSeg, h('div', { style: { marginTop: '16px' } }, [preview]), swatches]));

    var colors = h('div', { class: 'a-fields' });
    addField(colors, { label: 'Background', type: 'color', path: 'appearance.background', value: a.background, onChange: updateAppearancePreview });
    addField(colors, { label: 'Text colour', type: 'color', path: 'appearance.text', value: a.text, onChange: updateAppearancePreview });
    addField(colors, { label: 'Accent (lime slot)', type: 'color', path: 'appearance.accent', value: a.accent, onChange: updateAppearancePreview });
    addField(colors, { label: 'Secondary accent (cyan)', type: 'color', path: 'appearance.accent2', value: a.accent2, onChange: updateAppearancePreview });
    addField(colors, { label: 'Tertiary accent (violet)', type: 'color', path: 'appearance.accent3', value: a.accent3, onChange: updateAppearancePreview });
    root.appendChild(card('Colours', 'Theme tokens', null, [colors]));

    var surfaces = h('div', { class: 'a-fields' });
    addField(surfaces, {
      label: 'Glass transparency', type: 'range', min: 0, max: 1, step: 0.01, value: a.glassOpacity,
      format: function (v) { return Math.round(v * 100) + '%'; },
      hint: 'Opacity of the translucent panels and navigation.',
      onChange: updateAppearancePreview
    });
    addField(surfaces, {
      label: 'Blur intensity', type: 'range', min: 0, max: 40, step: 1, value: a.blur,
      format: function (v) { return v + 'px'; }, hint: 'Backdrop blur applied to glass surfaces.',
      onChange: updateAppearancePreview
    });
    addField(surfaces, {
      label: 'Border radius', type: 'range', min: 0, max: 40, step: 1, value: a.radius,
      format: function (v) { return v + 'px'; }, onChange: updateAppearancePreview
    });
    addField(surfaces, {
      label: 'Card shadow', type: 'range', min: 0, max: 80, step: 1, value: a.shadow,
      format: function (v) { return v + 'px'; }, onChange: updateAppearancePreview
    });
    root.appendChild(card('Glass & surfaces', 'Depth and softness', null, [surfaces]));

    var type = h('div', { class: 'a-fields' });
    var fontOptions = [
      'Manrope', 'Inter', 'Space Grotesk', 'Sora', 'DM Sans',
      'DM Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Great Vibes'
    ].map(function (f) { return { value: f, label: f }; });

    addField(type, { label: 'Display font', type: 'select', path: 'appearance.fontDisplay', value: a.fontDisplay, options: fontOptions, onChange: updateAppearancePreview });
    addField(type, { label: 'Body font', type: 'select', path: 'appearance.fontBody', value: a.fontBody, options: fontOptions, onChange: updateAppearancePreview });
    addField(type, { label: 'Mono font', type: 'select', path: 'appearance.fontMono', value: a.fontMono, options: fontOptions, onChange: updateAppearancePreview });
    addField(type, {
      label: 'Base font size', type: 'range', min: 0.8, max: 1.4, step: 0.01, value: a.fontScale,
      format: function (v) { return Math.round(v * 100) + '%'; },
      hint: 'Scales body text and spacing across the public site.',
      onChange: updateAppearancePreview
    });
    addField(type, {
      label: 'Heading scale', type: 'range', min: 0.7, max: 1.5, step: 0.01, value: a.headingScale,
      format: function (v) { return Math.round(v * 100) + '%'; },
      onChange: updateAppearancePreview
    });
    root.appendChild(card('Typography', 'Fonts & scale', null, [type]));

    root.appendChild(h('div', { class: 'a-note' }, [
      h('span', { class: 'a-note-ico', text: 'i' }),
      h('span', null, [
        'Fonts are loaded from Google Fonts. Only ',
        h('b', { text: 'Manrope, Inter, Space Grotesk, Sora, DM Sans, DM Mono, JetBrains Mono' }),
        ' are pre-loaded; other names fall back to the system font until you add them to the font link in index.html.'
      ])
    ]));

    root.appendChild(h('div', { class: 'a-data-actions', style: { marginTop: '16px' } }, [
      h('button', {
        class: 'a-btn ghost', type: 'button', text: 'Reset to current preset',
        onClick: function () { applyPreset(working.appearance.mode); }
      })
    ]));
  }

  function swatch(label, key) {
    return h('span', { class: 'a-swatch' }, [
      h('i', { dataset: { swatchKey: key } }),
      label
    ]);
  }

  function applyPreset(mode) {
    var preset = C.THEME_PRESETS[mode] || C.THEME_PRESETS.dark;
    Object.keys(preset).forEach(function (key) { working.appearance[key] = preset[key]; });
    markDirty();
    rebuildPanel('appearance');
    pushPreview();
    toast((mode === 'light' ? 'Light' : 'Dark') + ' preset applied', 'success');
  }

  function updateAppearancePreview() {
    var box = $('#appearancePreview');
    if (!box) return;
    var a = working.appearance;

    box.style.background = a.background;
    box.style.color = a.text;
    box.style.borderRadius = a.radius + 'px';
    box.style.borderColor = a.accent2;
    box.style.fontFamily = "'" + a.fontBody + "', system-ui, sans-serif";

    var heading = box.querySelector('h3');
    if (heading) {
      heading.style.fontFamily = "'" + a.fontDisplay + "', system-ui, sans-serif";
      heading.style.fontSize = (1.9 * a.headingScale).toFixed(2) + 'rem';
    }
    var em = box.querySelector('h3 em');
    if (em) {
      em.style.background = 'linear-gradient(100deg,' + a.accent2 + ',' + a.accent3 + ')';
      em.style.webkitBackgroundClip = 'text';
      em.style.backgroundClip = 'text';
      em.style.color = 'transparent';
    }
    var glass = box.querySelector('.tp-card');
    if (glass) {
      var alpha = a.mode === 'light' ? Math.min(0.95, 0.45 + a.glassOpacity) : a.glassOpacity;
      glass.style.background = 'rgba(255,255,255,' + alpha + ')';
      glass.style.borderColor = a.accent2;
      glass.style.borderRadius = Math.round(a.radius * 0.64) + 'px';
      glass.style.backdropFilter = 'blur(' + a.blur + 'px)';
      glass.style.webkitBackdropFilter = 'blur(' + a.blur + 'px)';
      glass.style.boxShadow = '0 ' + a.shadow + 'px ' + (a.shadow * 3) + 'px rgba(0,0,0,' + (a.mode === 'light' ? 0.12 : 0.35) + ')';
    }
    var solid = box.querySelector('.tp-btn.solid');
    if (solid) {
      solid.style.background = a.accent;
      solid.style.borderColor = a.accent;
      solid.style.color = contrastColor(a.accent);
    }
    var outline = box.querySelector('.tp-btn:not(.solid)');
    if (outline) { outline.style.color = a.accent2; outline.style.borderColor = a.accent2; }

    $$('[data-swatch-key]').forEach(function (node) {
      var key = node.dataset.swatchKey;
      node.style.background = a[key];
    });
  }

  /* ==========================================================
     ANIMATIONS
     ========================================================== */
  function buildAnimations(root) {
    var a = working.animations;

    var toggles = h('div', { class: 'a-fields' });
    var defs = [
      ['scrollReveal', 'Scroll reveal', 'Elements fade and build into view as the page scrolls.'],
      ['loadingAnimation', 'Self-building intro', 'The hero constructs itself on first load.'],
      ['pageTransitions', 'Page transitions', 'Fade/slide the page shell in on load.'],
      ['scrollProgress', 'Scroll progress bar', 'Thin gradient bar at the top of the page.'],
      ['hoverEffects', 'Hover effects', 'Lift and colour transitions on cards and buttons.'],
      ['parallax', 'Parallax orb', 'The hero orb drifts as you scroll (desktop only).'],
      ['magnetic', 'Magnetic buttons', 'Cursor-following highlight on buttons.'],
      ['cursor', 'Custom cursor', 'Desktop cursor follower.'],
      ['counters', 'Animated counters', 'Numbers count up when they enter view.']
    ];
    defs.forEach(function (d) {
      addField(toggles, {
        type: 'toggle', label: d[1], desc: d[2], full: true,
        value: a[d[0]],
        onChange: function (v) { working.animations[d[0]] = v; pushPreviewSoon(); }
      });
    });
    root.appendChild(card('Motion toggles', 'Respects reduced motion', null, [toggles]));

    var demoEl = h('div', { class: 'a-anim-box', id: 'animDemo', text: 'BUILDING…' });
    function updateDemo() {
      if (!demoEl) return;
      demoEl.style.setProperty('--demo-duration', working.animations.duration + 'ms');
      demoEl.style.setProperty('--demo-delay', working.animations.delay + 'ms');
    }
    function replay() {
      updateDemo();
      demoEl.classList.remove('play');
      void demoEl.offsetWidth;
      demoEl.classList.add('play');
    }

    var timing = h('div', { class: 'a-fields' });
    addField(timing, {
      label: 'Animation duration', type: 'range', min: 0, max: 3000, step: 50, value: a.duration,
      format: function (v) { return v + ' ms'; },
      hint: 'Base duration for reveal, page and AI transitions.',
      onChange: function (v) { working.animations.duration = v; updateDemo(); }
    });
    addField(timing, {
      label: 'Animation delay', type: 'range', min: 0, max: 1000, step: 10, value: a.delay,
      format: function (v) { return v + ' ms'; },
      onChange: function (v) { working.animations.delay = v; updateDemo(); }
    });
    addField(timing, {
      label: 'Stagger between cards', type: 'range', min: 0, max: 500, step: 10, value: a.stagger,
      format: function (v) { return v + ' ms'; },
      onChange: function (v) { working.animations.stagger = v; }
    });
    addField(timing, {
      label: 'Reduced motion', type: 'select', value: a.reducedMotion,
      options: [
        { value: 'system', label: 'Respect system preference (recommended)' },
        { value: 'force-off', label: 'Force animations off' }
      ],
      hint: 'When the visitor asks for reduced motion, the site disables reveal, parallax and the intro.',
      onChange: function (v) { working.animations.reducedMotion = v; }
    });
    root.appendChild(card('Timing', 'Fine tune the motion', null, [timing]));

    root.appendChild(card('Preview', 'Replay the reveal', [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Replay', onClick: replay })
    ], [h('div', { class: 'a-anim-demo' }, [demoEl])]));
    updateDemo();

    root.appendChild(isReducedMotion()
      ? h('div', { class: 'a-note warn' }, [
        h('span', { class: 'a-note-ico', text: '!' }),
        h('span', null, ['Your system currently requests reduced motion, so the live site will disable animations for you regardless of these settings.'])
      ])
      : h('div', { class: 'a-note' }, [
        h('span', { class: 'a-note-ico', text: 'i' }),
        h('span', null, ['These settings are saved with the site. The public page always honours the visitor’s operating-system reduced-motion preference.'])
      ]));
  }

  BUILDERS.media = buildMedia;
  BUILDERS.skills = buildSkills;
  BUILDERS.appearance = buildAppearance;
  BUILDERS.animations = buildAnimations;

  /* ==========================================================
     CONTACT & SOCIAL
     ========================================================== */
  function buildContact(root) {
    var emailGrid = h('div', { class: 'a-fields' });
    addField(emailGrid, {
      label: 'Email address', type: 'email', required: true, maxlength: 160,
      getValue: function () { return working.profile.email; },
      setValue: function (v) { working.profile.email = v; working.social.email = v; },
      validate: emailValidator,
      hint: 'Shown in the public contact section and used by the “Start a project” button.'
    });
    addField(emailGrid, {
      label: 'Location / availability line', type: 'text', path: 'profile.location', maxlength: 160,
      placeholder: 'Available worldwide · Remote',
      hint: 'A short location or availability caption.'
    });
    root.appendChild(card('Email', 'Primary contact', null, [emailGrid]));

    var socialGrid = h('div', { class: 'a-fields' });
    [
      ['instagram', 'Instagram'],
      ['youtube', 'YouTube'],
      ['facebook', 'Facebook'],
      ['behance', 'Behance'],
      ['dribbble', 'Dribbble']
    ].forEach(function (pair) {
      addField(socialGrid, {
        label: pair[1], type: 'url', path: 'social.' + pair[0],
        placeholder: 'https://' + pair[0] + '.com/yourname',
        validate: urlValidator,
        hint: 'Leave empty to hide this link on the site.'
      });
    });
    root.appendChild(card('Social profiles', 'Shown as links', [
      h('button', {
        class: 'a-btn tiny ghost', type: 'button', text: 'Update preview',
        onClick: function () { pushPreview(); toast('Preview updated', 'info'); }
      })
    ], [socialGrid]));

    var otherHost = h('div', { class: 'a-list' });
    listEditor(otherHost, {
      items: function () { return working.social.other; },
      max: 12,
      addLabel: 'Add link',
      addItem: function () { return { label: '', url: '' }; },
      renderItem: function (fields, item) {
        fields.appendChild(listInput({
          value: item.label, placeholder: 'Label (e.g. X / Twitter)',
          'aria-label': 'Link label', maxlength: '60'
        }, function (v) { item.label = v; markDirty(); }));
        fields.appendChild(listInput({
          value: item.url, placeholder: 'https://…',
          'aria-label': 'Link URL', maxlength: '300'
        }, function (v) { item.url = v; markDirty(); }));
      }
    });
    root.appendChild(card('Other links', 'Anything else', null, [
      h('p', {
        class: 'a-field-hint',
        text: 'Extra profiles such as X, Vimeo or a personal site. Empty labels and unsafe URLs are dropped when you save.'
      }),
      otherHost
    ]));
  }

  /* ==========================================================
     SEO
     ========================================================== */
  function buildSeo(root) {
    var urlNode = h('div', { class: 'a-serp-url' });
    var titleNode = h('div', { class: 'a-serp-title' });
    var descNode = h('p', { class: 'a-serp-desc' });
    var ogImg = h('div', { class: 'a-og-image' });
    var ogTitle = h('div', { class: 'a-og-title' });
    var ogDesc = h('div', { class: 'a-og-desc' });
    var ogDomain = h('div', { class: 'a-og-domain' });
    var countBadge = h('span', { class: 'a-muted' });

    function domainOf() {
      var raw = String(working.seo.siteUrl || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      return raw ? raw.split('/')[0] : 'mahin.design';
    }

    function update() {
      var seo = working.seo;
      var title = seo.title || working.profile.displayName || 'Untitled';
      var desc = seo.description || 'Add a meta description to control how this site appears in search and on social.';
      var domain = domainOf();
      urlNode.textContent = domain + ' ›';
      titleNode.textContent = title;
      descNode.textContent = desc;
      ogDomain.textContent = domain;
      ogTitle.textContent = title;
      ogDesc.textContent = desc;
      countBadge.textContent = desc.length + ' description characters';
      clear(ogImg);
      var src = C.resolveAsset(seo.ogImage, working);
      if (src) ogImg.appendChild(h('img', { src: src, alt: 'Sharing image preview' }));
      else ogImg.appendChild(h('span', { text: '1200 × 630 sharing image' }));
    }

    var grid = h('div', { class: 'a-fields' });
    addField(grid, {
      label: 'Website title', type: 'text', path: 'seo.title', maxlength: 120, counter: true,
      onChange: update, hint: 'Shown in the browser tab and search results. Around 60 characters reads best.'
    });
    addField(grid, {
      label: 'Meta description', type: 'textarea', path: 'seo.description', rows: 3, maxlength: 300, counter: true,
      onChange: update, hint: 'A one or two sentence summary used by search engines and social shares.'
    });
    addField(grid, {
      label: 'Keywords', type: 'text', path: 'seo.keywords', maxlength: 300,
      hint: 'Comma-separated topics, e.g. video editor, motion design, branding.'
    });
    addField(grid, {
      label: 'Canonical site URL', type: 'url', path: 'seo.siteUrl', validate: urlValidator,
      placeholder: 'https://mahin.design', hint: 'The public address of the finished site. Used for sharing links.'
    });
    addField(grid, {
      label: 'Twitter / X handle', type: 'text', path: 'seo.twitterHandle', maxlength: 40,
      placeholder: '@mahin', hint: 'Credits the site when shared on X.'
    });
    root.appendChild(card('Search & social text', 'Applies on save', [countBadge], [grid]));

    var media = h('div', { class: 'a-fields' });
    addField(media, {
      label: 'Open Graph image', type: 'media', path: 'seo.ogImage', onChange: update,
      emptyLabel: '— No sharing image —', hint: 'Ideally 1200 × 630. Upload one to the media library first.'
    });
    addField(media, {
      label: 'Favicon', type: 'media', path: 'seo.favicon', onChange: update,
      emptyLabel: '— No favicon —', hint: 'A small square PNG or WebP, 32 × 32 or larger.'
    });
    root.appendChild(card('Images', 'Sharing & icon', null, [media]));

    root.appendChild(card('Preview', 'How it could look', null, [
      h('div', { class: 'a-group' }, [
        h('div', { class: 'a-group-title', text: 'Google-style result' }),
        h('div', { class: 'a-serp' }, [urlNode, titleNode, descNode])
      ]),
      h('div', { class: 'a-group' }, [
        h('div', { class: 'a-group-title', text: 'Social sharing card' }),
        h('div', { class: 'a-og-card' }, [
          ogImg,
          h('div', { class: 'a-og-body' }, [ogDomain, ogTitle, ogDesc])
        ])
      ])
    ]));

    update();
  }

  /* ==========================================================
     DATA & BACKUP
     ========================================================== */
  function buildData(root) {
    root.appendChild(card('Storage', 'This browser only', null, [
      h('div', { class: 'a-meter' }, [h('span', { 'data-storage-meter': '' })]),
      h('p', { class: 'a-field-hint', 'data-storage-text': '', text: '' }),
      h('p', {
        class: 'a-field-hint',
        text: 'Everything you edit is stored in this browser under the key “' + C.STORAGE_KEY + '”. Nothing is uploaded to a server.'
      })
    ]));

    var jsonFile = h('input', { type: 'file', class: 'a-file-input', accept: '.json,application/json' });
    jsonFile.addEventListener('change', function () {
      var f = jsonFile.files && jsonFile.files[0];
      if (f) readJsonFile(f);
      jsonFile.value = '';
    });

    var importDrop = h('div', {
      class: 'a-dropzone', role: 'button', tabindex: '0',
      'aria-label': 'Import configuration: drop a JSON file or press Enter to browse'
    }, [
      h('span', { class: 'a-drop-ico', 'aria-hidden': 'true', text: '⇩' }),
      h('strong', { text: 'Drop a backup JSON here, or click to browse' }),
      h('span', { text: 'Replaces all content in this browser after confirmation' })
    ]);
    importDrop.addEventListener('click', function () { jsonFile.click(); });
    importDrop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); importDrop.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      importDrop.addEventListener(ev, function (e) { e.preventDefault(); importDrop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      importDrop.addEventListener(ev, function (e) { e.preventDefault(); importDrop.classList.remove('dragover'); });
    });
    importDrop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readJsonFile(f);
    });
    importDrop.appendChild(jsonFile);

    function dbtn(label, kind, handler) {
      var btn = h('button', { class: 'a-btn ' + (kind || 'ghost'), type: 'button', text: label });
      btn.addEventListener('click', handler);
      return btn;
    }

    root.appendChild(card('Save, export & import', 'Portable JSON', null, [
      h('div', { class: 'a-data-actions' }, [
        dbtn('Save changes now', 'primary', function () { saveNow({ silent: false }); }),
        dbtn('Download backup', 'ghost', exportNow),
        dbtn('Copy JSON', 'ghost', copyJSON),
        dbtn('Import from file', 'ghost', function () { jsonFile.click(); }),
        dbtn('Reset to defaults', 'danger', resetAll)
      ]),
      h('div', { style: { marginTop: '16px' } }, [importDrop]),
      h('p', {
        class: 'a-field-hint',
        text: 'Export writes a portable JSON file with your content, appearance and settings (uploaded media is embedded). Keep a recent copy before big changes.'
      })
    ]));

    root.appendChild(card('How this works', 'Read this', null, [
      h('div', { class: 'a-note' }, [
        h('span', { class: 'a-note-ico', text: 'i' }),
        h('div', null, [
          h('strong', { text: 'Local to this browser' }),
          h('p', { text: 'Saving here only affects the browser and device you are using. Another computer, another browser, or private mode will not see these changes, because localStorage is not shared. Export the JSON and import it to move your content.' })
        ])
      ]),
      h('div', { class: 'a-note warn' }, [
        h('span', { class: 'a-note-ico', text: '!' }),
        h('div', null, [
          h('strong', { text: 'This is not real security' }),
          h('p', { text: 'This admin page has no login. Anyone who can open the site on this device can open the admin too. Do not put private or sensitive information in these fields, and never add passwords or API keys to the JavaScript.' })
        ])
      ]),
      h('div', { class: 'a-note danger' }, [
        h('span', { class: 'a-note-ico', text: '✕' }),
        h('div', null, [
          h('strong', { text: 'For a site that publishes to everyone' }),
          h('p', { text: 'Showing the same content to every visitor needs a backend or CMS with real authentication and a database (for example a Node/Express API, Supabase, Firebase or a headless CMS). This local panel is a design tool, not a hosting service.' })
        ])
      ])
    ]));

    updateStorageMeter();
  }

  /* ==========================================================
     EXPORT / IMPORT / RESET
     ========================================================== */
  function exportNow() {
    try {
      var json = C.exportJSON(working);
      if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        toast('Downloads are unavailable here. Use “Copy JSON” instead.', 'warn', 5000);
        return;
      }
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: 'mahin-portfolio-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('Backup downloaded', 'success');
    } catch (e) {
      toast('Export failed: ' + (e && e.message ? e.message : 'unknown error'), 'error', 5000);
    }
  }

  function copyJSON() {
    var json = C.exportJSON(working);
    function fallback() {
      var ta = h('textarea', { class: 'a-textarea code', 'aria-label': 'Configuration JSON' });
      ta.value = json;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Configuration copied to the clipboard' : 'Copy blocked — use “Download backup” instead', ok ? 'success' : 'warn', 4500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        toast('Configuration copied to the clipboard', 'success');
      }).catch(fallback);
    } else fallback();
  }

  function readJsonFile(file) {
    if (!file) return;
    if (file.size > C.MAX_TOTAL_BYTES * 2) {
      toast('That file is too large to be a portfolio backup.', 'error', 5000);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { importFromText(String(reader.result)); };
    reader.onerror = function () { toast('Could not read that file.', 'error'); };
    reader.readAsText(file);
  }

  function importFromText(text) {
    var res = C.importJSON(text);
    if (!res.ok) {
      toast(res.errors[0] || 'That file could not be imported.', 'error', 6000);
      return;
    }
    var warnings = res.errors || [];
    confirmDialog({
      title: 'Import this backup?',
      message: 'This replaces everything currently in the editor with the contents of the file, then saves it to this browser. Unsaved changes will be lost.',
      confirmLabel: 'Import & replace'
    }).then(function (ok) {
      if (!ok) return;
      working = res.config;
      working.updatedAt = null;
      markDirty();
      saveNow({ silent: false });
      rebuildAllPanels();
      activatePanel('dashboard', true);
      if (warnings.length) toast(warnings[0], 'warn', 6000);
      toast('Backup imported', 'success');
    });
  }

  function resetAll() {
    confirmDialog({
      title: 'Reset to the original content?',
      message: 'Every change you have made — profile, projects, skills, media, appearance and settings — will be replaced with the built-in defaults. Export a backup first if you might want them back.',
      confirmLabel: 'Reset everything'
    }).then(function (ok) {
      if (!ok) return;
      var res = C.save(C.deepClone(C.DEFAULT_CONFIG));
      working = res.ok ? res.config : C.deepClone(C.DEFAULT_CONFIG);
      savedSignature = signature(working);
      dirty = false;
      updateStatus('saved');
      rebuildAllPanels();
      activatePanel('dashboard', true);
      toast('Reset to defaults', 'success');
    });
  }

  BUILDERS.contact = buildContact;
  BUILDERS.seo = buildSeo;
  BUILDERS.data = buildData;

})();