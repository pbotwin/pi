# Turning on the global leaderboard

By default every score is stored on the player's own device, because GitHub
Pages serves static files and has nowhere to run a database.

To make scores **global** — anyone who opens the link plays, and everyone sees
everyone's scores — the game needs one small backend. Supabase's free tier fits
exactly, and the whole setup is about ten minutes. The code is already written;
this is configuration only.

## 1. Create the project

1. Sign up at <https://supabase.com> and create a new project.
2. Wait for it to finish provisioning.
3. Open **Project Settings → API** and copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ...`

Copy the **anon public** key, never the **service_role** key. The anon key is
designed to be shipped in a web page; the service_role key bypasses all
security and must never leave a server.

## 2. Create the table

Open **SQL Editor** in Supabase, paste this, and run it.

```sql
create table public.scores (
  id     bigint generated always as identity primary key,
  name   text        not null check (char_length(name) between 1 and 12),
  score  integer     not null check (score >= 0 and score <= 10000),
  combo  integer     not null check (combo >= 0 and combo <= 10000),
  at     bigint      not null,
  mode   text        not null check (mode in ('endless', 'daily')),
  day    date,
  posted timestamptz not null default now()
);

-- The board is read constantly and filtered by mode, so index that path.
create index scores_rank_idx on public.scores (mode, score desc);
create index scores_day_idx  on public.scores (mode, day, score desc);

alter table public.scores enable row level security;

-- Anyone may read the board.
create policy "read scores"
  on public.scores for select
  to anon
  using (true);

-- Anyone may post a score, but only a well-formed one. The column CHECK
-- constraints above do the real validation; this policy just allows insert.
create policy "post scores"
  on public.scores for insert
  to anon
  with check (true);
```

Row-level security is what keeps this safe: visitors can read rows and add
rows, and can do nothing else — no updates, no deletes, no access to any other
table.

## 3. Add the credentials to GitHub

In the repository: **Settings → Secrets and variables → Actions → New
repository secret**. Add both:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon public key |

The deploy workflow already reads these. With them absent the build ships the
on-device board, so nothing breaks either way.

## 4. Deploy

Push any commit, or run the workflow manually from the **Actions** tab. When it
finishes, the **SCORES** screen shows a `GLOBAL` badge instead of `LOCAL`, and
the note under the table changes to say so.

## What players see

Everyone who opens <https://pbotwin.github.io/pi/> plays the same game. They set
a name under **Settings** (it defaults to `Player`), and each finished run posts
one row. The board shows the top ten per mode, with the player's own rows
highlighted. The daily board is filtered to the current date.

If the network is down or Supabase is unreachable, the game silently falls back
to the on-device board and keeps a local copy of every run, so a score is never
lost.

## Limits worth knowing

- The free tier is generous but not unlimited — it pauses a project after a
  week of complete inactivity, which a live game will not hit.
- Anyone can post a score, including a crafted one. The column constraints cap
  the plausible range, but this is a hobby leaderboard, not a tournament. If it
  ever matters, move submission behind an Edge Function that signs runs.
- Names are escaped before rendering, so a name can never inject markup.
