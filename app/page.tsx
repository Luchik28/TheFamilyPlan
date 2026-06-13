"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    const res = await fetch(`/api/plan/${trimmed}/people`);
    setBusy(false);
    if (res.ok) {
      router.push(`/plan/${trimmed}`);
    } else {
      setError("No plan found for that code.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/plan/${data.code}`);
    } else {
      setError("Could not create a plan. Is the database connected?");
    }
  }

  return (
    <main className="landing-card">
      <h1>📅 The Family Plan</h1>
      <p className="subtitle">A shared weekly calendar for you and yours.</p>

      {error && <div className="error">{error}</div>}

      <section className="panel">
        <h2>Join a plan</h2>
        <p>Enter the access code someone shared with you.</p>
        <form onSubmit={join} className="inline-form">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ACCESS CODE"
            maxLength={10}
            autoComplete="off"
            style={{ textTransform: "uppercase", letterSpacing: "2px" }}
          />
          <button type="submit" disabled={busy}>
            Join
          </button>
        </form>
      </section>

      <div className="divider">
        <span>or</span>
      </div>

      <section className="panel">
        <h2>Create a new plan</h2>
        <p>Start a fresh calendar and get a code to share.</p>
        <form onSubmit={create} className="inline-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Plan name (e.g. The Smiths)"
            maxLength={60}
          />
          <button type="submit" className="primary" disabled={busy}>
            Create
          </button>
        </form>
      </section>
    </main>
  );
}
