"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LocationInput from "./LocationInput";

const DAY_START = 6; // grid starts at 06:00
const DAY_END = 23; // grid ends at 23:00
const HOUR_H = 48; // px per hour — must match .calendar --hour-h
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A palette to suggest colors for new people.
const PALETTE = [
  "#4f7cff", "#e5484d", "#22a06b", "#f5a524", "#a855f7",
  "#0ea5e9", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

type Role = "driver" | "kid";

type Person = {
  id: number;
  name: string;
  role: Role;
  color: string;
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Greedily assign available drivers to each drive, in chronological order.
  const planAssignments = useMemo(() => {
    const driverAvails = items.filter((it) => it.person_role === "driver");
    // busy[driverId] = list of windows already committed to
    const busy: Record<number, { date: string; startMins: number; endMins: number }[]> = {};

    return plan.drives
      .filter((d) => d.duration_mins > 0)
      .map((drive) => {
        const item = items.find((it) => it.id === drive.id);
        if (!item) return { drive, driver: null };

        const arrivalMins = minutesOf(drive.start_time);
        const leaveMins = arrivalMins - drive.duration_mins;

        // Find a driver available during [leaveMins, arrivalMins] on the same date
        const eligible = driverAvails.filter((a) => {
          if (a.event_date !== item.event_date) return false;
          const s = minutesOf(a.start_time);
          const e = minutesOf(a.end_time ?? a.start_time);
          return s <= leaveMins && e >= arrivalMins;
        });

        let assigned: Person | null = null;
        for (const avail of eligible) {
          const windows = busy[avail.person_id] ?? [];
          const blocked = windows.some(
            (w) => w.date === item.event_date && w.startMins < arrivalMins && w.endMins > leaveMins
          );
          if (!blocked) {
            assigned = people.find((p) => p.id === avail.person_id) ?? null;
            if (!busy[avail.person_id]) busy[avail.person_id] = [];
            busy[avail.person_id].push({ date: item.event_date, startMins: leaveMins, endMins: arrivalMins });
            break;
          }
        }

        return { drive, item, driver: assigned };
      });
  }, [plan.drives, items, people]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [people, selectedId]
  );
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
    setPersonForm({ id: null, name: "", role, color: PALETTE[people.length % PALETTE.length] });
  }
  function openEditPerson(p: Person) {
    setPersonForm({ id: p.id, name: p.name, role: p.role, color: p.color });
  }
  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personForm) return;
    const payload = { name: personForm.name.trim(), role: personForm.role, color: personForm.color };
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

  async function saveSettings() {
    const res = await fetch(`/api/plan/${code}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_address: settingsForm.address, home_lat: settingsForm.lat, home_lng: settingsForm.lng }),
    });
    if (res.ok) {
      setHome(settingsForm);
      setSettingsOpen(false);
      showToast("Settings saved");
    } else {
      showToast("Could not save settings");
    }
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
        <Link href="/" className="brand">📅 The Family Plan</Link>

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
              onClick={() => { setSettingsForm(home); setSettingsOpen(true); }}
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
          className={"calendar" + (selectedPerson ? " has-selection" : "") + (selectedPerson?.role === "kid" ? " kid-mode" : "")}
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
              <div key={`col-${i}`} className="day-col">
                {hours.map((h) => (
                  <div
                    key={`c-${i}-${h}`}
                    className="hour-cell"
                    onClick={(e) => {
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const minute = Math.min(Math.round(y / (HOUR_H / 60) / 5) * 5, 55);
                      addForSelected(dateStr, h, minute);
                    }}
                    onMouseMove={(e) => {
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      e.currentTarget.style.setProperty("--hover-y", `${y}px`);
                    }}
                  />
                ))}

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
                      onClick={(e) => { e.stopPropagation(); openEditItem(it); }}
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
                    onClick={(e) => { e.stopPropagation(); openEditItem(it); }}
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
                <label>
                  Color
                  <input
                    type="color"
                    value={personForm.color}
                    onChange={(e) => setPersonForm({ ...personForm, color: e.target.value })}
                  />
                </label>
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
            {plan.drives.length === 0 ? (
              <p className="modal-sub">No kid needs scheduled yet — add some from the calendar.</p>
            ) : (
              <ul className="drives-list">
                {plan.drives.map((drive) => {
                  const item = items.find((it) => it.id === drive.id);
                  return (
                    <li key={drive.id} className="drive-row">
                      <div className="drive-time">
                        <span className="drive-date">{item ? new Date(item.event_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}</span>
                        <strong>{fmtTime(drive.start_time)}</strong>
                      </div>
                      <div className="drive-detail">
                        <div className="drive-who">
                          {drive.participants.map((p) => (
                            <span key={p.id} className="drive-participant">
                              <span className="person-dot" style={{ background: p.color }} />
                              {p.name}
                            </span>
                          ))}
                          {item && <span className="drive-type">{item.trip_type === "pickup" ? "pick up" : "drop off"}</span>}
                        </div>
                        <div className="drive-route">
                          <span className="drive-loc">{drive.start_location}</span>
                          <span className="drive-arrow">→</span>
                          <span className="drive-loc">{drive.end_location}</span>
                          {drive.duration_mins > 0 && (
                            <span className="drive-duration">{drive.duration_mins} min</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {planAssignments.length > 0 && (
              <>
                <h3 className="plan-section-title">Driver plan</h3>
                <ul className="drives-list">
                  {planAssignments.map(({ drive, item, driver }) => {
                    if (!item) return null;
                    const leaveMins = minutesOf(drive.start_time) - drive.duration_mins;
                    const leaveStr = `${String(Math.floor(leaveMins / 60)).padStart(2, "0")}:${String(leaveMins % 60).padStart(2, "0")}`;
                    return (
                      <li key={`pa-${drive.id}`} className="drive-row">
                        <div className="drive-time">
                          <span className="drive-date">{new Date(item.event_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                          <strong>{fmtTime(leaveStr)}</strong>
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
                            <span className="drive-arrow">→</span>
                            {drive.participants.map((p) => (
                              <span key={p.id} className="drive-participant">
                                <span className="person-dot" style={{ background: p.color }} />
                                {p.name}
                              </span>
                            ))}
                          </div>
                          <div className="drive-route">
                            <span className="drive-loc">{drive.start_location}</span>
                            <span className="drive-arrow">→</span>
                            <span className="drive-loc">{drive.end_location}</span>
                            <span className="drive-duration">{drive.duration_mins} min</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
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
          <div className="modal">
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
