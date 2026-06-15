"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LocationInput from "./LocationInput";
import { fetchTableOracle, planDay, type LatLng, type Need, type Trip } from "@/lib/route";

const DEFAULT_TIERS = [2, 1];

// Resolve a person's effective tier index (role default when unset, clamped).
function resolveTierIdx(tier: number | null | undefined, role: Role, tierCount: number): number {
  const fallback = role === "driver" ? 0 : tierCount - 1;
  const t = tier ?? fallback;
  return Math.max(0, Math.min(tierCount - 1, t));
}

const DAY_START = 6; // grid starts at 06:00
const DAY_END = 23; // grid ends at 23:00
const HOUR_H = 48; // px per hour — must match .calendar --hour-h
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A palette to suggest colors for new people.
const PALETTE = [
  "#4f7cff", "#e5484d", "#22a06b", "#f5a524", "#a855f7",
  "#0ea5e9", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#84cc16", "#d946ef", "#06b6d4", "#fb923c", "#8b5cf6",
  "#10b981", "#f43f5e", "#3b82f6", "#eab308", "#64748b",
];

type Role = "driver" | "kid";

type Person = {
  id: number;
  name: string;
  role: Role;
  color: string;
  tier: number | null;
};

// What should be in a "plan"
// It's a list of drives? Each drive has start, person, location, etc.
// So a LIST of drives

type Drive = {
  id: number;
  start_time: string;
  duration_mins: number;
  participants: Person[];
  start_location: string;
  end_location: string;
}

type Plan = {
  id: number;
  week_start: string;
  drives: Drive[];
};

type ScheduleItem = {
  id: number;
  person_id: number;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location: string;
  lat: number | null;
  lng: number | null;
  travel_mins: number | null;
  notes: string;
  trip_type: TripType;
  person_name: string;
  person_role: Role;
  person_color: string;
};

type TripType = "dropoff" | "pickup";

type ItemForm = {
  id: number | null;
  person_id: number;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  lat: number | null;
  lng: number | null;
  travel_mins: number | null;
  notes: string;
  trip_type: TripType;
};

type PersonForm = {
  id: number | null;
  name: string;
  role: Role;
  color: string;
  tier: number | null;
};

