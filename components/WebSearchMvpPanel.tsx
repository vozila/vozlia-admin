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

function safeJson<T = any>(v: any, fallback: T): T {
  try {
  
  async function sendTestEmail() {
    setErr(null);
    if (!destination.trim()) {
      setErr("Enter a destination email address to send a test email.");
      return;
    }
    if (!answer.trim()) {
      setErr("Run a search first (no answer to send).");
      return;
    }
    setLoading(true);
    try {
      const body = answer.length > 20000 ? answer.slice(0, 20000) + "…" : answer;
      const res = await fetch("/api/admin/notify/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: destination.trim(), subject: emailSubject || "Vozlia WebSearch Test", body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Email failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (v as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function WebSearchMvpPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [sources, setSources] = useState<WebSearchSource[]>([]);

  const [skills, setSkills] = useState<WebSearchSkill[]>([]);
  const [schedules, setSchedules] = useState<WebSearchSchedule[]>([]);

  const [newSkillName, setNewSkillName] = useState<string>("");
  const [newSkillTriggers, setNewSkillTriggers] = useState<string>(""); // one per line

  // Schedule form
  const [scheduleSkillId, setScheduleSkillId] = useState<string>("");
  const [hour, setHour] = useState<number>(10);
  const [minute, setMinute] = useState<number>(0);
  const [timezone, setTimezone] = useState<string>("America/New_York");
  const [channel, setChannel] = useState<string>("sms");
  const [destination, setDestination] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState<string>("Vozlia WebSearch Test");

  const selectedSkill = useMemo(() => skills.find((s) => s.id === scheduleSkillId) || null, [skills, scheduleSkillId]);

  async function loadSkills() {
    try {
      const res = await fetch("/api/admin/websearch/skills");
      if (!res.ok) return;
      const data = (await res.json()) as WebSearchSkill[];
      setSkills(Array.isArray(data) ? data : []);
      if (!scheduleSkillId && Array.isArray(data) && data.length > 0) setScheduleSkillId(data[0].id);
    } catch {
      // ignore
    }
  }

  async function loadSchedules() {
    try {
      const res = await fetch("/api/admin/websearch/schedules");
      if (!res.ok) return;
      const data = (await res.json()) as WebSearchSchedule[];
      setSchedules(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadSkills();
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    setErr(null);
    setLoading(true);
    setAnswer("");
    setSources([]);
    try {
      const res = await fetch("/api/admin/websearch/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = safeJson<WebSearchRunOut>(await res.json(), { query, answer: "", sources: [] });
      if (!res.ok) throw new Error((data as any)?.detail || (data as any)?.error || "Search failed");
      setAnswer(data.answer || "");
      setSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function createSkill() {
    setErr(null);
    if (!newSkillName.trim()) {
      setErr("Please provide a skill name.");
      return;
    }
    if (!query.trim()) {
      setErr("Please provide a query.");
      return;
    }
    setLoading(true);
    try {
      const triggers = newSkillTriggers
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/websearch/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSkillName.trim(), query: query.trim(), triggers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Create skill failed");
      setNewSkillName("");
      setNewSkillTriggers("");
      await loadSkills();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteSkill(id: string) {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/websearch/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.detail || (data as any)?.error || "Delete failed");
      await loadSkills();
      await loadSchedules();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function upsertSchedule() {
    setErr(null);
    if (!scheduleSkillId) {
      setErr("Pick a skill to schedule.");
      return;
    }
    if (!destination.trim()) {
      setErr("Destination is required (phone number or email).");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        web_search_skill_id: scheduleSkillId,
        hour: Number(hour),
        minute: Number(minute),
        timezone: timezone || "America/New_York",
        channel,
        destination: destination.trim(),
      };
      const res = await fetch("/api/admin/websearch/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "Schedule failed");
      await loadSchedules();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestSms() {
    setErr(null);
    if (!destination.trim()) {
      setErr("Enter a destination phone number (E.164 recommended) to send a test SMS.");
      return;
    }
    if (!answer.trim()) {
      setErr("Run a search first (no answer to send).");
      return;
    }
    setLoading(true);
    try {
      const body = answer.length > 1400 ? answer.slice(0, 1400) + "…" : answer;
      const res = await fetch("/api/admin/notify/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: destination.trim(), body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || "SMS failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panelTitle">Web Search: Run, Save, Schedule</div>
      <div className="panelSub">
        This panel hits <span className="mono">/api/admin/websearch/*</span> (WebUI) → Control Plane →
        Backend. It will only work after you deploy the Control Plane proxy + backend endpoints.
      </div>

      {err ? (
        <div className="errorBox">
          <div className="errorTitle">Error</div>
          <div className="errorMsg">{err}</div>
        </div>
      ) : null}

      <div className="form">
        <div className="field">
          <div className="fieldLabel">Query</div>
          <div className="fieldHelper">Example: “Are alternate-side parking rules in effect today in NYC?”</div>
          <textarea className="input" rows={3} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter your web search question..." />
        </div>

        <div className="actions">
          <button type="button" className="btnPrimary" disabled={loading || !query.trim()} onClick={runSearch}>
            {loading ? "Working…" : "Run Web Search"}
          </button>
        </div>

        {answer ? (
          <div className="panelInset">
            <div className="panelTitle">Result</div>
            <div className="panelSub">Answer returned by backend web-search wrapper.</div>
            <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{answer}</pre>

            {sources && sources.length ? (
              <div style={{ marginTop: 10 }}>
                <div className="fieldLabel">Sources</div>
                <ul style={{ marginTop: 6 }}>
                  {sources.slice(0, 6).map((s, idx) => (
                    <li key={idx} style={{ marginBottom: 6 }}>
                      <div><span className="mono">{s.title}</span></div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.url}</div>
                      {s.snippet ? <div className="muted" style={{ fontSize: 12 }}>{s.snippet}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="panelInset" style={{ marginTop: 10 }}>
              <div className="panelTitle">Test delivery</div>
              <div className="panelSub">Send the latest answer via SMS (requires Twilio env vars on backend).</div>

              <div className="field">
                <div className="fieldLabel">Destination (phone or email)</div>
                <div className="fieldHelper">Used for schedule destination and also “Send Test SMS”.</div>
                <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="+15551234567 or you@example.com" />
              </div>

              <div className="field">
                <div className="fieldLabel">Email subject (optional)</div>
                <input className="input" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Vozlia WebSearch Test" />
              </div>

              <div className="actions">
                <button type="button" className="btnPrimary" disabled={loading} onClick={sendTestSms}>
                  {loading ? "Working…" : "Send Test SMS"}
                </button>
                <button type="button" className="btn" disabled={loading} onClick={sendTestEmail} style={{ marginLeft: 10 }}>
                  {loading ? "Working…" : "Send Test Email"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="panelInset" style={{ marginTop: 12 }}>
          <div className="panelTitle">Save as WebSearchSkill</div>
          <div className="panelSub">Creates a saved skill with triggers. You can then schedule daily delivery.</div>

          <div className="field">
            <div className="fieldLabel">Skill name</div>
            <input className="input" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="NYC Parking Rules Report" />
          </div>

          <div className="field">
            <div className="fieldLabel">Triggers (one per line)</div>
            <div className="fieldHelper">Optional phrases that route callers to this saved search.</div>
            <textarea className="input" rows={3} value={newSkillTriggers} onChange={(e) => setNewSkillTriggers(e.target.value)} placeholder={"parking rules\nalternate side parking\nnyc asp"} />
          </div>

          <div className="actions">
            <button type="button" className="btnPrimary" disabled={loading} onClick={createSkill}>
              {loading ? "Working…" : "Save Skill"}
            </button>
          </div>
        </div>

        <div className="panelInset" style={{ marginTop: 12 }}>
          <div className="panelTitle">Saved Skills</div>
          <div className="panelSub">Fetched from backend via control plane proxy.</div>

          {skills.length ? (
            <div className="list">
              {skills.map((s) => (
                <div key={s.id} className="listItem" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="mono">{s.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.query}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>id: {s.id}</div>
                  </div>
                  <button type="button" className="btn" disabled={loading} onClick={() => deleteSkill(s.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>No saved web-search skills yet.</div>
          )}
        </div>

        <div className="panelInset" style={{ marginTop: 12 }}>
          <div className="panelTitle">Daily schedule</div>
          <div className="panelSub">
            Creates/updates a daily schedule (backend worker must be running). For quick testing, pick a time a minute or two in the future.
          </div>

          <div className="field">
            <div className="fieldLabel">Skill</div>
            <select className="input" value={scheduleSkillId} onChange={(e) => setScheduleSkillId(e.target.value)}>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedSkill ? <div className="fieldHelper">Query: {selectedSkill.query}</div> : null}
          </div>

          <div className="field">
            <div className="fieldLabel">Time (hour/minute)</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="input" style={{ width: 120 }} type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
              <input className="input" style={{ width: 120 }} type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Timezone</div>
            <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
          </div>

          <div className="field">
            <div className="fieldLabel">Channel</div>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="sms">sms</option>
              <option value="whatsapp">whatsapp</option>
              <option value="email">email</option>
              <option value="call">call</option>
            </select>
          </div>

          <div className="field">
            <div className="fieldLabel">Destination</div>
            <div className="fieldHelper">sms/whatsapp/call: phone number. email: email address.</div>
            <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="+15551234567 or you@example.com" />
          </div>

          <div className="actions">
            <button type="button" className="btnPrimary" disabled={loading || !skills.length} onClick={upsertSchedule}>
              {loading ? "Working…" : "Upsert Daily Schedule"}
            </button>
            <button type="button" className="btn" disabled={loading} onClick={loadSchedules} style={{ marginLeft: 10 }}>
              Refresh Schedules
            </button>
          </div>

          {schedules.length ? (
            <div className="list" style={{ marginTop: 10 }}>
              {schedules.map((s) => (
                <div key={s.id} className="listItem" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="mono">schedule: {s.id}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      skill_id={s.web_search_skill_id} • {s.cadence} • {s.time_of_day} {s.timezone}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {s.channel} → {s.destination}
                    </div>
                    {s.next_run_at ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>next_run_at={s.next_run_at}</div> : null}
                    {s.last_run_at ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>last_run_at={s.last_run_at}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>No schedules yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
