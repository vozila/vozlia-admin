import type { GetServerSidePropsContext } from "next";
import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { RenderLogsPanel } from "../components/RenderLogsPanel";

type EmailAccount = {
  id: string;
  provider_type: string;
  oauth_provider?: string | null;
  email_address?: string | null;
  display_name?: string | null;
  is_primary: boolean;
  is_active: boolean;
};

type SkillKey =
  | "gmail_summaries"
  | "sms"
  | "calendar"
  | "web_search"
  | "weather"
  | "investment_reporting";

const SKILL_ID_BY_KEY: Record<SkillKey, string> = {
  gmail_summaries: "gmail_summary",
  sms: "sms",
  calendar: "calendar",
  web_search: "web_search",
  weather: "weather",
  investment_reporting: "investment_reporting",
};

type SkillCfgState = {
  enabled: boolean;
  addToGreeting: boolean;
  autoExecuteAfterGreeting: boolean;
  engagementPrompt: string; // one phrase per line
  llmPrompt: string;
  tickers?: string; // comma-separated (investment_reporting only)
};

type SettingsResponse = {
  agent_greeting?: string;
  realtime_prompt_addendum?: string;

  gmail_summary_enabled?: boolean;
  gmail_account_id?: string | null;
  gmail_enabled_account_ids?: string[];

  skills_config?: Record<string, any>;
  skills_priority_order?: string[];

  shortterm_memory_enabled?: boolean;
  longterm_memory_enabled?: boolean;
  memory_engagement_phrases?: string[];

  [k: string]: any;
};

