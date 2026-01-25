"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

type WebSearchRunOut = {
  query: string;
  answer: string;
  sources?: WebSearchSource[];
  latency_ms?: number | null;
  model?: string | null;
};

type WebSearchSkill = {
  id: string;
  skill_key: string;
  name: string;
  query: string;
  triggers?: string[];
  enabled: boolean;
};

type WebSearchSchedule = {
  id: string;
  web_search_skill_id: string;
  enabled: boolean;
  cadence: string;
  time_of_day: string;
  timezone: string;
  channel: string;
  destination: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
};

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  meta?: { model?: string | null; latency_ms?: number | null };
  sources?: WebSearchSource[];
};

function parseTriggers(raw: string): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatWhenIso(iso?: string | null): string {
  if (!iso) return "";
  // Render gives ISO-ish strings; keep it simple and safe in UI.
  return iso.replace("T", " ").replace("Z", "");
}

export default function WebSearchMvpPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Chat input (also used as "current query" when saving a skill).
  const [query, setQuery] = useState("");

  // Optional: allow overriding the model the backend uses (leave blank to use default).
  const [model, setModel] = useState("");

  // Latest backend response (used for "turn into skill" and test notifications).
  const [runOut, setRunOut] = useState<WebSearchRunOut | null>(null);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [skills, setSkills] = useState<WebSearchSkill[]>([]);
  const [schedules, setSchedules] = useState<WebSearchSchedule[]>([]);

  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillTriggers, setNewSkillTriggers] = useState("");

  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const [hour, setHour] = useState("7");
  const [minute, setMinute] = useState("0");
  const [timezone, setTimezone] = useState("America/New_York");
  const [channel, setChannel] = useState("email");
  const [destination, setDestination] = useState("");

  const [testEmailTo, setTestEmailTo] = useState("");
  const [testSmsTo, setTestSmsTo] = useState("");

  async function refreshLists() {
    const [skillsRes, schedRes] = await Promise.all([
      fetch("/api/admin/websearch/skills", { method: "GET" }),
      fetch("/api/admin/websearch/schedules", { method: "GET" }),
    ]);

    const skillsData = await skillsRes.json().catch(() => []);
    const schedData = await schedRes.json().catch(() => []);

    if (skillsRes.ok) setSkills(Array.isArray(skillsData) ? skillsData : []);
    if (schedRes.ok) setSchedules(Array.isArray(schedData) ? schedData : []);
  }

  useEffect(() => {
    refreshLists().catch(() => null);
  }, []);

  useEffect(() => {
    // Auto-scroll chat to bottom.
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, loading]);

  const skillOptions = useMemo(() => skills.filter((s) => !!s.id), [skills]);

  async function ask(qRaw?: string) {
    setErr(null);

    const q = (qRaw ?? query).trim();
    if (!q) {
      setErr("Type a question to ask Vozlia.");
      return;
    }

    // Add the user message first.
    setChat((cur) => [...cur, { role: "user", text: q }]);

    // Keep query in state so “Create Skill” uses the last asked question.
    setQuery(q);

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, model: model.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Search failed");

      const out = data as WebSearchRunOut;
      setRunOut(out);

      setChat((cur) => [
        ...cur,
        {
          role: "assistant",
          text: out.answer || "",
          sources: out.sources || [],
          meta: { model: out.model ?? null, latency_ms: out.latency_ms ?? null },
        },
      ]);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setErr(msg);
      setChat((cur) => [
        ...cur,
        {
          role: "assistant",
          text: `Sorry — I couldn't complete that request.\n\n${msg}`,
          meta: { model: null, latency_ms: null },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function createSkillFromCurrentQuery() {
    setErr(null);

    const q = (runOut?.query || query || "").trim();
    if (!q) {
      setErr("Ask a question first (or type one above), then create the skill.");
      return;
    }

    const name = (newSkillName || "").trim() || `WebSearch: ${q.slice(0, 48)}`;
    const triggers = parseTriggers(newSkillTriggers);

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query: q, triggers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Create skill failed");

      // Prefer selecting the newly created skill for scheduling.
      if (data?.id) setSelectedSkillId(String(data.id));

      await refreshLists();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("vozlia:websearch-updated"));
      setNewSkillName("");
      setNewSkillTriggers("");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteSkill(id: string) {
    if (!id) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/websearch/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Delete failed");
      await refreshLists();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("vozlia:websearch-updated"));
      if (selectedSkillId === id) setSelectedSkillId("");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function upsertSchedule() {
    setErr(null);

    if (!selectedSkillId) {
      setErr("Select a saved Web Search skill to schedule.");
      return;
    }
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      setErr("Hour must be 0–23.");
      return;
    }
    if (!Number.isFinite(m) || m < 0 || m > 59) {
      setErr("Minute must be 0–59.");
      return;
    }
    if (!destination.trim()) {
      setErr("Destination is required (email or phone number).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          web_search_skill_id: selectedSkillId,
          hour: h,
          minute: m,
          timezone: timezone.trim() || "America/New_York",
          channel,
          destination: destination.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Schedule failed");

      await refreshLists();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("vozlia:websearch-updated"));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteSchedule(id: string) {
    if (!id) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/websearch/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Delete failed");
      await refreshLists();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("vozlia:websearch-updated"));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestEmail() {
    setErr(null);
    if (!testEmailTo.trim()) {
      setErr("Enter an email address for a test email.");
      return;
    }
    const body = (runOut?.answer || "").trim() || "(no answer yet)";
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notify/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmailTo.trim(),
          subject: "Vozlia WebSearch Test",
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Email failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestSms() {
    setErr(null);
    if (!testSmsTo.trim()) {
      setErr("Enter a phone number for a test SMS.");
      return;
    }
    const body = (runOut?.answer || "").trim() || "(no answer yet)";
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notify/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testSmsTo.trim(),
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "SMS failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panelTitle">Configuration Wizard</div>
      <div className="panelSub">
        ChatGPT-style entry point. Ask a question, then optionally turn it into a saved skill and schedule deliveries. (Currently:
        Web Search.)
      </div>

      {err ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div className="alertTitle">Error</div>
          <div className="alertBody">{err}</div>
        </div>
      ) : null}

      {/* Chat console */}
      <div className="panelInset" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask Vozlia</div>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 10,
            padding: 10,
            maxHeight: 320,
            overflowY: "auto",
            background: "rgba(0,0,0,0.02)",
          }}
        >
          {chat.length === 0 ? (
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Try: <b>Are alternate side parking rules in effect today in NYC?</b>
            </div>
          ) : null}

          {chat.map((m, idx) => (
            <div key={idx} style={{ marginTop: idx === 0 ? 0 : 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{m.role === "user" ? "You" : "Vozlia"}</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: m.role === "user" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.7)",
                }}
              >
                {m.text}
              </div>

              {m.role === "assistant" && (m.meta?.model || m.meta?.latency_ms != null) ? (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  model={m.meta?.model || "(default)"} · latency_ms={m.meta?.latency_ms ?? "?"}
                </div>
              ) : null}

              {m.role === "assistant" && (m.sources || []).length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Sources</div>
                  <ul style={{ marginTop: 6 }}>
                    {(m.sources || []).slice(0, 8).map((s, sIdx) => (
                      <li key={sIdx} style={{ fontSize: 13, marginTop: 4 }}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title || s.url}
                        </a>
                        {s.snippet ? <div style={{ opacity: 0.8 }}>{s.snippet}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}

          {loading ? <div style={{ marginTop: 10, opacity: 0.8 }}>Thinking…</div> : null}
          <div ref={chatEndRef} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <textarea
            className="input"
            style={{ flex: 1, minHeight: 44, resize: "vertical" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your question…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask().catch(() => null);
              }
            }}
          />
          <button className="btnPrimary" type="button" disabled={loading} onClick={() => ask().catch(() => null)}>
            {loading ? "Asking…" : "Ask"}
          </button>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", opacity: 0.85 }}>Advanced</summary>
          <div style={{ marginTop: 10 }}>
            <div className="field">
              <div className="fieldLabel">Model override (optional)</div>
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="leave blank for backend default"
              />
            </div>
          </div>
        </details>
      </div>

      {/* Turn into skill */}
      <div className="panelInset" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Turn this into a skill (optional)</div>
        <div style={{ opacity: 0.8, fontSize: 13, marginTop: 6 }}>
          This saves the last asked question as a Web Search skill and makes it available elsewhere in the portal.
        </div>

        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Skill name</div>
            <input className="input" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="NYC Alternate Side Parking" />
          </div>

          <div className="field">
            <div className="fieldLabel">Trigger phrases (comma-separated)</div>
            <input
              className="input"
              value={newSkillTriggers}
              onChange={(e) => setNewSkillTriggers(e.target.value)}
              placeholder="alternate side parking, ASP rules"
            />
          </div>

          <div className="actions">
            <button className="btnPrimary" type="button" disabled={loading} onClick={() => createSkillFromCurrentQuery().catch(() => null)}>
              {loading ? "Saving…" : "Create Skill"}
            </button>
            <button className="btnSecondary" type="button" disabled={loading} onClick={() => refreshLists().catch(() => null)}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Scheduling */}
      <div className="panelInset" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Schedule delivery (optional)</div>
        <div style={{ opacity: 0.8, fontSize: 13, marginTop: 6 }}>
          Schedule a saved Web Search skill for daily delivery via Email (or SMS if configured).
        </div>

        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Saved skill</div>
            <select className="input" value={selectedSkillId} onChange={(e) => setSelectedSkillId(e.target.value)}>
              <option value="">Select…</option>
              {skillOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="fieldLabel">Hour (0–23)</div>
              <input className="input" value={hour} onChange={(e) => setHour(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="fieldLabel">Minute (0–59)</div>
              <input className="input" value={minute} onChange={(e) => setMinute(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Timezone</div>
            <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>

          <div className="field">
            <div className="fieldLabel">Channel</div>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="whatsapp">whatsapp</option>
              <option value="call">call</option>
            </select>
          </div>

          <div className="field">
            <div className="fieldLabel">Destination (email or phone number)</div>
            <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="yasinc74@gmail.com or +1917..." />
          </div>

          <div className="actions">
            <button className="btnPrimary" type="button" disabled={loading} onClick={() => upsertSchedule().catch(() => null)}>
              {loading ? "Saving…" : "Save Schedule"}
            </button>
            <button className="btnSecondary" type="button" disabled={loading} onClick={() => refreshLists().catch(() => null)}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Quick view */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.85 }}>Saved Web Search skills & schedules (quick view)</summary>

        <div className="panelInset" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>Saved skills</div>
          {skills.length === 0 ? (
            <div style={{ opacity: 0.8, marginTop: 8 }}>No saved Web Search skills yet.</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {skills.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>{s.query}</div>
                    {(s.triggers || []).length ? <div style={{ opacity: 0.7, fontSize: 12 }}>triggers: {(s.triggers || []).join(", ")}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btnSecondary" type="button" onClick={() => setSelectedSkillId(s.id)}>
                      Select
                    </button>
                    <button className="btnDanger" type="button" disabled={loading} onClick={() => deleteSkill(s.id).catch(() => null)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panelInset" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>Saved schedules</div>
          {schedules.length === 0 ? (
            <div style={{ opacity: 0.8, marginTop: 8 }}>No schedules yet.</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {schedules.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {r.channel} → {r.destination}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                      {r.cadence} · {r.time_of_day} · {r.timezone}
                    </div>
                    {r.next_run_at ? <div style={{ opacity: 0.7, fontSize: 12 }}>next: {formatWhenIso(r.next_run_at)}</div> : null}
                    {r.last_run_at ? <div style={{ opacity: 0.7, fontSize: 12 }}>last: {formatWhenIso(r.last_run_at)}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btnDanger" type="button" disabled={loading} onClick={() => deleteSchedule(r.id).catch(() => null)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* Test notifications */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.85 }}>Test notifications (optional)</summary>

        <div className="panelInset" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>Send a test email</div>
          <div className="form" style={{ marginTop: 10 }}>
            <div className="field">
              <div className="fieldLabel">To</div>
              <input className="input" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="your@email.com" />
            </div>
            <div className="actions">
              <button className="btnPrimary" type="button" disabled={loading} onClick={() => sendTestEmail().catch(() => null)}>
                {loading ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        </div>

        <div className="panelInset" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>Send a test SMS</div>
          <div style={{ opacity: 0.8, fontSize: 13, marginTop: 6 }}>
            Requires a working SMS provider (e.g., Twilio A2P-approved sender).
          </div>
          <div className="form" style={{ marginTop: 10 }}>
            <div className="field">
              <div className="fieldLabel">To</div>
              <input className="input" value={testSmsTo} onChange={(e) => setTestSmsTo(e.target.value)} placeholder="+1917..." />
            </div>
            <div className="actions">
              <button className="btnPrimary" type="button" disabled={loading} onClick={() => sendTestSms().catch(() => null)}>
                {loading ? "Sending…" : "Send SMS"}
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
