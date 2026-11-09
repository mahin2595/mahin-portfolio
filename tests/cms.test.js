/* ============================================================
   Supabase CMS adapter tests — run with:  npm test
   Exercises cms.js against an in-memory Supabase double:
   published-only reads, CRUD row mapping, settings upserts,
   storage upload validation and the "never delete a used image"
   guard. No network and no real project are required.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const C = require('../config.js');               // sets globalThis.MahinConfig
const BASE_SUPABASE = require('../supabase.config.js');
const cms = require('../cms.js');
const { createMockClient } = require('./support/mock-supabase.js');

const BASE_CONFIG = C.normalizeConfig(C.DEFAULT_CONFIG).config;

function configure(overrides) {
  globalThis.MAHIN_SUPABASE = Object.assign({}, BASE_SUPABASE, {
    url: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test_key_123',
    enabled: true
  }, overrides || {});
}

function reset() {
  cms.clearClient();
  globalThis.MAHIN_SUPABASE = Object.assign({}, BASE_SUPABASE);
}

function seedDatabase() {
  return {
    projects: [
      {
        id: 'p1', title: 'Published One', description: 'First', category: 'design',
        tools: ['Graphic design', 'Branding'], project_url: 'https://example.test/1',
        video_url: '', thumbnail_path: 'projects/p1.png', thumbnail_url: '',
        featured: true, sort_order: 1, status: 'published',
        index_label: 'PROJECT / 001', caption: 'CAPTION ONE'
      },
      {
        id: 'p2', title: 'Draft Two', description: 'Hidden', category: 'video',
        tools: ['Video'], project_url: '', video_url: '', thumbnail_path: '',
        thumbnail_url: '', featured: false, sort_order: 0, status: 'draft',
        index_label: '', caption: ''
      },
      {
        id: 'p3', title: 'Published Three', description: 'Third', category: 'motion',
        tools: ['Motion'], project_url: '', video_url: 'https://video.test/x',
        thumbnail_path: '', thumbnail_url: 'https://cdn.test/three.jpg',
        featured: false, sort_order: 2, status: 'published',
        index_label: 'PROJECT / 003', caption: ''
      }
    ],
    skills: [
      { id: 's1', name: 'VIDEO EDITING', sort_order: 1, status: 'published' },
      { id: 's2', name: 'HIDDEN SKILL', sort_order: 0, status: 'draft' }
    ],
    social_links: [
      { id: 'l1', platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/x', sort_order: 0, visible: true },
      { id: 'l2', platform: 'youtube', label: 'YouTube', url: 'https://youtube.com/x', sort_order: 1, visible: false },
      { id: 'l3', platform: 'other', label: 'X', url: 'https://x.com/x', sort_order: 2, visible: true }
    ],
    site_settings: [
      {
        key: 'profile',
        value: {
          displayName: 'Mahin', heroIntro: 'Remote intro', email: 'hi@mahin.test',
          stats: [{ label: 'Years', value: 9 }]
        }
      },
      { key: 'seo', value: { title: 'Remote title' } }
    ]
  };
}

test('isConfigured is false while supabase.config.js still has placeholders', () => {
  reset();
  assert.strictEqual(cms.isConfigured(), false);
  configure();
  assert.strictEqual(cms.isConfigured(), true);
  reset();
});

test('public fetch returns only published projects, ordered, with resolved image URLs', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const res = await cms.fetchPublicConfig(BASE_CONFIG);

  assert.strictEqual(res.source, 'remote');
  assert.deepStrictEqual(res.config.projects.map((p) => p.id), ['p1', 'p3']);
  assert.strictEqual(
    res.config.projects[0].image,
    'https://test.supabase.co/storage/v1/object/public/portfolio-media/projects/p1.png'
  );
  assert.strictEqual(res.config.projects[1].image, 'https://cdn.test/three.jpg');
  assert.strictEqual(res.config.projects[0].order, 1);
  assert.strictEqual(res.config.profile.heroIntro, 'Remote intro');
  assert.strictEqual(res.config.seo.title, 'Remote title');
  assert.deepStrictEqual(res.config.skills, ['VIDEO EDITING']);
  assert.strictEqual(res.config.social.instagram, 'https://instagram.com/x');
  assert.strictEqual(res.config.social.youtube, '', 'hidden link is not exposed publicly');
  assert.ok(res.config.social.other.some((o) => o.label === 'X'), 'custom link included');
  assert.strictEqual(res.errors.length, 0);
  cms.clearClient();
  reset();
});

test('public fetch falls back to local content when Supabase errors', async () => {
  configure();
  cms.setClient(createMockClient({ database: seedDatabase(), faults: { '*': 'permission denied for table projects' } }));

  const res = await cms.fetchPublicConfig(BASE_CONFIG);

  assert.strictEqual(res.source, 'fallback');
  assert.strictEqual(res.config.projects.length, BASE_CONFIG.projects.length, 'fallback projects preserved');
  assert.strictEqual(res.config.profile.displayName, BASE_CONFIG.profile.displayName);
  assert.ok(res.errors.length > 0);
  assert.ok(res.errors[0].indexOf('Row Level Security') !== -1, 'error explains RLS');
  reset();
});

test('admin fetch includes drafts and hidden links', async () => {
  configure();
  cms.setClient(createMockClient({ database: seedDatabase() }));

  const data = await cms.fetchAdminData();
  assert.deepStrictEqual(data.projects.map((p) => p.id), ['p2', 'p1', 'p3']);
  assert.strictEqual(data.skills.length, 2);
  assert.strictEqual(data.socialLinks.length, 3);
  assert.deepStrictEqual(data.errors, []);
  reset();
});

test('createProject maps config fields to DB columns and derives a slug', async () => {
  configure();
  const client = createMockClient({ database: { projects: [], skills: [], social_links: [], site_settings: [] } });
  cms.setClient(client);

  const res = await cms.createProject({
    title: 'New Idea', description: 'Desc', category: 'video',
    tools: 'Video, Color', sortOrder: 4, status: 'draft',
    thumbnailPath: 'projects/x.png', featured: true
  });

  assert.strictEqual(res.error, null);
  const row = client.__db.projects[0];
  assert.strictEqual(row.title, 'New Idea');
  assert.strictEqual(row.slug, 'new-idea');
  assert.deepStrictEqual(row.tools, ['Video', 'Color']);
  assert.strictEqual(row.status, 'draft');
  assert.strictEqual(row.featured, true);
  assert.strictEqual(row.sort_order, 4);
  assert.strictEqual(row.thumbnail_path, 'projects/x.png');
  reset();
});

test('updateProject sends only the fields that changed', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  await cms.updateProject('p2', { status: 'published' });

  const update = client.__calls.filter((c) => c.op === 'update').pop();
  assert.deepStrictEqual(Object.keys(update.payload), ['status']);
  assert.strictEqual(client.__db.projects.find((p) => p.id === 'p2').status, 'published');
  assert.strictEqual(client.__db.projects.find((p) => p.id === 'p2').title, 'Draft Two');
  reset();
});

test('deleteProject removes the row', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const res = await cms.deleteProject('p2');
  assert.strictEqual(res.error, null);
  assert.ok(!client.__db.projects.some((p) => p.id === 'p2'));
  reset();
});

test('skills CRUD maps to the skills table', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const created = await cms.createSkill({ name: '  BRANDING ', sortOrder: 5, status: 'published' });
  assert.strictEqual(created.error, null);
  assert.strictEqual(created.data.name, 'BRANDING');
  assert.strictEqual(client.__db.skills.find((s) => s.id === created.data.id).name, 'BRANDING');

  await cms.updateSkill(created.data.id, { name: 'BRAND IDENTITY' });
  assert.strictEqual(client.__db.skills.find((s) => s.id === created.data.id).name, 'BRAND IDENTITY');

  await cms.deleteSkill(created.data.id);
  assert.ok(!client.__db.skills.some((s) => s.id === created.data.id));
  reset();
});

test('social link CRUD maps to social_links', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const created = await cms.createSocialLink({ platform: 'behance', label: 'Behance', url: 'https://behance.net/x', sortOrder: 3, visible: true });
  assert.strictEqual(created.error, null);
  assert.strictEqual(created.data.platform, 'behance');

  await cms.updateSocialLink(created.data.id, { visible: false });
  assert.strictEqual(client.__db.social_links.find((l) => l.id === created.data.id).visible, false);

  await cms.deleteSocialLink(created.data.id);
  assert.ok(!client.__db.social_links.some((l) => l.id === created.data.id));
  reset();
});

test('saveSettingSection upserts JSON and getSettings merges defaults', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const saved = await cms.saveSettingSection('profile', { displayName: 'Edited Name' });
  assert.strictEqual(saved.error, null);

  const row = client.__db.site_settings.find((r) => r.key === 'profile');
  assert.strictEqual(row.value.displayName, 'Edited Name');

  const settings = await cms.getSettings();
  assert.strictEqual(settings.data.profile.displayName, 'Edited Name');
  assert.strictEqual(settings.data.animations.scrollReveal, true, 'missing section filled from defaults');
  assert.ok(Array.isArray(settings.data.categories));
  reset();
});

test('validateImage rejects wrong types, empty and oversized files', () => {
  configure();
  assert.ok(cms.validateImage(null));
  assert.ok(cms.validateImage({ type: 'image/gif', size: 10 }));
  assert.ok(cms.validateImage({ type: 'text/plain', size: 10 }));
  assert.ok(cms.validateImage({ type: 'image/png', size: 0 }));
  assert.ok(cms.validateImage({ type: 'image/png', size: 6 * 1024 * 1024 }));
  assert.strictEqual(cms.validateImage({ type: 'image/png', size: 1000 }), null);
  assert.strictEqual(cms.validateImage({ type: 'image/jpeg', size: 1000 }), null);
  assert.strictEqual(cms.validateImage({ type: 'image/webp', size: 1000 }), null);
  reset();
});

test('uploadImage stores the object and returns its public URL', async () => {
  configure();
  const client = createMockClient({ database: seedDatabase() });
  cms.setClient(client);

  const res = await cms.uploadImage({ type: 'image/png', size: 1234, name: 'shot.png' }, 'projects');

  assert.strictEqual(res.error, null);
  assert.ok(/^projects\/[a-z0-9-]+\.png$/.test(res.data.path), 'path is prefixed with the folder');
  assert.strictEqual(
    res.data.url,
    'https://test.supabase.co/storage/v1/object/public/portfolio-media/' + res.data.path
  );
  assert.strictEqual(client.__objects.length, 1);
  reset();
});

test('replaceImage keeps the path but requires the same file extension', async () => {
  configure();
  const client = createMockClient({
    database: seedDatabase(),
    objects: [{ path: 'projects/a.png', type: 'image/png', size: 10 }]
  });
  cms.setClient(client);

  const mismatch = await cms.replaceImage('projects/a.png', { type: 'image/webp', size: 20, name: 'b.webp' });
  assert.ok(mismatch.error, 'different extension is rejected');

  const replaced = await cms.replaceImage('projects/a.png', { type: 'image/png', size: 20, name: 'b.png' });
  assert.strictEqual(replaced.error, null);
  assert.strictEqual(replaced.data.path, 'projects/a.png');
  assert.strictEqual(client.__objects[0].size, 20);
  reset();
});

test('deleteImage refuses to delete an image still used by a project', async () => {
  configure();
  const client = createMockClient({
    database: seedDatabase(),
    objects: [
      { path: 'projects/p1.png', type: 'image/png', size: 10 },
      { path: 'projects/unused.png', type: 'image/png', size: 10 }
    ]
  });
  cms.setClient(client);

  const usage = await cms.imageUsage('projects/p1.png');
  assert.deepStrictEqual(usage.data, ['Project: Published One']);

  const blocked = await cms.deleteImage('projects/p1.png');
  assert.ok(blocked.error);
  assert.ok(blocked.error.indexOf('still used by') !== -1);
  assert.strictEqual(client.__objects.length, 2, 'used image kept');

  const deleted = await cms.deleteImage('projects/unused.png');
  assert.strictEqual(deleted.error, null);
  assert.strictEqual(client.__objects.length, 1);
  reset();
});

test('schema mismatch errors point the reader at schema.sql', async () => {
  configure();
  cms.setClient(createMockClient({
    database: seedDatabase(),
    faults: { projects: 'relation "public.projects" does not exist' }
  }));

  const res = await cms.listProjects();
  assert.ok(res.error);
  assert.ok(res.error.indexOf('supabase/schema.sql') !== -1);
  reset();
});

test('listImages combines configured folders', async () => {
  configure();
  const client = createMockClient({
    database: seedDatabase(),
    objects: [
      { path: 'projects/a.png', type: 'image/png', size: 100 },
      { path: 'profile/me.webp', type: 'image/webp', size: 200 }
    ]
  });
  cms.setClient(client);

  const res = await cms.listImages();
  assert.strictEqual(res.error, null);
  assert.deepStrictEqual(res.data.map((i) => i.path).sort(), ['profile/me.webp', 'projects/a.png']);
  assert.ok(res.data[0].url.indexOf('/storage/v1/object/public/portfolio-media/') !== -1);
  reset();
});

test('public URL construction is stable for nested paths', () => {
  configure();
  assert.strictEqual(
    cms.publicUrl('projects/my file.png'),
    'https://test.supabase.co/storage/v1/object/public/portfolio-media/projects/my%20file.png'
  );
  assert.strictEqual(cms.publicUrl('https://cdn.test/x.png'), 'https://cdn.test/x.png');
  assert.strictEqual(cms.publicUrl(''), '');
  reset();
});