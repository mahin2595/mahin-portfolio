# Mahin Studio — Portfolio + Supabase CMS

A premium, Apple-inspired glassmorphism portfolio for **Mahin — Creative Designer / Video Editor**, with two admin surfaces:

1. **`/admin/` — the live Supabase CMS.** Real authentication, database-backed content, image uploads, drafts/publishing. Edits go live globally with **no GitHub redeploy**.
2. **`/admin.html` — the offline local editor.** Edits a config in `localStorage` in your own browser only. Kept as a zero-backend fallback.

The public site keeps the original design and its "self-building while scrolling" animation, smooth scrolling and mobile-first layout. All editable content lives in one shared configuration structure rather than being hardcoded across the HTML.

---

## 1. Project structure

| File | Purpose |
|------|---------|
| `index.html` | Public portfolio. Renders local defaults first, then hydrates from Supabase. Content still shows if JS or Supabase is unavailable. |
| `style.css` | Public design system (glass, colours, responsive, animations, sync pill). |
| `script.js` | Public interactivity: custom cursor, scroll reveal, self-building hero, smooth scroll, filters, counters, contact form. |
| `config.js` | **Shared core.** `DEFAULT_CONFIG`, validation/normalisation, `localStorage` load/save, export/import, theme + animation application, asset resolution. Works in the browser *and* in Node for tests. |
| `render.js` | Hydrates the public page from the shared config; handles live-preview messages and remote (Supabase) hydration. |
| `supabase.config.js` | **The only file you edit to connect the CMS** — project URL, publishable key, table/bucket names. Contains **no secrets**. |
| `supabase-client.js` | Lazily loads `@supabase/supabase-js` v2 (UMD, pinned CDN) and creates one client. `isConfigured()` returns false while placeholders remain, so the site silently uses fallback content. |
| `cms.js` | Framework-free data adapter shared by the site and dashboard: row ↔ config mapping, published-only reads, project/skill/social CRUD, settings, storage upload/validate, reference-safe delete. The client is injectable for tests. |
| `admin/index.html` | The protected **`/admin/`** dashboard shell (login, panels, drawer, dialogs, toasts). |
| `admin/cms.css` | CMS dashboard styling, layered on the shared admin design system. |
| `admin/cms.js` | Dashboard application: Supabase Auth, projects/skills/social/settings CRUD, media library, publish controls, connection status. |
| `admin.html` | **Offline local editor** (localStorage). Topbar/sidebar/panels. |
| `admin.css` | Admin glassmorphism styling (dark + light), shared by both admin surfaces. |
| `admin.js` | Local editor logic: form engine, CRUD, media library, live preview, search, import/export/reset. |
| `supabase/schema.sql` | Idempotent tables, indexes, **RLS policies** and the `portfolio-media` bucket + Storage policies. |
| `supabase/seed.sql` | Optional starter rows (only inserts into empty tables; safe to re-run). |
| `sw.js` | Service worker (network-first so a stale cache can never pin old assets). |
| `manifest.json` | PWA manifest, including an Admin shortcut to `./admin/`. |
| `tests/` | Automated tests (Node's built-in runner + jsdom + a spec-accurate mock Supabase client). |

No runtime dependencies and no build step. `jsdom` is a **dev-only** dependency used by the tests.

---

## 2. Running it locally

```bash
# plain static server (recommended; the service worker and /admin/ directory need it)
python3 -m http.server 8000
# then open http://localhost:8000
```

- Public site → `http://localhost:8000/`
- Live CMS → `http://localhost:8000/admin/` *(the trailing slash matters)*
- Offline editor → `http://localhost:8000/admin.html`

Since `/admin/` is a real directory with its own `index.html`, **browser refresh works** on it — there is no client-side router to fall over.

---

## 3. Supabase setup (do this once)

### 3.1 Create the database

In the Supabase dashboard open **SQL Editor** and run, in order:

> ✅ **Status on the machine where this repo was developed: already done.**
> Both files were executed on this project via the Management API (see §3.5).
> The instructions below are for a fresh project or a reset.

1. `supabase/schema.sql` — creates/repairs the four tables (`projects`, `skills`, `social_links`, `site_settings`), constraints, indexes, **RLS policies** and the `portfolio-media` bucket with Storage policies. Safe to re-run.
2. `supabase/seed.sql` *(optional)* — inserts a few starter projects and skill chips only when the tables are still empty.

The script is written to adopt an existing schema: it uses `create table if not exists` plus `add column if not exists` and drops/recreates its own policies, so it will not destroy rows you already have.

### 3.2 Create the administrator

- **Authentication → Users → Add user** — create your admin with email + password and confirm the email.
- **Authentication → Providers → Email** — leave **"Enable sign ups" off**. Registration is not exposed anywhere in this project, and turning it off means no visitor can create an account even by calling the API directly.
- Authorization is enforced by RLS in the database, not by the dashboard: every write policy requires an authenticated session.

### 3.3 Connect the site — the only edit you make

> ✅ **Status on this machine: already done.** `supabase.config.js` ships with the real
> project URL and publishable key for `ijxiygxqdtleurspiacs.supabase.co` (see §3.5 for
> the live verification of that project). If you clone the repo to a new machine or want
> to point it at a different project, repeat the steps below.

Open **`supabase.config.js`** and set (if not already set):

```js
url: 'https://YOUR-PROJECT-REF.supabase.co',
publishableKey: 'sb_publishable_REPLACE_WITH_YOUR_PUBLISHABLE_KEY',
```

Find them in Supabase under **Project Settings → API**:

| Supabase field | Goes into |
|----------------|-----------|
| Project URL | `url` |
| **Publishable key** (older projects: "anon public" key) | `publishableKey` |

> ⚠️ **Never put the `service_role` / secret key here.** It bypasses RLS and would be readable by every visitor. Only the publishable/anon key belongs in a static site; RLS decides what it may do.

Until real values are present (empty URL/key), `supabase-client.js` skips Supabase entirely — the page renders its local default content with no errors.

### 3.4 Verify from the dashboard

Open `/admin/` and sign in. The topbar status pill shows **Connected** when the SDK loaded and your session is valid.

On the **Dashboard → Connection** card press **Run live check**. It probes your live project and renders one row per requirement, with an ✗ and a concrete hint for anything missing:

- **Supabase Auth** — reachable endpoint (GoTrue).
- **Table `projects` / `skills` / `social_links` / `site_settings`** — exists and readable; a missing table gets the hint *"Missing — run supabase/schema.sql"*.
- **Storage bucket `portfolio-media`** — exists; a missing bucket gets *"Missing — supabase/schema.sql creates it"*.
- **Public sign-ups** *(browser only)* — warns if `disable_signup` is false.

The page itself degrades gracefully: if a table is missing, the public site keeps its local fallback content and shows a "live content unavailable" pill instead of a blank page.

### 3.5 Live verification of the configured project (2025-11)

> ✅ **Status: fully provisioned.** The database side of this repo's project
> (`ijxiygxqdtleurspiacs.supabase.co`) was set up and verified live via the Supabase
> Management API plus the public REST/Auth/Storage endpoints. Only the admin account
> (step 3.2) remains for you to create.

| Check | Result |
|-------|--------|
| Tables `projects`, `skills`, `social_links`, `site_settings` | ✅ created by running `supabase/schema.sql` — all four answer PostgREST queries |
| RLS policies (8) — public reads published/visible content only, authenticated full access | ✅ verified: anonymous SELECT returns only the 4 published projects; anonymous INSERT → `42501` "violates row-level security policy" |
| Seed content (`supabase/seed.sql`) | ✅ 4 projects, 8 skills, 2 social links, 5 `site_settings` rows |
| Storage bucket `portfolio-media` | ✅ exists **and is visible to the Storage API** — this required a grant + read policy on `storage.buckets` (see the fix note in `schema.sql` §7); without it the API ignores the row and every upload 404s |
| Anonymous upload to the bucket | ✅ blocked by RLS (`403 AccessDenied`) |
| Public sign-ups | ✅ **disabled** (`disable_signup: true`, set via the Management API) |

**What remains on your side (one step):**
1. **Authentication → Users → Add user** — create your admin email + password (sign-ups are off, so the dashboard's add-user path is the only way to create accounts).
2. Re-open `/admin/`, sign in, press **Run live check** — every row is green. Then work through the §8 manual checklist once to exercise login, CRUD and uploads as your admin.

> If you ever reset the project and re-run both SQL files, `schema.sql` now recreates
> the `storage.buckets` grant/policy automatically, so the bucket stays visible.

---

## 4. How the data flows

```
┌─ /admin/ (Supabase Auth session) ─┐
│  admin/cms.js form + CRUD         │
└───────────────┬───────────────────┘
                │ supabase-js v2 (publishable key + user JWT)
                ▼
        Supabase Postgres + Storage
                │ RLS: public reads only status='published'
                ▼
        cms.js fetchPublicConfig()
                │
                ▼
   index.html → render.js → public page
        (local defaults render first as fallback)
```

- The public page never queries drafts: RLS restricts anon reads to `status = 'published'`.
- `config.js` remains the single shape for content, so the local editor, the CMS and the renderer all speak the same language.
- The admin never injects HTML strings — content is rendered with `textContent`, keeping user input XSS-safe.

---

## 5. `/admin/` dashboard guide

### 5.1 Authentication
- Email + password login via **Supabase Auth** (no client-side password check).
- **Session persistence** — the session survives refresh and new tabs (`persistSession` is the SDK default); the dashboard re-checks it on load and restores your view.
- **Logout** from the topbar.
- **Password recovery** — "Forgot password?" emails a link (`resetPasswordForEmail`); the link returns to `/admin/`, where you set a new password via `updateUser`.
- Protected: the dashboard is `hidden` until a session exists; panels are never built or fetched while signed out. This is convenience only — the real gate is RLS.

### 5.2 Dashboard
Overview counts (projects, skills, social links, media), profile at a glance, quick actions, connection/session status and a "View site" link.

### 5.3 Projects
- **Create / edit / delete** rows in `projects` (delete asks for confirmation).
- Thumbnail via URL or upload to `portfolio-media`.
- Title, description, category, tools (comma separated), project URL, video preview URL.
- **Featured** toggle and **display order** (`sort_order`) with ↑/↓ reordering.
- **Draft / Published** controls: `status` is `draft` or `published`; drafts are invisible to visitors and to the public API.

### 5.4 Skills
Add, edit, reorder and delete rows in `skills`. Each has a name, level/percent or label, and a draft/published status. These populate the **Creative Toolkit** chips.

### 5.5 Social links
Manage rows in `social_links` (label, URL, icon/platform, visibility, order). URLs are validated before saving.

### 5.6 Profile & site settings
Edits the `site_settings` JSON sections: `profile` (name, title, hero copy, intro, about, availability, stats, process), `appearance`, `animations`, `seo` and `categories`. Each section is upserted as one row, so a save replaces only that section.

### 5.7 Media library
- Upload **JPG, PNG, WebP** to the `portfolio-media` bucket (drag-and-drop or browse).
- **Type and size validation** on the client (5 MB ceiling, matching `supabase.config.js`) — and the bucket's own limits are the real backstop.
- Preview, **replace** (same extension, stable path), **copy public URL**, and delete.
- **Delete safety:** before deleting, the adapter lists projects and refuses if any project still references the image. You must detach it first.
- Organized into `projects/` and `profile/` folders.

### 5.8 UX
Sidebar on desktop, slide-in **drawer** on mobile (scrim + Escape), toasts for success/error, confirmation dialogs with focus trapping, loading indicators on every async action, and a responsive layout down to small phones.

---

## 6. GitHub Pages deployment

Everything is static and uses **relative paths**, so it works from a repo sub-path (`https://user.github.io/repo/`) or a custom domain.

```bash
git add -A
git commit -m "Add Supabase CMS"
git push
```

Then **Settings → Pages → Source: Deploy from a branch → `main` / root**.

Because `/admin/` is a directory with an `index.html`, GitHub Pages serves it directly and refreshes resolve normally. If you visit `/admin` without the slash, Pages issues the standard directory redirect. No server routes, rewrites or serverless functions are required.

Published changes appear on the public site **without a redeploy** — the browser fetches from Supabase on load.

---

## 7. Security & architecture — read this

**The Supabase dashboard is genuinely protected; the offline editor is not.**

- **Authorization lives in the database.** RLS policies decide every read and write. Public visitors may read only `status = 'published'` rows; writes require an authenticated user. A visitor editing JavaScript gains nothing.
- **Only the publishable key ships.** `service_role`/secret keys are never referenced. Grep the repo: the only occurrence of `service_role` is a warning comment.
- **No public registration.** There is no sign-up UI, and you should keep "Enable sign ups" disabled in Supabase.
- **localStorage is browser- and device-specific.** The `/admin.html` editor's content is visible only in the browser that made it — not to visitors, not on other devices. Use its Export/Import to move content. A client-side PIN there would be security theatre; we do not pretend otherwise.
- **Drafts are not a security boundary for secret data** — they are simply excluded from public reads. Don't store client secrets in project fields.

### If you need more
For multiple editors or roles, add a `profiles`/roles column and scope RLS writes to that role. For scheduled publishing or audit history, add columns/triggers in Postgres. For a fully managed content model, the same `cms.js` adapter boundary lets you swap in another headless CMS without touching the public renderer.

---

## 8. Testing

```bash
npm install     # dev-only: jsdom
npm test
```

**71 tests, all passing.** With `node --test`, the runner discovers `tests/*.test.js`.

| Suite | Tests | Covers |
|-------|-------|--------|
| `config.test.js` | 10 | normalisation/clamping, unsafe-URL stripping *and reporting*, export/import round-trips, invalid-import rejection, memory persistence, asset resolution, safe DOM-free theme calls |
| `cms.test.js` | 21 | row ↔ config mapping, published-only filtering, project/skill/social CRUD, settings upsert+merge, image validation, upload/replace, **reference-safe delete**, schema-mismatch messaging, nested public URLs, **live `checkConnection()` diagnostics (healthy / missing table / missing bucket / unconfigured)** |
| `admin.test.js` | 15 | local editor: boot/nav/dashboard, drawer + Escape, project CRUD with confirmation, autosave + refresh, appearance swatch, light/dark persistence, live preview, valid/invalid uploads, cross-panel search, reset, import validation, reduced motion |
| `admin-cms.test.js` | 15 | `/admin/` dashboard: signed-out gate, login/logout, session restore, project create/edit/delete, publish toggle, skills/social CRUD, settings save, media upload/delete guard, error + toast paths, **dashboard "Run live check" (healthy and broken project)** |
| `site.test.js` | 6 | public hydration from config, theme variables, hidden empty avatar, social row, live-preview re-render + theme switch, reduced-motion reveal |
| `site-remote.test.js` | 4 | public site with a mock Supabase: published-only rendering, fallback when Supabase fails, no fetch when unconfigured, live content applied without reload |

### What is *not* verified here
The automated suite runs against a **spec-accurate mock client** that mirrors supabase-js v2 (`from/select/insert/update/delete/eq/order/single`, `storage.from().upload/getPublicUrl/remove`, `auth.*`) — no network, no real project.

Beyond the suite, the **real project was provisioned and probed live** (see §3.5): schema + seed applied, all RLS policies verified (anonymous reads limited to published/visible rows, anonymous writes rejected), the storage bucket visible and anonymous uploads blocked, and public sign-ups disabled. Still **not** verified live (the one dashboard step left — creating your admin user under Authentication → Users): signing in as *that* user, CRUD round-trips and uploads using that session. Create the admin, then work through the checklist below; the dashboard's **Run live check** shows everything green. The author will not claim those last end-to-end actions are tested until the admin account exists and is exercised.

### Manual checklist against your real project
1. Sign in at `/admin/`; refresh the page — you stay signed in.
2. Create a **draft** project → confirm it does **not** appear publicly; switch to published → it appears after a reload.
3. Edit and delete (confirm the dialog appears).
4. Upload a JPG/PNG/WebP, copy its URL, replace it, then try to delete it while a project uses it (should refuse).
5. Upload a `.gif` or an oversized file (should be rejected).
6. Change profile/appearance/SEO → reload the public site in a private window.
7. Trigger password recovery and set a new password.
8. Sign out, then open `/admin/` directly (you should see only the login screen).
9. Test the mobile layout at ~390 px width.
10. Enable OS reduced-motion and confirm animations are skipped.

---

## 9. Accessibility & performance notes

- Semantic landmarks, labelled controls, `aria-*` state on switches/tabs/dialogs, visible focus, skip-to-content.
- `prefers-reduced-motion` honoured on both the site and the admin.
- Supabase SDK is loaded lazily and pinned; if it fails, the site keeps its fallback content.
- Panels render lazily; the public page renders local content first, then re-renders once remote data arrives (no blank first paint).
- The service worker is **network-first** so updates always win over a stale cache.
- Renders use `textContent`, keeping user content XSS-safe.