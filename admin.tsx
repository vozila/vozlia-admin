import type { GetServerSidePropsContext } from "next";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  return (
    <span aria-hidden className="iconPlus">
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
    <div className="fieldRow">
      <div className="fieldText">
        <div className="fieldLabel">{label}</div>
        {helper ? <div className="fieldHelp">{helper}</div> : null}
      </div>

      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
        className={`switch ${checked ? "on" : "off"}`}
      >
        <span className="switchKnob" />
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
  return (
    <div>
      <div className="fieldLabel">{label}</div>
      {helper ? <div className="fieldHelp">{helper}</div> : null}
      <div style={{ marginTop: 8 }}>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder={placeholder}
            className="input"
            disabled={disabled}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="input"
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  helper?: string;
}) {
  return (
    <div>
      <div className="fieldLabel">{label}</div>
      {helper ? <div className="fieldHelp">{helper}</div> : null}
      <div style={{ marginTop: 8 }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="">— Select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
    <div className="sectionCard">
      <button type="button" onClick={onToggle} className="sectionHeader">
        <IconPlus open={open} />
        <div className="sectionTitleWrap">
          <div className="sectionTitle">{title}</div>
          <div className="sectionSubtitle">{subtitle}</div>
        </div>
        {rightSlot ? <div>{rightSlot}</div> : null}
      </button>

      {open ? (
        <div className="sectionBody">
          <div className="divider" />
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
    <button type="button" onClick={onClick} className={`tile ${active ? "active" : ""}`}>
      <div className="tileTop">
        <div className="tileTitle">{title}</div>
        <span className={`pill ${enabled ? "pillOn" : "pillOff"}`}>{enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <div className="tileDesc">{description}</div>
    </button>
  );
}

function CheckboxList({
  title,
  items,
  selected,
  onToggle,
  helper,
}: {
  title: string;
  items: { id: string; label: string; meta?: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  helper?: string;
}) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <div>
          <div className="panelTitle">{title}</div>
          {helper ? <div className="panelSub">{helper}</div> : null}
        </div>
      </div>

      <div className="checkGrid">
        {items.length === 0 ? (
          <div className="muted">No accounts found.</div>
        ) : (
          items.map((it) => (
            <label key={it.id} className="checkRow">
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} />
              <div className="checkText">
                <div className="checkLabel">{it.label}</div>
                {it.meta ? <div className="checkMeta">{it.meta}</div> : null}
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
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

  const gmailOptions = useMemo(() => {
    return gmailAccounts.map((a) => ({
      value: a.id,
      label: `${a.email_address || a.display_name || a.id}${a.is_primary ? " (Primary)" : ""}`,
    }));
  }, [gmailAccounts]);

  const enabledIds = useMemo(() => {
    const raw = Array.isArray(settings.gmail_enabled_account_ids) ? settings.gmail_enabled_account_ids : [];
    return new Set<string>(raw);
  }, [settings.gmail_enabled_account_ids]);

  function toggleEnabledInbox(id: string) {
    const next = new Set(enabledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSettings((p: any) => ({ ...p, gmail_enabled_account_ids: Array.from(next) }));
  }

  const primaryGmailId = useMemo(() => gmailAccounts.find((a) => a.is_primary)?.id || "", [gmailAccounts]);

  async function saveWiredSettings() {
    // Concept page: only save keys that exist today (avoid 422 until backend schema is updated).
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
            rightSlot={<span className={`pill ${gmailEnabled ? "pillOn" : "pillOff"}`}>{gmailEnabled ? "Gmail enabled" : "Gmail disabled"}</span>}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="tileGrid">
                <SkillTile
                  title="Gmail Summaries"
                  description="Summarize inboxes and answer “what did I miss?”"
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
                      <div className="panelSub">Controls shown in the preview you approved. (Some fields are concept-only for now.)</div>
                    </div>
                    <div className="panelRight">
                      <span className={`pill ${gmailEnabled ? "pillOn" : "pillOff"}`}>{gmailEnabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  <div className="grid">
                    <Switch
                      checked={!!settings.gmail_summary_enabled}
                      onChange={(v) => setSettings((p: any) => ({ ...p, gmail_summary_enabled: v }))}
                      label="Enable Gmail Summaries"
                      helper="Wired: this toggle already persists."
                    />

                    <TextField
                      label="Engagement Prompt"
                      value={gmailEngagementPrompt}
                      onChange={setGmailEngagementPrompt}
                      placeholder='Example: "If the caller asks about email, offer a Gmail summary."'
                      helper="Concept: we’ll wire this to skill config."
                    />

                    <TextField
                      label="LLM Prompt"
                      value={gmailLlmPrompt}
                      onChange={setGmailLlmPrompt}
                      multiline
                      placeholder="(Full prompt text that will be sent to the realtime API when this skill is engaged.)"
                      helper="Concept: we’ll wire this to skill config."
                    />

                    <SelectField
                      label="Default Inbox"
                      value={settings.gmail_account_id || ""}
                      onChange={(v) => setSettings((p: any) => ({ ...p, gmail_account_id: v }))}
                      options={gmailOptions}
                      helper="Wired: this determines which inbox Gmail Summaries uses today."
                    />

                    <CheckboxList
                      title="Enabled Inboxes"
                      helper="Wired: saved to gmail_enabled_account_ids (multi-inbox behavior depends on backend)."
                      items={gmailAccounts.map((a) => ({
                        id: a.id,
                        label: a.email_address || a.display_name || a.id,
                        meta: a.is_primary ? "Primary" : "",
                      }))}
                      selected={enabledIds}
                      onToggle={toggleEnabledInbox}
                    />

                    <div className="actions">
                      <button
                        className="btnPrimary"
                        type="button"
                        onClick={() => {
                          if (primaryGmailId) setSettings((p: any) => ({ ...p, gmail_account_id: primaryGmailId }));
                        }}
                      >
                        Use Primary Inbox as Default
                      </button>

                      <button className="btnSecondary" type="button" disabled={saving} onClick={saveWiredSettings}>
                        {saving ? "Saving…" : "Save"}
                      </button>

                      <button
                        className="btnGhost"
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

                    <Switch
                      checked={gmailAppendGreeting}
                      onChange={setGmailAppendGreeting}
                      label="Append To Greeting"
                      helper="Concept: adds a one-liner in the initial greeting advertising Gmail Summaries."
                    />
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
            <div className="grid">
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Memory</div>
                    <div className="panelSub">Concept controls; we’ll wire these once backend schema is ready.</div>
                  </div>
                </div>

                <div className="grid">
                  <Switch
                    checked={!!settings.shortterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, shortterm_memory_enabled: v }))}
                    label="Enable Short-Term Memory"
                  />
                  <Switch
                    checked={!!settings.longterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, longterm_memory_enabled: v }))}
                    label="Enable Long-Term Memory"
                  />

                  <TextField
                    label="Engagement Prompt"
                    value={memoryEngagementPrompt}
                    onChange={setMemoryEngagementPrompt}
                    placeholder='Example: "If caller says earlier / last time / remember, consult long-term memory."'
                    helper="This becomes phrases that tell the FSM to engage long-term memory."
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

                <div className="grid">
                  <TextField
                    label="Search"
                    value={memorySearch}
                    onChange={setMemorySearch}
                    placeholder='Filter by caller, keyword, fact key, "favorite_color", etc.'
                    helper="Concept: will query backend endpoint like /admin/memory?search=..."
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

              <div className="grid">
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
            subtitle="Toggle logging categories. Render logs are shown below."
            open={open.logging}
            onToggle={() => setOpen((p) => ({ ...p, logging: !p.logging }))}
          >
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Logging Toggles</div>
                  <div className="panelSub">Concept UI — we’ll persist these later (likely as settings).</div>
                </div>
              </div>

              <div className="grid">
                {Object.entries(logToggles).map(([k, v]) => (
                  <Switch key={k} checked={v} onChange={(next) => setLogToggles((p) => ({ ...p, [k]: next }))} label={k} />
                ))}

                <div className="hint">
                  Tip: For Flow A stability, keep realtime stats on but deltas off.
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
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Agent Core</div>
                  <div className="panelSub">These are already wired to the control plane.</div>
                </div>
              </div>

              <div className="grid">
                <TextField
                  label="Greeting"
                  value={settings.agent_greeting || ""}
                  onChange={(v) => setSettings((p: any) => ({ ...p, agent_greeting: v }))}
                  placeholder="Hello! How can I help?"
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
          </SectionRow>

          <SectionRow
            title="Email Accounts"
            subtitle="Manage connected inboxes (Gmail) and primary inbox selection."
            open={open.email}
            onToggle={() => setOpen((p) => ({ ...p, email: !p.email }))}
          >
            <div className="grid">
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Gmail Summaries Inbox Settings</div>
                    <div className="panelSub">These two fields determine which inbox is used and which inboxes are enabled.</div>
                  </div>
                </div>

                <div className="grid">
                  <SelectField
                    label="Default Inbox"
                    value={settings.gmail_account_id || ""}
                    onChange={(v) => setSettings((p: any) => ({ ...p, gmail_account_id: v }))}
                    options={gmailOptions}
                    helper="Wired: saves to gmail_account_id."
                  />

                  <CheckboxList
                    title="Enabled Inboxes"
                    helper="Wired: saves to gmail_enabled_account_ids."
                    items={gmailAccounts.map((a) => ({
                      id: a.id,
                      label: a.email_address || a.display_name || a.id,
                      meta: a.is_primary ? "Primary" : "",
                    }))}
                    selected={enabledIds}
                    onToggle={toggleEnabledInbox}
                  />

                  <div className="actions">
                    <button className="btnPrimary" type="button" onClick={() => primaryGmailId && setSettings((p: any) => ({ ...p, gmail_account_id: primaryGmailId }))}>
                      Use Primary Inbox as Default
                    </button>
                    <button className="btnSecondary" type="button" disabled={saving} onClick={saveWiredSettings}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Connected Email Accounts</div>
                    <div className="panelSub">Existing wired controls (primary/enable).</div>
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
                          <div className="rowTitle">{a.email_address || a.display_name || a.id}</div>
                          <div className="muted" style={{ marginTop: 4 }}>
                            {a.is_primary ? "Primary" : "Secondary"} · {a.is_active ? "Active" : "Inactive"} ·{" "}
                            <span className="mono">{a.id}</span>
                          </div>
                        </div>

                        <div className="rowActions">
                          <button className={a.is_primary ? "btnPrimary" : "btnSecondary"} type="button" onClick={() => setPrimaryAccount(a.id)}>
                            {a.is_primary ? "Primary" : "Make Primary"}
                          </button>

                          <button className="btnGhost" type="button" onClick={() => toggleAccountActive(a.id, !a.is_active)}>
                            {a.is_active ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Render Logs"
            subtitle="Live logs fetched from Render."
            open={open.renderLogs}
            onToggle={() => setOpen((p) => ({ ...p, renderLogs: !p.renderLogs }))}
          >
            <div className="panel" style={{ padding: 0 }}>
              <div style={{ padding: 14 }}>
                <div className="panelTitle">Render Logs</div>
                <div className="panelSub">Embedded panel (we can restyle this next).</div>
              </div>
              <div style={{ padding: 14, paddingTop: 0 }}>
                <RenderLogsPanel />
              </div>
            </div>
          </SectionRow>
        </div>

        <footer className="foot">
          <div className="muted">
            Concept layout only — next step is wiring new skill fields + adding backend endpoints (Memory Bank, logging toggles).
          </div>
        </footer>
      </div>

      <style jsx global>{`
        :root {
          /* Option A — Cloud (Light + Cyan Accent) */
          --bg: #f6f9ff;
          --card: #ffffff;
          --border: #e6ecf5;
          --text: #0f172a;
          --muted: #64748b;
          --accent: #06b6d4;
          --accentSoft: rgba(6, 182, 212, 0.12);
          --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--bg);
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
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
          opacity: 0.045;
          pointer-events: none;
          z-index: 0;
        }

        .wrap {
          position: relative;
          z-index: 1;
          max-width: 1080px;
          margin: 0 auto;
          padding: 26px 18px 44px;
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--card);
          box-shadow: var(--shadow);
        }

        .brand {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.2px;
        }
        .subtitle {
          margin-top: 4px;
          color: var(--muted);
          font-size: 13px;
        }
        .signedin {
          text-align: right;
          min-width: 220px;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        .alert {
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.08);
          box-shadow: var(--shadow);
        }
        .alertTitle {
          font-weight: 900;
        }
        .alertBody {
          margin-top: 6px;
          white-space: pre-wrap;
          color: #7f1d1d;
          font-size: 13px;
        }

        .stack {
          margin-top: 16px;
          display: grid;
          gap: 14px;
        }

        .sectionCard {
          border-radius: 18px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(8px);
          box-shadow: var(--shadow);
          overflow: hidden;
        }

        .sectionHeader {
          width: 100%;
          text-align: left;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .iconPlus {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #f1f7ff;
          color: var(--text);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 16px;
          line-height: 1;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
        }

        .sectionTitleWrap {
          flex: 1;
          min-width: 0;
        }
        .sectionTitle {
          color: var(--text);
          font-weight: 900;
          font-size: 16px;
        }
        .sectionSubtitle {
          color: var(--muted);
          font-size: 13px;
          margin-top: 2px;
          line-height: 1.35;
        }

        .sectionBody {
          padding: 16px;
          padding-top: 0;
        }

        .divider {
          height: 1px;
          background: var(--border);
          margin-bottom: 16px;
        }

        .panel {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--card);
          box-shadow: var(--shadow);
        }

        .panelHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
          align-items: flex-start;
        }
        .panelTitle {
          font-weight: 900;
          font-size: 15px;
        }
        .panelSub {
          margin-top: 4px;
          color: var(--muted);
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
          border: 1px solid var(--border);
          background: rgba(2, 132, 199, 0.06);
          color: #0f172a;
          font-weight: 800;
          white-space: nowrap;
        }
        .pillOn {
          border-color: rgba(6, 182, 212, 0.35);
          background: var(--accentSoft);
          color: #0f172a;
        }
        .pillOff {
          background: rgba(100, 116, 139, 0.08);
          color: #334155;
        }

        .grid {
          display: grid;
          gap: 14px;
        }

        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btnPrimary {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(6, 182, 212, 0.55);
          background: var(--accentSoft);
          color: #0f172a;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(6, 182, 212, 0.14);
        }
        .btnPrimary:hover {
          background: rgba(6, 182, 212, 0.16);
        }
        .btnPrimary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btnSecondary {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: #ffffff;
          color: var(--text);
          font-weight: 800;
          cursor: pointer;
        }
        .btnSecondary:hover {
          background: #f8fbff;
        }

        .btnGhost {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          font-weight: 800;
          cursor: pointer;
        }
        .btnGhost:hover {
          background: rgba(15, 23, 42, 0.04);
          color: var(--text);
        }

        .fieldRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .fieldText {
          min-width: 0;
        }
        .fieldLabel {
          font-weight: 800;
          color: var(--text);
        }
        .fieldHelp {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
          line-height: 1.35;
        }

        .input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: #ffffff;
          color: var(--text);
          outline: none;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
        }
        .input:focus {
          border-color: rgba(6, 182, 212, 0.7);
          box-shadow: 0 8px 26px rgba(6, 182, 212, 0.18);
        }

        .switch {
          width: 44px;
          height: 26px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: #ffffff;
          position: relative;
          cursor: pointer;
          flex: 0 0 auto;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
        }
        .switch.on {
          background: var(--accentSoft);
          border-color: rgba(6, 182, 212, 0.5);
        }
        .switch:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .switchKnob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #e5e7eb;
          transition: left 120ms ease, background 120ms ease;
        }
        .switch.on .switchKnob {
          left: 22px;
          background: var(--accent);
        }

        .tileGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
        }

        .tile {
          text-align: left;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: #ffffff;
          color: var(--text);
          cursor: pointer;
          box-shadow: var(--shadow);
        }
        .tile.active {
          border-color: rgba(6, 182, 212, 0.55);
          box-shadow: 0 14px 44px rgba(6, 182, 212, 0.18);
        }
        .tileTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .tileTitle {
          font-weight: 900;
        }
        .tileDesc {
          margin-top: 6px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.35;
        }

        .tilePlaceholder {
          padding: 14px;
          border-radius: 16px;
          border: 1px dashed rgba(100, 116, 139, 0.35);
          background: rgba(255, 255, 255, 0.65);
          color: var(--text);
          box-shadow: var(--shadow);
        }
        .tilePlaceholderTitle {
          font-weight: 900;
        }
        .tilePlaceholderBody {
          margin-top: 6px;
          font-size: 13px;
          color: var(--muted);
        }

        .checkGrid {
          display: grid;
          gap: 10px;
        }
        .checkRow {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(246, 249, 255, 0.6);
        }
        .checkText {
          min-width: 0;
        }
        .checkLabel {
          font-weight: 800;
        }
        .checkMeta {
          margin-top: 2px;
          font-size: 12px;
          color: var(--muted);
        }

        .tableShell {
          border-radius: 16px;
          border: 1px solid var(--border);
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
        }
        .tableHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 12px;
          border-bottom: 1px solid var(--border);
          background: rgba(246, 249, 255, 0.6);
        }
        .tableEmpty {
          padding: 18px 12px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .hint {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(246, 249, 255, 0.65);
          color: var(--muted);
          font-size: 12px;
        }

        .rowCard {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: #ffffff;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
        }
        .rowTitle {
          font-weight: 900;
        }
        .rowActions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
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
