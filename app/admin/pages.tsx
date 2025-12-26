"use client";

import { useEffect, useMemo, useState } from "react";

type Settings = {
  agent_greeting: string;
  gmail_summary_enabled: boolean;
  gmail_account_id: string | null;
  realtime_prompt_addendum: string;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [agentGreeting, setAgentGreeting] = useState("");
  const [gmailSummaryEnabled, setGmailSummaryEnabled] = useState(false);
  const [gmailAccountId, setGmailAccountId] = useState<string | null>(null);
  const [promptAddendum, setPromptAddendum] = useState("");

  const dirty = useMemo(() => {
    // simple heuristic
    return true;
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!r.ok) throw new Error(`GET /api/admin/settings failed: ${r.status}`);
      const data: Settings = await r.json();
      setAgentGreeting(data.agent_greeting ?? "");
      setGmailSummaryEnabled(!!data.gmail_summary_enabled);
      setGmailAccountId(data.gmail_account_id ?? null);
      setPromptAddendum(data.realtime_prompt_addendum ?? "");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_greeting: agentGreeting,
          gmail_summary_enabled: gmailSummaryEnabled,
          // optionally allow editing later:
          // gmail_account_id: gmailAccountId,
          realtime_prompt_addendum: promptAddendum,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`PATCH failed: ${r.status} ${t}`);
      }
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>Admin Settings</h1>

      {loading ? <p>Loading…</p> : null}
      {err ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, marginBottom: 16 }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      {!loading ? (
        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Greeting</h2>
            <p style={{ marginTop: 0, color: "#555" }}>
              This is the first sentence the agent should speak at call start.
            </p>
            <textarea
              value={agentGreeting}
              onChange={(e) => setAgentGreeting(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          </section>

          <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Realtime prompt addendum</h2>
            <textarea
              value={promptAddendum}
              onChange={(e) => setPromptAddendum(e.target.value)}
              rows={6}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          </section>

          <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Gmail summary</h2>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={gmailSummaryEnabled}
                onChange={(e) => setGmailSummaryEnabled(e.target.checked)}
              />
              Enabled
            </label>
            <p style={{ marginBottom: 0, color: "#555" }}>
              Active Gmail account id: <code>{gmailAccountId ?? "none"}</code>
            </p>
          </section>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #222", background: "#222", color: "white" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={load}
              disabled={saving}
              style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
            >
              Refresh
            </button>
          </div>

          <p style={{ color: "#666", marginTop: 4 }}>
            Tip: keep the admin key only in server env vars (never in the browser).
          </p>
        </div>
      ) : null}
    </main>
  );
}
