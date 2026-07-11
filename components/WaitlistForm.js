"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: "" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setState("done");
      } else {
        setState("error");
        setMsg(j.error || "Something went wrong. Try again.");
      }
    } catch {
      setState("error");
      setMsg("Network error. Try again.");
    }
  }

  if (state === "done") {
    return <p className="form-msg pos">You are on the list. We will email you when paid access opens.</p>;
  }

  return (
    <form onSubmit={submit} className="form-row" noValidate>
      <input
        className="input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button className="btn" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Join waitlist"}
      </button>
      {state === "error" ? <p className="form-msg neg">{msg}</p> : null}
    </form>
  );
}
