"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminRunButton({
  path, label, method = "GET", confirmText = null, redirectTo = null, small = false,
}) {
  const router = useRouter();
  const [state, setState] = useState("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    if (state === "busy") return;
    if (confirmText && !window.confirm(confirmText)) return;
    setState("busy");
    setMsg("");
    try {
      const res = await fetch(path, { method });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg(j.error || `HTTP ${res.status}`);
        return;
      }
      if (redirectTo) {
        window.location.href = redirectTo;
        return;
      }
      let summary = "OK";
      if (typeof j?.result?.status === "string") summary = j.result.status;
      else if (typeof j?.finalize?.status === "string") summary = `finalize ${j.finalize.status}`;
      else if (j?.count != null) summary = `count ${j.count}`;
      setState("done");
      setMsg(summary);
      router.refresh(); // servercomponenten opnieuw laden met verse data
    } catch (err) {
      setState("error");
      setMsg(String(err?.message || err));
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        className="btn"
        onClick={run}
        disabled={state === "busy"}
        style={small ? { padding: "6px 12px", fontSize: "0.8rem" } : undefined}
      >
        {state === "busy" ? "Running…" : label}
      </button>
      {msg ? <span className={`form-msg ${state === "error" ? "neg" : "pos"}`}>{msg}</span> : null}
    </span>
  );
}
