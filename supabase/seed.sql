-- ============================================================
-- MAHIN PORTFOLIO — OPTIONAL STARTER CONTENT
-- ============================================================
-- Run AFTER supabase/schema.sql, only if you want the four demo
-- projects, the skill chips and a profile row pre-filled.
-- It is safe to re-run: each block only inserts when its table is
-- still empty, so it can never duplicate your real content.
-- Delete / edit the rows from the /admin/ dashboard afterwards.
-- ============================================================

-- ------------------------------------------------------------
-- Starter projects (published so the site is not empty)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.projects) then
    insert into public.projects
      (title, slug, description, category, tools, featured, sort_order, status, index_label, caption)
    values
      ('Visual Identity', 'visual-identity',
       'A visual direction built around a clear concept, confident typography, and a memorable look.',
       'design', array['Graphic design','Branding'], true, 0, 'published',
       'PROJECT / 001', 'VISUAL IDENTITY STUDY'),
      ('Cinematic Editing', 'cinematic-editing',
       'A rhythm-led edit combining pacing, sound, transitions, and color to create atmosphere.',
       'video', array['Video editing','Color'], true, 1, 'published',
       'PROJECT / 002', 'CINEMATIC VIDEO EDIT'),
      ('AMV & Motion', 'amv-motion',
       'An expressive motion experiment built around impact frames, transitions, and music.',
       'motion', array['AMV','Motion design'], false, 2, 'published',
       'PROJECT / 003', 'AMV / MOTION EXPERIMENT'),
      ('AI Visual Concepts', 'ai-visual-concepts',
       'Exploring image-making, art direction, and visual storytelling through AI-assisted workflows.',
       'ai', array['AI art','Art direction'], false, 3, 'published',
       'PROJECT / 004', 'AI-ASSISTED ART DIRECTION');
  end if;
end $$;

-- ------------------------------------------------------------
-- Starter skills → the Creative Toolkit chips
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.skills) then
    insert into public.skills (name, sort_order, status) values
      ('VIDEO EDITING', 0, 'published'),
      ('AMV EDITING', 1, 'published'),
      ('VISUAL DESIGN', 2, 'published'),
      ('AI ART', 3, 'published'),
      ('MOTION GRAPHICS', 4, 'published'),
      ('BRANDING', 5, 'published'),
      ('COLOR GRADING', 6, 'published'),
      ('STORYTELLING', 7, 'published');
  end if;
end $$;

-- ------------------------------------------------------------
-- Starter social links (edit the URLs in the dashboard)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.social_links) then
    insert into public.social_links (platform, label, url, sort_order, visible) values
      ('instagram', 'Instagram', 'https://instagram.com/', 0, true),
      ('youtube',   'YouTube',   'https://youtube.com/',   1, true);
  end if;
end $$;

-- ------------------------------------------------------------
-- Starter profile (missing fields fall back to config.js defaults)
-- ------------------------------------------------------------
insert into public.site_settings (key, value) values (
  'profile',
  '{
    "displayName": "Mahin",
    "logoText": "MAHIN",
    "title": "Creative Designer / Video Editor",
    "heroEyebrow": "CREATIVE DESIGNER / VIDEO EDITOR",
    "availability": { "enabled": true, "text": "OPEN TO CREATIVE PROJECTS" },
    "heroHeading": "MAKING\nIDEAS FEEL\nUNREAL.",
    "heroAccentWord": "UNREAL.",
    "heroIntro": "Hey, I''m Mahin. I create visual identities, cinematic edits, and digital experiences that turn a good idea into something people remember.",
    "aboutLead": "I''m **Mahin** — a creative designer and video editor focused on visuals that make people **feel something.**",
    "aboutBody1": "From shaping a visual identity to editing a story frame by frame, I enjoy turning raw ideas into polished creative work. My approach combines clean design, strong composition, rhythm, and a constant curiosity to try something new.",
    "aboutBody2": "This is your space to tell your story. Add your background, creative philosophy, and the kind of clients or projects you want to attract.",
    "email": "hello@mahin.design",
    "location": "Available worldwide · Remote",
    "footerText": "MAHIN — MADE WITH INTENTION",
    "footerTag": "DESIGN · EDIT · REPEAT",
    "stats": [
      { "label": "Years Creating", "value": 3 },
      { "label": "Projects Delivered", "value": 50 },
      { "label": "Happy Clients", "value": 12 },
      { "label": "Videos Edited", "value": 200 }
    ]
  }'::jsonb
)
on conflict (key) do update
  set value = public.site_settings.value || excluded.value;
