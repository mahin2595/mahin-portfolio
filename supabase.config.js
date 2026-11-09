/* ============================================================
   MAHIN PORTFOLIO — SUPABASE CONFIGURATION  (EDIT THIS FILE)
   ------------------------------------------------------------
   This is the ONLY file you need to edit to connect the CMS.

   STEP 1 — Supabase dashboard -> Project Settings -> API
     • "Project URL"          -> url
     • "Publishable key"      -> publishableKey
       (older projects call this the "anon public" key; it is
        safe to ship in a static site because Row Level Security
        decides what it may read/write. NEVER put the
        service_role / secret key here.)

   STEP 2 — Replace the two placeholder strings below and save.

   Nothing in this file is a secret. Everything here is publicly
   readable by any visitor, by design. See README.md.
   ============================================================ */
(function (root) {
  'use strict';

  var config = {
    /* ------------------------------------------------------------------
       1. YOUR SUPABASE PROJECT
       ------------------------------------------------------------------ */
    // Example: 'https://abcdefghijklmnop.supabase.co'
    url: 'https://YOUR-PROJECT-REF.supabase.co',

    // Example: 'sb_publishable_AbCdEf123...'  (or the legacy 'eyJ...' anon key)
    publishableKey: 'sb_publishable_REPLACE_WITH_YOUR_PUBLISHABLE_KEY',

    /* ------------------------------------------------------------------
       2. WHERE THINGS LIVE IN SUPABASE
       Rename these only if your tables/bucket use different names.
       ------------------------------------------------------------------ */
    bucket: 'portfolio-media',

    tables: {
      projects: 'projects',
      skills: 'skills',
      socialLinks: 'social_links',
      settings: 'site_settings'
    },

    // Rows in `site_settings`: each key stores one JSON object.
    // Run supabase/schema.sql to create them.
    settingsKeys: {
      profile: 'profile',
      appearance: 'appearance',
      animations: 'animations',
      seo: 'seo',
      categories: 'categories'
    },

    // Storage folders inside the bucket. Used by the media library.
    folders: {
      projects: 'projects',
      profile: 'profile'
    },

    /* ------------------------------------------------------------------
       3. PUBLISH WORKFLOW
       A row is visible to the public only when status = statusPublished.
       ------------------------------------------------------------------ */
    statusPublished: 'published',
    statusDraft: 'draft',

    /* ------------------------------------------------------------------
       4. UPLOAD RULES (must stay >= your Supabase bucket limits)
       ------------------------------------------------------------------ */
    maxUploadBytes: 5 * 1024 * 1024, // 5 MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],

    /* ------------------------------------------------------------------
       5. SDK SOURCE (pinned so a breaking release can never auto-deploy)
       ------------------------------------------------------------------ */
    sdkUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js',

    // Master switch. Set false to force the site to use its local/default
    // content even after you have filled in the URL and key.
    enabled: true
  };

  root.MAHIN_SUPABASE = config;
  if (typeof module === 'object' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
