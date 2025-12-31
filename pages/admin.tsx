import type { GetServerSidePropsContext } from "next";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { RenderLogsPanel } from "../components/RenderLogsPanel";

type EmailAccount = {
  id: string;
  provider_type: string;
  oauth_provider?: string | null;
  email_address?: string | null;
  display_name?: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type SkillKey = "gmail_summaries";

function IconPlus({ open }: { open: boolean }) {
  // Simple plus/minus glyph (matches landing “clean tech” feel).
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: "1px solid rgba(148,163,184,0.35)",
        background: "rgba(15,23,42,0.92)",
        color: "#e5e7eb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 16,
        lineHeight: 1,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {open ? "–" : "+"}
    </span>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  helper?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "#f9fafb" }}>{label}</div>
        {helper ? <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>{helper}</div> : null}
      </div>

      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          border: "1px solid rgba(148,163,184,0.35)",
          background: checked ? "rgba(34,211,238,0.35)" : "rgba(15,23,42,0.92)",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 22 : 3,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: checked ? "#22d3ee" : "#e5e7eb",
            transition: "left 120ms ease",
          }}
        />
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const commonStyle: CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.35)",
    background: "rgba(15,23,42,0.92)",
    color: "#f9fafb",
    outline: "none",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div>
      <div style={{ fontWeight: 700, color: "#f9fafb" }}>{label}</div>
      {helper ? <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>{helper}</div> : null}
      <div style={{ marginTop: 8 }}>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder={placeholder}
            style={commonStyle}
            disabled={disabled}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={commonStyle}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

function SectionRow({
  title,
  subtitle,
  open,
  onToggle,
  children,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(148,163,184,0.35)",
        background: "rgba(15,23,42,0.65)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <IconPlus open={open} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#f9fafb", fontWeight: 800, fontSize: 16 }}>{title}</div>
          <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        {rightSlot ? <div style={{ flex: "0 0 auto" }}>{rightSlot}</div> : null}
      </button>

      {open ? (
        <div style={{ padding: 16, paddingTop: 0 }}>
          <div
            style={{
              height: 1,
              background: "rgba(148,163,184,0.2)",
              marginBottom: 16,
            }}
          />
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SkillTile({
  title,
  description,
  enabled,
  active,
  onClick,
}: {
  title: string;
  description: string;
  enabled: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: active ? "1px solid rgba(34,211,238,0.75)" : "1px solid rgba(148,163,184,0.35)",
        background: "rgba(15,23,42,0.92)",
        color: "#f9fafb",
        cursor: "pointer",
        boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <span
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.35)",
            background: enabled ? "rgba(34,211,238,0.25)" : "rgba(148,163,184,0.12)",
            color: enabled ? "#a5f3fc" : "#cbd5e1",
            fontWeight: 700,
          }}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 13, lineHeight: 1.35 }}>{description}</div>
    </button>
  );
}

