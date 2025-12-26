"use client";

import { useEffect, useState } from "react";

type Settings = {
  agent_greeting: string;
  gmail_summary_enabled: boolean;
  gmail_account_id: string | null;
  realtime_prompt_addendum: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [status, setStatus] = useState<string>("");

  async function load() {
    setStatus("Loading...");
    const r = await fetch("/api/admin/settings", { cache: "no-store" });
    const j = await r.json();
    setSettings(j);
    setDraft(j);
    setStatus("");
  }

  async function save() {
    setStatus("Saving...");
    const r = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_greeting: draft.agent_greeting,
        gmail_summary_enabled: draft.gmail_summary_enabled,
        gmail_account_id: draft.gmail_account_id,
        realtime_prompt_addendum: draft.realtime_prompt_addendum,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      setStatus(`Save failed (${r.status}): ${t}`);
      return;
    }

    const j = await r.json();
    setSettings(j);
    setDraft(j);
    setStatus("Saved ✅");
    setTimeout(() => setStatus(""), 1500);
  }

  useEffect(() => { load(); }, []);

  if (!settings) return <div style={{ padding: 24 }}>{status || "Loading..."}</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Vozlia Admin Settings</h1>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.7 }}>Gmail Account ID</div>
        <div style={{ fontFamily: "ui-monospace", marginTop: 6 }}>
          {draft.gmail_account_id || "(none)"}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 600 }}>Agent Greeting</label>
        <input
          value={draft.agent_greeting ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, agent_greeting: e.target.value }))}
          style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!draft.gmail_summary_enabled}
            onChange={(e) => setDraft((d) => ({ ...d, gmail_summary_enabled: e.target.checked }))}
          />
          <span style={{ fontWeight: 600 }}>Enable Gmail summaries</span>
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 600 }}>Realtime Prompt Addendum</label>
        <textarea
          value={draft.realtime_prompt_addendum ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, realtime_prompt_addendum: e.target.value }))}
          rows={6}
          style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center" }}>
        <button
          onClick={save}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white" }}
        >
          Save
        </button>

        <button
          onClick={load}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}
        >
          Refresh
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.8 }}>{status}</div>
      </div>
    </div>
  );
}
