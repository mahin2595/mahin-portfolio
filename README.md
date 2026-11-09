# Mahin Studio — Portfolio + Admin Control Panel

A premium, Apple-inspired glassmorphism portfolio for **Mahin — Creative Designer / Video Editor**, plus a fully local **Admin Control Panel** for editing every piece of content without touching code.

The public site keeps the original design and its "self-building while scrolling" animation, smooth scrolling and mobile-first layout. All editable content now lives in one shared configuration structure instead of being hardcoded across the HTML.

---

## 1. Project structure

| File | Purpose |
|------|---------|
| `index.html` | Public portfolio. Content falls back to sensible defaults if JS never runs. |
| `style.css` | Public design system (glass, colours, responsive, animations). |
| `script.js` | Public interactivity: custom cursor, scroll reveal, self-building hero, smooth scroll, filters, counters, contact form … |
| `config.js` | **Shared core.** `DEFAULT_CONFIG`, validation/normalisation, `localStorage` load/save, export/import, theme + animation application, asset resolution. Loaded by both the site and the admin. Works in the browser *and* in Node for tests. |
| `render.js` | Hydrates the public page from the shared config and handles live-preview messages. |
| `admin.html` | Admin shell (topbar, sidebar/drawer, panels). |
| `admin.css` | Admin glassmorphism styling (dark + light). |
| `admin.js` | Admin application: form engine, CRUD, media library, live preview, search, import/export/reset. |
| `sw.js` | Service worker (network-first so a stale cache can never pin old assets). |
| `manifest.json` | PWA manifest. |
| `tests/` | Automated tests (Node's built-in runner + jsdom). |

No runtime dependencies. No build step. `jsdom` is a **dev-only** dependency used by the tests.

---

## 2. Running it

From this project root:

```bash
# Option A — plain static server (recommended; needed for the service worker)
python3 -m http.server 8000
# then open http://localhost:8000

# Option B — just open index.html in a browser
```

Open the admin panel either from the floating **⚙ Admin** button on the site, or directly at:

```
http://localhost:8000/admin.html
```

> On GitHub Pages the same relative paths work from the repository sub-path.

---

## 3. How the data flows

```
admin.js  ──edits──▶  working config
   │                        │
   │ save (debounced)       │ postMessage  { type: 'mahin:preview-config', config }
   ▼                        ▼
localStorage          index.html iframe (render.js)
   │
   ▼
config.js load()  ──▶  render.js  ──▶  public page
```

`config.js` is the single source of truth. The admin never writes HTML strings for content — everything is rendered with `textContent`, so user-entered text cannot inject markup.

---

## 4. Admin Control Panel — feature guide

### 4.1 Dashboard (Overview)
- Live statistics: total projects, total skills, media assets, storage used.
- **Quick actions**: edit profile, add a project, upload media, appearance, preview site, export backup.
- **Website preview**: an embedded live iframe. It updates as you edit; **Refresh** reloads it and **Push changes** force-sends the current (even unsaved) config.
- **Save status** indicator in the topbar: *Saved*, *Unsaved changes*, *Saving…*, *Save failed*.
- Profile at a glance summary.

### 4.2 Profile
Edit display name, professional title, hero eyebrow, hero heading + accent word, intro, about lead/body, profile image, availability status, statistics and the process timeline. Avatar uploads use the media library.

### 4.3 Projects (full CRUD)
- **Add / edit / delete** projects with a confirmation dialog on delete.
- Thumbnail (media library, URL or upload).
- Title, description, category, tools/software (comma separated).
- Project URL and video preview URL (validated).
- **Featured** toggle and an explicit **Order** field, plus ↑/↓ reorder buttons.
- Search/filter the project list, and manage categories.

### 4.4 Media library
- Drag-and-drop or browse to upload **JPG, PNG, WebP**.
- Validates **file type and size** (2.5 MB per file) and shows an error toast otherwise.
- Preview, replace and delete images. Deleting warns you which items reference the image.
- Storage meter shows usage against the safe ceiling.
- Uploaded images are stored as data URLs and referenced as `media:<id>`, so one upload can be reused everywhere.

### 4.5 Skills
Add, edit, reorder (↑/↓) and delete skills. Duplicates and blanks are rejected. These populate the **Creative Toolkit** chips on the site.

### 4.6 Appearance
Background, text, accent (lime slot), secondary (cyan) and tertiary (violet) colours; glass transparency; blur intensity; border radius; card shadow; font family (display/body/mono); font scale; heading scale; light/dark presets. An in-panel **live preview** updates instantly, and the embedded site preview updates on push.

### 4.7 Animations
Toggle scroll reveal, self-building intro, page transitions, scroll-progress bar, hover effects, parallax orb, magnetic buttons, custom cursor and animated counters. Tune **duration**, **delay** and **stagger**, plus a live replay demo. Reduced-motion is always respected:
- `system` defers to the visitor's OS setting.
- `force-off` disables motion for everyone.

### 4.8 Contact & social
Email address (also used by the "Start a project" button), location/availability line, and Instagram / YouTube / Facebook / Behance / Dribbble links plus unlimited custom links.

### 4.9 SEO
Website title, meta description, keywords, canonical URL, Twitter/X handle, Open Graph sharing image and favicon. A live Google-style result and social-card preview update as you type.

### 4.10 Data & backup
- **Save changes now**, **Download backup** (JSON), **Copy JSON**, **Import from file**, **Reset to defaults**.
- Drag-and-drop JSON import with validation; invalid or unrelated JSON is rejected with a clear message and your data is untouched.
- **Automatic local saving** happens ~0.9 s after you stop editing (debounced).
- An **unsaved-changes** guard warns you before closing the tab.

### 4.11 Admin interface
- Sidebar navigation on desktop, slide-in drawer on mobile with scrim + Escape to close.
- Global **search** across every setting (panels are built on first search so results are complete).
- Toast notifications, confirmation dialogs, keyboard focus trapping in dialogs, skip-to-content link, and an admin-only light/dark toggle.

---

## 5. Security & architecture — read this

This admin is a **local editing tool**, not a hosted CMS.

- **There is no login.** Adding a client-side PIN or password would be security theatre: anyone can read the JavaScript and open `admin.html`. We deliberately do not pretend otherwise.
- **`localStorage` is browser- and device-specific.** Your edits are visible only in the browser where you made them. Open the site on another device, in another browser, or in private mode and you will see the defaults. Use **Export/Import** to move content.
- **Never store private data here.** No secrets, passwords, API keys or sensitive client information — everything saved is readable by anyone with access to the browser.
- **No credentials in JavaScript.** `config.js` contains no secrets by design.
- **Admin and public presentation are separate files** (`admin.*` vs `index.*`), and the admin page is marked `noindex`.

### If you need real authentication or global publishing
`localStorage` cannot do this. Add a backend/CMS with:
- a real authentication layer (session/JWT, hashed passwords),
- a database for content,
- an API the public site reads at load time,
- optional roles/permissions.

Compatible options include a small Node/Express + PostgreSQL API, Supabase, Firebase, Sanity or another headless CMS. The current admin's form/CRUD code can be pointed at such an API instead of `localStorage` with modest changes, because all content already flows through one central config object.

---

## 6. Testing

```bash
npm install     # installs the dev-only jsdom dependency
npm test
```

The suite (28 tests) covers:

- **config.js** — normalisation/clamping, unsafe-URL stripping *and reporting*, export/import round-trips, invalid import rejection, memory persistence, asset resolution, safe DOM-free theme calls.
- **admin.js (jsdom)** — boot/nav/dashboard, drawer + Escape, project add/edit/persist/delete-with-confirmation, autosave + simulated refresh, appearance live swatch, admin light/dark persistence, live preview messaging, invalid vs valid uploads, cross-panel search, reset-to-defaults, import validation, reduced-motion notice.
- **public site (jsdom)** — full hydration from config, theme variables, hidden empty avatar, social links, live-preview re-render + theme switch, reduced-motion reveal.

Manual checks worth doing in a real browser: drag-and-drop upload, the self-building scroll animation, smooth scrolling, and the mobile drawer at narrow widths.

---

## 7. Accessibility & performance notes

- Semantic landmarks, labelled controls, `aria-*` state on switches/tabs/dialogs, visible focus.
- `prefers-reduced-motion` honoured on both the site and the admin.
- Panels render lazily; search builds them once on demand.
- The service worker is **network-first** so updates always win over a stale cache.
- Renders use `textContent`, keeping user content XSS-safe.
