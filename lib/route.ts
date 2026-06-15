// Carpool optimization.
//
// Decide which kids ride together and with which driver, minimizing the
// weighted sum of everyone's "committed" time (door-to-done, waiting included),
// subject to the hard constraint that every kid reaches their destination by
// its deadline. Early arrival is free — you simply leave later (or wait).
//
// This module is PURE: travel times come from an injected oracle, so it can be
// unit-tested without network access. `fetchTableOracle` wires the oracle to
// OSRM's /table matrix in production.
//
// A trip is a depot-rooted round trip. For a DROP-OFF the depot is the shared
// origin (home): kids board at the depot and ride out to their destinations.
// For a PICK-UP the depot is the shared destination (home): the driver fans out
// to collect kids and brings them back. Both reduce to "visit a set of stops
// from a depot and return"; only how a kid's committed time is measured differs.

export type LatLng = { lat: number; lng: number };

// Travel time in minutes between two points.
export type TravelOracle = (from: LatLng, to: LatLng) => number;

export type TripType = "dropoff" | "pickup";

// A kid needs to travel between `origin` and `dest`, arriving at the far end of
// the trip by `deadlineMins` (minutes since midnight). For a drop-off that's
// arrival at `dest`; for a pick-up it's the driver reaching `origin`.
export type Need = {
  id: number;
  kidId: number;
  origin: LatLng;
  dest: LatLng;
  deadlineMins: number;
  tripType: TripType;
};

// A driver is available on this day for [startMins, endMins].
export type DriverAvail = {
  driverId: number;
  startMins: number;
  endMins: number;
};

export type PlanArgs = {
  needs: Need[];
  drivers: DriverAvail[];
  // Weighted cost-per-minute of a person's committed time. Higher = more
  // protected. Tier-count-agnostic: any ranking maps to a number here.
  weightOf: (personId: number) => number;
  // Weight to assume for whichever driver takes a trip (drivers share a tier by
  // default, so a single value suffices; refined per-driver later).
  driverWeight: number;
  travel: TravelOracle;
  // Above this many stops in one group, fall back from brute force (see below).
  bruteForceCap?: number;
};

export type TripStop = {
  needId: number;
  kidId: number;
  atMins: number; // clock time the car is at this kid's stop (drop or pickup)
  rideMins: number; // this kid's committed time
};

export type Trip = {
  tripType: TripType;
  depot: LatLng;
  stops: TripStop[];
  departMins: number;
  endMins: number; // when the driver returns to the depot
  driverId: number | null; // null = no available driver could cover it
  driverCommittedMins: number;
  weightedCost: number;
};

// ---- internals ----------------------------------------------------------- //

const EPS = 1e-6;

const depotOf = (n: Need, mode: TripType) => (mode === "dropoff" ? n.origin : n.dest);
const stopOf = (n: Need, mode: TripType) => (mode === "dropoff" ? n.dest : n.origin);

function key(p: LatLng): string {
  return `${p.lat},${p.lng}`;
}
function samePoint(a: LatLng, b: LatLng): boolean {
  return key(a) === key(b);
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

type Eval = {
  mode: TripType;
  depot: LatLng;
  order: Need[];
  offsets: number[]; // arrival offset from departure, per stop
  departMins: number;
  total: number; // full round-trip duration (depot -> stops -> depot)
  cost: number;
};

// Evaluate one ordering of stops for a depot-rooted round trip.
function evalOrder(
  mode: TripType,
  depot: LatLng,
  order: Need[],
  travel: TravelOracle,
  weightOf: (id: number) => number,
  driverWeight: number
): Eval {
  const offsets: number[] = [];
  let cum = 0;
  let prev = depot;
  for (const n of order) {
    cum += travel(prev, stopOf(n, mode));
    offsets.push(cum);
    prev = stopOf(n, mode);
  }
  const total = cum + travel(prev, depot); // return to depot

  // Leave as late as possible while still hitting every deadline (arrival at
  // each stop <= its deadline). Always satisfiable for a shared depot — a far
  // stop just forces an earlier departure, raising committed time.
  let departMins = Infinity;
  for (let i = 0; i < order.length; i++) {
    departMins = Math.min(departMins, order[i].deadlineMins - offsets[i]);
  }

  // Committed time. Drop-off: kid boards at depot (departure) and rides to their
  // stop -> offset. Pick-up: kid boards at their stop and rides until the driver
  // returns to the depot -> total - offset (waiting in the car counts).
  let cost = driverWeight * total;
  for (let i = 0; i < order.length; i++) {
    const ride = mode === "dropoff" ? offsets[i] : total - offsets[i];
    cost += weightOf(order[i].kidId) * ride;
  }
  return { mode, depot, order, offsets, departMins, total, cost };
}

function bestEval(
  mode: TripType,
  needs: Need[],
  travel: TravelOracle,
  weightOf: (id: number) => number,
  driverWeight: number,
  bruteForceCap: number
): Eval {
  const depot = depotOf(needs[0], mode);
  const orders =
    needs.length <= bruteForceCap
      ? permutations(needs)
      : [nearestNeighborOrder(mode, depot, needs, travel)];
  let best: Eval | null = null;
  for (const order of orders) {
    const e = evalOrder(mode, depot, order, travel, weightOf, driverWeight);
    if (!best || e.cost < best.cost - EPS) best = e;
  }
  return best!;
}

// Cheap fallback for large groups: visit the nearest unvisited stop each step.
function nearestNeighborOrder(
  mode: TripType,
  depot: LatLng,
  needs: Need[],
  travel: TravelOracle
): Need[] {
  const remaining = [...needs];
  const order: Need[] = [];
  let prev = depot;
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = travel(prev, stopOf(remaining[i], mode));
      if (d < bd) { bd = d; bi = i; }
    }
    const [n] = remaining.splice(bi, 1);
    order.push(n);
    prev = stopOf(n, mode);
  }
  return order;
}

