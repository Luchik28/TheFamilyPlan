import { describe, it, expect } from "vitest";
import { planDay, planDropoffs, planTrips, type LatLng, type Need, type TravelOracle } from "./route";

// A 1-D "road": points laid out on a line by their `lng`, travel time = the
// distance between them (1 unit = 1 minute). Lets us model "same place",
// "on the way", and "opposite directions" precisely.
const at = (x: number): LatLng => ({ lat: 0, lng: x });
const road: TravelOracle = (a, b) => Math.abs(a.lng - b.lng);

const HOME = at(0);
const equalWeights = () => 1;

function need(id: number, kidId: number, destX: number, deadline: number, origin = HOME): Omit<Need, "tripType"> {
  return { id, kidId, origin, dest: at(destX), deadlineMins: deadline };
}

describe("planDropoffs", () => {
  it("pools two kids going to the same place", () => {
    const needs = [need(1, 10, 30, 540), need(2, 11, 30, 540)];
    const trips = planDropoffs({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(1);
    expect(trips[0].stops.map((s) => s.needId).sort()).toEqual([1, 2]);
  });

  it("pools when one stop is just past the other ('passes right by')", () => {
    // Kid A at x=20, kid B at x=30, both due at 9:00. Home->A->B is 30 min of
    // driving; two separate trips would be 20 + 30 = 50 min out. Pooling wins.
    const needs = [need(1, 10, 20, 540), need(2, 11, 30, 540)];
    const trips = planDropoffs({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(1);
    // Visited nearer stop first.
    expect(trips[0].stops.map((s) => s.needId)).toEqual([1, 2]);
  });

  it("does NOT pool kids in opposite directions", () => {
    // A at x=-40, B at x=+40. Pooling forces a long backtrack; two trips win.
    const needs = [need(1, 10, -40, 600), need(2, 11, 40, 600)];
    const trips = planDropoffs({
      needs,
      drivers: [
        { driverId: 1, startMins: 0, endMins: 1440 },
        { driverId: 2, startMins: 0, endMins: 1440 },
      ],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(2);
  });

  it("respects deadlines: every kid arrives on time", () => {
    const needs = [need(1, 10, 20, 540), need(2, 11, 30, 540)];
    const trips = planDropoffs({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    for (const t of trips) {
      for (const s of t.stops) {
        const deadline = needs.find((n) => n.id === s.needId)!.deadlineMins;
        expect(s.atMins).toBeLessThanOrEqual(deadline);
      }
    }
  });

  it("weighting changes the decision: heavy driver weight forces a marginal pool", () => {
    // A triangle where A and B are each 10 min from home but 14 min apart.
    //   Separate driver time: (10+10) + (10+10) = 40.
    //   Pooled (home->A->B->home): 10 + 14 + 10 = 34  -> saves 6 driver minutes.
    //   But the 2nd kid now rides 24 min instead of 10 -> costs 14 kid minutes.
    // So it's a genuine tradeoff: with equal weights the kid cost dominates and
    // they stay separate; weighting the driver heavily flips it to pooled.
    const matrix: Record<number, Record<number, number>> = {
      0: { 0: 0, 1: 10, 2: 10 },
      1: { 0: 10, 1: 0, 2: 14 },
      2: { 0: 10, 1: 14, 2: 0 },
    };
    const tri: TravelOracle = (a, b) => matrix[a.lng][b.lng];
    const needs = [need(1, 10, 1, 1000), need(2, 11, 2, 1000)];
    const args = {
      needs,
      drivers: [
        { driverId: 1, startMins: 0, endMins: 1440 },
        { driverId: 2, startMins: 0, endMins: 1440 },
      ],
      travel: tri,
    };
    const light = planDropoffs({ ...args, weightOf: () => 1, driverWeight: 1 });
    const heavy = planDropoffs({ ...args, weightOf: () => 1, driverWeight: 10 });
    expect(light).toHaveLength(2);
    expect(heavy).toHaveLength(1);
  });

  it("flags a trip with no available driver", () => {
    const needs = [need(1, 10, 30, 540)];
    const trips = planDropoffs({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 60 }], // window too early
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips[0].driverId).toBeNull();
  });
});

describe("pick-ups", () => {
  // Pick-up: shared destination (home at x=0), kids collected from their spots.
  function pickup(id: number, kidId: number, fromX: number, deadline: number): Need {
    return { id, kidId, origin: at(fromX), dest: HOME, deadlineMins: deadline, tripType: "pickup" };
  }

  it("pools two kids picked up along the same way home", () => {
    const needs = [pickup(1, 10, 20, 1000), pickup(2, 11, 30, 1000)];
    const trips = planTrips("pickup", {
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(1);
    expect(trips[0].tripType).toBe("pickup");
    expect(trips[0].stops.map((s) => s.needId).sort()).toEqual([1, 2]);
  });

  it("a kid is picked up by their deadline", () => {
    const needs = [pickup(1, 10, 20, 900), pickup(2, 11, 30, 900)];
    const trips = planTrips("pickup", {
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    for (const t of trips) {
      for (const s of t.stops) {
        expect(s.atMins).toBeLessThanOrEqual(900);
      }
    }
  });
});

describe("planDay", () => {
  it("keeps drop-offs and pick-ups in separate cars and shares the driver pool", () => {
    const needs: Need[] = [
      { id: 1, kidId: 10, origin: HOME, dest: at(30), deadlineMins: 480, tripType: "dropoff" },
      { id: 2, kidId: 11, origin: at(30), dest: HOME, deadlineMins: 960, tripType: "pickup" },
    ];
    const trips = planDay({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(2);
    expect(trips.map((t) => t.tripType).sort()).toEqual(["dropoff", "pickup"]);
    // One driver, far-apart times -> both can use them.
    expect(trips.every((t) => t.driverId === 1)).toBe(true);
  });

  it("still plans address-less needs as solo, driver-assigned trips", () => {
    const needs: Need[] = [
      // No coordinates yet — just a time.
      { id: 1, kidId: 10, origin: null, dest: null, deadlineMins: 540, tripType: "dropoff" },
      // A routable one alongside it.
      { id: 2, kidId: 11, origin: HOME, dest: at(20), deadlineMins: 600, tripType: "dropoff" },
    ];
    const trips = planDay({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: road,
    });
    expect(trips).toHaveLength(2);
    const solo = trips.find((t) => t.stops.some((s) => s.needId === 1))!;
    expect(solo.depot).toBeNull();
    expect(solo.driverCommittedMins).toBe(0);
    expect(solo.departMins).toBe(540); // arrives by its deadline, no travel
    expect(solo.driverId).toBe(1); // still reserves a driver
  });

  it("works with no home set — every need becomes a solo trip", () => {
    const needs: Need[] = [
      { id: 1, kidId: 10, origin: null, dest: null, deadlineMins: 540, tripType: "dropoff" },
      { id: 2, kidId: 11, origin: null, dest: null, deadlineMins: 600, tripType: "pickup" },
    ];
    const trips = planDay({
      needs,
      drivers: [{ driverId: 1, startMins: 0, endMins: 1440 }],
      weightOf: equalWeights,
      driverWeight: 1,
      travel: () => Infinity,
    });
    expect(trips).toHaveLength(2);
    expect(trips.every((t) => t.driverId === 1 && t.driverCommittedMins === 0)).toBe(true);
  });
});
