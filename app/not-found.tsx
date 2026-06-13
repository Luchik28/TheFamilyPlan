import Link from "next/link";

export default function NotFound() {
  return (
    <main className="landing-card">
      <h1>📅 The Family Plan</h1>
      <div className="error">No plan found for that code.</div>
      <p>
        <Link href="/">← Back to home</Link>
      </p>
    </main>
  );
}