export default function AdminPageConcept() {
  const { data: session } = useSession();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<any>({});
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState<boolean>(true);

  // Concept-only (not yet wired to backend)
  const [activeSkill, setActiveSkill] = useState<SkillKey | null>(null);
  const [gmailEngagementPrompt, setGmailEngagementPrompt] = useState<string>("");
  const [gmailLlmPrompt, setGmailLlmPrompt] = useState<string>("");
  const [gmailAppendGreeting, setGmailAppendGreeting] = useState<boolean>(false);

  const [memoryEngagementPrompt, setMemoryEngagementPrompt] = useState<string>("");
  const [memorySearch, setMemorySearch] = useState<string>("");

  const [chitchatDelaySec, setChitchatDelaySec] = useState<string>("2.0");

  const [logToggles, setLogToggles] = useState<Record<string, boolean>>({
    REALTIME_LOG_TEXT: false,
    REALTIME_LOG_ALL_EVENTS: false,
    OBS_ENABLED: false,
    OBS_LOG_JSON: false,
  });

  const [open, setOpen] = useState<Record<string, boolean>>({
    skills: false,
    agentMemory: false,
    chitchat: false,
    logging: false,
    core: false,
    email: false,
    renderLogs: false,
  });

  const primaryEmail = (session?.user?.email as string | undefined) || "";

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    setSettings(data);

    // Keep concept prompt defaults empty for now (we’ll wire these later).
    // You can optionally prefill from existing fields as you introduce backend keys.
  }

  async function loadAccounts() {
    setAccountsLoading(true);
    const res = await fetch("/api/admin/email-accounts");
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
    setAccountsLoading(false);
  }

  useEffect(() => {
    loadSettings().catch((e: any) => setError(e?.message || String(e)));
    loadAccounts().catch((e: any) => setError(e?.message || String(e)));
  }, []);

  const gmailAccounts = useMemo(
    () => accounts.filter((a) => a.provider_type === "gmail" && a.is_active),
    [accounts]
  );

  async function saveWiredSettings() {
    // IMPORTANT: Concept page – only save keys that exist today to avoid 422 from control plane.
    // We'll wire the new skill/memory/logging fields once the backend schema is ready.
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_greeting: settings.agent_greeting,
          realtime_prompt_addendum: settings.realtime_prompt_addendum,
          gmail_summary_enabled: settings.gmail_summary_enabled,
          gmail_account_id: settings.gmail_account_id,
          gmail_enabled_account_ids: settings.gmail_enabled_account_ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save settings");
      setSettings(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function patchAccount(id: string, patch: Partial<EmailAccount>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update email account");
      await loadAccounts();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function setPrimaryAccount(id: string) {
    const updates = accounts
      .filter((a) => a.provider_type === "gmail")
      .map((a) => patchAccount(a.id, { is_primary: a.id === id }));
    await Promise.all(updates);
  }

  async function toggleAccountActive(id: string, nextActive: boolean) {
    await patchAccount(id, { is_active: nextActive });
  }

  const gmailEnabled = !!settings.gmail_summary_enabled;

  return (
    <div className="page">
      <div className="bg-watermark" />

      <div className="wrap">
        <header className="top">
          <div>
            <div className="brand">Vozlia</div>
            <div className="subtitle">Admin Portal</div>
          </div>
          <div className="signedin">
            <div className="muted">Signed in as</div>
            <div className="mono">{primaryEmail || "admin"}</div>
          </div>
        </header>

        {error ? (
          <div className="alert">
            <div className="alertTitle">Error</div>
            <div className="alertBody">{String(error)}</div>
          </div>
        ) : null}

        <div className="stack">
          <SectionRow
            title="Skills"
            subtitle="Enable features and customize per-skill prompts. (Collapsed by default.)"
            open={open.skills}
            onToggle={() => setOpen((p) => ({ ...p, skills: !p.skills }))}
            rightSlot={
              <span className="pill">
                {gmailEnabled ? "Gmail enabled" : "Gmail disabled"}
              </span>
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <SkillTile
                  title="Gmail Summaries"
                  description="Summarize inboxes and answer “what did I miss?” (First skill.)"
                  enabled={!!settings.gmail_summary_enabled}
                  active={activeSkill === "gmail_summaries"}
                  onClick={() => setActiveSkill((s) => (s === "gmail_summaries" ? null : "gmail_summaries"))}
                />
                <div className="tilePlaceholder">
                  <div className="tilePlaceholderTitle">Investment Reporting</div>
                  <div className="tilePlaceholderBody">Coming soon — tile + controls will live here.</div>
                </div>
                <div className="tilePlaceholder">
                  <div className="tilePlaceholderTitle">Weather</div>
                  <div className="tilePlaceholderBody">Coming soon — tile + controls will live here.</div>
                </div>
              </div>

              {activeSkill === "gmail_summaries" ? (
                <div className="panel">
                  <div className="panelHeader">
                    <div>
                      <div className="panelTitle">Gmail Summaries</div>
                      <div className="panelSub">Concept controls (we’ll wire new fields after backend schema update).</div>
                    </div>
                    <div className="panelRight">
                      <span className="pill">{gmailEnabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <Switch
                      checked={!!settings.gmail_summary_enabled}
                      onChange={(v) => setSettings((p: any) => ({ ...p, gmail_summary_enabled: v }))}
                      label="Enable / Disable"
                      helper="This toggle is already wired."
                    />

                    <TextField
                      label="Engagement Prompt"
                      value={gmailEngagementPrompt}
                      onChange={setGmailEngagementPrompt}
                      placeholder='Example: "If the caller asks about email, offer a Gmail summary."'
                      helper="Not wired yet (concept)."
                    />

                    <TextField
                      label="LLM Prompt"
                      value={gmailLlmPrompt}
                      onChange={setGmailLlmPrompt}
                      multiline
                      placeholder="(Full prompt text that will be sent to the realtime API when this skill is engaged.)"
                      helper="Not wired yet (concept)."
                    />

                    <Switch
                      checked={gmailAppendGreeting}
                      onChange={setGmailAppendGreeting}
                      label="Append To Greeting"
                      helper="Concept: if enabled, adds a one-liner in the initial greeting advertising this skill."
                    />

                    <div className="actions">
                      <button className="btnPrimary" type="button" disabled={saving} onClick={saveWiredSettings}>
                        {saving ? "Saving…" : "Save (wired settings only)"}
                      </button>
                      <button
                        className="btnSecondary"
                        type="button"
                        onClick={() => {
                          setGmailEngagementPrompt("");
                          setGmailLlmPrompt("");
                          setGmailAppendGreeting(false);
                        }}
                      >
                        Reset concept fields
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </SectionRow>

          <SectionRow
            title="Agent Memory"
            subtitle="Short-term / long-term toggles, long-term engagement phrases, and Memory Bank (searchable DB view)."
            open={open.agentMemory}
            onToggle={() => setOpen((p) => ({ ...p, agentMemory: !p.agentMemory }))}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Memory</div>
                    <div className="panelSub">Concept controls; toggles will be wired to backend once schema is ready.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <Switch
                    checked={!!settings.shortterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, shortterm_memory_enabled: v }))}
                    label="Enable Short-Term Memory"
                    helper="Concept now; wire to backend later."
                  />
                  <Switch
                    checked={!!settings.longterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, longterm_memory_enabled: v }))}
                    label="Enable Long-Term Memory"
                    helper="Concept now; wire to backend later."
                  />

                  <TextField
                    label="Engagement Prompt"
                    value={memoryEngagementPrompt}
                    onChange={setMemoryEngagementPrompt}
                    placeholder='Example: "If the caller says earlier / last time / remember, consult long-term memory."'
                    helper="This will become the phrases that tell the FSM to engage long-term memory."
                  />
                </div>
              </div>

              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Memory Bank</div>
                    <div className="panelSub">Search + table view of long-term memory events (concept).</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <TextField
                    label="Search"
                    value={memorySearch}
                    onChange={setMemorySearch}
                    placeholder='Filter by caller, keyword, fact key, "favorite_color", etc.'
                    helper="Concept: this will query a backend endpoint like /admin/memory?search=..."
                  />

                  <div className="tableShell">
                    <div className="tableHeader">
                      <div className="muted">No data yet (concept)</div>
                      <div className="muted mono">Memory events will render here</div>
                    </div>
                    <div className="tableEmpty">
                      Wire a control-plane endpoint to list/query memory events, then render rows here.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Chit-Chat"
            subtitle="Behavior tuning for conversational sessions."
            open={open.chitchat}
            onToggle={() => setOpen((p) => ({ ...p, chitchat: !p.chitchat }))}
          >
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Chit-Chat</div>
                  <div className="panelSub">Response delay and other conversational controls (concept).</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <TextField
                  label="Response Delay Time (seconds)"
                  value={chitchatDelaySec}
                  onChange={setChitchatDelaySec}
                  placeholder="2.0"
                  helper="How long Vozlia waits in dead air before responding (concept)."
                />
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Logging"
            subtitle="Toggle logging categories (stats vs deltas, observability, etc.). Render logs are shown below."
            open={open.logging}
            onToggle={() => setOpen((p) => ({ ...p, logging: !p.logging }))}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Logging Toggles</div>
                    <div className="panelSub">Concept UI — these map to env vars today; we can later persist to settings.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {Object.entries(logToggles).map(([k, v]) => (
                    <Switch
                      key={k}
                      checked={v}
                      onChange={(next) => setLogToggles((p) => ({ ...p, [k]: next }))}
                      label={k}
                      helper="Concept toggle"
                    />
                  ))}

                  <div className="hint">
                    Tip: For Flow A stability, keep stats on but deltas off (we’ll add explicit “DELTAS” toggle in this UI).
                  </div>
                </div>
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Agent Core"
            subtitle="Greeting and Realtime prompt addendum (existing wired settings)."
            open={open.core}
            onToggle={() => setOpen((p) => ({ ...p, core: !p.core }))}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Agent Core</div>
                    <div className="panelSub">These are already wired to the control plane.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <TextField
                    label="Greeting"
                    value={settings.agent_greeting || ""}
                    onChange={(v) => setSettings((p: any) => ({ ...p, agent_greeting: v }))}
                    placeholder="Hello! How can I help?"
                    helper="Used for calls."
                  />

                  <TextField
                    label="Realtime Prompt Addendum"
                    value={settings.realtime_prompt_addendum || ""}
                    onChange={(v) => setSettings((p: any) => ({ ...p, realtime_prompt_addendum: v }))}
                    multiline
                    placeholder="(Rules for Flow A Realtime assistant...)"
                    helper="Affects Flow A prompt shaping."
                  />

                  <div className="actions">
                    <button className="btnPrimary" type="button" disabled={saving} onClick={saveWiredSettings}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btnSecondary"
                      type="button"
                      onClick={async () => {
                        try {
                          setError(null);
                          await Promise.all([loadSettings(), loadAccounts()]);
                        } catch (e: any) {
                          setError(e?.message || String(e));
                        }
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Email Accounts"
            subtitle="Manage connected inboxes (Gmail) and primary inbox selection."
            open={open.email}
            onToggle={() => setOpen((p) => ({ ...p, email: !p.email }))}
          >
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Email Accounts</div>
                  <div className="panelSub">Existing wired controls.</div>
                </div>
              </div>

              {accountsLoading ? (
                <div className="muted">Loading…</div>
              ) : gmailAccounts.length === 0 ? (
                <div className="muted">No active Gmail accounts found.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {gmailAccounts.map((a) => (
                    <div key={a.id} className="rowCard">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#f9fafb" }}>
                          {a.email_address || a.display_name || a.id}
                        </div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {a.is_primary ? "Primary" : "Secondary"} · {a.is_active ? "Active" : "Inactive"} ·{" "}
                          <span className="mono">{a.id}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          className={a.is_primary ? "btnPrimary" : "btnSecondary"}
                          type="button"
                          onClick={() => setPrimaryAccount(a.id)}
                        >
                          {a.is_primary ? "Primary" : "Make Primary"}
                        </button>

                        <button
                          className="btnSecondary"
                          type="button"
                          onClick={() => toggleAccountActive(a.id, !a.is_active)}
                        >
                          {a.is_active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionRow>

          <SectionRow
            title="Render Logs"
            subtitle="Live logs fetched from Render. (Existing panel; we can restyle next.)"
            open={open.renderLogs}
            onToggle={() => setOpen((p) => ({ ...p, renderLogs: !p.renderLogs }))}
          >
            <div className="panel" style={{ padding: 0 }}>
              <div style={{ padding: 14 }}>
                <div className="panelTitle">Render Logs</div>
                <div className="panelSub">This is the existing panel embedded near the bottom.</div>
              </div>
              <div style={{ padding: 14, paddingTop: 0 }}>
                <RenderLogsPanel />
              </div>
            </div>
          </SectionRow>
        </div>

        <footer className="foot">
          <div className="muted">
            Concept layout only — next step is wiring fields + adding backend endpoints (Memory Bank, per-skill prompts,
            logging toggles).
          </div>
        </footer>
      </div>

      <style jsx global>{`
        :root {
          --bg-top: #020617;
          --bg-bottom: #020617;
          --accent: #22d3ee;
          --accent-soft: rgba(34, 211, 238, 0.35);
          --text-main: #f9fafb;
          --text-muted: #9ca3af;
          --card-bg: rgba(15, 23, 42, 0.92);
          --card-border: rgba(148, 163, 184, 0.35);
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--bg-top);
          color: var(--text-main);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji",
            "Segoe UI Emoji";
        }

        .page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
        }

        .bg-watermark {
          position: fixed;
          inset: 0;
          background-image: url("/circuit-watermark.jpg");
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          opacity: 0.06;
          pointer-events: none;
          z-index: 0;
        }

        .wrap {
          position: relative;
          z-index: 1;
          max-width: 1040px;
          margin: 0 auto;
          padding: 26px 18px 44px;
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 18px;
          border-radius: 18px;
          border: 1px solid var(--card-border);
          background: rgba(15, 23, 42, 0.65);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
        }

        .brand {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.2px;
        }

        .subtitle {
          margin-top: 4px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .signedin {
          text-align: right;
          min-width: 220px;
        }

        .muted {
          color: var(--text-muted);
          font-size: 12px;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
            monospace;
        }

        .alert {
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(248, 113, 113, 0.55);
          background: rgba(127, 29, 29, 0.35);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
        }

        .alertTitle {
          font-weight: 900;
        }

        .alertBody {
          margin-top: 6px;
          white-space: pre-wrap;
          color: #fecaca;
          font-size: 13px;
        }

        .stack {
          margin-top: 16px;
          display: grid;
          gap: 14px;
        }

        .panel {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.92);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
        }

        .panelHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .panelTitle {
          font-weight: 900;
          font-size: 15px;
        }

        .panelSub {
          margin-top: 4px;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.35;
        }

        .panelRight {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pill {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(34, 211, 238, 0.18);
          color: #a5f3fc;
          font-weight: 800;
          white-space: nowrap;
        }

        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        .btnPrimary {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(34, 211, 238, 0.75);
          background: rgba(34, 211, 238, 0.18);
          color: #e6fcff;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
        }

        .btnPrimary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .btnSecondary {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.92);
          color: #e5e7eb;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
        }

        .btnSecondary:hover {
          border-color: rgba(34, 211, 238, 0.55);
        }

        .rowCard {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(2, 6, 23, 0.3);
        }

        .tilePlaceholder {
          padding: 14px;
          border-radius: 16px;
          border: 1px dashed rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.45);
          color: #cbd5e1;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);
        }
        .tilePlaceholderTitle {
          font-weight: 900;
        }
        .tilePlaceholderBody {
          margin-top: 6px;
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.35;
        }

        .tableShell {
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          overflow: hidden;
          background: rgba(2, 6, 23, 0.25);
        }
        .tableHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        }
        .tableEmpty {
          padding: 18px 12px;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .hint {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(2, 6, 23, 0.25);
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.45;
        }

        .foot {
          margin-top: 18px;
          padding: 14px 4px 0;
        }
      `}</style>
    </div>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const { getServerSession } = await import("next-auth/next");
  const { authOptions } = await import("./api/auth/[...nextauth]");
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