function Switch({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <label className="switchRow">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div>
        <div className="switchLabel">{label}</div>
        {helper ? <div className="switchHelper">{helper}</div> : null}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
}) {
  return (
    <div className="field">
      <div className="fieldLabel">{label}</div>
      {helper ? <div className="fieldHelper">{helper}</div> : null}
      {multiline ? (
        <textarea
          className="input"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function parseLines(v: string): string[] {
  return (v || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTickers(v: string): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function skillCardTitle(key: SkillKey): string {
  switch (key) {
    case "gmail_summaries":
      return "Gmail Summaries";
    case "investment_reporting":
      return "Investment Reporting";
    case "sms":
      return "SMS";
    case "calendar":
      return "Calendar";
    case "web_search":
      return "Web Search";
    case "weather":
      return "Weather";
    default:
      return key;
  }
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [agentGreeting, setAgentGreeting] = useState("");
  const [realtimeAddendum, setRealtimeAddendum] = useState("");

  const [memoryShort, setMemoryShort] = useState(false);
  const [memoryLong, setMemoryLong] = useState(false);
  const [memoryEngagementPrompt, setMemoryEngagementPrompt] = useState("");

  const [greetingPriority, setGreetingPriority] = useState<SkillKey[]>([
    "gmail_summaries",
    "investment_reporting",
    "sms",
    "calendar",
    "web_search",
    "weather",
  ]);

  const [skillCfg, setSkillCfg] = useState<Record<SkillKey, SkillCfgState>>({
    gmail_summaries: {
      enabled: false,
      addToGreeting: false,
      autoExecuteAfterGreeting: false,
      engagementPrompt: "",
      llmPrompt: "",
    },
    investment_reporting: {
      enabled: false,
      addToGreeting: false,
      autoExecuteAfterGreeting: false,
      engagementPrompt: "",
      llmPrompt: "",
      tickers: "",
    },
    sms: { enabled: false, addToGreeting: false, autoExecuteAfterGreeting: false, engagementPrompt: "", llmPrompt: "" },
    calendar: { enabled: false, addToGreeting: false, autoExecuteAfterGreeting: false, engagementPrompt: "", llmPrompt: "" },
    web_search: { enabled: false, addToGreeting: false, autoExecuteAfterGreeting: false, engagementPrompt: "", llmPrompt: "" },
    weather: { enabled: false, addToGreeting: false, autoExecuteAfterGreeting: false, engagementPrompt: "", llmPrompt: "" },
  });

  const gmailAccounts = useMemo(() => accounts.filter((a) => a.provider_type === "gmail"), [accounts]);
  const gmailActiveAccounts = useMemo(() => gmailAccounts.filter((a) => a.is_active), [gmailAccounts]);

  const defaultGmailAccountId = settings?.gmail_account_id || null;

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    const data = (await res.json()) as SettingsResponse;
    if (!res.ok) throw new Error(data?.error || "Failed to load settings");

    setSettings(data);
    setAgentGreeting(String(data.agent_greeting || ""));
    setRealtimeAddendum(String(data.realtime_prompt_addendum || ""));

    setMemoryShort(!!data.shortterm_memory_enabled);
    setMemoryLong(!!data.longterm_memory_enabled);
    setMemoryEngagementPrompt((data.memory_engagement_phrases || []).join("\n"));

    // Skills config → UI state (defensive: accept multiple shapes)
    const skills = (data && typeof data === "object" && data.skills_config && typeof data.skills_config === "object")
      ? (data.skills_config as Record<string, any>)
      : {};

    const nextSkillCfg: Record<SkillKey, SkillCfgState> = { ...skillCfg };

    (Object.keys(SKILL_ID_BY_KEY) as SkillKey[]).forEach((key) => {
      const sid = SKILL_ID_BY_KEY[key];
      const cfg = skills[sid] || {};

      const engagement =
        Array.isArray(cfg.engagement_phrases) ? cfg.engagement_phrases.join("\n") :
        typeof cfg.engagementPrompt === "string" ? cfg.engagementPrompt :
        typeof cfg.engagement_prompt === "string" ? cfg.engagement_prompt :
        "";

      nextSkillCfg[key] = {
        enabled: !!cfg.enabled || (sid === "gmail_summary" ? !!data.gmail_summary_enabled : false),
        addToGreeting: !!cfg.add_to_greeting,
        autoExecuteAfterGreeting: !!cfg.auto_execute_after_greeting,
        engagementPrompt: engagement,
        llmPrompt: String(cfg.llm_prompt || cfg.llmPrompt || ""),
        tickers: key === "investment_reporting" ? String(cfg.tickers_raw || (Array.isArray(cfg.tickers) ? cfg.tickers.join(",") : (cfg.tickers || ""))) : undefined,
      };
    });

    setSkillCfg(nextSkillCfg);

    // Priority order
    const order = Array.isArray(data.skills_priority_order) ? data.skills_priority_order : [];
    if (order.length) {
      const next = order
        .map((sid) => {
          const key = (Object.keys(SKILL_ID_BY_KEY) as SkillKey[]).find((k) => SKILL_ID_BY_KEY[k] === sid);
          return key || null;
        })
        .filter(Boolean) as SkillKey[];
      if (next.length) setGreetingPriority(next);
    }
  }

  async function loadAccounts() {
    const res = await fetch("/api/admin/email-accounts");
    const text = await res.text();
    if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // upstream might return plain text; ignore
      data = {};
    }
    const list = Array.isArray(data.accounts) ? data.accounts : Array.isArray(data) ? data : [];
    setAccounts(list);
  }

  async function patchAccount(id: string, patch: Partial<EmailAccount>) {
    const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `Failed to patch account ${id}`);
    await loadAccounts();
  }

  async function setPrimaryAccount(id: string) {
    const updates = gmailAccounts.map((a) => patchAccount(a.id, { is_primary: a.id === id }));
    await Promise.all(updates);
  }

  async function saveSettings() {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setOkMsg(null);

    const payload = {
      agent_greeting: agentGreeting,
      realtime_prompt_addendum: realtimeAddendum,

      gmail_summary_enabled: !!settings.gmail_summary_enabled,
      gmail_account_id: settings.gmail_account_id,
      gmail_enabled_account_ids: settings.gmail_enabled_account_ids,

      skills_priority_order: greetingPriority.map((k) => SKILL_ID_BY_KEY[k]),

      shortterm_memory_enabled: memoryShort,
      longterm_memory_enabled: memoryLong,
      memory_engagement_phrases: parseLines(memoryEngagementPrompt),

      skills_config: (() => {
        const out: any = {};
        (Object.keys(SKILL_ID_BY_KEY) as SkillKey[]).forEach((key) => {
          const sid = SKILL_ID_BY_KEY[key];
          const cfg = skillCfg[key];

          out[sid] = {
            enabled: !!cfg.enabled,
            add_to_greeting: !!cfg.addToGreeting,
            auto_execute_after_greeting: !!cfg.autoExecuteAfterGreeting,
            engagement_phrases: parseLines(cfg.engagementPrompt || ""),
            llm_prompt: cfg.llmPrompt || "",
          };

          if (sid === "investment_reporting") {
            out[sid].tickers = parseTickers(cfg.tickers || "");
            out[sid].tickers_raw = cfg.tickers || "";
          }
        });

        // Mirror legacy gmail_summary_enabled into skill config too (defensive)
        out.gmail_summary = { ...(out.gmail_summary || {}), enabled: !!settings.gmail_summary_enabled };
        return out;
      })(),
    };

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      setSettings(data);
      setOkMsg("Saved.");
      await loadSettings();
      await loadAccounts();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
      setTimeout(() => setOkMsg(null), 2500);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadSettings(), loadAccounts()]);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSkill(key: SkillKey, patch: Partial<SkillCfgState>) {
    setSkillCfg((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function movePriority(key: SkillKey, dir: -1 | 1) {
    setGreetingPriority((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function connectGmail() {
    window.location.href = "/api/admin/gmail/connect";
  }

  if (!session) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Vozlia Admin</h1>
          <p>You are not signed in.</p>
          <a className="btn" href="/api/auth/signin">Sign in</a>
        </div>
        <style jsx>{baseStyles}</style>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">Vozlia Admin</div>
        <div className="topbarRight">
          <div className="user">{session.user?.email}</div>
          <button className="btn secondary" onClick={() => signOut({ callbackUrl: "/api/auth/signin" })}>Sign out</button>
        </div>
      </div>

      {loading ? (
        <div className="card">Loading...</div>
      ) : (
        <>
          {error ? <div className="alert error">{error}</div> : null}
          {okMsg ? <div className="alert ok">{okMsg}</div> : null}

          <div className="grid">
            <div className="card">
              <h2>Call Greeting</h2>
              <TextField
                label="Agent Greeting"
                value={agentGreeting}
                onChange={setAgentGreeting}
                helper="This is what Vozlia says at the start of the call."
                multiline
              />
              <TextField
                label="Realtime Prompt Addendum"
                value={realtimeAddendum}
                onChange={setRealtimeAddendum}
                helper="Extra system prompt appended to Realtime session.update."
                multiline
              />
            </div>

            <div className="card">
              <h2>Memory</h2>
              <Switch
                checked={memoryShort}
                onChange={setMemoryShort}
                label="Short-term memory enabled"
                helper="Stores short-lived call context for follow-up within a call."
              />
              <Switch
                checked={memoryLong}
                onChange={setMemoryLong}
                label="Long-term memory enabled"
                helper="Stores call summaries/transcripts for later retrieval."
              />
              <TextField
                label="Memory engagement phrases"
                value={memoryEngagementPrompt}
                onChange={setMemoryEngagementPrompt}
                helper="One phrase per line. Triggers memory recall behaviors."
                multiline
              />
            </div>

            <div className="card">
              <h2>Gmail Accounts</h2>
              <div className="row">
                <button className="btn" onClick={connectGmail}>Connect Gmail</button>
              </div>

              {gmailAccounts.length === 0 ? (
                <div className="muted">No Gmail accounts connected.</div>
              ) : (
                <div className="table">
                  <div className="thead">
                    <div>Email</div>
                    <div>Primary</div>
                    <div>Active</div>
                  </div>
                  {gmailAccounts.map((a) => (
                    <div key={a.id} className="trow">
                      <div className="mono">{a.email_address || a.display_name || a.id}</div>
                      <div>
                        <input
                          type="radio"
                          name="primaryGmail"
                          checked={a.is_primary}
                          onChange={() => setPrimaryAccount(a.id)}
                        />
                      </div>
                      <div>
                        <input
                          type="checkbox"
                          checked={a.is_active}
                          onChange={(e) => patchAccount(a.id, { is_active: e.target.checked })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="field" style={{ marginTop: 14 }}>
                <div className="fieldLabel">Default Gmail inbox for summaries</div>
                <div className="fieldHelper">Used by Gmail Summaries skill when enabled.</div>
                <select
                  className="input"
                  value={defaultGmailAccountId || ""}
                  onChange={(e) => {
                    const nextId = e.target.value || null;
                    setSettings((prev) => (prev ? { ...prev, gmail_account_id: nextId } : prev));
                  }}
                >
                  <option value="">(none)</option>
                  {gmailActiveAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.email_address || a.display_name || a.id) + (a.is_primary ? " (primary)" : "")}
                    </option>
                  ))}
                </select>
              </div>

              <Switch
                checked={!!settings?.gmail_summary_enabled}
                onChange={(v) => setSettings((prev) => (prev ? { ...prev, gmail_summary_enabled: v } : prev))}
                label="Enable Gmail Summaries (legacy toggle)"
                helper="Kept for backward compatibility; also mirrored into skills_config.gmail_summary.enabled."
              />
            </div>

            <div className="card">
              <h2>Greeting Priority</h2>
              <div className="muted">Order in which “add to greeting” skills are offered.</div>
              <div className="prio">
                {greetingPriority.map((k) => (
                  <div key={k} className="prioRow">
                    <div className="prioName">{skillCardTitle(k)}</div>
                    <div className="prioBtns">
                      <button className="btn tiny secondary" onClick={() => movePriority(k, -1)}>&uarr;</button>
                      <button className="btn tiny secondary" onClick={() => movePriority(k, 1)}>&darr;</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section">
            <h2>Skills</h2>
            <div className="grid">
              {(["gmail_summaries", "investment_reporting", "sms", "calendar", "web_search", "weather"] as SkillKey[]).map((k) => (
                <div key={k} className="card">
                  <h3>{skillCardTitle(k)}</h3>

                  <Switch checked={skillCfg[k].enabled} onChange={(v) => updateSkill(k, { enabled: v })} label="Enable" />
                  <Switch
                    checked={skillCfg[k].addToGreeting}
                    onChange={(v) => updateSkill(k, { addToGreeting: v })}
                    label="Add to greeting"
                    helper="Offer this skill as an option after greeting."
                  />
                  <Switch
                    checked={skillCfg[k].autoExecuteAfterGreeting}
                    onChange={(v) => updateSkill(k, { autoExecuteAfterGreeting: v })}
                    label="Auto-execute after greeting"
                    helper="Run this skill automatically after greeting if conditions match."
                  />

                  <TextField
                    label="Engagement Prompt"
                    value={skillCfg[k].engagementPrompt}
                    onChange={(v) => updateSkill(k, { engagementPrompt: v })}
                    helper="One phrase per line. Caller can say these to trigger the skill."
                    multiline
                  />

                  <TextField
                    label="LLM Prompt"
                    value={skillCfg[k].llmPrompt}
                    onChange={(v) => updateSkill(k, { llmPrompt: v })}
                    helper="Optional custom instruction appended for this skill."
                    multiline
                  />

                  {k === "investment_reporting" ? (
                    <TextField
                      label="Tickers"
                      value={skillCfg[k].tickers || ""}
                      onChange={(v) => updateSkill(k, { tickers: v })}
                      helper="Comma-separated tickers (e.g., AAPL, MSFT, TSLA)."
                      placeholder="AAPL, MSFT, TSLA"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="foot">
            <button className="btn" disabled={saving || !settings} onClick={saveSettings}>
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>

          <div className="section">
            <h2>Render Logs</h2>
            <RenderLogsPanel />
          </div>
        </>
      )}

      <style jsx>{baseStyles}</style>
    </div>
  );
}

const baseStyles = `
.wrap{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 22px; background:#0b0e14; min-height:100vh; color:#e6e6e6;}
.topbar{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;}
.brand{ font-weight:800; letter-spacing:.4px; }
.topbarRight{ display:flex; gap:12px; align-items:center;}
.user{ font-size:13px; opacity:.85; }
.grid{ display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:14px; }
.section{ margin-top:22px; }
.card{ background:#121726; border:1px solid #1f2740; border-radius:14px; padding:14px 14px 12px; }
h1,h2,h3{ margin:0 0 10px 0; }
h2{ font-size:16px; }
h3{ font-size:15px; }
.muted{ opacity:.7; font-size:13px; margin-bottom:8px; }
.alert{ padding:10px 12px; border-radius:12px; margin-bottom:12px; font-size:13px; border:1px solid transparent; }
.alert.error{ background:#2a1212; border-color:#5a1d1d; }
.alert.ok{ background:#112a16; border-color:#1d5a29; }
.btn{ background:#2b7cff; border:0; color:white; padding:9px 12px; border-radius:10px; cursor:pointer; font-weight:700; }
.btn.secondary{ background:#2a334d; }
.btn.tiny{ padding:6px 8px; border-radius:8px; font-size:12px; }
.btn:disabled{ opacity:.6; cursor:not-allowed;}
.row{ display:flex; gap:10px; align-items:center; margin:8px 0 12px; }
.field{ margin:10px 0; }
.fieldLabel{ font-size:13px; font-weight:800; margin-bottom:6px; }
.fieldHelper{ font-size:12px; opacity:.7; margin-bottom:6px; }
.input{ width:100%; padding:10px 10px; border-radius:10px; border:1px solid #2a334d; background:#0e1322; color:#e6e6e6; outline:none; }
.switchRow{ display:flex; gap:10px; align-items:flex-start; margin:10px 0; }
.switchLabel{ font-size:13px; font-weight:800; }
.switchHelper{ font-size:12px; opacity:.7; margin-top:2px; }
.table{ border:1px solid #2a334d; border-radius:12px; overflow:hidden; margin-top:8px;}
.thead,.trow{ display:grid; grid-template-columns: 1fr 80px 80px; gap:10px; padding:8px 10px; }
.thead{ background:#0e1322; font-size:12px; opacity:.8; font-weight:800;}
.trow{ border-top:1px solid #2a334d; font-size:13px;}
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px;}
.prio{ margin-top:10px; display:flex; flex-direction:column; gap:8px;}
.prioRow{ display:flex; justify-content:space-between; align-items:center; padding:10px 10px; border:1px solid #2a334d; border-radius:12px; background:#0e1322;}
.prioName{ font-weight:800; font-size:13px; }
.prioBtns{ display:flex; gap:8px; }
.foot{ margin-top:18px; }
`;


export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return {
      redirect: {
        destination: `/api/auth/signin?callbackUrl=${encodeURIComponent("/admin")}`,
        permanent: false,
      },
    };
  }
  return { props: { session } };
}
