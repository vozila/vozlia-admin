import { useEffect, useMemo, useState } from "react";

type Settings = {
  agent_greeting: string;
  gmail_summary_enabled: boolean;
  gmail_account_id: string;
  realtime_prompt_addendum: string;
};

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Leave as text
  }

  if (!res.ok) {
    const msg = typeof data === "object" && data?.detail ? data.detail : text || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (data ?? {}) as T;
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Editable fields
  const [agentGreeting, setAgentGreeting] = useState("");
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [promptAddendum, setPromptAddendum] = useState("");

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      agentGreeting !== settings.agent_greeting ||
      gmailEnabled !== settings.gmail_summary_enabled ||
      promptAddendum !== settings.realtime_prompt_addendum
    );
  }, [settings, agentGreeting, gmailEnabled, promptAddendum]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchJSON<Settings>("/api/admin/settings");
      setSettings(s);
      setAgentGreeting(s.agent_greeting || "");
      setGmailEnabled(Boolean(s.gmail_summary_enabled));
      setPromptAddendum(s.realtime_prompt_addendum || "");
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const payload: Partial<Settings> = {
        agent_greeting: agentGreeting,
        gmail_summary_enabled: gmailEnabled,
        realtime_prompt_addendum: promptAddendum,
      };
      const updated = await fetchJSON<Settings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(updated);
      setToast("Saved");
      window.setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 920 }}>
      <h1 style={{ margin: 0 }}>Vozlia Admin</h1>
      <p style={{ marginTop: 6, color: "#555" }}>Central settings (served via Vercel → Vozlia Control → Vozlia Backend)</p>

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button onClick={load} disabled={loading || saving}>
          Refresh
        </button>
        <button onClick={save} disabled={loading || saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </button>
        {toast && <span style={{ color: "#0a7" }}>{toast}</span>}
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f2c", background: "#fff5fb" }}>
          <strong style={{ color: "#b00020" }}>Error:</strong> <span>{error}</span>
          <div style={{ marginTop: 8, color: "#555" }}>
            If this is Unauthorized, confirm the Vercel env vars are set:
            <code style={{ display: "block", marginTop: 6 }}>VOZLIA_CONTROL_BASE_URL</code>
            <code style={{ display: "block" }}>VOZLIA_ADMIN_KEY</code>
          </div>
        </div>
      )}

      {settings && (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Greeting</h2>
            <label style={{ display: "block", fontWeight: 600 }}>Agent greeting</label>
            <input
              value={agentGreeting}
              onChange={(e) => setAgentGreeting(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder='e.g., "Hello, you’re speaking with Vozlia — how can I help today?"'
            />
            <p style={{ color: "#666", marginBottom: 0 }}>
              This is the *exact* greeting we want Realtime to say first. Your Twilio call flow should load this and pass
              it into the Realtime session.
            </p>
          </div>

          <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Realtime prompt addendum</h2>
            <label style={{ display: "block", fontWeight: 600 }}>Prompt addendum</label>
            <textarea
              value={promptAddendum}
              onChange={(e) => setPromptAddendum(e.target.value)}
              rows={6}
              style={{ width: "100%", padding: 10, marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
            <p style={{ color: "#666", marginBottom: 0 }}>
              Keep this short and deterministic. It’s injected into the Realtime session at call start.
            </p>
          </div>

          <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Gmail</h2>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={gmailEnabled} onChange={(e) => setGmailEnabled(e.target.checked)} />
              Enable Gmail summaries
            </label>
            <div style={{ marginTop: 10, color: "#666" }}>
              <div>
                Current Gmail account id: <code>{settings.gmail_account_id}</code>
              </div>
            </div>
          </div>

          <div style={{ padding: 14, border: "1px dashed #ccc", borderRadius: 10, color: "#666" }}>
            <strong>Debug:</strong>
            <div style={{ marginTop: 6 }}>
              <div>
                API check: <code>/api/health</code>
              </div>
              <div>
                Settings API: <code>/api/admin/settings</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
