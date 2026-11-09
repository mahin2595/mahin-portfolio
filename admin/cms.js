/* ============================================================
   MAHIN STUDIO — SUPABASE CMS DASHBOARD  (/admin/)
   ------------------------------------------------------------
   Authentication + content management against Supabase.

   • Auth is real (Supabase Auth: email/password, session
     persistence, password recovery). It is NOT a JS password check.
   • Authorization is enforced by Row Level Security in the
     database and Storage. This frontend only decides what UI to
     show; it never assumes the client is trusted.
   • Every value from the database is rendered with textContent /
     DOM nodes, never innerHTML.
   ============================================================ */
(function () {
  'use strict';

  var C = window.MahinConfig;
  var CMS = window.MahinCMS;
  var SB = window.MahinSupabase;

  if (!C || !CMS) {
    document.body.innerHTML = '<div style="padding:40px;font-family:system-ui;color:#fff;background:#0a0d14;min-height:100vh">' +
      'The CMS could not start because config.js or cms.js failed to load. ' +
      'Make sure all files were deployed together.</div>';
    return;
  }

  /* ==========================================================
     SMALL DOM HELPERS
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

  function message(error) {
    if (!error) return 'Something went wrong.';
    if (typeof error === 'string') return error;
    return error.message || error.error_description || 'Something went wrong.';
  }

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

  function saveLabel(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.rest) btn.dataset.rest = btn.textContent;
      btn.disabled = true;
      clear(btn);
      btn.appendChild(h('span', { class: 'cms-spinner', 'aria-hidden': 'true' }));
      btn.appendChild(document.createTextNode(label || 'Working…'));
    } else {
      btn.disabled = false;
      var rest = btn.dataset.rest;
      if (rest) { clear(btn); btn.textContent = rest; }
    }
  }

  /* ==========================================================
     TOASTS + CONFIRM DIALOG
     ========================================================== */
  var TOAST_ICON = { success: '✓', error: '✕', warn: '!', info: 'i' };

  function toast(text, type, ms) {
    var wrap = $('#cmsToasts');
    if (!wrap) return;
    var node = h('div', { class: 'a-toast ' + (type || 'info'), role: 'status' }, [
      h('span', { class: 'a-toast-ico', 'aria-hidden': 'true', text: TOAST_ICON[type] || 'i' }),
      h('span', { text: text })
    ]);
    wrap.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, ms || 3800);
  }

  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = $('#cmsModalRoot');
      if (!root) { resolve(window.confirm(opts.message || 'Are you sure?')); return; }
      var titleEl = $('#cmsModalTitle');
      var bodyEl = $('#cmsModalBody');
      var confirmBtn = $('#cmsModalConfirm');
      titleEl.textContent = opts.title || 'Confirm';
      bodyEl.textContent = opts.message || '';
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      root.hidden = false;
      var opener = document.activeElement;
      confirmBtn.focus();

      function cleanup() {
        confirmBtn.removeEventListener('click', onConfirm);
        root.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
      }
      function close(value) {
        root.hidden = true;
        cleanup();
        if (opener && opener.focus) opener.focus();
        resolve(value);
      }
      function onConfirm() { close(true); }
      function onBackdrop(event) { if (event.target.hasAttribute('data-close-modal')) close(false); }
      function onKey(event) { if (event.key === 'Escape') close(false); }

      confirmBtn.addEventListener('click', onConfirm);
      root.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ==========================================================
     STATE
     ========================================================== */
  var state = {
    session: null,
    user: null,
    panel: 'dashboard',
    data: { projects: [], skills: [], socialLinks: [], settings: null, errors: [] },
    editingProject: null,   // project id | 'new' | null
    draftProject: null,
    mediaItems: null,
    mediaLoading: false,
    siteDraft: null,
    siteDirty: false,
    activeSiteTab: 'profile',
    search: ''
  };

  var NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-11h6V4h-6v5Z' },
    { id: 'projects', label: 'Projects', icon: 'M12 3 3 8l9 5 9-5-9-5Zm-9 10 9 5 9-5M3 15.5l9 5 9-5' },
    { id: 'skills', label: 'Skills', icon: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z' },
    { id: 'social', label: 'Social links', icon: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 8a5 5 0 0 1-7 0 5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 0' },
    { id: 'site', label: 'Profile & settings', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z' },
    { id: 'media', label: 'Media library', icon: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' }
  ];

  function navItem(id) { return NAV.filter(function (n) { return n.id === id; })[0]; }

  function iconSvg(path, label) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }

  /* ==========================================================
     AUTH SCREEN
     ========================================================== */
  function showNotice(text, type) {
    var box = $('#authNotice');
    if (!box) return;
    box.hidden = !text;
    box.className = 'cms-notice ' + (type || 'info');
    box.textContent = text || '';
  }

  function setConfigState() {
    var el = $('#configState');
    if (!el) return;
    if (CMS.isConfigured()) {
      el.className = 'cms-config-state ok';
      el.textContent = 'Supabase connected';
    } else {
      el.className = 'cms-config-state warn';
      el.textContent = 'Not configured';
    }
  }

  var AUTH_FORMS = ['loginForm', 'forgotForm', 'resetForm'];

  function showAuth(mode) {
    var auth = $('#authScreen');
    var app = $('#appScreen');
    if (auth) auth.hidden = false;
    if (app) app.hidden = true;
    var target = mode === 'forgot' ? 'forgotForm' : (mode === 'reset' ? 'resetForm' : 'loginForm');
    AUTH_FORMS.forEach(function (id) {
      var form = document.getElementById(id);
      if (form) form.hidden = id !== target;
    });
    showNotice('', 'info');
    var form = document.getElementById(target);
    var first = form && form.querySelector('input');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function showApp() {
    var auth = $('#authScreen');
    var app = $('#appScreen');
    if (auth) auth.hidden = true;
    if (app) app.hidden = false;
    var account = $('#cmsAccount');
    if (account) {
      var email = (state.user && state.user.email) || '';
      account.textContent = email;
      account.title = 'Signed in as ' + email;
    }
    buildNav();
    loadAll();
  }

  function initAuth() {
    setConfigState();
    if (!CMS.isConfigured()) {
      showAuth('login');
      showNotice('Supabase is not configured yet. Open supabase.config.js and replace the project URL and publishable key, then run supabase/schema.sql. See README.md → "Supabase setup".', 'info');
    }

    CMS.getClient().then(function (client) {
      if (!client) {
        if (CMS.isConfigured()) showNotice(SB && SB.getLastError ? SB.getLastError() : 'Could not reach Supabase.', 'error');
        return;
      }
      state.client = client;

      // Subscribe first so a recovery link is caught even on first load.
      if (client.auth && client.auth.onAuthStateChange) {
        client.auth.onAuthStateChange(function (event, session) {
          if (event === 'PASSWORD_RECOVERY') { showAuth('reset'); return; }
          if (event === 'SIGNED_OUT') { state.session = null; state.user = null; showAuth('login'); return; }
          if (session) {
            state.session = session;
            state.user = session.user || (session.data && session.data.user) || null;
            if ($('#appScreen') && $('#appScreen').hidden) showApp();
          }
        });
      }

      client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (session) {
          state.session = session;
          state.user = session.user || null;
          if (/type=recovery/.test(window.location.hash)) showAuth('reset');
          else showApp();
        } else {
          showAuth('login');
        }
      }).catch(function (err) {
        showNotice(message(err), 'error');
        showAuth('login');
      });
    });

    bindAuthForms();
  }

  function bindAuthForms() {
    var loginForm = $('#loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = ($('#loginEmail').value || '').trim();
        var password = $('#loginPassword').value || '';
        if (!email || !password) { showNotice('Enter your email and password.', 'error'); return; }
        var btn = $('#loginSubmit');
        saveLabel(btn, true, 'Signing in…');
        CMS.getClient().then(function (client) {
          return client.auth.signInWithPassword({ email: email, password: password });
        }).then(function (res) {
          saveLabel(btn, false);
          if (res && res.error) { showNotice(message(res.error), 'error'); return; }
          showNotice('', 'info');
          // onAuthStateChange shows the dashboard.
        }).catch(function (err) {
          saveLabel(btn, false);
          showNotice(message(err), 'error');
        });
      });
    }

    var forgotForm = $('#forgotForm');
    if (forgotForm) {
      forgotForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = ($('#forgotEmail').value || '').trim();
        if (!email) { showNotice('Enter the administrator email address.', 'error'); return; }
        var btn = $('#forgotSubmit');
        saveLabel(btn, true, 'Sending…');
        CMS.getClient().then(function (client) {
          return client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
        }).then(function (res) {
          saveLabel(btn, false);
          if (res && res.error) { showNotice(message(res.error), 'error'); return; }
          showNotice('Recovery email sent. Open the link in it to choose a new password.', 'success');
        }).catch(function (err) {
          saveLabel(btn, false);
          showNotice(message(err), 'error');
        });
      });
    }

    var resetForm = $('#resetForm');
    if (resetForm) {
      resetForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var pw = $('#resetPassword').value || '';
        var confirm = $('#resetConfirm').value || '';
        if (pw.length < 8) { showNotice('Use at least 8 characters.', 'error'); return; }
        if (pw !== confirm) { showNotice('The two passwords do not match.', 'error'); return; }
        var btn = $('#resetSubmit');
        saveLabel(btn, true, 'Updating…');
        CMS.getClient().then(function (client) {
          return client.auth.updateUser({ password: pw });
        }).then(function (res) {
          saveLabel(btn, false);
          if (res && res.error) { showNotice(message(res.error), 'error'); return; }
          showNotice('Password updated.', 'success');
          history.replaceState(null, '', location.pathname + location.search);
          showApp();
          toast('Password updated', 'success');
        }).catch(function (err) {
          saveLabel(btn, false);
          showNotice(message(err), 'error');
        });
      });
    }

    $$('[data-auth-back]').forEach(function (btn) {
      btn.addEventListener('click', function () { showAuth('login'); });
    });
    var forgotLink = $('#forgotLink');
    if (forgotLink) forgotLink.addEventListener('click', function () { showAuth('forgot'); });

    var signOut = $('#cmsSignOutBtn');
    if (signOut) {
      signOut.addEventListener('click', function () {
        confirmDialog({
          title: 'Sign out?',
          message: 'You will need to sign in again to manage content.',
          confirmLabel: 'Sign out'
        }).then(function (ok) {
          if (!ok) return;
          var client = state.client || null;
          if (!client) { showAuth('login'); return; }
          client.auth.signOut().then(function () {
            state.session = null; state.user = null;
            showAuth('login');
            toast('Signed out', 'info');
          });
        });
      });
    }
  }

  /* ==========================================================
     DATA LOADING + CONNECTION STATUS
     ========================================================== */
  function setConnection(kindState, text) {
    var el = $('#cmsConnection');
    if (!el) return;
    el.dataset.state = kindState || 'ok';
    var label = $('#cmsConnectionText');
    if (label) label.textContent = text;
  }

  function loadAll(opts) {
    opts = opts || {};
    setConnection('loading', 'Syncing…');
    var main = $('#cmsPanels');
    if (main && opts.skeleton !== false && state.panel !== 'dashboard') {
      clear(main);
      main.appendChild(skeletonPanel());
    }
    return CMS.fetchAdminData().then(function (data) {
      state.data = data;
      state.siteDraft = data.settings ? deepClone(data.settings) : null;
      state.siteDirty = false;
      var warnings = data.errors && data.errors.length;
      setConnection(warnings ? 'warn' : 'ok', warnings ? 'Connected — check warnings' : 'Connected');
      if (warnings) data.errors.slice(0, 3).forEach(function (e) { toast(e, 'error', 7000); });
      updateNavCounts();
      renderPanel(state.panel);
      return data;
    });
  }

  function skeletonPanel() {
    return h('div', { class: 'a-panel active' }, [
      h('div', { class: 'cms-skeleton', style: { height: '40px', maxWidth: '260px' } }),
      h('div', { class: 'cms-skeleton' }),
      h('div', { class: 'cms-skeleton' }),
      h('div', { class: 'cms-skeleton' })
    ]);
  }

  function updateNavCounts() {
    var counts = {
      projects: state.data.projects.length,
      skills: state.data.skills.length,
      social: state.data.socialLinks.length
    };
    $$('#cmsNav .a-nav-item').forEach(function (node) {
      var badge = node.querySelector('.cms-nav-count');
      var key = node.dataset.panel;
      if (!badge) return;
      if (counts[key] === undefined) { badge.hidden = true; return; }
      badge.hidden = false;
      badge.textContent = String(counts[key]);
    });
  }

  /* ==========================================================
     NAVIGATION / PANELS
     ========================================================== */
  function panelMeta(id) {
    var found = navItem(id);
    return found || NAV[0];
  }

  function buildNav() {
    var nav = $('#cmsNav');
    if (!nav) return;
    clear(nav);
    NAV.forEach(function (item) {
      var btn = h('button', {
        class: 'a-nav-item' + (item.id === state.panel ? ' active' : ''),
        type: 'button',
        dataset: { panel: item.id },
        'aria-current': item.id === state.panel ? 'page' : null
      });
      btn.appendChild(iconSvg(item.icon, item.label));
      btn.appendChild(h('span', { text: item.label }));
      btn.appendChild(h('span', { class: 'cms-nav-count', hidden: true }));
      btn.addEventListener('click', function () { activatePanel(item.id); });
      nav.appendChild(btn);
    });
  }

  function activatePanel(id, opts) {
    opts = opts || {};
    state.panel = id;
    state.editingProject = null;
    $$('#cmsNav .a-nav-item').forEach(function (node) {
      var on = node.dataset.panel === id;
      node.classList.toggle('active', on);
      if (on) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
    renderPanel(id);
    closeDrawer();
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: opts.instant ? 'auto' : 'smooth' });
  }

  function renderPanel(id) {
    var main = $('#cmsPanels');
    if (!main) return;
    clear(main);
    main.appendChild(panelFrame(id));
  }

  function panelFrame(id) {
    var meta = panelMeta(id);
    var section = h('section', { class: 'a-panel active', dataset: { panel: id } });
    section.appendChild(h('div', { class: 'a-panel-head' }, [
      h('div', null, [
        h('div', { class: 'a-eyebrow', text: 'CMS / ' + meta.label }),
        h('h2', { text: meta.label })
      ])
    ]));
    var body = h('div', { class: 'a-panel-body' });
    section.appendChild(body);

    var builders = {
      dashboard: buildDashboard,
      projects: buildProjects,
      skills: buildSkills,
      social: buildSocial,
      site: buildSite,
      media: buildMedia
    };
    (builders[id] || buildDashboard)(body);
    return section;
  }

  /* Drawer (mobile) */
  function toggleDrawer() {
    var sidebar = $('#cmsSidebar');
    var scrim = $('#cmsScrim');
    if (!sidebar) return;
    var open = sidebar.classList.toggle('open');
    if (scrim) scrim.hidden = !open;
    var btn = $('#cmsDrawerBtn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }
  function closeDrawer() {
    var sidebar = $('#cmsSidebar');
    var scrim = $('#cmsScrim');
    if (sidebar) sidebar.classList.remove('open');
    if (scrim) scrim.hidden = true;
    var btn = $('#cmsDrawerBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /* ==========================================================
     SHARED FORM HELPERS
     ========================================================== */
  var fieldSeq = 0;

  function field(labelText, control, hint) {
    if (!control.id) control.id = 'cms-f' + (++fieldSeq);
    var wrap = h('div', { class: 'a-field' }, [
      h('label', { class: 'a-field-label', for: control.id, text: labelText }),
      control
    ]);
    if (hint) wrap.appendChild(h('p', { class: 'a-field-hint', text: hint }));
    return wrap;
  }

  function fieldFull(labelText, control, hint) {
    var node = field(labelText, control, hint);
    node.classList.add('full');
    return node;
  }

  function input(attrs) { return h('input', Object.assign({ class: 'a-input', type: 'text' }, attrs || {})); }
  function textarea(attrs) { return h('textarea', Object.assign({ class: 'a-textarea', rows: 3 }, attrs || {})); }

  function selectFrom(options, value, attrs) {
    var sel = h('select', Object.assign({ class: 'a-select' }, attrs || {}));
    options.forEach(function (opt) {
      sel.appendChild(h('option', { value: opt.value, text: opt.label, selected: String(opt.value) === String(value) }));
    });
    return sel;
  }

  function emptyState(title, sub) {
    return h('div', { class: 'a-empty' }, [
      h('strong', { text: title }),
      h('span', { text: sub })
    ]);
  }

  function miniBtn(label, title, onClick, opts) {
    opts = opts || {};
    var btn = h('button', {
      class: 'a-mini-btn' + (opts.danger ? ' danger' : ''),
      type: 'button', title: title, 'aria-label': title, text: label, disabled: opts.disabled
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function firstError(results) {
    var list = Array.isArray(results) ? results : [results];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].error) return list[i].error;
    }
    return null;
  }

  function badge(text, kind) {
    return h('span', { class: 'cms-badge' + (kind ? ' ' + kind : ''), text: text });
  }

  function categoryOptions() {
    var cats = (state.data.settings && state.data.settings.categories) || [];
    if (!cats.length) cats = [{ id: 'design', label: 'Design' }];
    return cats.map(function (c) { return { value: c.id, label: c.label }; });
  }

  function categoryLabel(id) {
    var found = categoryOptions().filter(function (c) { return c.value === id; })[0];
    return found ? found.label : (id || 'Uncategorised');
  }

  function statusBadge(status) {
    var published = status === 'published';
    return badge(published ? 'Published' : 'Draft', published ? 'published' : 'draft');
  }

  /* ==========================================================
     DASHBOARD
     ========================================================== */
  function statCard(label, value, foot) {
    var card = h('div', { class: 'cms-stat' }, [
      h('b', { text: String(value) }),
      h('span', { text: label })
    ]);
    if (foot) card.appendChild(h('p', { class: 'cms-media-sub', style: { marginTop: '8px' }, text: foot }));
    return card;
  }

  function buildDashboard(root) {
    var d = state.data;
    var published = d.projects.filter(function (p) { return p.status === 'published'; }).length;
    var drafts = d.projects.length - published;

    root.appendChild(h('div', { class: 'cms-stats' }, [
      statCard('Projects', d.projects.length, published + ' published · ' + drafts + ' draft'),
      statCard('Skills', d.skills.length, 'toolkit chips'),
      statCard('Social links', d.socialLinks.length, 'contact section'),
      statCard('Media files', state.mediaItems ? state.mediaItems.length : '—', 'in portfolio-media')
    ]));

    var quick = h('div', { class: 'a-card' }, [
      h('div', { class: 'a-card-head' }, [h('h2', { text: 'Quick actions' })]),
      h('div', { class: 'a-card-body' }, [
        h('div', { class: 'cms-quick' }, [
          quickAction('New project', 'Create a draft and fill in the details.', function () { activatePanel('projects'); startNewProject(); }),
          quickAction('Upload media', 'Add images to the portfolio-media bucket.', function () { activatePanel('media'); }),
          quickAction('Edit profile', 'Name, hero copy, about and statistics.', function () { activatePanel('site'); }),
          quickAction('Open public site', 'See the live result in a new tab.', function () { window.open('../index.html', '_blank', 'noopener'); })
        ])
      ])
    ]);
    root.appendChild(quick);

    var recent = h('div', { class: 'a-card' }, [
      h('div', { class: 'a-card-head' }, [h('h2', { text: 'Recent projects' })]),
      h('div', { class: 'a-card-body' })
    ]);
    var recentBody = recent.querySelector('.a-card-body');
    var ordered = projectListOrdered();
    if (!ordered.length) {
      recentBody.appendChild(emptyState('No projects yet', 'Add a project from the Projects panel.'));
    } else {
      ordered.slice(0, 5).forEach(function (p) {
        var row = h('div', { class: 'cms-item simple', style: { marginBottom: '10px' } }, [
          h('div', { class: 'cms-item-main' }, [
            h('p', { class: 'cms-item-title', text: p.title || 'Untitled' }),
            h('div', { class: 'cms-item-meta' }, [
              statusBadge(p.status),
              badge(categoryLabel(p.category)),
              p.featured ? badge('Featured', 'featured') : null
            ])
          ]),
          h('div', { class: 'cms-item-actions' }, [
            h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Edit', onClick: function () { activatePanel('projects'); openProjectEditor(p); } })
          ])
        ]);
        recentBody.appendChild(row);
      });
    }
    root.appendChild(recent);

    var info = h('div', { class: 'a-card' }, [
      h('div', { class: 'a-card-head' }, [h('h2', { text: 'Connection' })]),
      h('div', { class: 'a-card-body' }, [
        h('dl', { class: 'cms-kv' }, [
          kvRow('Signed in as', (state.user && state.user.email) || '—'),
          kvRow('Project', (CMS.isConfigured() ? (SB && SB.getConfig().url) : 'Not configured')),
          kvRow('Storage bucket', (SB && SB.getConfig().bucket) || 'portfolio-media'),
          kvRow('Table prefix', 'projects · skills · social_links · site_settings')
        ]),
        h('p', { class: 'cms-hint', style: { marginTop: '16px', marginBottom: '0' } }, [
          h('strong', { text: 'Authorization is enforced by Supabase RLS. ' }),
          document.createTextNode('The dashboard is a convenience layer only. Public visitors can read published rows; only a signed-in administrator can write.')
        ])
      ])
    ]);
    root.appendChild(info);

    if (!state.mediaItems && CMS.isConfigured()) loadMedia(true);
  }

  function quickAction(title, sub, onClick) {
    return h('button', { type: 'button', onClick: onClick }, [
      h('strong', { text: title }),
      h('span', { text: sub })
    ]);
  }

  function kvRow(label, value) {
    return h('div', null, [
      h('dt', { text: label }),
      h('dd', { text: value })
    ]);
  }

  function loadMedia(silent) {
    state.mediaLoading = true;
    return CMS.listImages().then(function (res) {
      state.mediaLoading = false;
      if (res.error) {
        if (!silent) toast(res.error, 'error', 7000);
        return res;
      }
      state.mediaItems = res.data || [];
      if (state.panel === 'media' || state.panel === 'dashboard') renderPanel(state.panel);
      return res;
    });
  }

  /* ==========================================================
     PROJECTS
     ========================================================== */
  function projectListOrdered() {
    return state.data.projects.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  }

  function buildProjects(root) {
    var search = input({ type: 'search', value: state.search, placeholder: 'Search projects…', 'aria-label': 'Search projects' });
    search.addEventListener('input', function () {
      state.search = search.value;
      renderProjectList(list);
    });
    root.appendChild(h('div', { class: 'a-toolbar' }, [
      h('div', { class: 'a-toolbar-actions' }, [search]),
      h('div', { class: 'a-toolbar-actions' }, [
        h('button', { class: 'a-btn primary', type: 'button', text: '+ New project', onClick: startNewProject })
      ])
    ]));

    if (state.editingProject === 'new' && state.draftProject) {
      root.appendChild(projectEditor(state.draftProject, true));
    }

    var list = h('div', { class: 'cms-list' });
    root.appendChild(list);
    renderProjectList(list);
  }

  function renderProjectList(list) {
    if (!list) return;
    clear(list);
    var ordered = projectListOrdered();
    var q = (state.search || '').trim().toLowerCase();
    var filtered = q ? ordered.filter(function (p) {
      return (p.title + ' ' + p.category + ' ' + (p.tools || []).join(' ')).toLowerCase().indexOf(q) !== -1;
    }) : ordered;

    if (!filtered.length) {
      list.appendChild(q
        ? emptyState('No matches', 'Nothing matches “' + state.search + '”.')
        : emptyState('No projects yet', 'Click “New project” to create your first one.'));
      return;
    }

    filtered.forEach(function (project) {
      var index = ordered.indexOf(project);
      list.appendChild(projectRow(project, index, ordered.length));
      if (state.editingProject === project.id) {
        list.appendChild(projectEditor(project, false));
      }
    });
  }

  function projectRow(project, index, total) {
    var wrap = h('div');
    var thumb = h('div', { class: 'cms-item-thumb' });
    if (project.image) thumb.appendChild(h('img', { src: project.image, alt: '', loading: 'lazy' }));
    else thumb.appendChild(h('span', { text: 'NO IMG' }));

    var actions = h('div', { class: 'cms-item-actions' }, [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Edit', onClick: function () { openProjectEditor(project); } }),
      h('button', {
        class: 'a-btn tiny ghost', type: 'button',
        text: project.status === 'published' ? 'Unpublish' : 'Publish',
        onClick: function () { toggleProjectStatus(project); }
      }),
      miniBtn(project.featured ? '★' : '☆', project.featured ? 'Remove featured' : 'Mark as featured', function () { toggleProjectFeatured(project); }),
      miniBtn('↑', 'Move up', function () { moveProject(project, -1); }, { disabled: index === 0 }),
      miniBtn('↓', 'Move down', function () { moveProject(project, 1); }, { disabled: index === total - 1 }),
      miniBtn('✕', 'Delete project', function () { deleteProject(project); }, { danger: true })
    ]);

    var item = h('div', { class: 'cms-item' + (project.featured ? ' is-featured' : '') }, [
      thumb,
      h('div', { class: 'cms-item-main' }, [
        h('p', { class: 'cms-item-title', text: project.title || 'Untitled project' }),
        h('div', { class: 'cms-item-meta' }, [
          statusBadge(project.status),
          badge(categoryLabel(project.category)),
          badge('Order ' + (index + 1)),
          project.featured ? badge('Featured', 'featured') : null
        ]),
        project.description ? h('p', { class: 'cms-item-desc', text: project.description }) : null
      ]),
      actions
    ]);
    wrap.appendChild(item);
    return wrap;
  }

  function openProjectEditor(project) {
    state.editingProject = project.id;
    state.draftProject = null;
    renderPanel('projects');
    var node = $('.a-card[data-editor="' + project.id + '"]');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function startNewProject() {
    state.draftProject = {
      title: '',
      description: '',
      category: (categoryOptions()[0] && categoryOptions()[0].value) || 'design',
      tools: [],
      projectUrl: '',
      videoUrl: '',
      thumbnailPath: '',
      thumbnailUrl: '',
      featured: false,
      sortOrder: state.data.projects.length,
      status: 'draft',
      indexLabel: '',
      caption: ''
    };
    state.editingProject = 'new';
    renderPanel('projects');
  }

  function projectEditor(project, isNew) {
    var categories = categoryOptions();
    if (!categories.some(function (c) { return c.value === project.category; })) {
      categories = categories.concat([{ value: project.category || 'design', label: (project.category || 'design') }]);
    }

    var refs = {};
    refs.title = input({ value: project.title || '', required: true, placeholder: 'Project title' });
    refs.description = textarea({ rows: 3, placeholder: 'A short description of the work' });
    refs.description.textContent = project.description || '';
    refs.category = selectFrom(categories, project.category);
    refs.tools = input({ value: (project.tools || []).join(', '), placeholder: 'Video editing, Color grading' });
    refs.projectUrl = input({ type: 'url', value: project.projectUrl || '', placeholder: 'https://…' });
    refs.videoUrl = input({ type: 'url', value: project.videoUrl || '', placeholder: 'https://youtube.com/…' });
    refs.indexLabel = input({ value: project.indexLabel || '', placeholder: 'PROJECT / 005' });
    refs.caption = input({ value: project.caption || '', placeholder: 'VISUAL IDENTITY STUDY' });
    refs.sortOrder = input({ type: 'number', min: '0', step: '1', value: String(project.sortOrder || 0) });
    refs.featured = h('input', { type: 'checkbox', checked: !!project.featured });
    refs.status = selectFrom([
      { value: 'draft', label: 'Draft — hidden from visitors' },
      { value: 'published', label: 'Published — visible on the site' }
    ], project.status || 'draft');
    refs.thumbUrl = input({ type: 'url', value: project.thumbnailUrl || '', placeholder: 'https://… external image' });

    // Give every control a name so native form semantics + tests can target it.
    Object.keys(refs).forEach(function (key) {
      var node = refs[key];
      if (node && node.setAttribute && node.tagName !== 'BUTTON') node.setAttribute('name', key);
    });

    var thumbState = { path: project.thumbnailPath || '' };
    var preview = h('div', { class: 'cms-item-thumb', style: { width: '132px', height: '92px' } });
    function renderPreview() {
      clear(preview);
      var src = refs.thumbUrl.value.trim() || CMS.publicUrl(thumbState.path);
      if (src) preview.appendChild(h('img', { src: src, alt: '' }));
      else preview.appendChild(h('span', { text: 'NO IMG' }));
    }
    refs.thumbUrl.addEventListener('input', renderPreview);
    renderPreview();

    var fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Upload thumbnail' });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      toast('Uploading…', 'info', 1600);
      CMS.uploadImage(file, folderFor('projects')).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        thumbState.path = res.data.path;
        refs.thumbUrl.value = '';
        renderPreview();
        toast('Uploaded. Remember to save the project.', 'success');
      });
      fileInput.value = '';
    });

    var thumbControls = h('div', { class: 'cms-media-actions' }, [
      h('label', { class: 'a-btn tiny ghost', style: { cursor: 'pointer' } }, [
        document.createTextNode('Upload'), fileInput
      ]),
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Choose from media', onClick: function () {
        openMediaPicker(function (item) { thumbState.path = item.path; refs.thumbUrl.value = ''; renderPreview(); });
      } }),
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Clear', onClick: function () {
        thumbState.path = ''; refs.thumbUrl.value = ''; renderPreview();
      } })
    ]);

    var form = h('form', { class: 'a-card', dataset: { editor: isNew ? 'new' : project.id }, style: { marginTop: '4px' } }, [
      h('div', { class: 'a-card-head' }, [
        h('h2', { text: isNew ? 'New project' : 'Edit project' }),
        h('span', { class: 'a-muted', text: isNew ? 'Draft' : categoryLabel(project.category) })
      ]),
      h('div', { class: 'a-card-body' }, [
        h('div', { class: 'a-grid-2' }, [
          fieldFull('Title', refs.title, 'Shown as the card heading.'),
          fieldFull('Description', refs.description),
          field('Category', refs.category),
          field('Tools / software', refs.tools, 'Comma separated; shown as tags.'),
          field('Project URL', refs.projectUrl),
          field('Video preview URL', refs.videoUrl),
          field('Index label', refs.indexLabel, 'Optional small label on the artwork.'),
          field('Caption', refs.caption, 'Optional caption under the label.'),
          field('Display order', refs.sortOrder, 'Lower numbers appear first.'),
          field('Status', refs.status),
          h('div', { class: 'a-field' }, [
            h('label', { class: 'a-field-label', text: 'Thumbnail' }),
            preview,
            thumbControls,
            h('p', { class: 'a-field-hint', text: 'Upload a JPG/PNG/WebP (max 5 MB) or paste an external URL above.' })
          ]),
          field('External image URL', refs.thumbUrl, 'Overrides the uploaded thumbnail when set.')
        ]),
        h('label', { class: 'a-field-label', style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } }, [
          refs.featured, document.createTextNode(' Featured project')
        ]),
        h('div', { class: 'a-toolbar-actions', style: { marginTop: '18px' } }, [
          (function () {
            refs.save = h('button', { class: 'a-btn primary', type: 'submit', text: isNew ? 'Create project' : 'Save project' });
            return refs.save;
          })(),
          h('button', { class: 'a-btn ghost', type: 'button', text: 'Cancel', onClick: function () {
            state.editingProject = null; state.draftProject = null; renderPanel('projects');
          } }),
          isNew ? null : h('button', { class: 'a-btn danger', type: 'button', text: 'Delete', onClick: function () { deleteProject(project); } })
        ])
      ])
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var payload = {
        title: refs.title.value.trim(),
        description: refs.description.value.trim(),
        category: refs.category.value,
        tools: refs.tools.value,
        projectUrl: refs.projectUrl.value.trim(),
        videoUrl: refs.videoUrl.value.trim(),
        featured: refs.featured.checked,
        sortOrder: Number(refs.sortOrder.value) || 0,
        status: refs.status.value,
        indexLabel: refs.indexLabel.value.trim(),
        caption: refs.caption.value.trim(),
        thumbnailPath: thumbState.path,
        thumbnailUrl: refs.thumbUrl.value.trim()
      };
      if (!payload.title) { toast('A project needs a title.', 'error'); refs.title.focus(); return; }
      saveLabel(refs.save, true, 'Saving…');
      var op = isNew ? CMS.createProject(payload) : CMS.updateProject(project.id, payload);
      op.then(function (res) {
        saveLabel(refs.save, false);
        if (res.error) { toast(res.error, 'error', 7000); return; }
        toast(isNew ? 'Project created' : 'Project saved', 'success');
        state.editingProject = null;
        state.draftProject = null;
        loadAll({ skeleton: false });
      });
    });

    return form;
  }

  function toggleProjectStatus(project) {
    var next = project.status === 'published' ? 'draft' : 'published';
    CMS.updateProject(project.id, { status: next }).then(function (res) {
      if (res.error) { toast(res.error, 'error', 7000); return; }
      toast(next === 'published' ? 'Project published' : 'Project moved to drafts', 'success');
      loadAll({ skeleton: false });
    });
  }

  function toggleProjectFeatured(project) {
    CMS.updateProject(project.id, { featured: !project.featured }).then(function (res) {
      if (res.error) { toast(res.error, 'error', 7000); return; }
      loadAll({ skeleton: false });
    });
  }

  function moveProject(project, dir) {
    var ordered = projectListOrdered();
    var index = ordered.indexOf(project);
    var target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    var tmp = ordered[index]; ordered[index] = ordered[target]; ordered[target] = tmp;
    Promise.all(ordered.map(function (p, i) { return CMS.updateProject(p.id, { sortOrder: i }); })).then(function (res) {
      var err = firstError(res);
      if (err) { toast(err, 'error', 7000); return; }
      loadAll({ skeleton: false });
    });
  }

  function deleteProject(project) {
    confirmDialog({
      title: 'Delete this project?',
      message: '“' + (project.title || 'Untitled') + '” will be permanently removed from Supabase.',
      confirmLabel: 'Delete project'
    }).then(function (ok) {
      if (!ok) return;
      CMS.deleteProject(project.id).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        toast('Project deleted', 'success');
        if (state.editingProject === project.id) state.editingProject = null;
        loadAll({ skeleton: false });
      });
    });
  }

  /* ==========================================================
     SKILLS
     ========================================================== */
  function buildSkills(root) {
    var nameInput = input({ placeholder: 'e.g. COLOR GRADING', 'aria-label': 'New skill' });
    var addForm = h('form', { class: 'cms-inline-form' }, [
      field('New skill', nameInput),
      h('button', { class: 'a-btn primary', type: 'submit', text: 'Add skill' })
    ]);
    addForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = nameInput.value.trim();
      if (!name) { toast('Type a skill name first.', 'warn'); return; }
      CMS.createSkill({ name: name, sortOrder: state.data.skills.length, status: 'published' }).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        nameInput.value = '';
        toast('Skill added', 'success');
        loadAll({ skeleton: false });
      });
    });
    root.appendChild(addForm);

    var list = h('div', { class: 'cms-list' });
    root.appendChild(list);
    var ordered = state.data.skills.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

    if (!ordered.length) {
      list.appendChild(emptyState('No skills yet', 'Add the first skill above.'));
      return;
    }

    ordered.forEach(function (skill, index) {
      var nameField = input({ value: skill.name, 'aria-label': 'Skill name' });
      nameField.addEventListener('change', function () {
        var value = nameField.value.trim();
        if (!value || value === skill.name) { nameField.value = skill.name; return; }
        CMS.updateSkill(skill.id, { name: value }).then(function (res) {
          if (res.error) { toast(res.error, 'error', 7000); return; }
          toast('Skill updated', 'success');
          loadAll({ skeleton: false });
        });
      });

      list.appendChild(h('div', { class: 'cms-item simple' }, [
        nameField,
        h('div', { class: 'cms-item-actions' }, [
          h('button', {
            class: 'a-btn tiny ghost', type: 'button',
            text: skill.status === 'published' ? 'Published' : 'Hidden',
            title: 'Toggle visibility',
            onClick: function () {
              CMS.updateSkill(skill.id, { status: skill.status === 'published' ? 'draft' : 'published' }).then(function (res) {
                if (res.error) { toast(res.error, 'error', 7000); return; }
                loadAll({ skeleton: false });
              });
            }
          }),
          miniBtn('↑', 'Move up', function () { moveSkill(skill, -1); }, { disabled: index === 0 }),
          miniBtn('↓', 'Move down', function () { moveSkill(skill, 1); }, { disabled: index === ordered.length - 1 }),
          miniBtn('✕', 'Delete skill', function () {
            confirmDialog({ title: 'Delete skill?', message: '“' + skill.name + '” will be removed.', confirmLabel: 'Delete' }).then(function (ok) {
              if (!ok) return;
              CMS.deleteSkill(skill.id).then(function (res) {
                if (res.error) { toast(res.error, 'error', 7000); return; }
                toast('Skill deleted', 'success');
                loadAll({ skeleton: false });
              });
            });
          }, { danger: true })
        ])
      ]));
    });
  }

  function moveSkill(skill, dir) {
    var ordered = state.data.skills.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var index = ordered.indexOf(skill);
    var target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    var tmp = ordered[index]; ordered[index] = ordered[target]; ordered[target] = tmp;
    Promise.all(ordered.map(function (s, i) { return CMS.updateSkill(s.id, { sortOrder: i }); })).then(function (res) {
      var err = firstError(res);
      if (err) { toast(err, 'error', 7000); return; }
      loadAll({ skeleton: false });
    });
  }

  /* ==========================================================
     SOCIAL LINKS
     ========================================================== */
  var PLATFORMS = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'behance', label: 'Behance' },
    { value: 'dribbble', label: 'Dribbble' },
    { value: 'email', label: 'Email' },
    { value: 'other', label: 'Other' }
  ];

  function buildSocial(root) {
    var platform = selectFrom(PLATFORMS, 'instagram', { 'aria-label': 'Platform' });
    var labelInput = input({ placeholder: 'Label (optional)', 'aria-label': 'Label' });
    var urlInput = input({ type: 'url', placeholder: 'https://…', 'aria-label': 'URL' });
    var addForm = h('form', { class: 'a-card' }, [
      h('div', { class: 'a-card-head' }, [h('h2', { text: 'Add a link' })]),
      h('div', { class: 'a-card-body' }, [
        h('div', { class: 'a-grid-2' }, [
          field('Platform', platform),
          field('Label', labelInput, 'Defaults to the platform name.'),
          fieldFull('URL', urlInput, 'Instagram, YouTube, Facebook, Behance, Dribbble, email or any custom link.')
        ]),
        h('div', { class: 'a-toolbar-actions' }, [
          h('button', { class: 'a-btn primary', type: 'submit', text: 'Add link' })
        ])
      ])
    ]);
    addForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var url = urlInput.value.trim();
      if (!url) { toast('A link needs a URL.', 'error'); urlInput.focus(); return; }
      CMS.createSocialLink({
        platform: platform.value,
        label: labelInput.value.trim(),
        url: url,
        sortOrder: state.data.socialLinks.length,
        visible: true
      }).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        toast('Link added', 'success');
        loadAll({ skeleton: false });
      });
    });
    root.appendChild(addForm);

    var ordered = state.data.socialLinks.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var list = h('div', { class: 'cms-list', style: { marginTop: '18px' } });
    root.appendChild(list);

    if (!ordered.length) {
      list.appendChild(emptyState('No links yet', 'Add Instagram, YouTube, Behance or any custom profile above.'));
      return;
    }

    ordered.forEach(function (link, index) {
      var labelField = input({ value: link.label, 'aria-label': 'Label', placeholder: 'Label' });
      labelField.addEventListener('change', function () {
        CMS.updateSocialLink(link.id, { label: labelField.value.trim() }).then(function (res) {
          if (res.error) { toast(res.error, 'error', 7000); return; }
          loadAll({ skeleton: false });
        });
      });
      var urlField = input({ type: 'url', value: link.url, 'aria-label': 'URL', placeholder: 'https://…' });
      urlField.addEventListener('change', function () {
        var value = urlField.value.trim();
        if (!value) { urlField.value = link.url; return; }
        CMS.updateSocialLink(link.id, { url: value }).then(function (res) {
          if (res.error) { toast(res.error, 'error', 7000); return; }
          loadAll({ skeleton: false });
        });
      });

      list.appendChild(h('div', { class: 'cms-item simple' }, [
        h('div', { class: 'cms-item-main' }, [
          h('div', { class: 'cms-item-meta', style: { marginBottom: '8px' } }, [
            badge(link.platform),
            link.visible ? badge('Visible', 'published') : badge('Hidden', 'hidden')
          ]),
          h('div', { class: 'a-grid-2' }, [
            field('Label', labelField),
            field('URL', urlField)
          ])
        ]),
        h('div', { class: 'cms-item-actions' }, [
          h('button', {
            class: 'a-btn tiny ghost', type: 'button',
            text: link.visible ? 'Hide' : 'Show',
            onClick: function () {
              CMS.updateSocialLink(link.id, { visible: !link.visible }).then(function (res) {
                if (res.error) { toast(res.error, 'error', 7000); return; }
                loadAll({ skeleton: false });
              });
            }
          }),
          miniBtn('↑', 'Move up', function () { moveSocial(link, -1); }, { disabled: index === 0 }),
          miniBtn('↓', 'Move down', function () { moveSocial(link, 1); }, { disabled: index === ordered.length - 1 }),
          miniBtn('✕', 'Delete link', function () {
            confirmDialog({ title: 'Delete link?', message: (link.label || link.url) + ' will be removed.', confirmLabel: 'Delete' }).then(function (ok) {
              if (!ok) return;
              CMS.deleteSocialLink(link.id).then(function (res) {
                if (res.error) { toast(res.error, 'error', 7000); return; }
                toast('Link deleted', 'success');
                loadAll({ skeleton: false });
              });
            });
          }, { danger: true })
        ])
      ]));
    });
  }

  function moveSocial(link, dir) {
    var ordered = state.data.socialLinks.slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var index = ordered.indexOf(link);
    var target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    var tmp = ordered[index]; ordered[index] = ordered[target]; ordered[target] = tmp;
    Promise.all(ordered.map(function (l, i) { return CMS.updateSocialLink(l.id, { sortOrder: i }); })).then(function (res) {
      var err = firstError(res);
      if (err) { toast(err, 'error', 7000); return; }
      loadAll({ skeleton: false });
    });
  }

  function folderFor(kind) {
    var folders = (SB && SB.getConfig().folders) || {};
    return folders[kind] || kind;
  }

  /* __CMS_PART3__ */

  /* ==========================================================
     PROFILE & SETTINGS (tabs)
     ========================================================== */
  function markSiteDirty() {
    state.siteDirty = true;
    var note = $('#siteDirtyNote');
    if (note) note.hidden = false;
  }

  function saveSection(name, btn) {
    if (!state.siteDraft) return;
    saveLabel(btn, true, 'Saving…');
    CMS.saveSettingSection(name, state.siteDraft[name]).then(function (res) {
      saveLabel(btn, false);
      if (res.error) { toast(res.error, 'error', 7000); return; }
      toast('Saved to Supabase — the live site updates on next load', 'success');
      state.siteDirty = false;
      var note = $('#siteDirtyNote');
      if (note) note.hidden = true;
    });
  }

  function bindValue(obj, key, control, eventName) {
    control.addEventListener(eventName || 'input', function () {
      obj[key] = control.value;
      markSiteDirty();
    });
  }

  function bindCheck(obj, key, control) {
    control.addEventListener('change', function () {
      obj[key] = control.checked;
      markSiteDirty();
    });
  }

  function bindNum(obj, key, control) {
    control.addEventListener('input', function () {
      obj[key] = Number(control.value);
      markSiteDirty();
    });
  }

  function rangeField(labelText, obj, key, min, max, step, suffix) {
    var control = h('input', { class: 'a-range', type: 'range', min: String(min), max: String(max), step: String(step), value: String(obj[key]) });
    var readout = h('span', { class: 'cms-media-sub', text: (obj[key]) + (suffix || '') });
    control.addEventListener('input', function () {
      obj[key] = Number(control.value);
      readout.textContent = control.value + (suffix || '');
      markSiteDirty();
    });
    var wrap = h('div', { class: 'a-field' }, [
      h('label', { class: 'a-field-label' }, [document.createTextNode(labelText + ' '), readout]),
      control
    ]);
    return wrap;
  }

  function colorField(labelText, obj, key) {
    var control = input({ type: 'text', value: obj[key] || '', placeholder: '#080a10' });
    var picker = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key]) ? obj[key] : '#080a10', 'aria-label': labelText + ' picker' });
    picker.addEventListener('input', function () { control.value = picker.value; obj[key] = picker.value; markSiteDirty(); });
    bindValue(obj, key, control);
    var wrap = h('div', { class: 'a-field' }, [
      h('label', { class: 'a-field-label', text: labelText }),
      h('div', { style: { display: 'flex', gap: '8px' } }, [control, h('div', { style: { width: '44px', flex: '0 0 auto' } }, [picker])])
    ]);
    return wrap;
  }

  function buildSite(root) {
    if (!state.siteDraft) {
      root.appendChild(emptyState('Settings unavailable', 'The site_settings table could not be read. Check the connection banner.'));
      return;
    }
    var tabs = [
      { id: 'profile', label: 'Profile' },
      { id: 'seo', label: 'SEO' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'motion', label: 'Motion' }
    ];
    var tabBar = h('div', { class: 'cms-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
    tabs.forEach(function (tab) {
      var btn = h('button', {
        class: 'cms-tab', type: 'button', role: 'tab',
        'aria-selected': String(state.activeSiteTab === tab.id), text: tab.label
      });
      btn.addEventListener('click', function () { state.activeSiteTab = tab.id; renderPanel('site'); });
      tabBar.appendChild(btn);
    });
    var dirty = h('span', { class: 'cms-badge draft', id: 'siteDirtyNote', hidden: !state.siteDirty, text: 'Unsaved changes' });
    root.appendChild(h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' } }, [tabBar, dirty]));

    var panel = h('div', { class: 'cms-tabpanel' });
    root.appendChild(panel);
    if (state.activeSiteTab === 'seo') panel.appendChild(seoTab());
    else if (state.activeSiteTab === 'appearance') panel.appendChild(appearanceTab());
    else if (state.activeSiteTab === 'motion') panel.appendChild(motionTab());
    else panel.appendChild(profileTab());
  }

  function sectionCard(title, note, controls) {
    return h('div', { class: 'a-card' }, [
      h('div', { class: 'a-card-head' }, [h('h2', { text: title }), h('span', { class: 'a-muted', text: note || '' })]),
      h('div', { class: 'a-card-body' }, controls)
    ]);
  }

  function saveFooter(section, btnLabel) {
    var btn = h('button', { class: 'a-btn primary', type: 'button', text: btnLabel || 'Save changes' });
    btn.addEventListener('click', function () { saveSection(section, btn); });
    return h('div', { class: 'a-toolbar-actions', style: { marginTop: '18px' } }, [btn]);
  }

  function profileTab() {
    var p = state.siteDraft.profile = state.siteDraft.profile || {};
    p.availability = p.availability || { enabled: true, text: '' };
    p.sectionNotes = p.sectionNotes || {};
    p.stats = p.stats || [];
    p.process = p.process || [];

    var displayName = input({ value: p.displayName || '' });
    var logoText = input({ value: p.logoText || '' });
    var title = input({ value: p.title || '' });
    var heroEyebrow = input({ value: p.heroEyebrow || '' });
    var heroHeading = textarea({ rows: 3 }); heroHeading.textContent = p.heroHeading || '';
    var heroAccentWord = input({ value: p.heroAccentWord || '' });
    var heroIntro = textarea({ rows: 3 }); heroIntro.textContent = p.heroIntro || '';
    var aboutLead = textarea({ rows: 3 }); aboutLead.textContent = p.aboutLead || '';
    var aboutBody1 = textarea({ rows: 4 }); aboutBody1.textContent = p.aboutBody1 || '';
    var aboutBody2 = textarea({ rows: 4 }); aboutBody2.textContent = p.aboutBody2 || '';
    var email = input({ type: 'email', value: p.email || '' });
    var location = input({ value: p.location || '' });
    var footerText = input({ value: p.footerText || '' });
    var footerTag = input({ value: p.footerTag || '' });
    var availEnabled = h('input', { type: 'checkbox', checked: p.availability.enabled !== false });
    var availText = input({ value: p.availability.text || '' });

    bindValue(p, 'displayName', displayName);
    bindValue(p, 'logoText', logoText);
    bindValue(p, 'title', title);
    bindValue(p, 'heroEyebrow', heroEyebrow);
    bindValue(p, 'heroHeading', heroHeading);
    bindValue(p, 'heroAccentWord', heroAccentWord);
    bindValue(p, 'heroIntro', heroIntro);
    bindValue(p, 'aboutLead', aboutLead);
    bindValue(p, 'aboutBody1', aboutBody1);
    bindValue(p, 'aboutBody2', aboutBody2);
    bindValue(p, 'email', email);
    bindValue(p, 'location', location);
    bindValue(p, 'footerText', footerText);
    bindValue(p, 'footerTag', footerTag);
    bindCheck(p.availability, 'enabled', availEnabled);
    bindValue(p.availability, 'text', availText);

    var noteFields = ['about', 'work', 'journey', 'contact'].map(function (key) {
      var control = textarea({ rows: 2 });
      control.textContent = p.sectionNotes[key] || '';
      control.addEventListener('input', function () { p.sectionNotes[key] = control.value; markSiteDirty(); });
      return fieldFull(key.charAt(0).toUpperCase() + key.slice(1) + ' section note', control);
    });

    // Avatar upload / picker
    var avatarState = { path: p.avatarPath || '' };
    var avatarPreview = h('div', { class: 'cms-item-thumb', style: { width: '110px', height: '110px', borderRadius: '50%' } });
    var avatarUrl = input({ type: 'url', value: p.avatar || '', placeholder: 'https://… external image' });
    function renderAvatar() {
      clear(avatarPreview);
      var src = avatarUrl.value.trim() || CMS.publicUrl(avatarState.path);
      if (src) avatarPreview.appendChild(h('img', { src: src, alt: '' }));
      else avatarPreview.appendChild(h('span', { text: 'NO IMG' }));
    }
    avatarUrl.addEventListener('input', function () { p.avatar = avatarUrl.value.trim(); markSiteDirty(); renderAvatar(); });
    renderAvatar();
    var avatarFile = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Upload profile image' });
    avatarFile.addEventListener('change', function () {
      var file = avatarFile.files && avatarFile.files[0];
      if (!file) return;
      CMS.uploadImage(file, folderFor('profile')).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        avatarState.path = res.data.path;
        p.avatarPath = res.data.path;
        p.avatar = res.data.url;
        avatarUrl.value = '';
        markSiteDirty();
        renderAvatar();
        toast('Uploaded. Save the Profile tab to publish it.', 'success');
      });
      avatarFile.value = '';
    });

    var profileCard = sectionCard('Profile', 'Shown across the public site', [
      h('div', { class: 'a-grid-2' }, [
        fieldFull('Display name', displayName),
        field('Logo text', logoText),
        field('Professional title', title),
        fieldFull('Hero eyebrow', heroEyebrow, 'Small line above the hero heading.'),
        fieldFull('Hero heading', heroHeading, 'Use line breaks to control the layout.'),
        field('Hero accent word', heroAccentWord, 'The word rendered in the gradient.'),
        fieldFull('Hero introduction', heroIntro),
        fieldFull('About lead', aboutLead, 'Wrap words in **double asterisks** for emphasis.'),
        fieldFull('About — paragraph 1', aboutBody1),
        fieldFull('About — paragraph 2', aboutBody2),
        field('Email address', email),
        field('Location / availability line', location),
        field('Footer text', footerText),
        field('Footer tag', footerTag)
      ]),
      h('div', { class: 'a-field' }, [
        h('label', { class: 'a-field-label', text: 'Availability badge' }),
        h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } }, [availEnabled, document.createTextNode(' Show the availability badge')]),
        availText
      ]),
      h('div', { class: 'a-field' }, [
        h('label', { class: 'a-field-label', text: 'Profile image' }),
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } }, [
          avatarPreview,
          h('div', { class: 'cms-media-actions' }, [
            h('label', { class: 'a-btn tiny ghost', style: { cursor: 'pointer' } }, [document.createTextNode('Upload'), avatarFile]),
            h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Choose from media', onClick: function () {
              openMediaPicker(function (item) {
                avatarState.path = item.path;
                p.avatarPath = item.path;
                p.avatar = item.url;
                avatarUrl.value = '';
                markSiteDirty();
                renderAvatar();
              });
            } }),
            h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Clear', onClick: function () {
              avatarState.path = ''; p.avatarPath = ''; p.avatar = ''; avatarUrl.value = ''; markSiteDirty(); renderAvatar();
            } })
          ])
        ]),
        avatarUrl
      ]),
      h('h3', { class: 'a-field-label', style: { marginTop: '22px' }, text: 'Statistics' }),
      statsEditor(p),
      h('h3', { class: 'a-field-label', style: { marginTop: '22px' }, text: 'Process timeline' }),
      processEditor(p),
      h('div', null, noteFields),
      saveFooter('profile', 'Save profile')
    ]);
    return profileCard;
  }

  function statsEditor(profile) {
    var box = h('div', { class: 'cms-list' });
    function render() {
      clear(box);
      (profile.stats || []).forEach(function (s, index) {
        var label = input({ value: s.label || '', 'aria-label': 'Statistic label' });
        label.addEventListener('input', function () { s.label = label.value; markSiteDirty(); });
        var value = input({ type: 'number', value: String(s.value || 0), 'aria-label': 'Statistic value' });
        value.addEventListener('input', function () { s.value = Number(value.value) || 0; markSiteDirty(); });
        box.appendChild(h('div', { class: 'cms-item simple' }, [
          h('div', { class: 'a-grid-2' }, [field('Label', label), field('Value', value)]),
          h('div', { class: 'cms-item-actions' }, [
            miniBtn('✕', 'Remove statistic', function () { profile.stats.splice(index, 1); markSiteDirty(); render(); }, { danger: true })
          ])
        ]));
      });
      box.appendChild(h('button', { class: 'a-btn tiny ghost', type: 'button', text: '+ Add statistic', onClick: function () {
        profile.stats = profile.stats || [];
        profile.stats.push({ label: 'New statistic', value: 0 });
        markSiteDirty();
        render();
      } }));
    }
    render();
    return box;
  }

  function processEditor(profile) {
    var box = h('div', { class: 'cms-list' });
    function render() {
      clear(box);
      (profile.process || []).forEach(function (step, index) {
        var stepField = input({ value: step.step || '', 'aria-label': 'Step label' });
        stepField.addEventListener('input', function () { step.step = stepField.value; markSiteDirty(); });
        var titleField = input({ value: step.title || '', 'aria-label': 'Step title' });
        titleField.addEventListener('input', function () { step.title = titleField.value; markSiteDirty(); });
        var bodyField = textarea({ rows: 2, 'aria-label': 'Step description' });
        bodyField.textContent = step.body || '';
        bodyField.addEventListener('input', function () { step.body = bodyField.value; markSiteDirty(); });
        box.appendChild(h('div', { class: 'cms-item simple' }, [
          h('div', null, [
            h('div', { class: 'a-grid-2' }, [field('Step label', stepField), field('Title', titleField)]),
            fieldFull('Description', bodyField)
          ]),
          h('div', { class: 'cms-item-actions' }, [
            miniBtn('✕', 'Remove step', function () { profile.process.splice(index, 1); markSiteDirty(); render(); }, { danger: true })
          ])
        ]));
      });
      box.appendChild(h('button', { class: 'a-btn tiny ghost', type: 'button', text: '+ Add step', onClick: function () {
        profile.process = profile.process || [];
        profile.process.push({ step: String(profile.process.length + 1).padStart(2, '0'), title: 'New step', body: '' });
        markSiteDirty();
        render();
      } }));
    }
    render();
    return box;
  }

  function seoTab() {
    var seo = state.siteDraft.seo = state.siteDraft.seo || {};
    var title = input({ value: seo.title || '' });
    var description = textarea({ rows: 3 }); description.textContent = seo.description || '';
    var keywords = input({ value: seo.keywords || '' });
    var siteUrl = input({ type: 'url', value: seo.siteUrl || '', placeholder: 'https://ovmahin.my.id/' });
    var twitterHandle = input({ value: seo.twitterHandle || '', placeholder: '@mahin' });
    var ogImage = input({ type: 'url', value: seo.ogImage || '', placeholder: 'https://…' });
    var favicon = input({ type: 'url', value: seo.favicon || '', placeholder: 'https://… /favicon.png' });

    bindValue(seo, 'title', title);
    bindValue(seo, 'description', description);
    bindValue(seo, 'keywords', keywords);
    bindValue(seo, 'siteUrl', siteUrl);
    bindValue(seo, 'twitterHandle', twitterHandle);
    bindValue(seo, 'ogImage', ogImage);
    bindValue(seo, 'favicon', favicon);

    var ogPicker = h('div', { class: 'cms-media-actions', style: { marginTop: '8px' } }, [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Choose from media', onClick: function () {
        openMediaPicker(function (item) {
          seo.ogImage = item.url; ogImage.value = item.url; markSiteDirty();
        });
      } })
    ]);

    return sectionCard('SEO & sharing', 'Search engines and social previews', [
      h('div', { class: 'a-grid-2' }, [
        fieldFull('Website title', title),
        fieldFull('Meta description', description, 'Around 150 characters works best.'),
        fieldFull('Keywords', keywords, 'Comma separated.'),
        field('Canonical URL', siteUrl, 'Your live site address.'),
        field('Twitter/X handle', twitterHandle),
        fieldFull('Open Graph image', ogImage, 'Recommended 1200×630.'),
        fieldFull('Favicon URL', favicon, 'PNG or SVG.')
      ]),
      ogPicker,
      saveFooter('seo', 'Save SEO')
    ]);
  }

  function appearanceTab() {
    var a = state.siteDraft.appearance = state.siteDraft.appearance || {};
    var mode = selectFrom([{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], a.mode || 'dark');
    mode.addEventListener('change', function () { a.mode = mode.value; markSiteDirty(); });
    return sectionCard('Appearance', 'Colours, glass and typography', [
      h('div', { class: 'a-grid-2' }, [
        field('Appearance mode', mode),
        colorField('Background', a, 'background'),
        colorField('Text', a, 'text'),
        colorField('Accent', a, 'accent'),
        colorField('Secondary accent', a, 'accent2'),
        colorField('Tertiary accent', a, 'accent3'),
        rangeField('Glass transparency', a, 'glassOpacity', 0, 1, 0.01, ''),
        rangeField('Blur intensity', a, 'blur', 0, 40, 1, 'px'),
        rangeField('Border radius', a, 'radius', 0, 40, 1, 'px'),
        rangeField('Card shadow', a, 'shadow', 0, 80, 1, 'px'),
        rangeField('Body font scale', a, 'fontScale', 0.8, 1.4, 0.01, '×'),
        rangeField('Heading scale', a, 'headingScale', 0.7, 1.5, 0.01, '×')
      ]),
      saveFooter('appearance', 'Save appearance')
    ]);
  }

  function motionTab() {
    var m = state.siteDraft.animations = state.siteDraft.animations || {};
    var toggles = [
      ['scrollReveal', 'Scroll reveal animations'],
      ['hoverEffects', 'Hover effects'],
      ['pageTransitions', 'Page transitions'],
      ['scrollProgress', 'Scroll progress indicator'],
      ['loadingAnimation', 'Loading / self-building animation'],
      ['parallax', 'Parallax background'],
      ['magnetic', 'Magnetic buttons'],
      ['cursor', 'Custom cursor (desktop)'],
      ['counters', 'Animated counters']
    ];
    var nodes = toggles.map(function (pair) {
      var cb = h('input', { type: 'checkbox', checked: m[pair[0]] !== false });
      bindCheck(m, pair[0], cb);
      return h('label', { style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '7px 0' } }, [cb, document.createTextNode(' ' + pair[1])]);
    });

    var reduced = selectFrom([
      { value: 'system', label: 'Respect the visitor’s system setting' },
      { value: 'force-off', label: 'Disable all motion for everyone' }
    ], m.reducedMotion || 'system');
    reduced.addEventListener('change', function () { m.reducedMotion = reduced.value; markSiteDirty(); });

    return sectionCard('Motion & animation', 'Duration, delay and reduced-motion', [
      h('div', { class: 'a-grid-2' }, [
        h('div', { class: 'a-field' }, [h('label', { class: 'a-field-label', text: 'Enabled effects' }), h('div', null, nodes)]),
        h('div', null, [
          rangeField('Animation duration', m, 'duration', 0, 3000, 50, 'ms'),
          rangeField('Animation delay', m, 'delay', 0, 1000, 10, 'ms'),
          rangeField('Stagger between items', m, 'stagger', 0, 500, 10, 'ms'),
          field('Reduced motion', reduced)
        ])
      ]),
      saveFooter('animations', 'Save motion')
    ]);
  }

  /* ==========================================================
     MEDIA LIBRARY
     ========================================================== */
  function buildMedia(root) {
    var fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, 'aria-label': 'Upload images' });
    var drop = h('label', { class: 'cms-drop' }, [
      h('strong', { text: 'Upload images' }),
      h('span', { text: 'Drag & drop, or click to browse. JPG, PNG or WebP · max 5 MB each.' }),
      fileInput
    ]);
    fileInput.addEventListener('change', function () {
      handleUploads(fileInput.files);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleUploads(e.dataTransfer.files);
    });
    root.appendChild(drop);

    root.appendChild(h('div', { class: 'a-toolbar' }, [
      h('div', { class: 'a-toolbar-actions' }, [
        h('button', { class: 'a-btn ghost', type: 'button', text: 'Reload media', onClick: function () { loadMedia(false); } })
      ]),
      h('div', { class: 'a-toolbar-actions' }, [
        h('span', { class: 'cms-media-sub', id: 'mediaProgress' })
      ])
    ]));

    if (state.mediaLoading && !state.mediaItems) {
      root.appendChild(loadingRow('Loading media…'));
      return;
    }
    if (!state.mediaItems) {
      loadMedia(true);
      root.appendChild(loadingRow('Loading media…'));
      return;
    }
    if (!state.mediaItems.length) {
      root.appendChild(emptyState('No media yet', 'Upload your first image above.'));
      return;
    }

    var grid = h('div', { class: 'cms-media-grid' });
    state.mediaItems.forEach(function (item) { grid.appendChild(mediaCard(item)); });
    root.appendChild(grid);
  }

  function loadingRow(text) {
    return h('div', { class: 'cms-loading-row' }, [
      h('span', { class: 'cms-spinner', 'aria-hidden': 'true' }),
      h('span', { text: text })
    ]);
  }

  function handleUploads(files) {
    var queue = Array.prototype.slice.call(files || []);
    if (!queue.length) return;
    var progress = $('#mediaProgress');
    var uploaded = 0, failed = 0, total = queue.length;
    if (progress) progress.textContent = 'Uploading 0/' + total + '…';

    function next() {
      if (!queue.length) {
        if (progress) progress.textContent = '';
        toast((uploaded ? uploaded + ' uploaded' : 'Nothing uploaded') + (failed ? ', ' + failed + ' failed' : ''), failed ? 'warn' : 'success');
        loadMedia(true);
        return;
      }
      var file = queue.shift();
      var problem = CMS.validateImage(file);
      if (problem) {
        failed++;
        toast(file.name + ': ' + problem, 'error', 7000);
        updateProgress();
        next();
        return;
      }
      CMS.uploadImage(file, folderFor('projects')).then(function (res) {
        if (res.error) { failed++; toast(file.name + ': ' + res.error, 'error', 7000); }
        else uploaded++;
        updateProgress();
        next();
      });
    }
    function updateProgress() {
      if (!progress) return;
      progress.textContent = 'Uploading ' + (uploaded + failed) + '/' + total + '…';
    }
    next();
  }

  function mediaCard(item) {
    var actions = h('div', { class: 'cms-media-actions' }, [
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Copy URL', onClick: function () { copyText(item.url); } }),
      h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Preview', onClick: function () { window.open(item.url, '_blank', 'noopener'); } })
    ]);

    var replaceInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Replace ' + item.name });
    replaceInput.addEventListener('change', function () {
      var file = replaceInput.files && replaceInput.files[0];
      if (!file) return;
      CMS.replaceImage(item.path, file).then(function (res) {
        if (res.error) { toast(res.error, 'error', 7000); return; }
        toast('Image replaced', 'success');
        loadMedia(true);
      });
      replaceInput.value = '';
    });
    actions.appendChild(h('label', { class: 'a-btn tiny ghost', style: { cursor: 'pointer' } }, [document.createTextNode('Replace'), replaceInput]));
    actions.appendChild(h('button', { class: 'a-btn tiny danger', type: 'button', text: 'Delete', onClick: function () {
      confirmDialog({
        title: 'Delete this image?',
        message: '“' + item.name + '” will be removed from the bucket. Images still used by a project cannot be deleted.',
        confirmLabel: 'Delete image'
      }).then(function (ok) {
        if (!ok) return;
        CMS.deleteImage(item.path).then(function (res) {
          if (res.error) { toast(res.error, 'error', 8000); return; }
          toast('Image deleted', 'success');
          loadMedia(true);
        });
      });
    } }));

    return h('div', { class: 'cms-media-card' }, [
      h('div', { class: 'cms-media-thumb' }, [
        h('img', { src: item.url, alt: item.name, loading: 'lazy' })
      ]),
      h('div', { class: 'cms-media-info' }, [
        h('p', { class: 'cms-media-name', text: item.name }),
        h('span', { class: 'cms-media-sub', text: (CMS.formatBytes(item.size) || '—') + ' · ' + (item.type || 'image') }),
        actions
      ])
    ]);
  }

  function copyText(text) {
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      area.remove();
      toast(ok ? 'URL copied' : 'Copy failed — select it manually.', ok ? 'success' : 'warn');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('URL copied', 'success'); }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ==========================================================
     MEDIA PICKER (reuse an existing upload)
     ========================================================== */
  function openMediaPicker(onPick) {
    var overlay = h('div', { class: 'cms-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose an image' });
    var grid = h('div', { class: 'cms-picker-grid' });
    var panel = h('div', { class: 'cms-picker-panel' }, [
      h('div', { class: 'a-card-head' }, [
        h('h2', { text: 'Choose an image' }),
        h('button', { class: 'a-btn tiny ghost', type: 'button', text: 'Close', onClick: close })
      ]),
      grid
    ]);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    function onKey(event) { if (event.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    document.body.appendChild(overlay);

    var cached = state.mediaItems;
    var promise = cached ? Promise.resolve({ data: cached, error: null }) : CMS.listImages();
    clear(grid);
    grid.appendChild(loadingRow('Loading images…'));
    promise.then(function (res) {
      clear(grid);
      if (res.error) { grid.appendChild(h('p', { class: 'cms-notice error', text: res.error })); return; }
      if (!res.data.length) { grid.appendChild(emptyState('No images yet', 'Upload an image in the Media library first.')); return; }
      res.data.forEach(function (item) {
        var btn = h('button', { class: 'cms-picker-item', type: 'button', title: item.name }, [
          h('img', { src: item.url, alt: item.name, loading: 'lazy' }),
          h('span', { text: item.name })
        ]);
        btn.addEventListener('click', function () { onPick(item); close(); });
        grid.appendChild(btn);
      });
    });
  }

  /* ==========================================================
     CHROME: theme, refresh, drawer
     ========================================================== */
  var THEME_KEY = 'mahin_admin_theme';

  function applyAdminTheme(theme) {
    var value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-admin-theme', value);
    var btn = $('#cmsThemeBtn');
    if (btn) btn.textContent = value === 'light' ? '☾' : '☀';
  }
  function restoreAdminTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) { /* */ }
    applyAdminTheme(saved || 'dark');
  }
  function toggleAdminTheme() {
    var next = document.documentElement.getAttribute('data-admin-theme') === 'light' ? 'dark' : 'light';
    applyAdminTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* */ }
  }

  function bindChrome() {
    restoreAdminTheme();
    var themeBtn = $('#cmsThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleAdminTheme);
    var drawer = $('#cmsDrawerBtn');
    if (drawer) drawer.addEventListener('click', toggleDrawer);
    var scrim = $('#cmsScrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { closeDrawer(); }
    });
    var refresh = $('#cmsRefreshBtn');
    if (refresh) refresh.addEventListener('click', function () {
      saveLabel(refresh, true, 'Refreshing…');
      state.mediaItems = null;
      loadAll().then(function () {
        saveLabel(refresh, false);
        toast('Content refreshed', 'success');
      }).catch(function () { saveLabel(refresh, false); });
    });
    window.addEventListener('beforeunload', function (event) {
      if (!state.siteDirty) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  function boot() {
    bindChrome();
    initAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
