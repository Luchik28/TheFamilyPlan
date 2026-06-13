"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DAY_START = 6; // grid starts at 06:00
const DAY_END = 23; // grid ends at 23:00
const HOUR_H = 48; // px per hour — must match .calendar --hour-h
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

type ScheduleItem = {
  id: number;
  person_id: number;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location: string;
  notes: string;
  person_name: string;
  person_role: Role;
  person_color: string;
};

type ItemForm = {
  id: number | null;
  person_id: number | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  notes: string;
};

type PersonForm = {
  id: number | null;
  name: string;
  role: Role;
  color: string;
};

// ---- date helpers (local time) ------------------------------------------- //
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
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
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [personForm, setPersonForm] = useState<PersonForm | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<Date>(() => new Date());
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
    if (res.ok) setItems((await res.json()).items);
    else showToast("Failed to load schedule");
  }, [code, weekStart, showToast]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
      undefined,
      opts
    )}, ${end.getFullYear()}`;
  }, [weekStart]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === itemForm?.person_id) ?? null,
    [people, itemForm]
  );

  // ---- people management -------------------------------------------------- //
  function openNewPerson(role: Role) {
    setPersonForm({
      id: null,
      name: "",
      role,
      color: PALETTE[people.length % PALETTE.length],
    });
  }
  function openEditPerson(p: Person) {
    setPersonForm({ id: p.id, name: p.name, role: p.role, color: p.color });
  }
  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!personForm) return;
    const payload = {
      name: personForm.name.trim(),
      role: personForm.role,
      color: personForm.color,
    };
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
    setPersonForm(null);
    showToast(personForm.id ? "Updated" : "Added");
    loadPeople();
    loadItems();
  }
  async function deletePerson() {
    if (!personForm?.id) return;
    if (!confirm("Remove this person and all their schedule entries?")) return;
    const res = await fetch(`/api/plan/${code}/people/${personForm.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPersonForm(null);
      showToast("Removed");
      loadPeople();
      loadItems();
    } else showToast("Could not remove");
  }

  // ---- schedule items ----------------------------------------------------- //
  function openNewItem(dateStr?: string, hour?: number) {
    if (people.length === 0) {
      showToast("Add a driver or kid first →");
      return;
    }
    const h = hour ?? 9;
    setItemForm({
      id: null,
      person_id: people[0].id,
      event_date: dateStr ?? isoDate(weekStart),
      start_time: `${String(h).padStart(2, "0")}:00`,
      end_time: `${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`,
      location: "",
      notes: "",
    });
  }
  function openEditItem(it: ScheduleItem) {
    setItemForm({
      id: it.id,
      person_id: it.person_id,
      event_date: it.event_date,
      start_time: it.start_time,
      end_time: it.end_time ?? `${it.start_time}`,
      location: it.location,
      notes: it.notes,
    });
  }
  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm || !selectedPerson) return;
    const payload = {
      person_id: itemForm.person_id,
      event_date: itemForm.event_date,
      start_time: itemForm.start_time,
      end_time: selectedPerson.role === "driver" ? itemForm.end_time : null,
      location: itemForm.location.trim(),
      notes: itemForm.notes.trim(),
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
    const res = await fetch(`/api/plan/${code}/items/${itemForm.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItemForm(null);
      showToast("Deleted");
      loadItems();
    } else showToast("Could not delete");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied — share it to invite others");
    } catch {
      showToast(`Share this URL: ${window.location.href}`);
    }
  }

  const isDriverSelected = selectedPerson?.role === "driver";

  return (
    <div className="shell">
      {/* ---------------- Sidebar ---------------- */}
      <aside className="sidebar">
        <Link href="/" className="brand">
          📅 The Family Plan
        </Link>

        <PeopleGroup
          title="Drivers"
          empty="No drivers yet"
          people={drivers}
          onAdd={() => openNewPerson("driver")}
          onEdit={openEditPerson}
        />
        <PeopleGroup
          title="Kids"
          empty="No kids yet"
          people={kids}
          onAdd={() => openNewPerson("kid")}
          onEdit={openEditPerson}
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
              <button className="ghost-btn" type="button" onClick={copyLink}>
                Copy link
              </button>
            </div>
          </div>
          <div className="week-nav">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
            <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
            <span id="week-label">{weekLabel}</span>
          </div>
          <button className="primary" type="button" onClick={() => openNewItem()}>+ Add</button>
        </header>

        {toast && <div className="toast">{toast}</div>}

        <main className="calendar">
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

            return (
              <div key={`col-${i}`} className="day-col">
                {hours.map((h) => (
                  <div
                    key={`c-${i}-${h}`}
                    className="hour-cell"
                    onClick={() => openNewItem(dateStr, h)}
                  />
                ))}

                {/* Driver availability blocks */}
                {avails.map((it) => {
                  const top = topFor(it.start_time);
                  const height = Math.max(
                    topFor(it.end_time as string) - top,
                    18
                  );
                  return (
                    <div
                      key={`a-${it.id}`}
                      className="avail"
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

                {/* Kid needs — points in time */}
                {needs.map((it) => (
                  <div
                    key={`n-${it.id}`}
                    className="need"
                    style={{ top: `${topFor(it.start_time)}px` }}
                    onClick={(e) => { e.stopPropagation(); openEditItem(it); }}
                  >
                    <span className="need-dot" style={{ background: it.person_color }} />
                    <span className="need-label" style={{ borderColor: it.person_color }}>
                      <strong>{fmtTime(it.start_time)}</strong> {it.person_name}
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
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setPersonForm(null); }}
        >
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
      {itemForm && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setItemForm(null); }}
        >
          <div className="modal">
            <h2>
              {itemForm.id ? "Edit entry" : "Add entry"}
              {selectedPerson && (
                <span className="modal-sub">
                  {isDriverSelected ? " — driver availability" : " — kid needs a ride"}
                </span>
              )}
            </h2>
            <form onSubmit={submitItem}>
              <label>
                Who
                <select
                  required
                  value={itemForm.person_id ?? ""}
                  onChange={(e) => setItemForm({ ...itemForm, person_id: Number(e.target.value) })}
                >
                  <optgroup label="Drivers">
                    {drivers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Kids">
                    {kids.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                </select>
              </label>

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

              {isDriverSelected ? (
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
                  <label>
                    Needs to be there at
                    <input
                      type="time" required
                      value={itemForm.start_time}
                      onChange={(e) => setItemForm({ ...itemForm, start_time: e.target.value })}
                    />
                  </label>
                  <label>
                    Where (location)
                    <input
                      type="text" maxLength={80} placeholder="e.g. Soccer field"
                      value={itemForm.location}
                      onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                    />
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
    </div>
  );
}

// ---- sidebar people group ------------------------------------------------- //
function PeopleGroup({
  title,
  empty,
  people,
  onAdd,
  onEdit,
}: {
  title: string;
  empty: string;
  people: Person[];
  onAdd: () => void;
  onEdit: (p: Person) => void;
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
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" className="person-row" onClick={() => onEdit(p)}>
                <span className="person-dot" style={{ background: p.color }} />
                <span className="person-name">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
