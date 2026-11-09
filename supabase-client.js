/* ============================================================
   MAHIN PORTFOLIO — SUPABASE CLIENT BOOTSTRAP
   ------------------------------------------------------------
   Loads the official @supabase/supabase-js v2 library on demand,
   creates ONE shared client, and exposes it to the rest of the
   app. Works in the browser and in Node (for tests).

   Design notes
     • The SDK is fetched lazily the first time a query runs, so
       the public page is never blocked by a third-party script.
     • Every call fails soft: if the SDK cannot load or the site
       is not configured, we return null instead of throwing.
     • Tests can inject a fake client with setClient().
     • No secret or service-role key is ever used here.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MahinSupabase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PLACEHOLDER_RE = /(YOUR-PROJECT-REF|REPLACE_WITH|YOUR_|xxxx+)/i;

  var client = null;        // memoized real client
  var override = null;      // test-injected client
  var sdkPromise = null;    // in-flight SDK load
  var sdkNamespace = null;  // resolved global namespace
  var lastError = null;

  function getConfig() {
    return (root && root.MAHIN_SUPABASE) || {};
  }

  /**
   * True when a real project URL + publishable key are present and the
   * master switch is on. Placeholder values from supabase.config.js
   * return false so the site quietly uses its local fallback.
   */
  function isConfigured() {
    var cfg = getConfig();
    if (cfg.enabled === false) return false;
    var url = String(cfg.url || '').trim();
    var key = String(cfg.publishableKey || '').trim();
    if (!url || !key) return false;
    if (PLACEHOLDER_RE.test(url) || PLACEHOLDER_RE.test(key)) return false;
    // Accept hosted projects and local Supabase CLI instances.
    var urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)(\/|$)/i.test(url) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    return urlOk;
  }

  /**
   * Append the SDK <script> once and resolve the global namespace.
   * Rejects after a timeout so a blocked CDN can never hang the UI.
   */
  function loadSdk() {
    if (sdkNamespace && sdkNamespace.createClient) return Promise.resolve(sdkNamespace);
    if (typeof root.supabase !== 'undefined' && root.supabase && root.supabase.createClient) {
      sdkNamespace = root.supabase;
      return Promise.resolve(sdkNamespace);
    }
    if (sdkPromise) return sdkPromise;

    var cfg = getConfig();
    var src = cfg.sdkUrl;

    sdkPromise = new Promise(function (resolve, reject) {
      if (!src || typeof document === 'undefined') {
        reject(new Error('Supabase SDK cannot be loaded in this environment.'));
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      var settled = false;

      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        sdkPromise = null;
        lastError = 'Timed out loading the Supabase library.';
        reject(new Error(lastError));
      }, 15000);

      script.onload = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sdkNamespace = root.supabase || null;
        if (sdkNamespace && sdkNamespace.createClient) resolve(sdkNamespace);
        else {
          sdkPromise = null;
          lastError = 'Supabase library loaded but createClient is missing.';
          reject(new Error(lastError));
        }
      };
      script.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sdkPromise = null;
        lastError = 'Could not download the Supabase library (check your connection).';
        reject(new Error(lastError));
      };

      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  /**
   * Resolve the shared client, or null when unavailable.
   * Never throws.
   */
  function getClient() {
    if (override) return Promise.resolve(override);
    if (client) return Promise.resolve(client);
    if (!isConfigured()) return Promise.resolve(null);

    return loadSdk().then(function (sdk) {
      if (!sdk || !sdk.createClient) return null;
      var cfg = getConfig();
      client = sdk.createClient(cfg.url, cfg.publishableKey, {
        auth: {
          persistSession: true,      // session persistence across refresh
          autoRefreshToken: true,
          detectSessionInUrl: true,  // required for password-recovery links
          storageKey: 'mahin-cms-auth'
        }
      });
      return client;
    }).catch(function (err) {
      lastError = err && err.message ? err.message : String(err);
      return null;
    });
  }

  function isReady() { return !!override || !!client; }
  function getLastError() { return lastError; }

  /* Test / advanced hooks ------------------------------------------------ */
  function setClient(injected) { override = injected || null; }
  function clearClient() { client = null; }
  function reset() {
    override = null;
    client = null;
    sdkPromise = null;
    sdkNamespace = null;
    lastError = null;
  }
  function setSdkNamespace(ns) { sdkNamespace = ns || null; }

  return {
    getConfig: getConfig,
    isConfigured: isConfigured,
    loadSdk: loadSdk,
    getClient: getClient,
    isReady: isReady,
    getLastError: getLastError,
    setClient: setClient,
    clearClient: clearClient,
    setSdkNamespace: setSdkNamespace,
    reset: reset
  };
});