function evalToTrip(ev: Eval): Trip {
  return {
    tripType: ev.mode,
    depot: ev.depot,
    departMins: ev.departMins,
    endMins: ev.departMins + ev.total,
    driverId: null,
    driverCommittedMins: ev.total,
    weightedCost: ev.cost,
    stops: ev.order.map((n, i) => ({
      needId: n.id,
      kidId: n.kidId,
      atMins: ev.departMins + ev.offsets[i],
      rideMins: ev.mode === "dropoff" ? ev.offsets[i] : ev.total - ev.offsets[i],
    })),
  };
}

// Greedy "savings" merge of one same-depot, same-type group: repeatedly fuse the
// pair whose combined trip beats the two separate trips by the most.
function poolGroup(
  mode: TripType,
  group: Need[],
  travel: TravelOracle,
  weightOf: (id: number) => number,
  driverWeight: number,
  bruteForceCap: number
): Eval[] {
  const evalOf = (ns: Need[]) => bestEval(mode, ns, travel, weightOf, driverWeight, bruteForceCap);
  let parts = group.map((n) => ({ needs: [n], ev: evalOf([n]) }));
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bestSaving = EPS;
    let bestMerged: Eval | null = null;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const merged = evalOf([...parts[i].needs, ...parts[j].needs]);
        const saving = parts[i].ev.cost + parts[j].ev.cost - merged.cost;
        if (saving > bestSaving) {
          bestSaving = saving;
          bi = i; bj = j; bestMerged = merged;
        }
      }
    }
    if (bi < 0 || !bestMerged) break;
    const mergedNeeds = [...parts[bi].needs, ...parts[bj].needs];
    parts = parts.filter((_, k) => k !== bi && k !== bj);
    parts.push({ needs: mergedNeeds, ev: bestMerged });
  }
  return parts.map((p) => p.ev);
}

// Assign drivers to already-built trips (earliest departures first), respecting
// availability windows and not double-booking a driver.
function assignDrivers(trips: Trip[], drivers: DriverAvail[]): Trip[] {
  trips.sort((a, b) => a.departMins - b.departMins);
  const busy: Record<number, { s: number; e: number }[]> = {};
  for (const trip of trips) {
    const start = trip.departMins;
    const end = trip.endMins;
    for (const d of drivers) {
      if (d.startMins > start || d.endMins < end) continue;
      const windows = busy[d.driverId] ?? [];
      if (windows.some((w) => w.s < end && w.e > start)) continue;
      trip.driverId = d.driverId;
      (busy[d.driverId] ??= []).push({ s: start, e: end });
      break;
    }
  }
  return trips;
}

// ---- public -------------------------------------------------------------- //

// Plan all trips of one type, pooling within shared-depot groups.
export function planTrips(mode: TripType, args: PlanArgs): Trip[] {
  const { needs, drivers, weightOf, driverWeight, travel, bruteForceCap = 7 } = args;
  const groups: Need[][] = [];
  for (const n of needs) {
    const g = groups.find((grp) => samePoint(depotOf(grp[0], mode), depotOf(n, mode)));
    if (g) g.push(n);
    else groups.push([n]);
  }
  const evals = groups.flatMap((g) => poolGroup(mode, g, travel, weightOf, driverWeight, bruteForceCap));
  return assignDrivers(evals.map(evalToTrip), drivers);
}

// Plan a full day: drop-offs and pick-ups are pooled separately (kept in
// separate cars) but share the same driver pool and availability.
export function planDay(args: PlanArgs): Trip[] {
  const dropoffs = planTrips("dropoff", { ...args, needs: args.needs.filter((n) => n.tripType === "dropoff") });
  const pickups = planTrips("pickup", { ...args, needs: args.needs.filter((n) => n.tripType === "pickup") });
  // Re-run driver assignment across BOTH so a driver isn't double-booked.
  const all = [...dropoffs, ...pickups];
  for (const t of all) t.driverId = null;
  return assignDrivers(all, args.drivers);
}

// Back-compat thin wrapper used by the unit tests / drop-off-only callers.
export function planDropoffs(args: Omit<PlanArgs, "needs"> & { needs: Omit<Need, "tripType">[] }): Trip[] {
  return planTrips("dropoff", {
    ...args,
    needs: args.needs.map((n) => ({ ...n, tripType: "dropoff" as const })),
  });
}

// Build a TravelOracle from OSRM's /table duration matrix for `points`.
export async function fetchTableOracle(
  points: LatLng[],
  signal?: AbortSignal
): Promise<TravelOracle> {
  if (points.length === 0) return () => Infinity;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const res = await fetch(
    `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`,
    { signal }
  );
  const json = await res.json();
  const durations: (number | null)[][] = json.durations ?? [];
  const index = new Map<string, number>();
  points.forEach((p, i) => index.set(key(p), i));
  return (a, b) => {
    const i = index.get(key(a));
    const j = index.get(key(b));
    if (i == null || j == null) return Infinity;
    const sec = durations[i]?.[j];
    return sec == null ? Infinity : Math.round(sec / 60);
  };
}
