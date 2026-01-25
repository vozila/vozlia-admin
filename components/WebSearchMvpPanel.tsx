"use client";

import { useEffect, useMemo, useState } from "react";

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

function parseTriggers(raw: string): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function WebSearchMvpPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [runOut, setRunOut] = useState<WebSearchRunOut | null>(null);

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

  const skillOptions = useMemo(() => skills.filter((s) => !!s.id), [skills]);

  async function runSearch() {
    setErr(null);
    if (!query.trim()) {
      setErr("Enter a query.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), model: model.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Search failed");
      setRunOut(data as WebSearchRunOut);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function createSkillFromCurrentQuery() {
    setErr(null);
    const q = (runOut?.query || query || "").trim();
    if (!q) {
      setErr("Run a search (or enter a query) first.");
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
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function upsertSchedule() {
    setErr(null);
    if (!selectedSkillId) {
      setErr("Select a skill to schedule.");
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
      <div className="panelTitle">Web Search MVP</div>
      <div className="panelSub">
        Run a search via the backend, optionally save it as a WebSearch skill, then schedule delivery via the scheduled worker.
      </div>

      {err ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div className="alertTitle">Error</div>
          <div className="alertBody">{err}</div>
        </div>
      ) : null}

      <div className="form" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="fieldLabel">Query</div>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g., Are NYC alternate side parking rules in effect today?" />
        </div>

        <div className="field">
          <div className="fieldLabel">Model (optional)</div>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="leave blank for backend default" />
        </div>

        <div className="actions">
          <button className="btnPrimary" type="button" disabled={loading} onClick={runSearch}>
            {loading ? "Running…" : "Run Search"}
          </button>
          <button className="btnSecondary" type="button" disabled={loading} onClick={() => refreshLists().catch(() => null)}>
            Refresh Lists
          </button>
        </div>

        {runOut ? (
          <div className="panelInset">
            <div className="row">
              <div className="rowMain">
                <div className="rowTitle">Answer</div>
                <div className="rowSub">
                  model={runOut.model || "(default)"} · latency_ms={runOut.latency_ms ?? "?"}
                </div>
              </div>
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 10, fontSize: 14 }}>{runOut.answer}</div>

            {(runOut.sources || []).length ? (
              <div style={{ marginTop: 12 }}>
                <div className="fieldLabel">Sources</div>
                <ul style={{ marginTop: 6 }}>
                  {(runOut.sources || []).slice(0, 8).map((s, idx) => (
                    <li key={idx}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title || s.url}
                      </a>
                      {s.snippet ? <div className="muted">{s.snippet}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Create Skill</div>
        <div className="panelSub">Saves the current query as a reusable skill (appears as websearch_&lt;id&gt; in skills_config).</div>

        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Skill name</div>
            <input className="input" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="e.g., NYC Parking Report" />
          </div>
          <div className="field">
            <div className="fieldLabel">Triggers (optional, comma-separated)</div>
            <input className="input" value={newSkillTriggers} onChange={(e) => setNewSkillTriggers(e.target.value)} placeholder="e.g., parking, alternate side, nyc" />
          </div>

          <div className="actions">
            <button className="btnPrimary" type="button" disabled={loading} onClick={createSkillFromCurrentQuery}>
              {loading ? "Working…" : "Create Skill"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="fieldLabel">Existing WebSearch Skills</div>
          {skillOptions.length ? (
            <div className="list">
              {skillOptions.map((s) => (
                <div key={s.id} className="rowCard">
                  <div style={{ minWidth: 0 }}>
                    <div className="rowTitle">{s.name}</div>
                    <div className="rowSub">
                      <span className="mono">{s.skill_key}</span> · enabled={String(!!s.enabled)}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {s.query}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btnSecondary" type="button" onClick={() => setSelectedSkillId(s.id)}>
                      Use for Schedule
                    </button>
                    <button className="btnSecondary" type="button" disabled={loading} onClick={() => deleteSkill(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              No websearch skills yet.
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Schedule Delivery</div>
        <div className="panelSub">
          Requires the backend scheduled worker to be running. For initial testing you can set NOTIFY_DRY_RUN=1 on backend+worker.
        </div>

        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Skill</div>
            <select className="input" value={selectedSkillId} onChange={(e) => setSelectedSkillId(e.target.value)}>
              <option value="">(select a skill)</option>
              {skillOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <div className="fieldLabel">Time of day</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="input" style={{ maxWidth: 120 }} value={hour} onChange={(e) => setHour(e.target.value)} placeholder="hour" />
              <input className="input" style={{ maxWidth: 120 }} value={minute} onChange={(e) => setMinute(e.target.value)} placeholder="minute" />
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
            <div className="fieldLabel">Destination</div>
            <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="email or phone number" />
          </div>

          <div className="actions">
            <button className="btnPrimary" type="button" disabled={loading} onClick={upsertSchedule}>
              {loading ? "Saving…" : "Save Schedule"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="fieldLabel">Existing Schedules</div>
          {schedules.length ? (
            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Time</th>
                  <th>TZ</th>
                  <th>Channel</th>
                  <th>Destination</th>
                  <th>Next</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.web_search_skill_id.slice(0, 8)}</td>
                    <td className="mono">{r.time_of_day}</td>
                    <td className="mono">{r.timezone}</td>
                    <td className="mono">{r.channel}</td>
                    <td className="mono">{r.destination}</td>
                    <td className="mono">{r.next_run_at || ""}</td>
                    <td className="mono">{r.last_run_at || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              No schedules yet.
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Send Test Notification</div>
        <div className="panelSub">Uses Control Plane proxy endpoints. Useful before scheduling.</div>

        <div className="form" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Test Email To</div>
            <input className="input" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="you@example.com" />
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btnSecondary" type="button" disabled={loading} onClick={sendTestEmail}>
                Send Test Email
              </button>
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Test SMS To</div>
            <input className="input" value={testSmsTo} onChange={(e) => setTestSmsTo(e.target.value)} placeholder="+1..." />
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btnSecondary" type="button" disabled={loading} onClick={sendTestSms}>
                Send Test SMS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}