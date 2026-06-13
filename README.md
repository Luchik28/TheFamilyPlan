# The Family Plan

Are you a member of a family that has a VERY complicated logistics schedules?
Are the kids always being shuttled around to various extracurricular activities?
Then **The Family Plan** might be for you!

It includes tools to help a single person quickly plan out the week so they know who needs to drive who where and when! Gone are the hours spent each weekend figuring out logistics struggles! And it's free! (but not done yet)

## Features

- **Week view** of the current week (Mon–Sun) with an hourly time grid and a
  live "now" line.
- **Shared access** — each calendar (a *plan*) has a short access code. Anyone
  with the code and URL (`/plan/ABC123`) sees and edits the same events.
- **Add / edit / delete events** by clicking an empty slot or an existing event.
  Each event has a title, day, start/end time, optional person, color, and notes.
- **Week navigation** (previous / next / today).
- **Vercel Postgres** persistence — durable across restarts and deploys.

## Tech

- Next.js 15 (App Router), React 19, TypeScript
- `@vercel/postgres` for the database
- Route handlers under `app/api/...` for the JSON API
- No CSS framework — plain `app/globals.css`

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import Project** from the repo.
3. In the project's **Storage** tab, create a **Postgres** database and connect
   it. Vercel injects `POSTGRES_URL` (and friends) automatically.
4. Deploy. The schema (`plans`, `events` tables) is created automatically on the
   first request via `ensureSchema()`.

## Local development

```bash
npm install

# Pull the Postgres env vars from your Vercel project (one-time):
npx vercel link
npx vercel env pull .env.local

npm run dev
```

Open http://localhost:3000

- **Create a plan** to get an access code.
- Share the URL (e.g. `/plan/ABC123`) or have others enter the code on the home
  page to **join**.

> No Postgres yet? You can also point `POSTGRES_URL` at any Postgres instance
> (local Docker, Neon, Supabase) — see `.env.example`.

## API

| Method | Path                              | Purpose                    |
| ------ | --------------------------------- | -------------------------- |
| POST   | `/api/plan`                       | Create a plan, returns code |
| GET    | `/api/plan/:code/events?week=...` | List events for a week      |
| POST   | `/api/plan/:code/events`          | Add an event                |
| PUT    | `/api/plan/:code/events/:id`      | Update an event             |
| DELETE | `/api/plan/:code/events/:id`      | Delete an event             |

## Note on access

The access code grants full view/edit access to that plan — treat it like a
shared password. For a quick family/team calendar this is intentional; add real
auth if you need per-user permissions.
