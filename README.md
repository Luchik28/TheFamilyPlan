# The Family Plan

**A weekly planner that solves your family's carpool for you** — say who's free to drive and where the kids need to be, and it works out who drives whom, pooling rides so nobody wastes time in the car.

![The Family Plan — a week calendar of driver availability and kid pickups, with an automatic driving plan](docs/banner.svg)

### ▶ [Demo!!!](https://the-family-plan.vercel.app)

---

## Quick start

It's a website — **[open the demo](https://the-family-plan.vercel.app)**, click **Create a new family**, type your home address, and you're in. Then:

1. Add a **driver** and a **kid** in the sidebar.
2. Select the driver and **drag on the calendar** to mark when they can drive.
3. Select the kid and **click** to add a drop-off or pickup (with a real address).
4. Hit **Drives** — the carpool plan appears, and you can save each person's schedule as an image to text them.

## Features

- **Drag-to-plan calendar** — select a driver and drag down a day to block out availability; select a kid and click to drop a pickup/dropoff at an exact time and address. Overlapping availability for the same driver auto-merges.
- **Automatic carpool solving** — the core of the app. It assigns drivers to trips and **pools multiple kids into one car** when the extra driving is worth it, while guaranteeing every kid arrives on time.
- **Real travel times** — addresses are geocoded and routed (OSRM), so "leave by" times and detours reflect actual driving, not guesses.
- **Priority tiers** — decide whose time matters most (drivers over kids by default). Drag people between tiers in Settings; the planner weights its choices accordingly.
- **Shareable schedules** — export any person's week as a clean PNG to send over text or email: drivers see their runs, kids see their rides and who's driving.
- **Shared by a code** — every plan has a short access code and URL (`/plan/ABC123`); the whole family edits one live schedule.

## How it works

The interesting part is the **carpool optimizer** ([`lib/route.ts`](lib/route.ts)).

Deciding who rides together is a small **dial-a-ride / vehicle-routing problem**. Family-sized instances are tiny, so instead of a heavyweight solver it uses **greedy savings-merging**: every kid starts as their own trip, and trips are repeatedly fused whenever combining them lowers the objective — trying every stop order (brute force is fine at this scale) and keeping the cheapest.

The key design decision: **pool on marginal detour cost, never on compass direction.** "Same direction vs. opposite" is unreliable — what matters is whether adding a kid costs much extra driving. Two kids heading "opposite" ways still ride together when one destination is simply on the road to the other, because the optimizer asks OSRM for the real road time (one [`/table`](https://project-osrm.org/docs/v5.24.0/api/#table-service) matrix call per day) rather than reasoning about geometry.

"Best" is a single weighted objective: **minimize Σ (priority weight × time committed)**, subject to the hard constraint that everyone arrives on time (early arrival is free — you just leave later). Priority tiers feed the weights, so the same machinery covers both "protect the drivers' time" and a flat "minimize everyone's total time in the car."

The optimizer is a **pure module with the travel-time oracle injected**, so its logic is unit-tested offline (no network) — see [`lib/route.test.ts`](lib/route.test.ts). Run the tests with `npm test`.

The rest is a Next.js App Router app: route handlers under [`app/api`](app/api) back a small JSON API over Postgres, and a single client component renders the calendar and runs the optimizer in the browser as you edit.

## Run it locally

Requires **Node 18+** and a **Postgres** connection string.

```bash
npm install
cp .env.example .env.local      # then set POSTGRES_URL (see below)
npm run dev                     # http://localhost:3000
```

**Getting a database (free, ~2 min):** create a project at [Neon](https://neon.tech) (or Supabase / local Docker Postgres) and paste its connection string into `.env.local` as `POSTGRES_URL`. The schema is created automatically on first request — no migrations to run.

```bash
# .env.local
POSTGRES_URL="postgres://user:password@host/dbname?sslmode=require"
```

Other commands:

```bash
npm test          # run the optimizer unit tests (Vitest)
npm run build     # production build
```

### Deploy

Push to GitHub, **Import** the repo in [Vercel](https://vercel.com), add a **Postgres** database in the Storage tab (it injects `POSTGRES_URL` automatically), and deploy.

## Tech stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **Postgres** via `@vercel/postgres`
- **OSRM** for routing, **Photon** (Komoot) for address autocomplete
- **html-to-image** for the PNG schedule export
- **Vitest** for tests · plain CSS, no UI framework

## Credits

- Routing by the [OSRM](https://project-osrm.org/) public API; geocoding by [Photon](https://photon.komoot.io/).
- PNG export via [html-to-image](https://github.com/bubkoo/html-to-image).
- Built for **[Hack Club Stardance](https://stardance.hackclub.com/)**.
