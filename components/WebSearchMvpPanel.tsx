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
    refreshLists().catch(() => {});
  }, []);

  const selectedSkill = useMemo(() => {
    return skills.find((s) => s.id === selectedSkillId) || null;
  }, [skills, selectedSkillId]);

  async function runSearch() {
    setErr(null);
    setRunOut(null);

    const q = query.trim();
    if (!q) {
      setErr("Enter a search query.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, model: model.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Search failed");

      setRunOut(data as WebSearchRunOut);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function createSkillFromRun() {
    setErr(null);

    const out = runOut;
    if (!out?.answer?.trim()) {
      setErr("Run a search first (no answer to save).");
      return;
    }

    const name = (newSkillName || "").trim();
    if (!name) {
      setErr("Enter a name for the new skill.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          query: out.query,
          triggers: parseTriggers(newSkillTriggers),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Create skill failed");

      await refreshLists();
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
      const res = await fetch(`/api/admin/websearch/skills/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Delete skill failed");

      await refreshLists();
      if (selectedSkillId === id) setSelectedSkillId("");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function createSchedule() {
    setErr(null);

    const skillId = selectedSkillId;
    if (!skillId) {
      setErr("Select a WebSearch skill first.");
      return;
    }

    const hh = String(Math.max(0, Math.min(23, parseInt(hour || "7", 10) || 0))).padStart(2, "0");
    const mm = String(Math.max(0, Math.min(59, parseInt(minute || "0", 10) || 0))).padStart(2, "0");
    const tz = (timezone || "").trim() || "America/New_York";
    const ch = (channel || "").trim() || "email";
    const dest = (destination || "").trim();

    if (!dest) {
      setErr("Enter a destination (email address or phone number).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          web_search_skill_id: skillId,
          enabled: true,
          cadence: "daily",
          time_of_day: `${hh}:${mm}`,
          timezone: tz,
          channel: ch,
          destination: dest,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Create schedule failed");

      await refreshLists();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function toggleSchedule(id: string, enabled: boolean) {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/websearch/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Update schedule failed");
      await refreshLists();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestEmail() {
    setErr(null);
    const to = (testEmailTo || "").trim();
    const out = runOut;

    if (!to) {
      setErr("Enter a destination email address to send a test email.");
      return;
    }
    if (!out?.answer?.trim()) {
      setErr("Run a search first (no answer to send).");
      return;
    }

    setLoading(true);
    try {
      const body = out.answer.length > 20000 ? out.answer.slice(0, 20000) + "…" : out.answer;
      const res = await fetch("/api/admin/notify/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: "Vozlia WebSearch Test", body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "Email failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestSms() {
    setErr(null);
    const to = (testSmsTo || "").trim();
    const out = runOut;

    if (!to) {
      setErr("Enter a destination phone number to send a test SMS.");
      return;
    }
    if (!out?.answer?.trim()) {
      setErr("Run a search first (no answer to send).");
      return;
    }

    setLoading(true);
    try {
      const body = out.answer.length > 1200 ? out.answer.slice(0, 1200) + "…" : out.answer;
      const res = await fetch("/api/admin/notify/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || data?.error || "SMS failed");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>Web Search MVP</h2>

      {err ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff0f0", border: "1px solid #f5c2c7" }}>
          <strong>Error:</strong> {err}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <label style={{ display: "block", fontWeight: 600 }}>Search query</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Are alternate side parking rules in effect today in NYC?"'
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ width: 240 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Model (optional)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="leave blank for default"
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ paddingTop: 22 }}>
          <button onClick={runSearch} disabled={loading} style={{ padding: "10px 14px" }}>
            {loading ? "Working..." : "Run search"}
          </button>
        </div>
      </div>

      {runOut ? (
        <div style={{ marginTop: 16 }}>
          <h3>Answer</h3>
          <div style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
            {runOut.answer}
          </div>

          {runOut.sources?.length ? (
            <>
              <h4 style={{ marginTop: 12 }}>Sources</h4>
              <ul>
                {runOut.sources.map((s, idx) => (
                  <li key={idx}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title || s.url}
                    </a>
                    {s.snippet ? <div style={{ opacity: 0.8 }}>{s.snippet}</div> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px" }}>
              <label style={{ display: "block", fontWeight: 600 }}>Test email to</label>
              <input
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="you@example.com"
                style={{ width: "100%", padding: 10 }}
              />
              <button onClick={sendTestEmail} disabled={loading} style={{ marginTop: 8, padding: "10px 14px" }}>
                Send test email
              </button>
            </div>

            <div style={{ flex: "1 1 320px" }}>
              <label style={{ display: "block", fontWeight: 600 }}>Test SMS to</label>
              <input
                value={testSmsTo}
                onChange={(e) => setTestSmsTo(e.target.value)}
                placeholder="+15551234567"
                style={{ width: "100%", padding: 10 }}
              />
              <button onClick={sendTestSms} disabled={loading} style={{ marginTop: 8, padding: "10px 14px" }}>
                Send test SMS
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <hr style={{ margin: "18px 0" }} />

      <h3>Saved WebSearch Skills</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <label style={{ display: "block", fontWeight: 600 }}>Create skill from last run</label>
          <input
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            placeholder="Skill name (e.g. NYC parking report)"
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            value={newSkillTriggers}
            onChange={(e) => setNewSkillTriggers(e.target.value)}
            placeholder='Triggers (comma separated), e.g. "parking,asp,alternate side"'
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <button onClick={createSkillFromRun} disabled={loading || !runOut} style={{ padding: "10px 14px" }}>
            Save as skill
          </button>
        </div>

        <div style={{ flex: "1 1 420px" }}>
          <label style={{ display: "block", fontWeight: 600 }}>Existing skills</label>
          <select
            value={selectedSkillId}
            onChange={(e) => setSelectedSkillId(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="">-- select a skill --</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.skill_key})
              </option>
            ))}
          </select>

          {selectedSkill ? (
            <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 6 }}>
              <div>
                <strong>Query:</strong> {selectedSkill.query}
              </div>
              <div>
                <strong>Enabled:</strong> {String(selectedSkill.enabled)}
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => deleteSkill(selectedSkill.id)}
                  disabled={loading}
                  style={{ padding: "8px 12px" }}
                >
                  Delete skill
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3>Schedules</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px" }}>
          <label style={{ display: "block", fontWeight: 600 }}>Create daily schedule</label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Time</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={hour} onChange={(e) => setHour(e.target.value)} style={{ width: 60, padding: 8 }} />
                <input
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  style={{ width: 60, padding: 8 }}
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>HH (0-23) / MM (0-59)</div>
            </div>

            <div style={{ minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>Timezone</div>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 600 }}>Channel</div>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: "100%", padding: 8 }}>
                <option value="email">email</option>
                <option value="sms">sms</option>
                <option value="whatsapp">whatsapp</option>
                <option value="call">call</option>
              </select>
            </div>

            <div style={{ flex: "1 1 240px", minWidth: 240 }}>
              <div style={{ fontWeight: 600 }}>Destination</div>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="email or phone number"
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ paddingTop: 22 }}>
              <button onClick={createSchedule} disabled={loading} style={{ padding: "10px 14px" }}>
                Create schedule
              </button>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
            Note: schedules run in the Render <code>scheduled_deliveries_worker</code>.
          </div>
        </div>

        <div style={{ flex: "1 1 520px" }}>
          <label style={{ display: "block", fontWeight: 600 }}>Existing schedules</label>

          <div style={{ marginTop: 8 }}>
            {schedules.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No schedules yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Skill</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>When</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Channel</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Destination</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
                    const skillName = skills.find((k) => k.id === s.web_search_skill_id)?.name || s.web_search_skill_id;
                    return (
                      <tr key={s.id}>
                        <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{skillName}</td>
                        <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>
                          {s.cadence} @ {s.time_of_day} {s.timezone}
                        </td>
                        <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{s.channel}</td>
                        <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{s.destination}</td>
                        <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>
                          <button
                            onClick={() => toggleSchedule(s.id, !s.enabled)}
                            disabled={loading}
                            style={{ padding: "6px 10px" }}
                          >
                            {s.enabled ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
