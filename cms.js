/* ============================================================
   MAHIN PORTFOLIO — SUPABASE CMS DATA ADAPTER
   ------------------------------------------------------------
   One place that knows how to talk to the Supabase tables and
   Storage bucket, and how to turn database rows into the config
   shape the rest of the site already understands.

   Used by:
     • render.js      -> fetchPublicConfig()  (published only)
     • admin/cms.js   -> fetchAdminData() + CRUD + storage

   Design rules
     • Every function resolves to { data, error } — it never throws.
     • The Supabase client is resolved lazily and can be injected,
       so the whole adapter is unit-testable without a network.
     • Public reads request only published/visible rows. Writing
       is additionally protected by RLS on the Supabase side; this
       frontend never relies on client-side checks alone.
     • No secret key is ever referenced.

   Table columns expected (see supabase/schema.sql):
     projects(id,title,slug,description,category,tools,project_url,
              video_url,thumbnail_path,thumbnail_url,featured,
              sort_order,status,index_label,caption)
     skills(id,name,sort_order,status)
     social_links(id,platform,label,url,sort_order,visible)
     site_settings(key,value)
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MahinCMS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /* Config core (config.js) gives us defaults + validators. Optional so the
     adapter also runs standalone in tests. */
  var C = (root && root.MahinConfig) || null;
  if (!C && typeof require === 'function') {
    try { C = require('./config.js'); } catch (_) { C = null; }
  }

  var FALLBACK_DEFAULTS = {
    profile: {}, appearance: {}, animations: {}, seo: {}, categories: []
  };

  var injectedClient = null;
  var PUBLIC_COLUMNS = '*';

  /* ----------------------------------------------------------
     SMALL UTILITIES
     ---------------------------------------------------------- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function deepClone(v) {
    if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (_) { /* */ } }
    return JSON.parse(JSON.stringify(v));
  }

  function deepMerge(base, patch) {
    if (patch === undefined) return base;
    if (!isObj(patch)) return patch;
    var out = isObj(base) ? Object.assign({}, base) : {};
    Object.keys(patch).forEach(function (k) {
      var pv = patch[k];
      if (isObj(pv) && isObj(out[k])) out[k] = deepMerge(out[k], pv);
      else out[k] = pv;
    });
    return out;
  }

  function toArray(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x !== null && x !== undefined && x !== ''; }).map(String);
    if (typeof v === 'string') {
      var t = v.trim();
      if (!t) return [];
      if (t.charAt(0) === '[') {
        try { var parsed = JSON.parse(t); if (Array.isArray(parsed)) return parsed.map(String); } catch (_) { /* */ }
      }
      return t.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return [];
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function slugify(v) {
    return String(v || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  }

  function formatBytes(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function message(error) {
    if (!error) return null;
    if (typeof error === 'string') return error;
    return error.message || error.error_description || error.details || 'Unknown Supabase error.';
  }

  /** Turn a raw Supabase error into a helpful, user-facing string. */
  function prettyError(error, context) {
    var m = message(error);
    if (!m) return context ? context + ' failed.' : 'Request failed.';
    if (/does not exist|schema cache|Could not find the table|relation .* does not exist|column .* does not exist/i.test(m)) {
      m += ' — your database schema does not match. Run supabase/schema.sql (see README).';
    }
    if (/row-level security|permission denied|not authorized|JWT/i.test(m)) {
      m += ' — the request was blocked by Row Level Security. Make sure you are signed in as the administrator.';
    }
    return context ? context + ': ' + m : m;
  }

  function ok(data) { return { data: data, error: null }; }
  function fail(error) { return { data: null, error: error }; }

  /* ----------------------------------------------------------
     CONFIG / CLIENT RESOLUTION
     ---------------------------------------------------------- */
  function supaConfig() {
    return (root && root.MAHIN_SUPABASE) || {};
  }

  function settingsKey(name) {
    var keys = supaConfig().settingsKeys || {};
    return keys[name] || name;
  }

  function table(name) {
    var t = supaConfig().tables || {};
    return t[name] || name;
  }

  function bucket() {
    return supaConfig().bucket || 'portfolio-media';
  }

  function isConfigured() {
    var S = root && root.MahinSupabase;
    if (S && typeof S.isConfigured === 'function') return S.isConfigured();
    var cfg = supaConfig();
    var blob = String(cfg.url || '') + String(cfg.publishableKey || '');
    return !!(cfg.enabled !== false && cfg.url && cfg.publishableKey && !/REPLACE_WITH|YOUR-PROJECT-REF/i.test(blob));
  }

  /** Resolve the Supabase client, or null when unavailable. Never throws. */
  function getClient() {
    if (injectedClient) return Promise.resolve(injectedClient);
    var S = root && root.MahinSupabase;
    if (S && typeof S.getClient === 'function') {
      return Promise.resolve()
        .then(function () { return S.getClient(); })
        .catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  /** Build a public Storage URL without needing the SDK (deterministic). */
  function publicUrl(path) {
    var value = String(path || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    var base = String(supaConfig().url || '').replace(/\/+$/, '');
    if (!base) return '';
    var clean = value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return base + '/storage/v1/object/public/' + encodeURIComponent(bucket()) + '/' + clean;
  }

  /* ----------------------------------------------------------
     ROW <-> OBJECT MAPPING
     ---------------------------------------------------------- */
  /**
   * True when an object has already been through mapProjectRow(). Raw DB
   * rows never contain camelCase `thumbnailPath`/`sortOrder` keys.
   */
  function isMappedProject(row) {
    return !!row && typeof row === 'object' &&
      Object.prototype.hasOwnProperty.call(row, 'thumbnailPath') &&
      Object.prototype.hasOwnProperty.call(row, 'sortOrder');
  }

  function mapProjectRow(row) {
    row = row || {};
    // Idempotent: list*() already returns mapped objects and toConfigProject()
    // passes them straight back in. Re-mapping would drop sortOrder.
    if (isMappedProject(row)) return Object.assign({}, row);
    var thumbnailPath = row.thumbnail_path || row.image_path || '';
    var thumbnailUrl = row.thumbnail_url || row.image_url || '';
    return {
      id: row.id,
      title: row.title || '',
      slug: row.slug || '',
      description: row.description || '',
      category: row.category || 'design',
      tools: toArray(row.tools),
      projectUrl: row.project_url || row.url || '',
      videoUrl: row.video_url || row.videoUrl || '',
      thumbnailPath: thumbnailPath,
      thumbnailUrl: thumbnailUrl,
      image: thumbnailUrl || publicUrl(thumbnailPath) || row.image || '',
      featured: !!row.featured,
      sortOrder: num(row.sort_order !== undefined ? row.sort_order : row.order, 0),
      status: row.status || supaConfig().statusDraft || 'draft',
      indexLabel: row.index_label || '',
      caption: row.caption || '',
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  /** Map a DB project row into the shape config.js/render.js expect. */
  function toConfigProject(row) {
    var p = mapProjectRow(row);
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      tools: p.tools,
      url: p.projectUrl,
      videoUrl: p.videoUrl,
      image: p.image,
      featured: p.featured,
      order: p.sortOrder,
      indexLabel: p.indexLabel,
      caption: p.caption
    };
  }

  var PROJECT_COLUMNS = {
    title: 'title',
    slug: 'slug',
    description: 'description',
    category: 'category',
    tools: 'tools',
    projectUrl: 'project_url',
    videoUrl: 'video_url',
    thumbnailPath: 'thumbnail_path',
    thumbnailUrl: 'thumbnail_url',
    featured: 'featured',
    sortOrder: 'sort_order',
    status: 'status',
    indexLabel: 'index_label',
    caption: 'caption'
  };

  /** Convert a partial project object into a DB row payload. */
  function projectToRow(input, partial) {
    input = input || {};
    var row = {};
    Object.keys(PROJECT_COLUMNS).forEach(function (key) {
      var present = Object.prototype.hasOwnProperty.call(input, key);
      if (partial && !present) return;
      if (!partial && !present) return; // only send what we were given
      var value = input[key];
      switch (key) {
        case 'tools': row[PROJECT_COLUMNS[key]] = toArray(value); break;
        case 'featured': row[PROJECT_COLUMNS[key]] = !!value; break;
        case 'sortOrder': row[PROJECT_COLUMNS[key]] = Math.round(num(value, 0)); break;
        case 'status':
          row[PROJECT_COLUMNS[key]] = value === (supaConfig().statusPublished || 'published')
            ? (supaConfig().statusPublished || 'published')
            : (supaConfig().statusDraft || 'draft');
          break;
        default: row[PROJECT_COLUMNS[key]] = value === null || value === undefined ? '' : String(value);
      }
    });
    // Auto-derive a slug on create when the author did not supply one.
    if (!partial && !row.slug && input.title) row.slug = slugify(input.title);
    return row;
  }

  function mapSkillRow(row) {
    row = row || {};
    return {
      id: row.id,
      name: row.name || '',
      sortOrder: num(row.sort_order, 0),
      status: row.status || (supaConfig().statusPublished || 'published')
    };
  }

  function mapSocialRow(row) {
    row = row || {};
    return {
      id: row.id,
      platform: row.platform || 'other',
      label: row.label || row.platform || '',
      url: row.url || '',
      sortOrder: num(row.sort_order, 0),
      visible: row.visible !== false
    };
  }

  /* ----------------------------------------------------------
     READS
     ---------------------------------------------------------- */
  function listProjects(opts) {
    opts = opts || {};
    return Promise.resolve().then(function () {
      return getClient();
    }).then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var query = client.from(table('projects')).select(PUBLIC_COLUMNS)
        .order('sort_order', { ascending: true });
      if (!opts.includeDrafts) query = query.eq('status', supaConfig().statusPublished || 'published');
      return Promise.resolve(query).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Loading projects'));
        return ok((res.data || []).map(mapProjectRow));
      });
    }).catch(function (err) { return fail(prettyError(err, 'Loading projects')); });
  }

  function listSkills(opts) {
    opts = opts || {};
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var query = client.from(table('skills')).select(PUBLIC_COLUMNS)
        .order('sort_order', { ascending: true });
      if (!opts.includeDrafts) query = query.eq('status', supaConfig().statusPublished || 'published');
      return Promise.resolve(query).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Loading skills'));
        return ok((res.data || []).map(mapSkillRow));
      });
    }).catch(function (err) { return fail(prettyError(err, 'Loading skills')); });
  }

  function listSocial(opts) {
    opts = opts || {};
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var query = client.from(table('socialLinks')).select(PUBLIC_COLUMNS)
        .order('sort_order', { ascending: true });
      if (!opts.includeHidden) query = query.eq('visible', true);
      return Promise.resolve(query).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Loading social links'));
        return ok((res.data || []).map(mapSocialRow));
      });
    }).catch(function (err) { return fail(prettyError(err, 'Loading social links')); });
  }

  function getSettings() {
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      return Promise.resolve(client.from(table('settings')).select('key,value')).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Loading site settings'));
        var map = {};
        (res.data || []).forEach(function (r) { if (r && r.key) map[r.key] = r.value; });
        var defaults = (C && C.DEFAULT_CONFIG) ? C.DEFAULT_CONFIG : FALLBACK_DEFAULTS;
        var merged = {
          profile: deepMerge(deepClone(defaults.profile || {}), map[settingsKey('profile')]),
          appearance: deepMerge(deepClone(defaults.appearance || {}), map[settingsKey('appearance')]),
          animations: deepMerge(deepClone(defaults.animations || {}), map[settingsKey('animations')]),
          seo: deepMerge(deepClone(defaults.seo || {}), map[settingsKey('seo')])
        };
        var cats = map[settingsKey('categories')];
        merged.categories = (Array.isArray(cats) && cats.length) ? cats : deepClone(defaults.categories || []);
        return ok(merged);
      });
    }).catch(function (err) { return fail(prettyError(err, 'Loading site settings')); });
  }

  function resolve() {
    return Promise.resolve().then(function () { return getClient(); });
  }

  /* ----------------------------------------------------------
     WRITES
     ---------------------------------------------------------- */
  function insertRow(tableName, row, context) {
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      return Promise.resolve(client.from(tableName).insert(row).select().single()).then(function (res) {
        if (res.error) return fail(prettyError(res.error, context));
        return ok(res.data);
      });
    }).catch(function (err) { return fail(prettyError(err, context)); });
  }

  function updateRow(tableName, id, row, context) {
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      return Promise.resolve(client.from(tableName).update(row).eq('id', id).select().single()).then(function (res) {
        if (res.error) return fail(prettyError(res.error, context));
        return ok(res.data);
      });
    }).catch(function (err) { return fail(prettyError(err, context)); });
  }

  function deleteRow(tableName, id, context) {
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      return Promise.resolve(client.from(tableName).delete().eq('id', id)).then(function (res) {
        if (res.error) return fail(prettyError(res.error, context));
        return ok(true);
      });
    }).catch(function (err) { return fail(prettyError(err, context)); });
  }

  function createProject(project) {
    return insertRow(table('projects'), projectToRow(project, false), 'Creating project')
      .then(function (res) { return res.error ? res : ok(mapProjectRow(res.data)); });
  }
  function updateProject(id, patch) {
    return updateRow(table('projects'), id, projectToRow(patch, true), 'Updating project')
      .then(function (res) { return res.error ? res : ok(mapProjectRow(res.data)); });
  }
  function deleteProject(id) { return deleteRow(table('projects'), id, 'Deleting project'); }

  function skillToRow(input, partial) {
    input = input || {};
    var row = {};
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'name')) row.name = String(input.name || '').trim();
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'sortOrder')) row.sort_order = Math.round(num(input.sortOrder, 0));
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'status')) {
      row.status = input.status === (supaConfig().statusDraft || 'draft')
        ? (supaConfig().statusDraft || 'draft')
        : (supaConfig().statusPublished || 'published');
    }
    return row;
  }
  function createSkill(skill) {
    if (!String(skill && skill.name || '').trim()) return Promise.resolve(fail('A skill needs a name.'));
    return insertRow(table('skills'), skillToRow(skill, false), 'Creating skill')
      .then(function (res) { return res.error ? res : ok(mapSkillRow(res.data)); });
  }
  function updateSkill(id, patch) {
    return updateRow(table('skills'), id, skillToRow(patch, true), 'Updating skill')
      .then(function (res) { return res.error ? res : ok(mapSkillRow(res.data)); });
  }
  function deleteSkill(id) { return deleteRow(table('skills'), id, 'Deleting skill'); }

  function socialToRow(input, partial) {
    input = input || {};
    var row = {};
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'platform')) row.platform = String(input.platform || 'other').trim() || 'other';
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'label')) row.label = String(input.label || '').trim();
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'url')) row.url = String(input.url || '').trim();
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'sortOrder')) row.sort_order = Math.round(num(input.sortOrder, 0));
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'visible')) row.visible = input.visible !== false;
    return row;
  }
  function createSocialLink(link) {
    if (!String(link && link.url || '').trim()) return Promise.resolve(fail('A social link needs a URL.'));
    return insertRow(table('socialLinks'), socialToRow(link, false), 'Creating social link')
      .then(function (res) { return res.error ? res : ok(mapSocialRow(res.data)); });
  }
  function updateSocialLink(id, patch) {
    return updateRow(table('socialLinks'), id, socialToRow(patch, true), 'Updating social link')
      .then(function (res) { return res.error ? res : ok(mapSocialRow(res.data)); });
  }
  function deleteSocialLink(id) { return deleteRow(table('socialLinks'), id, 'Deleting social link'); }

  /** Upsert one JSON section of site_settings (key/value design). */
  function saveSettingSection(name, value) {
    var key = settingsKey(name);
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var payload = { key: key, value: value };
      return Promise.resolve(
        client.from(table('settings')).upsert(payload, { onConflict: 'key' }).select().single()
      ).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Saving ' + name + ' settings'));
        return ok(res.data && res.data.value !== undefined ? res.data.value : value);
      });
    }).catch(function (err) { return fail(prettyError(err, 'Saving ' + name + ' settings')); });
  }

  /* ----------------------------------------------------------
     STORAGE / MEDIA
     ---------------------------------------------------------- */
  function allowedTypes() {
    return supaConfig().allowedImageTypes || ['image/jpeg', 'image/png', 'image/webp'];
  }
  function maxUpload() {
    return num(supaConfig().maxUploadBytes, 5 * 1024 * 1024);
  }

  function extensionFor(file) {
    var name = String(file && file.name || '');
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) !== -1) return ext === 'jpeg' ? 'jpg' : ext;
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function extOf(path) {
    var parts = String(path || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  /** Returns an error string, or null when the file is acceptable. */
  function validateImage(file) {
    if (!file) return 'No file selected.';
    if (allowedTypes().indexOf(file.type) === -1) {
      return 'Unsupported file type' + (file.type ? ' (' + file.type + ')' : '') + '. Use JPG, PNG or WebP.';
    }
    if (!file.size) return 'That file is empty.';
    if (file.size > maxUpload()) {
      return 'That file is ' + formatBytes(file.size) + ' — the maximum is ' + formatBytes(maxUpload()) + '.';
    }
    return null;
  }

  function uploadImage(file, folder) {
    var problem = validateImage(file);
    if (problem) return Promise.resolve(fail(problem));
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var dir = folder || (supaConfig().folders || {}).projects || 'projects';
      var path = dir + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + extensionFor(file);
      return Promise.resolve(client.storage.from(bucket()).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Uploading image'));
        return ok({
          path: path,
          url: publicUrl(path),
          name: file.name || path.split('/').pop(),
          size: file.size,
          type: file.type,
          createdAt: new Date().toISOString()
        });
      });
    }).catch(function (err) { return fail(prettyError(err, 'Uploading image')); });
  }

  /**
   * Replace the bytes behind an existing object while keeping its path, so
   * every project referencing it updates automatically. The new file must
   * use the same extension (paths are stable).
   */
  function replaceImage(oldPath, file) {
    var problem = validateImage(file);
    if (problem) return Promise.resolve(fail(problem));
    if (!oldPath) return Promise.resolve(fail('No existing image to replace.'));
    if (extOf(oldPath) !== extensionFor(file)) {
      return Promise.resolve(fail('Replacement must be a .' + extOf(oldPath) + ' file to keep the same URL.'));
    }
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      return Promise.resolve(client.storage.from(bucket()).upload(oldPath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      })).then(function (res) {
        if (res.error) return fail(prettyError(res.error, 'Replacing image'));
        return ok({ path: oldPath, url: publicUrl(oldPath), name: file.name, size: file.size, type: file.type });
      });
    }).catch(function (err) { return fail(prettyError(err, 'Replacing image')); });
  }

  /** Which project titles / settings reference this storage path. */
  function imageUsage(path) {
    if (!path) return Promise.resolve(ok([]));
    return Promise.all([
      listProjects({ includeDrafts: true }),
      getSettings()
    ]).then(function (results) {
      var projects = (results[0] && results[0].data) || [];
      var settings = (results[1] && results[1].data) || {};
      var url = publicUrl(path);
      var used = [];
      projects.forEach(function (p) {
        if (p.thumbnailPath === path || (p.thumbnailUrl && p.thumbnailUrl === url) || p.image === url) {
          used.push('Project: ' + (p.title || 'Untitled'));
        }
      });
      var avatarPath = settings.profile && settings.profile.avatarPath;
      if (avatarPath && avatarPath === path) used.push('Profile avatar');
      return ok(used);
    }).catch(function (err) { return fail(prettyError(err, 'Checking image usage')); });
  }

  /**
   * Delete an object, but refuse while it is still referenced by a project
   * or the profile avatar. This mirrors "never delete an image still in use".
   */
  function deleteImage(path) {
    if (!path) return Promise.resolve(fail('No image selected.'));
    return imageUsage(path).then(function (usage) {
      if (usage.error) return usage;
      if (usage.data.length) {
        return fail('This image is still used by ' + usage.data.join(', ') + '. Replace or remove those references first.');
      }
      return resolve().then(function (client) {
        if (!client) return fail('Supabase is not configured.');
        return Promise.resolve(client.storage.from(bucket()).remove([path])).then(function (res) {
          if (res.error) return fail(prettyError(res.error, 'Deleting image'));
          return ok(true);
        });
      });
    }).catch(function (err) { return fail(prettyError(err, 'Deleting image')); });
  }

  /** Every storage path that currently exists in the configured folders. */
  function listImages() {
    return resolve().then(function (client) {
      if (!client) return fail('Supabase is not configured.');
      var folders = supaConfig().folders || { projects: 'projects' };
      var names = Object.keys(folders).map(function (k) { return folders[k]; });
      return Promise.all(names.map(function (folder) {
        return Promise.resolve(client.storage.from(bucket()).list(folder, {
          limit: 200,
          sortBy: { column: 'name', order: 'asc' }
        })).then(function (res) {
          if (res.error) return { folder: folder, items: [], error: res.error };
          // Supabase returns folders with id === null; skip those.
          var items = (res.data || []).filter(function (item) { return item && item.id !== null && item.name; });
          return { folder: folder, items: items, error: null };
        });
      })).then(function (groups) {
        var errors = groups.filter(function (g) { return g.error; });
        var images = [];
        groups.forEach(function (g) {
          g.items.forEach(function (item) {
            var path = g.folder + '/' + item.name;
            images.push({
              path: path,
              name: item.name,
              folder: g.folder,
              size: (item.metadata && item.metadata.size) || 0,
              type: (item.metadata && item.metadata.mimetype) || '',
              updatedAt: item.updated_at || item.created_at || null,
              url: publicUrl(path)
            });
          });
        });
        if (errors.length) {
          return { data: images, error: prettyError(errors[0].error, 'Listing media') };
        }
        return ok(images);
      });
    }).catch(function (err) { return fail(prettyError(err, 'Listing media')); });
  }

  /** All storage paths referenced anywhere (used for backup / cleanup UI). */
  function collectImagePaths(projects, settings) {
    var paths = [];
    (projects || []).forEach(function (p) { if (p.thumbnailPath) paths.push(p.thumbnailPath); });
    if (settings && settings.profile && settings.profile.avatarPath) paths.push(settings.profile.avatarPath);
    return paths;
  }

  /* ----------------------------------------------------------
     HIGH-LEVEL LOADS
     ---------------------------------------------------------- */

  /**
   * Public site load. Merges published remote content over a local base
   * config. Sections that fail keep the fallback, so the page is never
   * blank and never throws. Returns { config, source, errors, counts }.
   */
  function fetchPublicConfig(baseConfig) {
    var base = baseConfig || (C ? C.load() : deepClone(FALLBACK_DEFAULTS));
    var out = deepClone(base);
    var errors = [];

    if (!isConfigured()) {
      return Promise.resolve({
        config: out,
        source: 'unconfigured',
        errors: ['Supabase is not configured — showing local fallback content.'],
        counts: null
      });
    }

    return Promise.all([
      listProjects({ includeDrafts: false }),
      listSkills({ includeDrafts: false }),
      listSocial({ includeHidden: false }),
      getSettings()
    ]).then(function (res) {
      var projects = res[0], skills = res[1], social = res[2], settings = res[3];

      if (projects.error) errors.push(projects.error);
      else out.projects = projects.data.map(toConfigProject);

      if (skills.error) errors.push(skills.error);
      else out.skills = skills.data.map(function (s) { return s.name; }).filter(Boolean);

      if (social.error) errors.push(social.error);
      else out.social = socialToConfig(social.data, out);

      if (settings.error) errors.push(settings.error);
      else {
        out.profile = deepMerge(out.profile || {}, settings.data.profile || {});
        out.appearance = deepMerge(out.appearance || {}, settings.data.appearance || {});
        out.animations = deepMerge(out.animations || {}, settings.data.animations || {});
        out.seo = deepMerge(out.seo || {}, settings.data.seo || {});
        if (settings.data.categories && settings.data.categories.length) out.categories = settings.data.categories;
      }
      // The profile email is the canonical contact address.
      if (out.profile && out.profile.email && out.social) {
        out.social.email = out.profile.email;
      }

      var remoteReached = !projects.error || !skills.error || !social.error || !settings.error;
      return {
        config: out,
        source: remoteReached ? 'remote' : 'fallback',
        errors: errors,
        counts: { projects: out.projects ? out.projects.length : 0 }
      };
    }).catch(function (err) {
      errors.push(prettyError(err, 'Loading live content'));
      return { config: out, source: 'fallback', errors: errors, counts: null };
    });
  }

  /**
   * Turn social_links rows into the config.social object shape.
   * The database is authoritative when the read succeeds: links that are
   * not present (or not visible) must NOT be inherited from local defaults,
   * otherwise deleting a link in the CMS would never remove it from the site.
   */
  function socialToConfig(rows, base) {
    var out = {
      email: '', instagram: '', youtube: '', facebook: '', behance: '', dribbble: '', other: []
    };
    var known = ['instagram', 'youtube', 'facebook', 'behance', 'dribbble', 'email'];
    (rows || []).forEach(function (link) {
      var platform = String(link.platform || '').toLowerCase();
      if (known.indexOf(platform) !== -1) out[platform] = link.url;
      else out.other.push({ label: link.label || link.platform, url: link.url });
    });
    if (!out.email && base && base.profile && base.profile.email) out.email = base.profile.email;
    return out;
  }

  /** Admin dashboard load: every row, including drafts and hidden links. */
  function fetchAdminData() {
    return Promise.all([
      listProjects({ includeDrafts: true }),
      listSkills({ includeDrafts: true }),
      listSocial({ includeHidden: true }),
      getSettings()
    ]).then(function (res) {
      var errors = res.map(function (r) { return r.error; }).filter(Boolean);
      return {
        projects: res[0].data || [],
        skills: res[1].data || [],
        socialLinks: res[2].data || [],
        settings: res[3].data || deepClone(FALLBACK_DEFAULTS),
        errors: errors
      };
    }).catch(function (err) {
      return {
        projects: [], skills: [], socialLinks: [],
        settings: deepClone(FALLBACK_DEFAULTS),
        errors: [prettyError(err, 'Loading dashboard')]
      };
    });
  }

  /* ----------------------------------------------------------
     TEST / ADVANCED HOOKS
     ---------------------------------------------------------- */
  function setClient(client) { injectedClient = client || null; }
  function clearClient() { injectedClient = null; }

  return {
    // setup
    isConfigured: isConfigured,
    getClient: getClient,
    setClient: setClient,
    clearClient: clearClient,
    publicUrl: publicUrl,
    // mapping
    mapProjectRow: mapProjectRow,
    mapSkillRow: mapSkillRow,
    mapSocialRow: mapSocialRow,
    toConfigProject: toConfigProject,
    projectToRow: projectToRow,
    socialToConfig: socialToConfig,
    // reads
    listProjects: listProjects,
    listSkills: listSkills,
    listSocial: listSocial,
    getSettings: getSettings,
    fetchPublicConfig: fetchPublicConfig,
    fetchAdminData: fetchAdminData,
    // project writes
    createProject: createProject,
    updateProject: updateProject,
    deleteProject: deleteProject,
    // skill writes
    createSkill: createSkill,
    updateSkill: updateSkill,
    deleteSkill: deleteSkill,
    // social writes
    createSocialLink: createSocialLink,
    updateSocialLink: updateSocialLink,
    deleteSocialLink: deleteSocialLink,
    // settings
    saveSettingSection: saveSettingSection,
    // media
    validateImage: validateImage,
    uploadImage: uploadImage,
    replaceImage: replaceImage,
    deleteImage: deleteImage,
    listImages: listImages,
    imageUsage: imageUsage,
    collectImagePaths: collectImagePaths,
    formatBytes: formatBytes
  };
});
