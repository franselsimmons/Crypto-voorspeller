"use client";

import { useState } from "react";

export default function AdminLoginForm() {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState("idle");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMsg("");
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        window.location.href = "/admin"; // volledige navigatie zodat de server de cookie ziet
        return;
      }
      setState("error");
      setMsg(j.error || `HTTP ${res.status}`);
    } catch {
      setState("error");
      setMsg("Network error. Try again.");
    }
  }

  return (
    <form onSubmit={submit} className="form-row" noValidate>
      <input
        className="input"
        type="password"
        autoComplete="current-password"
        placeholder="Admin secret"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
      />
      <button className="btn" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Signing in…" : "Sign in"}
      </button>
      {state === "error" ? <p className="form-msg neg">{msg}</p> : null}
    </form>
  );
}
