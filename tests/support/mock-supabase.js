/* ============================================================
   IN-MEMORY SUPABASE CLIENT (test double)
   ------------------------------------------------------------
   Implements the small slice of the supabase-js v2 API that
   cms.js uses, with PostgREST-like chaining:

     client.from('projects').select('*').order('sort_order')
     client.from('projects').insert(row).select().single()
     client.from('projects').update(patch).eq('id', id).select().single()
     client.from('projects').delete().eq('id', id)
     client.from('site_settings').upsert(row, { onConflict: 'key' })

   plus storage.objects and a mock auth session. Fault injection
   is available through `client.__faults` so error paths can be
   exercised deterministically.
   ============================================================ */
'use strict';

function uid() {
  return '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.op = null;
    this.payload = null;
    this.filters = [];
    this.orderSpec = null;
    this.isSingle = false;
    this.upsertOpts = null;
  }

  /* -- operations ------------------------------------------------------ */
  select() {
    if (!this.op) this.op = 'select';
    return this;
  }
  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(row, opts) { this.op = 'upsert'; this.payload = row; this.upsertOpts = opts || {}; return this; }

  /* -- modifiers ------------------------------------------------------- */
  eq(column, value) { this.filters.push({ column, value }); return this; }
  order(column, opts) { this.orderSpec = { column, ascending: !opts || opts.ascending !== false }; return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.isSingle = true; return this; }

  /* -- execution ------------------------------------------------------- */
  _rows() {
    if (!this.client.__db[this.table]) this.client.__db[this.table] = [];
    return this.client.__db[this.table];
  }

  _fault() {
    const faults = this.client.__faults || {};
    if (faults[this.table]) return faults[this.table];
    if (faults['*']) return faults['*'];
    return null;
  }

  _matches(row) {
    return this.filters.every((f) => row[f.column] === f.value);
  }

  _run() {
    const fault = this._fault();
    if (fault) return { data: null, error: { message: fault } };

    const rows = this._rows();

    if (this.op === 'insert' || this.op === 'upsert') {
      const payload = this.payload;
      const incoming = Array.isArray(payload) ? payload : [payload];
      const results = [];
      for (const raw of incoming) {
        const row = Object.assign({ id: raw.id || uid(), created_at: new Date().toISOString() }, raw);
        if (this.op === 'upsert' && this.upsertOpts && this.upsertOpts.onConflict) {
          const key = this.upsertOpts.onConflict;
          const existing = rows.find((r) => r[key] === row[key]);
          if (existing) {
            Object.assign(existing, row);
            results.push(existing);
            continue;
          }
        }
        rows.push(row);
        results.push(row);
      }
      return { data: this.isSingle ? results[0] : results, error: null };
    }

    if (this.op === 'update') {
      const matched = rows.filter((r) => this._matches(r));
      matched.forEach((r) => Object.assign(r, this.payload));
      const data = this.isSingle ? (matched[0] || null) : matched;
      return { data, error: null };
    }

    if (this.op === 'delete') {
      const keep = [];
      rows.forEach((r) => { if (!this._matches(r)) keep.push(r); });
      this.client.__db[this.table] = keep;
      return { data: null, error: null };
    }

    // select
    let data = rows.filter((r) => this._matches(r)).map((r) => Object.assign({}, r));
    if (this.orderSpec) {
      const { column, ascending } = this.orderSpec;
      data.sort((a, b) => {
        const av = a[column], bv = b[column];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN) data = data.slice(0, this.limitN);
    if (this.isSingle) data = data[0] || null;
    return { data, error: null };
  }

  then(onFulfilled, onRejected) {
    const result = this._run();
    this.client.__calls.push({ table: this.table, op: this.op, payload: this.payload, filters: this.filters });
    return Promise.resolve(result).then(onFulfilled, onRejected);
  }
}

function createStorage(client, bucketName) {
  return {
    from(bucket) {
      const b = bucket || bucketName;
      return {
        upload(path, file, opts) {
          const fault = (client.__storageFaults || {})[path];
          if (fault) return Promise.resolve({ data: null, error: { message: fault } });
          const existing = client.__objects.find((o) => o.path === path);
          if (existing && !(opts && opts.upsert)) {
            return Promise.resolve({ data: null, error: { message: 'The resource already exists' } });
          }
          const object = {
            path, bucket: b,
            name: path.split('/').pop(),
            type: file.type,
            size: file.size,
            metadata: { size: file.size, mimetype: file.type }
          };
          if (existing) Object.assign(existing, object);
          else client.__objects.push(object);
          return Promise.resolve({ data: { path }, error: null });
        },
        replace(path, file) {
          return this.upload(path, file, { upsert: true });
        },
        remove(paths) {
          const list = Array.isArray(paths) ? paths : [paths];
          const removed = [];
          list.forEach((p) => {
            const idx = client.__objects.findIndex((o) => o.path === p);
            if (idx !== -1) removed.push(client.__objects.splice(idx, 1)[0]);
          });
          return Promise.resolve({ data: removed, error: null });
        },
        list(folder) {
          if (!folder) {
            return Promise.resolve({ data: client.__objects.slice(), error: null });
          }
          const prefix = folder.replace(/\/+$/, '') + '/';
          const items = client.__objects
            .filter((o) => o.path.startsWith(prefix))
            .map((o) => ({
              name: o.path.slice(prefix.length),
              id: o.path,
              metadata: o.metadata,
              updated_at: new Date().toISOString()
            }));
          return Promise.resolve({ data: items, error: null });
        },
        getPublicUrl(path) {
          return {
            data: {
              publicUrl: client.__url + '/storage/v1/object/public/' + b + '/' + path
            }
          };
        }
      };
    }
  };
}

function createAuth(client, seed) {
  let session = seed.session || null;
  const listeners = [];
  const users = seed.users || [{ email: 'admin@example.com', password: 'correct-horse' }];

  function emit(event, nextSession) {
    listeners.forEach((cb) => cb(event, nextSession));
  }

  return {
    __listeners: listeners,
    __emit: emit,
    getSession() {
      return Promise.resolve({ data: { session }, error: null });
    },
    signInWithPassword({ email, password }) {
      const user = users.find((u) => u.email === email && u.password === password);
      if (!user) {
        return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
      }
      session = { access_token: 'mock-token', user: { id: 'user-1', email } };
      emit('SIGNED_IN', session);
      return Promise.resolve({ data: { session, user: session.user }, error: null });
    },
    signOut() {
      session = null;
      emit('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    },
    resetPasswordForEmail(email) {
      const exists = users.some((u) => u.email === email);
      if (!exists) return Promise.resolve({ data: null, error: { message: 'User not found' } });
      return Promise.resolve({ data: {}, error: null });
    },
    updateUser({ password }) {
      if (session && session.user) session.user.password = password;
      emit('USER_UPDATED', session);
      return Promise.resolve({ data: { user: session && session.user }, error: null });
    },
    onAuthStateChange(cb) {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe() {} } } };
    }
  };
}

/**
 * @param {object} seed
 *   database   { projects: [], skills: [], social_links: [], site_settings: [] }
 *   objects    [{ path, type, size }]
 *   users      [{ email, password }]
 *   session    initial session
 *   faults     { projects: 'message', ... }
 *   storageFaults { 'projects/x.png': 'message' }
 */
function createMockClient(seed) {
  seed = seed || {};
  const client = {
    __db: JSON.parse(JSON.stringify(seed.database || {
      projects: [], skills: [], social_links: [], site_settings: []
    })),
    __objects: (seed.objects || []).map((o) => Object.assign({
      name: String(o.path || '').split('/').pop(),
      metadata: { size: o.size || 0, mimetype: o.type || 'image/png' }
    }, o)),
    __url: seed.url || 'https://test.supabase.co',
    __calls: [],
    __faults: seed.faults || {},
    __storageFaults: seed.storageFaults || {}
  };
  client.from = (table) => new Query(client, table);
  client.storage = createStorage(client, 'portfolio-media');
  client.auth = createAuth(client, seed);
  return client;
}

module.exports = { createMockClient };