// ---- date helpers (local time) ------------------------------------------- //
function sundayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // getDay(): 0 = Sunday
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// The week to show: the current Sun–Sat week, but on weekends (Sat/Sun) jump to
// next week, since plans are usually about the upcoming weekdays.
function defaultWeekStart(): Date {
  const today = new Date();
  const start = sundayOf(today);
  const dow = today.getDay();
  return dow === 0 || dow === 6 ? addDays(start, 7) : start;
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function topFor(hhmm: string): number {
  return ((minutesOf(hhmm) - DAY_START * 60) / 60) * HOUR_H;
}
function minsToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export default function Calendar({ code, name }: { code: string; name: string }) {
  const [weekStart] = useState<Date>(() => defaultWeekStart());
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [personForm, setPersonForm] = useState<PersonForm | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<Date>(() => new Date());
  const [home, setHome] = useState<{ address: string; lat: number | null; lng: number | null }>({ address: "", lat: null, lng: null });
  const [travelTimes, setTravelTimes] = useState<Record<number, number>>({});
  const [travelOrigins, setTravelOrigins] = useState<Record<number, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<{ address: string; lat: number | null; lng: number | null }>({ address: "", lat: null, lng: null });
  const [drivesOpen, setDrivesOpen] = useState(false);
  const [priorityTiers, setPriorityTiers] = useState<number[]>(DEFAULT_TIERS);
  // Trips computed by the carpool optimizer, grouped by date.
  const [weekTrips, setWeekTrips] = useState<{ date: string; trips: Trip[] }[]>([]);
  // Local editing state for the settings tier editor.
  const [tiersForm, setTiersForm] = useState<number[]>(DEFAULT_TIERS);
  const [tierAssign, setTierAssign] = useState<Record<number, number>>({});
  const [hoverGhost, setHoverGhost] = useState<{ dateStr: string; startMins: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ dateStr: string; startMins: number; endMins: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ dateStr: string; startMins: number; startClientY: number; isDragging: boolean; endMins: number } | null>(null);
  const selectedPersonRef = useRef<Person | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const loadPeople = useCallback(async () => {
    const res = await fetch(`/api/plan/${code}/people`);
    if (res.ok) setPeople((await res.json()).people);
  }, [code]);

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/plan/${code}/items?week=${isoDate(weekStart)}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      if (data.plan) {
        setHome({
          address: data.plan.home_address || "",
          lat: data.plan.home_lat ?? null,
          lng: data.plan.home_lng ?? null,
        });
        if (Array.isArray(data.plan.priority_tiers) && data.plan.priority_tiers.length) {
          setPriorityTiers(data.plan.priority_tiers);
        }
      }
    } else {
      showToast("Failed to load schedule");
    }
  }, [code, weekStart, showToast]);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const deltaY = e.clientY - dragRef.current.startClientY;
      if (!dragRef.current.isDragging && Math.abs(deltaY) > 5) {
        dragRef.current.isDragging = true;
      }
      if (dragRef.current.isDragging) {
        const extraMins = Math.round((deltaY / HOUR_H) * 60 / 5) * 5;
        const endMins = Math.min(
          Math.max(dragRef.current.startMins + 15, dragRef.current.startMins + extraMins),
          DAY_END * 60
        );
        dragRef.current.endMins = endMins;
        setDragGhost({ dateStr: dragRef.current.dateStr, startMins: dragRef.current.startMins, endMins });
        setHoverGhost(null);
      }
    }
    function onMouseUp() {
      if (!dragRef.current) return;
      const { dateStr, startMins, endMins, isDragging } = dragRef.current;
      const person = selectedPersonRef.current;
      dragRef.current = null;
      setDragGhost(null);
      if (!person || person.role !== "driver") return;
      const finalEnd = isDragging ? endMins : Math.min(startMins + 60, DAY_END * 60);
      fetch(`/api/plan/${code}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: person.id,
          event_date: dateStr,
          start_time: minsToTime(startMins),
          end_time: minsToTime(finalEnd),
          location: "",
          lat: null,
          lng: null,
          travel_mins: null,
          notes: "",
          trip_type: "dropoff",
        }),
      }).then(async (res) => {
        if (res.ok) {
          loadItems();
          showToast("Added");
        } else {
          showToast((await res.json().catch(() => ({}))).error || "Could not save");
        }
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Compute origin labels for all kid needs, and fetch OSRM for those without a saved time.
  useEffect(() => {
    const controller = new AbortController();
    async function compute() {
      const allKidNeeds = items.filter((it) => it.person_role === "kid");
      const routes: { id: number; oLat: number; oLng: number; dLat: number; dLng: number }[] = [];
      const newOrigins: Record<number, string> = {};

      // Group ALL kid needs by kid+date to walk the location chain
      const groups = new Map<string, ScheduleItem[]>();
      for (const it of allKidNeeds) {
        const key = `${it.person_id}:${it.event_date}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(it);
      }

      for (const group of groups.values()) {
        group.sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));
        for (let i = 0; i < group.length; i++) {
          const it = group[i];
          // Walk backwards to find the nearest prior location with coordinates
          let oLat = home.lat;
          let oLng = home.lng;
          let originLabel = home.address || "Home";
          for (let j = i - 1; j >= 0; j--) {
            if (group[j].lat && group[j].lng) {
              oLat = group[j].lat; oLng = group[j].lng;
              originLabel = group[j].location || "Previous stop";
              break;
            }
          }
          if (it.lat && it.lng && oLat && oLng) {
            newOrigins[it.id] = originLabel;
            // Only hit OSRM if no saved travel time
            if (it.travel_mins === null) {
              routes.push({ id: it.id, oLat, oLng, dLat: it.lat, dLng: it.lng });
            }
          }
        }
      }

      setTravelOrigins(newOrigins);

      const results = await Promise.all(routes.map(async (r) => {
        try {
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${r.oLng},${r.oLat};${r.dLng},${r.dLat}?overview=false`,
            { signal: controller.signal }
          );
          const json = await res.json();
          const mins = Math.round((json.routes?.[0]?.duration ?? 0) / 60);
          return mins > 0 ? { id: r.id, mins } : null;
        } catch { return null; }
      }));

      if (controller.signal.aborted) return;
      const times: Record<number, number> = {};
      for (const r of results) { if (r) times[r.id] = r.mins; }
      setTravelTimes(times);
    }
    compute();
    return () => controller.abort();
  }, [items, home]);

  // Carpool optimizer: build Needs (with chained origins), fetch one OSRM /table
  // matrix for the week, and run planDay per date with tier-derived weights.
  useEffect(() => {
    const controller = new AbortController();
    async function compute() {
      if (home.lat == null || home.lng == null) { setWeekTrips([]); return; }
      const homePt: LatLng = { lat: home.lat, lng: home.lng };

      const kidNeeds = items.filter(
        (it) => it.person_role === "kid" && it.lat != null && it.lng != null
      );
      if (kidNeeds.length === 0) { setWeekTrips([]); return; }

      // Chained origin for a drop-off: the kid's previous drop-off location that
      // day (if it has coords), else home.
      const byKidDate = new Map<string, ScheduleItem[]>();
      for (const it of kidNeeds) {
        const k = `${it.person_id}:${it.event_date}`;
        (byKidDate.get(k) ?? byKidDate.set(k, []).get(k)!).push(it);
      }
      for (const g of byKidDate.values()) g.sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));

      const needs: (Need & { event_date: string })[] = [];
      for (const g of byKidDate.values()) {
        for (let i = 0; i < g.length; i++) {
          const it = g[i];
          const loc: LatLng = { lat: it.lat as number, lng: it.lng as number };
          let origin = homePt;
          if (it.trip_type !== "pickup") {
            for (let j = i - 1; j >= 0; j--) {
              if (g[j].lat != null && g[j].lng != null) {
                origin = { lat: g[j].lat as number, lng: g[j].lng as number };
                break;
              }
            }
          }
          needs.push({
            id: it.id,
            kidId: it.person_id,
            event_date: it.event_date,
            tripType: it.trip_type === "pickup" ? "pickup" : "dropoff",
            // Drop-off: origin -> activity. Pick-up: activity -> home.
            origin: it.trip_type === "pickup" ? loc : origin,
            dest: it.trip_type === "pickup" ? homePt : loc,
            deadlineMins: minutesOf(it.start_time),
          });
        }
      }

      // Unique points for the distance matrix.
      const pts: LatLng[] = [];
      const seen = new Set<string>();
      for (const p of [homePt, ...needs.flatMap((n) => [n.origin, n.dest])]) {
        const key = `${p.lat},${p.lng}`;
        if (!seen.has(key)) { seen.add(key); pts.push(p); }
      }

      let oracle;
      try {
        oracle = await fetchTableOracle(pts, controller.signal);
      } catch { return; }
      if (controller.signal.aborted) return;

      const tierCount = priorityTiers.length;
      const weightOf = (personId: number) => {
        const p = people.find((x) => x.id === personId);
        const idx = resolveTierIdx(p?.tier, p?.role ?? "kid", tierCount);
        return priorityTiers[idx] ?? 1;
      };
      const driverWeight = priorityTiers[0] ?? 1; // drivers default to the top tier

      const dates = Array.from(new Set(needs.map((n) => n.event_date)));
      const result: { date: string; trips: Trip[] }[] = [];
      for (const date of dates) {
        const dayNeeds = needs.filter((n) => n.event_date === date);
        const avails = items
          .filter((it) => it.person_role === "driver" && it.event_date === date && it.end_time)
          .map((a) => ({
            driverId: a.person_id,
            startMins: minutesOf(a.start_time),
            endMins: minutesOf(a.end_time as string),
          }));
        const trips = planDay({ needs: dayNeeds, drivers: avails, weightOf, driverWeight, travel: oracle });
        if (trips.length) result.push({ date, trips });
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
      setWeekTrips(result);
    }
    compute();
    return () => controller.abort();
  }, [items, home, people, priorityTiers]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const hours = useMemo(
    () => Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i),
    []
  );
  const drivers = useMemo(() => people.filter((p) => p.role === "driver"), [people]);
  const kids = useMemo(() => people.filter((p) => p.role === "kid"), [people]);

  const plan = useMemo<Plan>(() => {
    const kidNeeds = items
      .filter((it) => it.person_role === "kid")
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || minutesOf(a.start_time) - minutesOf(b.start_time));
    return {
      id: 0,
      week_start: isoDate(weekStart),
      drives: kidNeeds.map((it) => {
        const kidPerson = people.find((p) => p.id === it.person_id);
        return {
          id: it.id,
          start_time: it.start_time,
          duration_mins: it.travel_mins ?? travelTimes[it.id] ?? 0,
          participants: kidPerson ? [kidPerson] : [],
          start_location: home.address || "Home",
          end_location: it.location || "—",
        };
      }),
    };
  }, [items, weekStart, people, home, travelTimes]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [people, selectedId]
  );
  useEffect(() => { selectedPersonRef.current = selectedPerson; }, [selectedPerson]);
  // Whose role the open item form is for (the entry's person).
  const formPerson = useMemo(
    () => people.find((p) => p.id === itemForm?.person_id) ?? null,
    [people, itemForm]
  );
  const formIsDriver = formPerson?.role === "driver";

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const isThisWeek = sameDay(sundayOf(now), weekStart);
    const tag = isThisWeek ? "This week" : "Week of";
    return `${tag}: ${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
      undefined,
      opts
    )}`;
  }, [weekStart, now]);

  // ---- people management -------------------------------------------------- //
  function openNewPerson(role: Role) {
    setPersonForm({ id: null, name: "", role, color: PALETTE[people.length % PALETTE.length], tier: null });
  }
  function openEditPerson(p: Person) {
    setPersonForm({ id: p.id, name: p.name, role: p.role, color: p.color, tier: p.tier });
  }
  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personForm) return;
    const payload = { name: personForm.name.trim(), role: personForm.role, color: personForm.color, tier: personForm.tier };
    const url = personForm.id
      ? `/api/plan/${code}/people/${personForm.id}`
      : `/api/plan/${code}/people`;
    const res = await fetch(url, {
      method: personForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    const saved = await res.json();
    setPersonForm(null);
    showToast(personForm.id ? "Updated" : "Added");
    await loadPeople();
    loadItems();
    if (!personForm.id && saved?.id) setSelectedId(saved.id); // select newly added person
  }
  async function deletePerson() {
    if (!personForm?.id) return;
    if (!confirm("Remove this person and all their schedule entries?")) return;
    const res = await fetch(`/api/plan/${code}/people/${personForm.id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedId === personForm.id) setSelectedId(null);
      setPersonForm(null);
      showToast("Removed");
      loadPeople();
      loadItems();
    } else showToast("Could not remove");
  }

  // ---- schedule items ----------------------------------------------------- //
  function addForSelected(dateStr?: string, hour?: number, minute?: number) {
    if (!selectedPerson) return;
    const h = hour ?? 9;
    const m = minute ?? 0;
    const startMins = h * 60 + m;
    const endMins = Math.min(startMins + 60, DAY_END * 60);
    setItemForm({
      id: null,
      person_id: selectedPerson.id,
      event_date: dateStr ?? isoDate(weekStart),
      start_time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      end_time: `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`,
      location: "",
      lat: null,
      lng: null,
      travel_mins: null,
      notes: "",
      trip_type: "dropoff",
    });
  }
  function openEditItem(it: ScheduleItem) {
    setItemForm({
      id: it.id,
      person_id: it.person_id,
      event_date: it.event_date,
      start_time: it.start_time,
      end_time: it.end_time ?? it.start_time,
      location: it.location,
      lat: it.lat ?? null,
      lng: it.lng ?? null,
      travel_mins: it.travel_mins ?? travelTimes[it.id] ?? null,
      notes: it.notes,
      trip_type: it.trip_type ?? "dropoff",
    });
  }
  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm || !formPerson) return;
    const payload = {
      person_id: itemForm.person_id,
      event_date: itemForm.event_date,
      start_time: itemForm.start_time,
      end_time: formPerson.role === "driver" ? itemForm.end_time : null,
      location: itemForm.location.trim(),
      lat: itemForm.lat,
      lng: itemForm.lng,
      travel_mins: formPerson.role === "kid" ? itemForm.travel_mins : null,
      notes: itemForm.notes.trim(),
      trip_type: formPerson.role === "kid" ? itemForm.trip_type : "dropoff",
    };
    const url = itemForm.id
      ? `/api/plan/${code}/items/${itemForm.id}`
      : `/api/plan/${code}/items`;
    const res = await fetch(url, {
      method: itemForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    setItemForm(null);
    showToast(itemForm.id ? "Saved" : "Added");
    loadItems();
  }
  async function deleteItem() {
    if (!itemForm?.id) return;
    const res = await fetch(`/api/plan/${code}/items/${itemForm.id}`, { method: "DELETE" });
    if (res.ok) {
      setItemForm(null);
      showToast("Deleted");
      loadItems();
    } else showToast("Could not delete");
  }

  function openSettings() {
    setSettingsForm(home);
    setTiersForm(priorityTiers);
    // Seed each person's tier from their resolved (role-defaulted) index.
    const assign: Record<number, number> = {};
    for (const p of people) assign[p.id] = resolveTierIdx(p.tier, p.role, priorityTiers.length);
    setTierAssign(assign);
    setSettingsOpen(true);
  }

  async function saveSettings() {
    const tiers = tiersForm.length ? tiersForm : DEFAULT_TIERS;
    const res = await fetch(`/api/plan/${code}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home_address: settingsForm.address,
        home_lat: settingsForm.lat,
        home_lng: settingsForm.lng,
        priority_tiers: tiers,
      }),
    });
    if (!res.ok) { showToast("Could not save settings"); return; }

    // Persist any changed per-person tier assignments.
    const changed = people.filter((p) => {
      const next = Math.min(tierAssign[p.id] ?? 0, tiers.length - 1);
      const current = resolveTierIdx(p.tier, p.role, priorityTiers.length);
      return next !== current;
    });
    await Promise.all(
      changed.map((p) =>
        fetch(`/api/plan/${code}/people/${p.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            role: p.role,
            color: p.color,
            tier: Math.min(tierAssign[p.id] ?? 0, tiers.length - 1),
          }),
        })
      )
    );

    setHome(settingsForm);
    setPriorityTiers(tiers);
    setSettingsOpen(false);
    showToast("Settings saved");
    loadPeople();
  }

  // ---- tier editor helpers ------------------------------------------------ //
  function addTier() {
    setTiersForm((t) => [...t, 1]);
  }
  function removeTier(idx: number) {
    setTiersForm((t) => (t.length <= 1 ? t : t.filter((_, i) => i !== idx)));
    // Shift assignments: anyone in/after the removed tier moves up one, clamped.
    setTierAssign((a) => {
      const next: Record<number, number> = {};
      const newCount = Math.max(1, tiersForm.length - 1);
      for (const [id, ti] of Object.entries(a)) {
        let v = ti >= idx ? ti - 1 : ti;
        v = Math.max(0, Math.min(newCount - 1, v));
        next[Number(id)] = v;
      }
      return next;
    });
  }
  function setTierWeight(idx: number, value: number) {
    setTiersForm((t) => t.map((w, i) => (i === idx ? value : w)));
  }
  function movePerson(personId: number, delta: number) {
    setTierAssign((a) => {
      const cur = a[personId] ?? 0;
      const next = Math.max(0, Math.min(tiersForm.length - 1, cur + delta));
      return { ...a, [personId]: next };
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied — share it to invite others");
    } catch {
      showToast(`Share this URL: ${window.location.href}`);
    }
  }

  return (
    <div className="shell">
      {/* ---------------- Sidebar ---------------- */}
      <aside className="sidebar">
        <Link href="/" className="brand">The Family Plan</Link>

        <p className="sidebar-hint">
          {selectedPerson
            ? "Click a time slot to add — or click again to deselect."
            : "Select a driver or kid, then click the calendar to add their times."}
        </p>

        <PeopleGroup
          title="Drivers"
          empty="No drivers yet"
          people={drivers}
          selectedId={selectedId}
          hasSelection={selectedId !== null}
          onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          onEdit={openEditPerson}
          onAdd={() => openNewPerson("driver")}
        />
        <PeopleGroup
          title="Kids"
          empty="No kids yet"
          people={kids}
          selectedId={selectedId}
          hasSelection={selectedId !== null}
          onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          onEdit={openEditPerson}
          onAdd={() => openNewPerson("kid")}
        />

        <div className="legend">
          <div><span className="legend-swatch block" /> driver available (block)</div>
          <div><span className="legend-swatch point" /> kid needs to be there (time)</div>
        </div>
      </aside>

      {/* ---------------- Main ---------------- */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1>{name}</h1>
            <div className="code-pill" title="Share this code so others can join">
              Code: <strong>{code}</strong>
              <button className="ghost-btn" type="button" onClick={copyLink}>Copy link</button>
            </div>
            <button
              className="ghost-btn settings-btn"
              type="button"
              onClick={openSettings}
            >
              Settings
            </button>
          </div>
          <span className="week-label">{weekLabel}</span>
          <div className="topbar-right">
            <button type="button" className="ghost-btn" onClick={() => setDrivesOpen(true)}>
              Drives {plan.drives.length > 0 && <span className="drives-badge">{plan.drives.length}</span>}
            </button>
            <button
              className="primary"
              type="button"
              disabled={!selectedPerson}
              onClick={() => addForSelected()}
            >
              {selectedPerson ? `+ Add for ${selectedPerson.name}` : "+ Add"}
            </button>
          </div>
        </header>

        {toast && <div className="toast">{toast}</div>}

        <main
          className={"calendar" + (selectedPerson ? " has-selection" : "") + (selectedPerson?.role === "kid" ? " kid-mode" : "") + (selectedPerson?.role === "driver" ? " driver-mode" : "")}
          style={selectedPerson?.role === "kid" ? { "--kid-color": selectedPerson.color } as React.CSSProperties : undefined}
        >
          <div className="corner" />
          {days.map((d, i) => (
            <div key={`head-${i}`} className={"col-head" + (sameDay(d, now) ? " today" : "")}>
              <div className="dow">{DOW[i]}</div>
              <div className="dom">{d.getDate()}</div>
            </div>
          ))}

          <div className="time-gutter">
            {hours.map((h) => (
              <div key={`t-${h}`} className="time-label">
                {fmtTime(`${String(h).padStart(2, "0")}:00`)}
              </div>
            ))}
          </div>

          {days.map((d, i) => {
            const dateStr = isoDate(d);
            const dayItems = items.filter((it) => it.event_date === dateStr);
            const avails = dayItems.filter((it) => it.person_role === "driver");
            const needs = dayItems.filter((it) => it.person_role === "kid");
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const showNow =
              sameDay(d, now) && nowMins >= DAY_START * 60 && nowMins <= (DAY_END + 1) * 60;
            const dim = (it: ScheduleItem) =>
              selectedId !== null && it.person_id !== selectedId ? " dim" : "";

            return (
              <div
                key={`col-${i}`}
                className="day-col"
                onMouseLeave={() => { if (!dragRef.current) setHoverGhost(null); }}
              >
                {hours.map((h) => (
                  <div
                    key={`c-${i}-${h}`}
                    className="hour-cell"
                    onClick={(e) => {
                      if (selectedPerson?.role !== "kid") return;
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const minute = Math.min(Math.round(y / (HOUR_H / 60) / 5) * 5, 55);
                      addForSelected(dateStr, h, minute);
                    }}
                    onMouseDown={(e) => {
                      if (selectedPerson?.role !== "driver") return;
                      e.preventDefault();
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const minute = Math.min(Math.round(y / (HOUR_H / 60) / 5) * 5, 55);
                      const startMins = h * 60 + minute;
                      dragRef.current = { dateStr, startMins, startClientY: e.clientY, isDragging: false, endMins: startMins + 60 };
                    }}
                    onMouseMove={(e) => {
                      if (selectedPerson?.role === "kid") {
                        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        e.currentTarget.style.setProperty("--hover-y", `${y}px`);
                      } else if (selectedPerson?.role === "driver" && !dragRef.current?.isDragging) {
                        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        const minute = Math.min(Math.round(y / (HOUR_H / 60) / 5) * 5, 55);
                        setHoverGhost({ dateStr, startMins: h * 60 + minute });
                      }
                    }}
                  />
                ))}

                {selectedPerson?.role === "driver" && (() => {
                  const ghost = dragGhost?.dateStr === dateStr
                    ? dragGhost
                    : hoverGhost?.dateStr === dateStr
                    ? { startMins: hoverGhost.startMins, endMins: Math.min(hoverGhost.startMins + 60, DAY_END * 60) }
                    : null;
                  if (!ghost) return null;
                  const gTop = topFor(minsToTime(ghost.startMins));
                  const gHeight = Math.max(topFor(minsToTime(ghost.endMins)) - gTop, 18);
                  return (
                    <div
                      className="avail avail-ghost"
                      style={{
                        top: `${gTop}px`,
                        height: `${gHeight}px`,
                        borderColor: selectedPerson.color,
                        background: `${selectedPerson.color}22`,
                        color: selectedPerson.color,
                      }}
                    />
                  );
                })()}

                {avails.map((it) => {
                  const top = topFor(it.start_time);
                  const height = Math.max(topFor(it.end_time as string) - top, 18);
                  return (
                    <div
                      key={`a-${it.id}`}
                      className={"avail" + dim(it)}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        borderColor: it.person_color,
                        background: `${it.person_color}22`,
                        color: it.person_color,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedPerson?.role === "kid") {
                          const startMins = minutesOf(it.start_time);
                          addForSelected(dateStr, Math.floor(startMins / 60), startMins % 60);
                        } else if (selectedPerson?.id === it.person_id) {
                          openEditItem(it);
                        }
                      }}
                    >
                      <div className="ev-title">{it.person_name}</div>
                      <div className="ev-time">
                        {fmtTime(it.start_time)}–{fmtTime(it.end_time as string)} · available
                      </div>
                    </div>
                  );
                })}

                {needs.map((it) => {
                  const travelMins = it.travel_mins ?? travelTimes[it.id];
                  if (!travelMins) return null;
                  const needTop = topFor(it.start_time);
                  const blockH = (travelMins / 60) * HOUR_H;
                  const blockTop = Math.max(0, needTop - blockH);
                  const clippedH = needTop - blockTop;
                  const leaveMins = minutesOf(it.start_time) - travelMins;
                  const leaveStr = `${String(Math.floor(leaveMins / 60)).padStart(2, "0")}:${String(leaveMins % 60).padStart(2, "0")}`;
                  const origin = travelOrigins[it.id];
                  return (
                    <>
                      <div
                        key={`tr-${it.id}`}
                        className={"travel-block" + dim(it)}
                        style={{ top: `${blockTop}px`, height: `${clippedH}px`, background: `${it.person_color}28`, borderColor: it.person_color }}
                      >
                        {clippedH >= 18 && <span className="travel-label">{travelMins} min</span>}
                      </div>
                      {blockTop === needTop - blockH && origin && (
                        <div key={`to-${it.id}`} className={"travel-origin" + dim(it)} style={{ top: `${blockTop}px` }}>
                          <span className="need-dot" style={{ background: "transparent", border: `2px solid ${it.person_color}` }} />
                          <span className="need-label" style={{ borderColor: it.person_color, opacity: 0.75 }}>
                            <strong>{fmtTime(leaveStr)}</strong> leave · {origin}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })}

                {needs.map((it) => (
                  <div
                    key={`n-${it.id}`}
                    className={"need" + dim(it)}
                    style={{ top: `${topFor(it.start_time)}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedPerson?.id === it.person_id) openEditItem(it);
                    }}
                  >
                    <span className="need-dot" style={{ background: it.person_color }} />
                    <span className="need-label" style={{ borderColor: it.person_color }}>
                      <strong>{fmtTime(it.start_time)}</strong> {it.person_name}
                      {" · "}{it.trip_type === "pickup" ? "pick up" : "drop off"}
                      {it.location ? ` · ${it.location}` : ""}
                    </span>
                  </div>
                ))}

                {showNow && (
                  <div
                    className="now-line"
                    style={{ top: `${((nowMins - DAY_START * 60) / 60) * HOUR_H}px` }}
                  />
                )}
              </div>
            );
          })}
        </main>
      </div>

      {/* ---------------- Person modal ---------------- */}
      {personForm && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPersonForm(null); }}>
          <div className="modal">
            <h2>{personForm.id ? "Edit person" : `Add ${personForm.role}`}</h2>
            <form onSubmit={submitPerson}>
              <label>
                Name
                <input
                  type="text" required maxLength={40} autoFocus
                  value={personForm.name}
                  onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
                />
              </label>
              <div className="row">
                <label>
                  Role
                  <select
                    value={personForm.role}
                    onChange={(e) => setPersonForm({ ...personForm, role: e.target.value as Role })}
                  >
                    <option value="driver">Driver</option>
                    <option value="kid">Kid</option>
                  </select>
                </label>
                <div className="color-field">
                  <span className="field-label">Color</span>
                  <div className="color-swatches">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={"color-swatch" + (personForm.color === c ? " selected" : "")}
                        style={{ background: c }}
                        onClick={() => setPersonForm({ ...personForm, color: c })}
                      />
                    ))}
                    <label className="color-swatch custom-swatch" style={{ background: PALETTE.includes(personForm.color) ? "#e2e8f0" : personForm.color }} title="Custom color">
                      <span style={{ color: PALETTE.includes(personForm.color) ? "#64748b" : "#fff", fontSize: 14, lineHeight: 1 }}>+</span>
                      <input
                        type="color"
                        value={personForm.color}
                        onChange={(e) => setPersonForm({ ...personForm, color: e.target.value })}
                        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                {personForm.id && (
                  <button type="button" className="danger" onClick={deletePerson}>Remove</button>
                )}
                <span className="spacer" />
                <button type="button" className="ghost-btn" onClick={() => setPersonForm(null)}>Cancel</button>
                <button type="submit" className="primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Item modal ---------------- */}
      {itemForm && formPerson && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setItemForm(null); }}>
          <div className="modal">
            <h2>{itemForm.id ? "Edit entry" : "Add entry"}</h2>
            <div className="who-chip">
              <span className="person-dot" style={{ background: formPerson.color }} />
              <strong>{formPerson.name}</strong>
              <span className="who-role">
                {formIsDriver ? "driver — availability" : "kid — needs a ride"}
              </span>
            </div>
            <form onSubmit={submitItem}>
              <label>
                Day
                <select
                  required
                  value={itemForm.event_date}
                  onChange={(e) => setItemForm({ ...itemForm, event_date: e.target.value })}
                >
                  {days.map((d, i) => (
                    <option key={i} value={isoDate(d)}>{DOW[i]} {d.getMonth() + 1}/{d.getDate()}</option>
                  ))}
                </select>
              </label>

              {formIsDriver ? (
                <div className="row">
                  <label>
                    Available from
                    <input
                      type="time" required
                      value={itemForm.start_time}
                      onChange={(e) => setItemForm({ ...itemForm, start_time: e.target.value })}
                    />
                  </label>
                  <label>
                    Until
                    <input
                      type="time" required
                      value={itemForm.end_time}
                      onChange={(e) => setItemForm({ ...itemForm, end_time: e.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className="trip-toggle">
                    <button
                      type="button"
                      className={itemForm.trip_type === "dropoff" ? "active" : ""}
                      onClick={() => setItemForm({ ...itemForm, trip_type: "dropoff" })}
                    >
                      Drop off
                    </button>
                    <button
                      type="button"
                      className={itemForm.trip_type === "pickup" ? "active" : ""}
                      onClick={() => setItemForm({ ...itemForm, trip_type: "pickup" })}
                    >
                      Pick up
                    </button>
                  </div>
                  <label>
                    {itemForm.trip_type === "pickup" ? "Needs to be picked up at" : "Needs to be there at"}
                    <input
                      type="time" required
                      value={itemForm.start_time}
                      onChange={(e) => setItemForm({ ...itemForm, start_time: e.target.value })}
                    />
                  </label>
                  <label>
                    Where (location)
                    <LocationInput
                      value={itemForm.location}
                      onChange={(v) => setItemForm({ ...itemForm, location: v, lat: null, lng: null })}
                      onSelect={(address, lat, lng) => setItemForm({ ...itemForm, location: address, lat, lng })}
                    />
                  </label>
                  <label>
                    Drive time (min)
                    <input
                      type="number" min="1" step="1" placeholder="e.g. 12"
                      value={itemForm.travel_mins ?? ""}
                      onChange={(e) => setItemForm({ ...itemForm, travel_mins: e.target.value ? Number(e.target.value) : null })}
                    />
                    {itemForm.travel_mins !== null && (itemForm.travel_mins === (travelTimes[itemForm.id ?? -1]))
                      && <span className="field-hint">Estimated from map — edit to override</span>}
                  </label>
                </>
              )}

              <label>
                Notes (optional)
                <textarea
                  rows={2} maxLength={300}
                  value={itemForm.notes}
                  onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                />
              </label>

              <div className="modal-actions">
                {itemForm.id && (
                  <button type="button" className="danger" onClick={deleteItem}>Delete</button>
                )}
                <span className="spacer" />
                <button type="button" className="ghost-btn" onClick={() => setItemForm(null)}>Cancel</button>
                <button type="submit" className="primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Drives modal ---------------- */}
      {drivesOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDrivesOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Drives this week</h2>
            {weekTrips.length === 0 ? (
              <p className="modal-sub">No drives planned yet — add driver availability and kid drop-offs/pick-ups from the calendar.</p>
            ) : (
              <>
                <ul className="drives-list">
                  {weekTrips.flatMap(({ date, trips }) =>
                    trips.map((trip, ti) => {
                      const driver = trip.driverId != null ? people.find((p) => p.id === trip.driverId) : null;
                      const dateLabel = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                      return (
                        <li key={`${date}-${ti}`} className="drive-row">
                          <div className="drive-time">
                            <span className="drive-date">{dateLabel}</span>
                            <strong>{fmtTime(minsToTime(trip.departMins))}</strong>
                            <span className="drive-date">leave</span>
                          </div>
                          <div className="drive-detail">
                            <div className="drive-who">
                              {driver ? (
                                <span className="drive-participant">
                                  <span className="person-dot" style={{ background: driver.color }} />
                                  {driver.name}
                                </span>
                              ) : (
                                <span className="unassigned-badge">No driver available</span>
                              )}
                              <span className="drive-type">{trip.tripType === "pickup" ? "pick up" : "drop off"}</span>
                              {trip.stops.length > 1 && (
                                <span className="pool-badge">carpool ×{trip.stops.length}</span>
                              )}
                            </div>
                            <div className="drive-route">
                              {trip.stops.map((s, si) => {
                                const kid = people.find((p) => p.id === s.kidId);
                                const it = items.find((x) => x.id === s.needId);
                                return (
                                  <span key={s.needId} className="pool-stop">
                                    {si > 0 && <span className="drive-arrow">→</span>}
                                    <span className="person-dot" style={{ background: kid?.color }} />
                                    <span className="drive-loc">{it?.location || "—"}</span>
                                    <span className="drive-stop-time">{fmtTime(minsToTime(s.atMins))}</span>
                                  </span>
                                );
                              })}
                              <span className="drive-duration">{trip.driverCommittedMins} min driving</span>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="primary" onClick={() => setDrivesOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Settings modal ---------------- */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Settings</h2>
            <label>
              Home address
              <LocationInput
                value={settingsForm.address}
                onChange={(v) => setSettingsForm({ address: v, lat: null, lng: null })}
                onSelect={(address, lat, lng) => setSettingsForm({ address, lat, lng })}
              />
            </label>
            {settingsForm.lat
              ? <p className="modal-sub">Location confirmed — travel times will update automatically.</p>
              : home.address
                ? <p className="modal-sub">Type to search for a new address, or keep the current one.</p>
                : <p className="modal-sub">Set your home address to see estimated drive times on the calendar.</p>
            }

            <h3 className="plan-section-title">Priority</h3>
            <p className="modal-sub">
              Higher tiers have their time protected first. The weight is how much
              a minute of that tier&apos;s time counts when balancing carpools.
            </p>
            <div className="tier-editor">
              {tiersForm.map((weight, idx) => {
                const members = people.filter((p) => Math.min(tierAssign[p.id] ?? 0, tiersForm.length - 1) === idx);
                return (
                  <div key={idx} className="tier-row">
                    <div className="tier-head">
                      <span className="tier-name">
                        Tier {idx + 1}{idx === 0 ? " · highest" : ""}
                      </span>
                      <label className="tier-weight">
                        weight
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={weight}
                          onChange={(e) => setTierWeight(idx, Number(e.target.value))}
                        />
                      </label>
                      {tiersForm.length > 1 && (
                        <button type="button" className="ghost-btn tier-remove" onClick={() => removeTier(idx)}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="tier-members">
                      {members.length === 0 && <span className="tier-empty">No one here</span>}
                      {members.map((p) => (
                        <span key={p.id} className="tier-chip">
                          <span className="person-dot" style={{ background: p.color }} />
                          <span className="tier-chip-name">{p.name}</span>
                          <button
                            type="button"
                            className="tier-move"
                            title="Higher priority"
                            disabled={idx === 0}
                            onClick={() => movePerson(p.id, -1)}
                          >▲</button>
                          <button
                            type="button"
                            className="tier-move"
                            title="Lower priority"
                            disabled={idx === tiersForm.length - 1}
                            onClick={() => movePerson(p.id, +1)}
                          >▼</button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button type="button" className="ghost-btn" onClick={addTier}>+ Add tier</button>
            </div>

            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button type="button" className="primary" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- sidebar people group ------------------------------------------------- //
function PeopleGroup({
  title,
  empty,
  people,
  selectedId,
  hasSelection,
  onSelect,
  onEdit,
  onAdd,
}: {
  title: string;
  empty: string;
  people: Person[];
  selectedId: number | null;
  hasSelection: boolean;
  onSelect: (id: number) => void;
  onEdit: (p: Person) => void;
  onAdd: () => void;
}) {
  return (
    <section className="people-group">
      <div className="people-head">
        <h3>{title}</h3>
        <button type="button" className="ghost-btn" onClick={onAdd}>+ Add</button>
      </div>
      {people.length === 0 ? (
        <p className="people-empty">{empty}</p>
      ) : (
        <ul className="people-list">
          {people.map((p) => {
            const selected = p.id === selectedId;
            const cls =
              "person-item" + (selected ? " selected" : "") +
              (hasSelection && !selected ? " dim" : "");
            return (
              <li key={p.id} className={cls}>
                <button type="button" className="person-select" onClick={() => onSelect(p.id)}>
                  <span className="person-dot" style={{ background: p.color }} />
                  <span className="person-name">{p.name}</span>
                </button>
                <button
                  type="button"
                  className="person-edit"
                  title="Edit"
                  onClick={() => onEdit(p)}
                >
                  ✎
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
