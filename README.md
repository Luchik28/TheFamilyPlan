# The Family Plan

Are you a member of a family that has a VERY complicated logistics schedules?
Are the kids always being shuttled around to various extracurricular activities?
Then **The Family Plan** might be for you!

It includes tools to help a single person quickly plan out the week so they know who needs to drive who where and when! Gone are the hours spent each weekend figuring out logistics struggles! And it's free! (but not done yet)

## Features

- **People sidebar** — manage any number of **drivers** and **kids**, each with
  a name and color. Add, rename, recolor, or remove them.
- **Week view** of the current week (Mon–Sun) with an hourly time grid and a
  live "now" line. The grid shows two kinds of things:
  - **Kid needs** — a *point in time* (and place) a kid needs to be somewhere,
    shown as a labeled marker, e.g. "5:00 PM · Sam · Soccer field".
  - **Driver availability** — a *block of time* a driver can drive, shown as a
    translucent band in that driver's color.
- **Shared access** — each plan has a short access code. Anyone with the code
  and URL (`/plan/ABC123`) sees and edits the same schedule.
- **Add / edit / delete** by clicking an empty slot or an existing entry. The
  entry form adapts to who you pick: a kid gets a single time + location, a
  driver gets an available-from/until range.
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

| Method | Path                             | Purpose                          |
| ------ | -------------------------------- | -------------------------------- |
| POST   | `/api/plan`                      | Create a plan, returns code      |
| GET    | `/api/plan/:code/people`         | List drivers and kids            |
| POST   | `/api/plan/:code/people`         | Add a driver or kid              |
| PUT    | `/api/plan/:code/people/:id`     | Update a person                  |
| DELETE | `/api/plan/:code/people/:id`     | Remove a person (+ their items)  |
| GET    | `/api/plan/:code/items?week=...` | List schedule items for a week   |
| POST   | `/api/plan/:code/items`          | Add a need / availability        |
| PUT    | `/api/plan/:code/items/:id`      | Update an item                   |
| DELETE | `/api/plan/:code/items/:id`      | Delete an item                   |

## Note on access

The access code grants full view/edit access to that plan — treat it like a
shared password. For a quick family/team calendar this is intentional; add real
auth if you need per-user permissions.
