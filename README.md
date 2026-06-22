# The Family Plan

**Weekly logistics planner for families**. Helps manage logistics for families that have to manage driving their kids around to different extracurriculars all the time. Just put in when drivers are available, and when and where kids need to be, and it calculates the most optimal plan to get everyone where they need to be with as little time in the car as possible.

### Try the [Demo!!!](https://the-family-plan.vercel.app)

---

## Quick start

It's a website — **[open the link](https://the-family-plan.vercel.app)**, add a name for your family, and put in your home address (or any address where people will start and end each day). This is used to calculate drive times, to optimize who should drive who where, especially when multiple kids and locations are involved in a ride. Then:

1. Add a **driver** and a **kid** in the sidebar, or a couple.
2. Select the driver and drag on the calendar or click to mark when they are available.
3. Select the kid and click to add a drop-off or pickup. If you put in an address that shows up on the autocomplete, it'll automatically calculate the drive time. If the address isn't in there, you can still add the drive time in the settings.
4. Hit **Drives** to open the drives modal. The carpool plan appears, and you can save each person's schedule as an image to text them.

## Features

- **Drag-to-plan calendar** — select a driver and drag down a day to block out availability; select a kid and click to drop a pickup/dropoff at an exact time and address. Overlapping availability for the same driver auto-merges.
- **Automatic carpool solving** — Assigns drivers to trips and pools multiple kids into one car when the extra driving is worth it, while guaranteeing every kid arrives on time.
- **Real travel times** — addresses are geocoded and routed (OSRM), so it can estimate driving time correctly. Not all addresses or in the database, however, so this might not work very well depending on your location.
- **Priority tiers** — decide whose time matters most (drivers over kids by default). Drag people between tiers in Settings; the planner weights its choices accordingly.
- **Shareable schedules** — export any person's week as a clean PNG to send to every person, so they know exactly where they need to be and when.
- **Shared by a code** — every plan has a short access code and URL (`/plan/ABC123`) so you can add the entire family to work on the plan.

## How it works

The interesting part is the **carpool optimizer** ([`lib/route.ts`](lib/route.ts)).

After the user puts in all of the driver's availability, and when kid's need to get and where, they can press the drives button to generate the most optimal plan for who drives who when.

The "Best" plan means lowering this loss function as much as possible: **minimize Σ (priority weight × time in car)**, subject to the hard constraint that everyone arrives on time. The priority weight is gotten from the tiers that users set in settings, it helps protect some drivers time more than others. 

Deciding who rides together is a small dial-a-ride / vehicle-routing problem. Family-sized instances are tiny, so instead of a heavyweight solver it uses greedy savings-merging: every kid starts as their own trip, and trips are repeatedly fused whenever combining them lowers the objective, trying every stop order and keeping the cheapest. I might add a more efficient system in the future, as the current system runs in roughly O(n⁴), but it seems to work fine for now since n is always pretty small.

Although I initially tried to get it to use the location data to try to decide how the kids should be carpooled, this proved too complicated, as it asks OSRM for the real road time (one [`/table`](https://project-osrm.org/docs/v5.24.0/api/#table-service) matrix call per day), not the physical location.

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

Push to GitHub, import the repo in [Vercel](https://vercel.com), add a Postgres database (should be listed as Neon) in the Storage tab (it injects `POSTGRES_URL` automatically), and deploy.

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
