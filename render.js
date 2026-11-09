/* ============================================================
   MAHIN PORTFOLIO — PUBLIC RENDER LAYER
   ------------------------------------------------------------
   Reads the shared configuration (config.js) and hydrates the
   public page. Loaded BEFORE script.js so that all interactive
   modules (reveal, counters, filters) can observe the rendered
   DOM.

   All user content is written with textContent / createElement,
   never innerHTML, so admin-authored text cannot inject script.

   Live preview: admin.html posts { type:'mahin:preview-config',
   config } to the preview iframe; this file applies it without a
   page reload.
   ============================================================ */
(function () {
  'use strict';

  var C = (typeof window !== 'undefined') ? window.MahinConfig : null;
  if (!C) { console.warn('[mahin] config.js missing — using static HTML'); return; }

  var currentConfig = null;
  var firstRender = true;

  /* ----------------------------------------------------------
     DOM HELPERS
     ---------------------------------------------------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else if (k === 'dataset') Object.keys(props[k]).forEach(function (d) { node.dataset[d] = props[k][d]; });
        else if (props[k] !== null && props[k] !== undefined && props[k] !== false) node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function setText(sel, value) {
    $$(sel).forEach(function (node) {
      if (value === null || value === undefined) return;
      node.textContent = value;
    });
  }

  /**
   * Render a tiny subset of markdown: **text** becomes <em>.
   * Returns a DocumentFragment built with safe DOM nodes.
   */
  function richText(text, emTag) {
    var frag = document.createDocumentFragment();
    var parts = String(text == null ? '' : text).split(/\*\*/);
    parts.forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) frag.appendChild(el(emTag || 'em', null, [part]));
      else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  function isReduced() {
    if (!currentConfig) return false;
    if (currentConfig.animations.reducedMotion === 'force-off') return true;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ----------------------------------------------------------
     SEO / HEAD
     ---------------------------------------------------------- */
  function upsertMeta(selector, attrs) {
    var node = $(selector);
    if (!node) {
      node = document.createElement('meta');
      document.head.appendChild(node);
    }
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  }

  function upsertLink(rel, href) {
    var node = document.head.querySelector('link[rel="' + rel + '"]');
    if (!node) {
      node = document.createElement('link');
      node.setAttribute('rel', rel);
      document.head.appendChild(node);
    }
    node.setAttribute('href', href);
  }

  function applySeo(cfg) {
    var seo = cfg.seo;
    var title = seo.title || cfg.profile.displayName;
    document.title = title;
    upsertMeta('meta[name="description"]', { name: 'description', content: seo.description || '' });
    upsertMeta('meta[name="keywords"]', { name: 'keywords', content: seo.keywords || '' });
    upsertMeta('meta[name="author"]', { name: 'author', content: cfg.profile.displayName || '' });

    var url = seo.siteUrl || '';
    if (url) {
      upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
      upsertLink('canonical', url);
    }
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description || '' });
    var ogImage = C.resolveAsset(seo.ogImage, cfg);
    var favicon = C.resolveAsset(seo.favicon, cfg);
    if (ogImage) upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImage });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: ogImage ? 'summary_large_image' : 'summary' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: seo.description || '' });
    if (ogImage) upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImage });
    if (seo.twitterHandle) {
      var handle = seo.twitterHandle.charAt(0) === '@' ? seo.twitterHandle : '@' + seo.twitterHandle;
      upsertMeta('meta[name="twitter:site"]', { name: 'twitter:site', content: handle });
    }
    if (favicon) {
      var fav = document.head.querySelector('link[rel="icon"]');
      if (!fav) {
        fav = document.createElement('link');
        fav.setAttribute('rel', 'icon');
        document.head.appendChild(fav);
      }
      fav.setAttribute('href', favicon);
    }
    var themeColor = cfg.appearance.mode === 'light' ? cfg.appearance.background : '#080a10';
    upsertMeta('meta[name="theme-color"]', { name: 'theme-color', content: themeColor });
  }

  /* ----------------------------------------------------------
     PROFILE
     ---------------------------------------------------------- */
  function renderBrand(cfg) {
    $$('.brand').forEach(function (brand) {
      clear(brand);
      brand.appendChild(document.createTextNode(cfg.profile.logoText || 'MAHIN'));
      brand.appendChild(el('span', null, ['.']));
    });
  }

  function renderHeroHeading(cfg) {
    var h1 = $('.hero-build h1');
    if (!h1) return;
    var heading = cfg.profile.heroHeading || '';
    var accent = (cfg.profile.heroAccentWord || '').trim();
    clear(h1);
    heading.split('\n').forEach(function (line, lineIndex) {
      if (lineIndex > 0) h1.appendChild(el('br'));
      if (accent && line.indexOf(accent) !== -1) {
        var pieces = line.split(accent);
        pieces.forEach(function (piece, i) {
          if (piece) h1.appendChild(document.createTextNode(piece));
          if (i < pieces.length - 1) h1.appendChild(el('span', { class: 'gradient' }, [accent]));
        });
      } else {
        h1.appendChild(document.createTextNode(line));
      }
    });
    h1.appendChild(el('span', { class: 'typing-caret', 'aria-hidden': 'true' }));
  }

  function renderAvailability(cfg) {
    var node = $('[data-cfg="availability"]');
    if (!node) return;
    var av = cfg.profile.availability;
    node.hidden = !av.enabled;
    clear(node);
    node.appendChild(el('span', { class: 'dot', 'aria-hidden': 'true' }));
    node.appendChild(document.createTextNode(av.text || ''));
  }

  function renderStats(container, stats) {
    if (!container) return;
    clear(container);
    (stats || []).forEach(function (stat) {
      container.appendChild(el('div', { class: 'stat' }, [
        el('strong', { dataset: { count: String(stat.value) }, text: '0' }),
        el('span', { text: stat.label })
      ]));
    });
  }

  function renderProfile(cfg) {
    var p = cfg.profile;
    setText('[data-cfg="heroEyebrow"]', p.heroEyebrow);
    renderHeroHeading(cfg);
    setText('[data-cfg="heroIntro"]', p.heroIntro);
    renderStats($('[data-cfg="heroStats"]'), p.stats);
    renderAvailability(cfg);

    setText('[data-cfg="noteAbout"]', p.sectionNotes.about);
    var lead = $('[data-cfg="aboutLead"]');
    if (lead) { clear(lead); lead.appendChild(richText(p.aboutLead)); }
    setText('[data-cfg="aboutBody1"]', p.aboutBody1);
    setText('[data-cfg="aboutBody2"]', p.aboutBody2);
    renderStats($('[data-cfg="aboutStats"]'), p.stats);

    setText('[data-cfg="noteWork"]', p.sectionNotes.work);
    setText('[data-cfg="noteJourney"]', p.sectionNotes.journey);
    setText('[data-cfg="noteContact"]', p.sectionNotes.contact);

    // Portrait / avatar
    var avatar = $('[data-cfg="avatar"]');
    if (avatar) {
      var avatarSrc = C.resolveAsset(p.avatar, cfg);
      if (avatarSrc) {
        clear(avatar);
        avatar.appendChild(el('img', { src: avatarSrc, alt: p.avatarAlt || p.displayName, loading: 'lazy' }));
        avatar.hidden = false;
      } else {
        avatar.hidden = true;
      }
    }

    // Email links
    var mailto = 'mailto:' + (p.email || '');
    $$('[data-cfg="emailLink"]').forEach(function (link) {
      link.setAttribute('href', mailto);
      if (link.dataset.cfgText === 'true') link.textContent = (p.email || '') + ' ↗';
    });

    // Footer
    setText('[data-cfg="footerText"]', p.footerText);
    setText('[data-cfg="footerTag"]', p.footerTag);
  }

  /* ----------------------------------------------------------
     SKILLS
     ---------------------------------------------------------- */
  function renderSkills(cfg) {
    var container = $('#skillsContainer');
    if (!container) return;
    clear(container);
    (cfg.skills || []).forEach(function (skill) {
      container.appendChild(el('span', { class: 'chip', text: skill }));
    });
  }

  /* ----------------------------------------------------------
     PROJECTS
     ---------------------------------------------------------- */
  function renderFilters(cfg) {
    var container = $('[data-cfg="filters"]');
    if (!container) return;
    clear(container);
    var all = el('button', {
      class: 'filter-btn active magnetic', type: 'button', role: 'tab',
      'aria-selected': 'true', dataset: { filter: 'all' }, text: 'All'
    });
    container.appendChild(all);
    (cfg.categories || []).forEach(function (cat) {
      container.appendChild(el('button', {
        class: 'filter-btn magnetic', type: 'button', role: 'tab',
        'aria-selected': 'false', dataset: { filter: cat.id }, text: cat.label
      }));
    });
  }

  function categoryLabel(cfg, id) {
    var found = (cfg.categories || []).filter(function (c) { return c.id === id; })[0];
    return found ? found.label : id;
  }

  function projectCard(cfg, project) {
    var imageSrc = C.resolveAsset(project.image, cfg);
    var hasImage = !!imageSrc;
    var art = el('div', { class: 'project-art' });
    if (hasImage) {
      art.appendChild(el('img', { class: 'project-image', src: imageSrc, alt: project.title, loading: 'lazy' }));
    } else {
      art.appendChild(el('div', { class: 'art-orb', 'aria-hidden': 'true' }));
    }
    if (project.indexLabel) art.appendChild(el('span', { class: 'art-index', text: project.indexLabel }));
    if (project.caption) art.appendChild(el('span', { class: 'art-caption', text: project.caption }));

    var arrow = project.url
      ? el('a', { class: 'project-arrow', href: project.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open ' + project.title, text: '↗' })
      : el('span', { class: 'project-arrow', 'aria-hidden': 'true', text: '↗' });

    var info = el('div', { class: 'project-info' }, [
      el('div', { class: 'project-top' }, [
        el('h3', { text: project.title }),
        arrow
      ]),
      el('p', { text: project.description })
    ]);

    if (project.featured) {
      info.insertBefore(el('span', { class: 'featured-badge', text: 'FEATURED' }), info.firstChild);
    }

    var tags = el('div', { class: 'project-tags' });
    (project.tools || []).forEach(function (tool, i) {
      if (i > 0) tags.appendChild(el('span', { text: '·' }));
      tags.appendChild(el('span', { text: tool }));
    });
    info.appendChild(tags);

    if (project.videoUrl || project.url) {
      var links = el('div', { class: 'project-links' });
      if (project.videoUrl) links.appendChild(el('a', { class: 'project-link', href: project.videoUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Watch preview ↗' }));
      if (project.url) links.appendChild(el('a', { class: 'project-link', href: project.url, target: '_blank', rel: 'noopener noreferrer', text: 'View project ↗' }));
      info.appendChild(links);
    }

    var card = el('article', {
      class: 'glass-panel project reveal' + (project.featured ? ' is-featured' : ''),
      dataset: { category: project.category, id: project.id }
    }, [art, info]);

    if (project.category) card.setAttribute('aria-label', project.title + ' — ' + categoryLabel(cfg, project.category));
    return card;
  }

  function renderProjects(cfg) {
    var grid = $('#workGrid');
    if (!grid) return;
    clear(grid);
    if (!cfg.projects.length) {
      grid.appendChild(el('p', { class: 'empty-state', text: 'No projects yet. Add one from the admin panel.' }));
      return;
    }
    var reduced = isReduced() || !cfg.animations.scrollReveal;
    cfg.projects.forEach(function (project, index) {
      var card = projectCard(cfg, project);
      card.style.setProperty('--stagger-index', String(index));
      if (reduced) card.classList.add('visible');
      grid.appendChild(card);
    });
  }

  function bindFilters() {
    var container = $('[data-cfg="filters"]');
    var grid = $('#workGrid');
    if (!container || !grid || container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';
    container.addEventListener('click', function (event) {
      var btn = event.target.closest('.filter-btn');
      if (!btn) return;
      var filter = btn.dataset.filter;
      $$('.filter-btn', container).forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $$('.project', grid).forEach(function (project, index) {
        var match = filter === 'all' || project.dataset.category === filter;
        project.classList.toggle('hidden', !match);
        project.style.transitionDelay = match ? (index * 60) + 'ms' : '0ms';
      });
    });
    // Announce that the render layer owns filter clicks.
    window.__mahinRenderOwnsFilters = true;
  }

  /* ----------------------------------------------------------
     PROCESS / TIMELINE
     ---------------------------------------------------------- */
  function renderProcess(cfg) {
    var container = $('[data-cfg="process"]');
    if (!container) return;
    clear(container);
    (cfg.profile.process || []).forEach(function (step) {
      container.appendChild(el('div', { class: 'timeline-item reveal' }, [
        el('div', { class: 'timeline-date', text: step.step }),
        el('div', null, [
          el('h3', { text: step.title }),
          el('p', { text: step.body })
        ]),
        el('div', { class: 'timeline-marker', 'aria-hidden': 'true' })
      ]));
    });
  }

  /* ----------------------------------------------------------
     SOCIAL
     ---------------------------------------------------------- */
  function renderSocial(cfg) {
    var container = $('[data-cfg="social"]');
    if (!container) return;
    clear(container);
    var s = cfg.social;
    var items = [];
    if (s.instagram) items.push({ label: 'Instagram', url: s.instagram });
    if (s.youtube) items.push({ label: 'YouTube', url: s.youtube });
    if (s.facebook) items.push({ label: 'Facebook', url: s.facebook });
    if (s.behance) items.push({ label: 'Behance', url: s.behance });
    if (s.dribbble) items.push({ label: 'Dribbble', url: s.dribbble });
    (s.other || []).forEach(function (o) { items.push({ label: o.label, url: o.url }); });

    if (!items.length) { container.hidden = true; return; }
    container.hidden = false;
    items.forEach(function (item) {
      container.appendChild(el('a', {
        class: 'social-link',
        href: item.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: item.label + ' ↗'
      }));
    });
  }

  /* ----------------------------------------------------------
     MAIN RENDER
     ---------------------------------------------------------- */
  function render(config, options) {
    var opts = options || {};
    var result = C.normalizeConfig(config || C.load());
    currentConfig = result.config;

    try { C.applyTheme(currentConfig); } catch (e) { console.warn('[mahin] theme', e); }
    try { C.applyAnimations(currentConfig); } catch (e) { console.warn('[mahin] animations', e); }
    try { applySeo(currentConfig); } catch (e) { console.warn('[mahin] seo', e); }
    try { renderBrand(currentConfig); } catch (e) { console.warn('[mahin] brand', e); }
    try { renderProfile(currentConfig); } catch (e) { console.warn('[mahin] profile', e); }
    try { renderSkills(currentConfig); } catch (e) { console.warn('[mahin] skills', e); }
    try { renderFilters(currentConfig); } catch (e) { console.warn('[mahin] filters', e); }
    try { renderProjects(currentConfig); } catch (e) { console.warn('[mahin] projects', e); }
    try { renderProcess(currentConfig); } catch (e) { console.warn('[mahin] process', e); }
    try { renderSocial(currentConfig); } catch (e) { console.warn('[mahin] social', e); }
    try { bindFilters(); } catch (e) { console.warn('[mahin] bindFilters', e); }

    if (typeof window.__mahinApplyRuntimeConfig === 'function') {
      try { window.__mahinApplyRuntimeConfig(currentConfig, opts); } catch (e) { console.warn('[mahin] runtime', e); }
    }
    if (!firstRender) {
      // Re-render (live preview): immediately reveal so content is never stuck hidden.
      $$('.reveal').forEach(function (n) { n.classList.add('visible'); });
    }
    firstRender = false;
    document.documentElement.classList.add('mahin-rendered');
    return currentConfig;
  }

  /* ----------------------------------------------------------
     LIVE CMS HYDRATION (Supabase)
     The page always renders local/default content first, so it is
     never blank. When Supabase is configured we then fetch the
     published content and re-render in place. On any failure the
     fallback simply stays on screen.
     ---------------------------------------------------------- */
  function syncPill(text, kind) {
    var node = document.querySelector('.cms-sync');
    if (!node) {
      node = document.createElement('div');
      node.className = 'cms-sync';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.hidden = false;
    node.dataset.state = kind || 'loading';
    node.textContent = text;
    return node;
  }

  function removeSyncPill(node, delay) {
    if (!node) return;
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, delay || 0);
  }

  function hydrateRemote() {
    var cms = window.MahinCMS;
    if (!cms || typeof cms.fetchPublicConfig !== 'function') return Promise.resolve(null);
    if (typeof cms.isConfigured === 'function' && !cms.isConfigured()) return Promise.resolve(null);

    var reduced = isReduced();
    syncPill('Loading live content…', 'loading');
    document.documentElement.setAttribute('data-cms-loading', '1');

    return cms.fetchPublicConfig(C.load()).then(function (res) {
      if (res && res.source === 'remote') {
        render(res.config, { remote: true });
        syncPill('Live content loaded', 'ok');
      } else {
        syncPill('Showing offline content', 'fallback');
      }
      if (res && res.errors && res.errors.length) {
        console.warn('[mahin:cms]', res.errors.join(' | '));
      }
      return res;
    }).catch(function (err) {
      console.warn('[mahin:cms]', err);
      syncPill('Showing offline content', 'fallback');
      return null;
    }).then(function (res) {
      document.documentElement.removeAttribute('data-cms-loading');
      removeSyncPill(document.querySelector('.cms-sync'), reduced ? 900 : 2200);
      window.__mahinCmsSettled = true;
      return res;
    });
  }

  /* ----------------------------------------------------------
     PREVIEW MESSAGING
     ---------------------------------------------------------- */
  function listenForPreview() {
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.type !== 'mahin:preview-config' || !data.config) return;
      // Same-origin (or file://) only — never accept cross-origin config.
      var sameOrigin = event.origin === window.location.origin;
      var fileProto = window.location.protocol === 'file:';
      if (!sameOrigin && !fileProto && event.origin !== 'null') return;
      render(data.config, { preview: true, immediate: !!data.immediate });
    });
  }

  /* ----------------------------------------------------------
     BOOT
     ---------------------------------------------------------- */
  function boot() {
    var config;
    var params = new URLSearchParams(window.location.search);
    var isPreviewWindow = params.get('preview') === '1';
    if (isPreviewWindow) {
      try {
        var stored = JSON.parse(localStorage.getItem(C.PREVIEW_KEY) || 'null');
        if (stored) config = stored;
      } catch (_) { /* fall through to normal load */ }
    }
    render(config || C.load(), { preview: isPreviewWindow });
    listenForPreview();
    // The admin live-preview iframe must show the admin's config, not the
    // published one — otherwise it would fight the postMessage updates.
    if (!isPreviewWindow) hydrateRemote();
  }

  window.MahinRender = {
    render: render,
    current: function () { return currentConfig; },
    reload: function () { return render(C.load()); },
    hydrateRemote: hydrateRemote
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
