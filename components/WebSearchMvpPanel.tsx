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
  triggers: string[];
  enabled: boolean;
};

type WebSearchSchedule = {
  id: string;
  web_search_skill_id: string;
  enabled: boolean;
  cadence: string; // "daily" (MVP)
  time_of_day: string; // "HH:MM"
  timezone: string;
  channel: string; // "email" | "sms" (MVP)
  destination: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
};

type ChatRole = "user" | "assistant" | "system";
type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  meta?: {
    sources?: WebSearchSource[];
    model?: string | null;
    latency_ms?: number | null;
  };
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function parseCsv(raw: string): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function hmFromTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay || "");
  if (!m) return { hour: 7, minute: 0 };
  const hour = Math.max(0, Math.min(23, Number(m[1])));
  const minute = Math.max(0, Math.min(59, Number(m[2])));
  return { hour, minute };
}

function scheduleSummary(s: WebSearchSchedule | null | undefined): string {
  if (!s) return "Not scheduled";
  const when = `${s.cadence || "daily"} · ${s.time_of_day} · ${s.timezone}`;
  const where = `${s.channel} → ${s.destination}`;
  const onOff = s.enabled ? "On" : "Off";
  return `${onOff} · ${when} · ${where}`;
}

export default function WebSearchMvpPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Chat
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Tell me what you want. I can answer quickly, and if you want it as a recurring report I can save it as an automation (email/SMS).",
    },
  ]);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Advanced (optional)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState("");

  // Last run (used for “Save as automation”)
  const [lastQuery, setLastQuery] = useState<string>("");
  const [lastAnswer, setLastAnswer] = useState<string>("");

  // Skills + schedules
  const [skills, setSkills] = useState<WebSearchSkill[]>([]);
  const [schedules, setSchedules] = useState<WebSearchSchedule[]>([]);

  // Save skill modal
  const [saveOpen, setSaveOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillTriggers, setNewSkillTriggers] = useState("");

  // Manage card modal
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSkillId, setManageSkillId] = useState<string>("");
  const [hour, setHour] = useState("7");
  const [minute, setMinute] = useState("0");
  const [timezone, setTimezone] = useState("America/New_York");
  const [channel, setChannel] = useState("email");
  const [destination, setDestination] = useState("");

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
    // Auto-scroll to bottom on new messages
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const cards = useMemo(() => {
    const schedBySkill = new Map<string, WebSearchSchedule>();
    for (const s of schedules) {
      // MVP: assume 1 schedule per skill; keep first enabled else first
      if (!schedBySkill.has(s.web_search_skill_id)) {
        schedBySkill.set(s.web_search_skill_id, s);
      }
    }
    return skills
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((sk) => ({ skill: sk, schedule: schedBySkill.get(sk.id) || null }));
  }, [skills, schedules]);

  function pushMsg(m: ChatMsg) {
    setMessages((cur) => [...cur, m]);
  }

  async function runSearch(qRaw: string) {
    setErr(null);
    const q = (qRaw || "").trim();
    if (!q) return;

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
      setLastQuery(out.query || q);
      setLastAnswer(out.answer || "");

      pushMsg({
        id: uid("assistant"),
        role: "assistant",
        text: out.answer || "(No answer returned.)",
        meta: { sources: out.sources || [], model: out.model ?? null, latency_ms: out.latency_ms ?? null },
      });

      // Subtle inline hint (no buttons, stays chat-like)
      pushMsg({
        id: uid("system"),
        role: "system",
        text: "If you want this as a recurring report, click “Save as automation” below the chat, or tell me in chat: “save this as an automation”.",
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      pushMsg({
        id: uid("assistant"),
        role: "assistant",
        text: `Sorry — I couldn't complete that. ${String(e?.message ?? e)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function onSend() {
    const text = (draft || "").trim();
    if (!text) return;

    setDraft("");
    pushMsg({ id: uid("user"), role: "user", text });

    // MVP command: “save this …” opens the save modal
    if (/^save\b/i.test(text) || /save this/i.test(text) || /create.*automation/i.test(text)) {
      setSaveOpen(true);
      return;
    }

    await runSearch(text);
  }

  async function createSkillFromLastQuery() {
    setErr(null);
    const q = (lastQuery || "").trim();
    if (!q) {
      setErr("Ask a question first so there’s something to save.");
      return;
    }

    const name = (newSkillName || "").trim() || `Automation: ${q.slice(0, 48)}`;
    const triggers = parseCsv(newSkillTriggers);

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

      setSaveOpen(false);
      setNewSkillName("");
      setNewSkillTriggers("");

      pushMsg({
        id: uid("assistant"),
        role: "assistant",
        text: `Saved. I created an automation called “${name}”. You can set delivery (email/SMS + schedule) from the card below.`,
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function openManage(skillId: string) {
    const sk = skills.find((s) => s.id === skillId) || null;
    const sc = schedules.find((s) => s.web_search_skill_id === skillId) || null;

    setManageSkillId(skillId);

    // Prefill delivery fields from schedule if present; else sensible defaults
    if (sc) {
      const { hour, minute } = hmFromTimeOfDay(sc.time_of_day);
      setHour(String(hour));
      setMinute(String(minute));
      setTimezone(sc.timezone || "America/New_York");
      setChannel(sc.channel || "email");
      setDestination(sc.destination || "");
    } else {
      setHour("7");
      setMinute("0");
      setTimezone("America/New_York");
      setChannel("email");
      setDestination("");
    }

    setManageOpen(true);
  }

  async function upsertSchedule() {
    setErr(null);
    if (!manageSkillId) {
      setErr("No skill selected.");
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
          web_search_skill_id: manageSkillId,
          hour: h,
          minute: m,
          timezone: (timezone || "").trim() || "America/New_York",
          channel,
          destination: destination.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Schedule failed");

      await refreshLists();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("vozlia:websearch-updated"));

      setManageOpen(false);
      pushMsg({
        id: uid("assistant"),
        role: "assistant",
        text: `Scheduled. I’ll deliver that automation via ${channel} to ${destination.trim()} at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} (${timezone || "America/New_York"}).`,
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const manageSkill = useMemo(() => skills.find((s) => s.id === manageSkillId) || null, [skills, manageSkillId]);
  const manageSchedule = useMemo(
    () => schedules.find((s) => s.web_search_skill_id === manageSkillId) || null,
    [schedules, manageSkillId]
  );

  return (
    <div className="panel">
      <div className="wizardTop">
        <div>
          <div className="panelTitle">Chat</div>
          <div className="panelSub">Ask anything. If it’s useful as a recurring report, save it as an automation.</div>
        </div>
        <button className="btnTertiary" type="button" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "Hide" : "Show"} advanced
        </button>
      </div>

      {showAdvanced ? (
        <div className="panelInset" style={{ marginTop: 12 }}>
          <div className="field">
            <div className="fieldLabel">Model (optional)</div>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="leave blank for backend default" />
          </div>
          <div className="rowSub" style={{ marginTop: 8 }}>
            Tip: Leave this blank unless you’re testing models.
          </div>
        </div>
      ) : null}

      {err ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div className="alertTitle">Error</div>
          <div className="alertBody">{err}</div>
        </div>
      ) : null}

      <div className="chatShell" style={{ marginTop: 12 }}>
        <div className="chatMessages" ref={messagesRef}>
          {messages.map((m) => (
            <div key={m.id} className={`chatMsg ${m.role}`}>
              <div className="chatBubble">
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                {m.role === "assistant" && (m.meta?.model || m.meta?.latency_ms != null) ? (
                  <div className="chatMeta">
                    {m.meta?.model ? `model=${m.meta.model}` : ""}
                    {m.meta?.latency_ms != null ? ` · latency_ms=${Math.round(m.meta.latency_ms)}` : ""}
                  </div>
                ) : null}
                {m.role === "assistant" && (m.meta?.sources || []).length ? (
                  <details className="chatSources">
                    <summary>Sources</summary>
                    <ul style={{ margin: "8px 0 0 18px" }}>
                      {(m.meta?.sources || []).slice(0, 8).map((s, idx) => (
                        <li key={idx}>
                          <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                            {s.title || s.url}
                          </a>
                          {s.snippet ? <div className="rowSub">{s.snippet}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="chatInputRow">
          <textarea
            className="chatInput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your goal or question…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend().catch(() => null);
              }
            }}
          />
          <button className="btnPrimary" type="button" disabled={loading} onClick={() => onSend().catch(() => null)}>
            {loading ? "…" : "Send"}
          </button>
        </div>
      </div>

      <div className="actions" style={{ marginTop: 12 }}>
        <button
          className="btnSecondary"
          type="button"
          disabled={loading || !lastQuery}
          onClick={() => {
            setSaveOpen(true);
          }}
        >
          Save as automation
        </button>
        <button className="btnSecondary" type="button" disabled={loading} onClick={() => refreshLists().catch(() => null)}>
          Refresh
        </button>
      </div>

      <div className="panelInset" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="rowMain">
            <div className="rowTitle">Automations</div>
            <div className="rowSub">
              Automations you’ve saved. Click a card to set delivery (schedule + channel).
            </div>
          </div>
        </div>

        {cards.length ? (
          <div className="autoGrid">
            {cards.map(({ skill, schedule }) => (
              <button key={skill.id} type="button" className="autoCard" onClick={() => openManage(skill.id)}>
                <div>
                  <div className="autoTitle">{skill.name}</div>
                  <div className="autoMeta">{scheduleSummary(schedule)}</div>
                </div>
                <div className="autoFooter">
                  <span className={`pill ${skill.enabled ? "pillOn" : "pillOff"}`}>{skill.enabled ? "Enabled" : "Disabled"}</span>
                  <span className="autoSmall">Click to manage</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rowSub" style={{ marginTop: 10 }}>
            No saved automations yet.
          </div>
        )}
      </div>

      {/* Save modal */}
      {saveOpen ? (
        <div className="modalOverlay" onMouseDown={() => setSaveOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Save as automation</div>
            <div className="rowSub" style={{ marginTop: 6 }}>
              This will create an automation card from your most recent question.
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <div className="fieldLabel">Name</div>
              <input className="input" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="e.g., NYC Alternate Side Parking" />
            </div>

            {showAdvanced ? (
              <div className="field" style={{ marginTop: 10 }}>
                <div className="fieldLabel">Triggers (optional, comma-separated)</div>
                <input className="input" value={newSkillTriggers} onChange={(e) => setNewSkillTriggers(e.target.value)} placeholder="e.g., alternate side parking, ASP rules" />
              </div>
            ) : (
              <div className="rowSub" style={{ marginTop: 10 }}>
                Tip: Enable “advanced” if you want custom trigger phrases.
              </div>
            )}

            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btnPrimary" type="button" disabled={loading} onClick={() => createSkillFromLastQuery().catch(() => null)}>
                {loading ? "Saving…" : "Save"}
              </button>
              <button className="btnSecondary" type="button" disabled={loading} onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
            </div>

            {lastQuery ? (
              <div className="panelInset" style={{ marginTop: 12 }}>
                <div className="rowSub">Saved query:</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 13 }}>{lastQuery}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Manage modal */}
      {manageOpen && manageSkill ? (
        <div className="modalOverlay" onMouseDown={() => setManageOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">{manageSkill.name}</div>
            <div className="rowSub" style={{ marginTop: 6 }}>
              {manageSchedule ? scheduleSummary(manageSchedule) : "Not scheduled yet"}
            </div>

            <div className="panelInset" style={{ marginTop: 12 }}>
              <div className="field">
                <div className="fieldLabel">Time</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input className="input" value={hour} onChange={(e) => setHour(e.target.value)} style={{ width: 90 }} />
                  <input className="input" value={minute} onChange={(e) => setMinute(e.target.value)} style={{ width: 90 }} />
                  <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
                </div>
                <div className="rowSub" style={{ marginTop: 6 }}>
                  Hour is 0–23, minute is 0–59. Timezone must be an IANA TZ string.
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <div className="fieldLabel">Delivery</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: 140 }}>
                    <option value="email">email</option>
                    <option value="sms">sms</option>
                  </select>
                  <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={channel === "email" ? "you@example.com" : "+15551234567"} style={{ minWidth: 260, flex: 1 }} />
                </div>
              </div>

              <div className="actions" style={{ marginTop: 14 }}>
                <button className="btnPrimary" type="button" disabled={loading} onClick={() => upsertSchedule().catch(() => null)}>
                  {loading ? "Saving…" : manageSchedule ? "Update schedule" : "Create schedule"}
                </button>
                <button className="btnSecondary" type="button" disabled={loading} onClick={() => setManageOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary className="rowSub">Show automation query</summary>
              <div className="panelInset" style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13 }}>
                {manageSkill.query}
              </div>
              {manageSkill.triggers?.length ? (
                <div className="rowSub" style={{ marginTop: 8 }}>
                  Triggers: {manageSkill.triggers.join(", ")}
                </div>
              ) : null}
            </details>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .wizardTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .btnTertiary {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
        }
        .chatShell {
          border: 1px solid var(--border);
          background: var(--card);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .chatMessages {
          height: 520px;
          overflow: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .chatMsg {
          display: flex;
        }
        .chatMsg.user {
          justify-content: flex-end;
        }
        .chatMsg.assistant {
          justify-content: flex-start;
        }
        .chatMsg.system {
          justify-content: center;
        }
        .chatBubble {
          max-width: 86%;
          border-radius: 16px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          background: var(--card);
        }
        .chatMsg.user .chatBubble {
          background: var(--accentSoft);
          border-color: rgba(6, 182, 212, 0.25);
        }
        .chatMsg.system .chatBubble {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          padding: 0;
          max-width: 92%;
          text-align: center;
        }
        .chatMeta {
          margin-top: 8px;
          font-size: 12px;
          color: var(--muted);
        }
        .chatSources {
          margin-top: 10px;
          font-size: 13px;
          color: var(--muted);
        }
        .chatInputRow {
          display: flex;
          gap: 10px;
          padding: 12px;
          border-top: 1px solid var(--border);
        }
        .chatInput {
          flex: 1;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 12px;
          font-size: 14px;
          outline: none;
          resize: vertical;
          min-height: 54px;
          max-height: 180px;
          background: #fff;
        }

        .autoGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 14px;
        }
        .autoCard {
          text-align: left;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--card);
          padding: 14px;
          cursor: pointer;
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          aspect-ratio: 1 / 1;
        }
        .autoTitle {
          font-weight: 700;
          font-size: 15px;
          line-height: 1.25;
        }
        .autoMeta {
          margin-top: 10px;
          font-size: 12px;
          color: var(--muted);
          line-height: 1.35;
        }
        .autoFooter {
          margin-top: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .autoSmall {
          font-size: 12px;
          color: var(--muted);
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 50;
        }
        .modalCard {
          width: min(720px, 96vw);
          max-height: 92vh;
          overflow: auto;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--card);
          box-shadow: var(--shadow);
          padding: 16px;
        }
        .modalTitle {
          font-size: 16px;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
