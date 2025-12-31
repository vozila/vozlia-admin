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

type SkillKey =
  | "gmail_summaries"
  | "sms"
  | "calendar"
  | "weather"
  | "investment_reporting"
  | "web_search";

type Tile = {
  key: SkillKey;
  title: string;
  description: string;
  enabled: boolean;
};

type Playbook = {
  id: string;
  name: string;
  enabled: boolean;
  steps: SkillKey[];
};

type Template = {
  id: string;
  name: string;
  enabled: boolean;
  sequence: Array<{ kind: "skill"; key: SkillKey } | { kind: "playbook"; id: string }>;
};

function IconPlus({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        background: "rgba(255,255,255,0.9)",
        color: "#0F172A",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 16,
        lineHeight: 1,
        boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
      }}
    >
      {open ? "–" : "+"}
    </span>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        background: "rgba(6,182,212,0.12)",
        color: "#0F172A",
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
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
        <div style={{ fontWeight: 800, color: "#0F172A" }}>{label}</div>
        {helper ? <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>{helper}</div> : null}
      </div>

      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        disabled={disabled}
        style={{
          width: 46,
          height: 28,
          borderRadius: 999,
          border: "1px solid rgba(15, 23, 42, 0.12)",
          background: checked ? "rgba(6,182,212,0.22)" : "rgba(255,255,255,0.9)",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 24 : 4,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: checked ? "#06B6D4" : "#0F172A",
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
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.92)",
    color: "#0F172A",
    outline: "none",
    boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div>
      <div style={{ fontWeight: 800, color: "#0F172A" }}>{label}</div>
      {helper ? <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>{helper}</div> : null}
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
        borderRadius: 20,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        background: "rgba(255,255,255,0.8)",
        boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
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
          <div style={{ color: "#0F172A", fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ color: "#64748B", fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        {rightSlot ? <div style={{ flex: "0 0 auto" }}>{rightSlot}</div> : null}
      </button>

      {open ? (
        <div style={{ padding: 16, paddingTop: 0 }}>
          <div style={{ height: 1, background: "rgba(15,23,42,0.08)", marginBottom: 16 }} />
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SkillTile({
  tile,
  active,
  onClick,
  onDragStart,
}: {
  tile: Tile;
  active: boolean;
  onClick: () => void;
  onDragStart?: (key: SkillKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", `skill:${tile.key}`);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(tile.key);
      }}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 18,
        border: active ? "1px solid rgba(6,182,212,0.55)" : "1px solid rgba(15,23,42,0.12)",
        background: "rgba(255,255,255,0.92)",
        color: "#0F172A",
        cursor: "pointer",
        boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 950 }}>{tile.title}</div>
        <span
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.12)",
            background: tile.enabled ? "rgba(6,182,212,0.14)" : "rgba(100,116,139,0.10)",
            color: "#0F172A",
            fontWeight: 800,
          }}
        >
          {tile.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div style={{ marginTop: 6, color: "#64748B", fontSize: 13, lineHeight: 1.35 }}>{tile.description}</div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#64748B" }}>
        Drag into a playbook or template • Click to configure
      </div>
    </button>
  );
}

function DragList({
  title,
  subtitle,
  items,
  itemLabel,
  onMove,
  onDropAppend,
  allowDropKinds,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  items: string[];
  itemLabel: (id: string) => string;
  onMove: (fromIdx: number, toIdx: number) => void;
  onDropAppend: (payload: { kind: "skill"; key: SkillKey } | { kind: "playbook"; id: string }) => void;
  allowDropKinds: Array<"skill" | "playbook">;
  rightSlot?: ReactNode;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function parsePayload(data: string): { kind: "skill"; key: SkillKey } | { kind: "playbook"; id: string } | null {
    if (!data) return null;
    const [kind, id] = data.split(":", 2);
    if (kind === "skill" && allowDropKinds.includes("skill")) {
      return { kind: "skill", key: id as SkillKey };
    }
    if (kind === "playbook" && allowDropKinds.includes("playbook")) {
      return { kind: "playbook", id };
    }
    return null;
  }

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(15,23,42,0.12)",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
        overflow: "hidden",
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        const p = parsePayload(e.dataTransfer.getData("text/plain"));
        if (!p) return;
        onDropAppend(p);
        setHoverIdx(null);
      }}
    >
      <div style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 950, color: "#0F172A" }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748B", lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        {rightSlot ? <div style={{ flex: "0 0 auto" }}>{rightSlot}</div> : null}
      </div>

      <div style={{ padding: 14, paddingTop: 0, display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <div
            style={{
              borderRadius: 16,
              border: "1px dashed rgba(15,23,42,0.18)",
              padding: 14,
              color: "#64748B",
              background: "rgba(6,182,212,0.06)",
            }}
          >
            Drop items here…
          </div>
        ) : null}

        {items.map((id, idx) => (
          <div
            key={`${id}-${idx}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverIdx(idx);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/plain");
              const fromIdx = items.findIndex((x, i) => `${x}` === from && i !== idx) === -1 ? items.indexOf(from) : items.indexOf(from);
              // We only support reordering within this list when dragging list items (same payload).
              const exactFromIdx = items.findIndex((x, i) => `${x}` === from && i !== idx) ?? items.indexOf(from);
              const f = items.indexOf(from);
              if (f >= 0 && f !== idx) onMove(f, idx);
              setHoverIdx(null);
            }}
            style={{
              padding: 12,
              borderRadius: 16,
              border: hoverIdx === idx ? "1px solid rgba(6,182,212,0.55)" : "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.98)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              cursor: "grab",
            }}
            title="Drag to reorder"
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: "#0F172A" }}>{itemLabel(id)}</div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>Step {idx + 1}</div>
            </div>
            <div style={{ fontSize: 12, color: "#64748B" }}>⇅</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function moveItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  const next = arr.slice();
  const [x] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, x);
  return next;
}

export default function AdminPage() {
  const { data: session } = useSession();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<any>({});
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState<boolean>(true);

  // Concept-only state (not yet wired)
  const [activeSkill, setActiveSkill] = useState<SkillKey | null>(null);

  // Gmail skill concept fields
  const [gmailEngagementPrompt, setGmailEngagementPrompt] = useState<string>("");
  const [gmailLlmPrompt, setGmailLlmPrompt] = useState<string>("");
  const [gmailAddToGreeting, setGmailAddToGreeting] = useState<boolean>(false);

  // Admin-configurable greeting priority list (concept)
  const [greetingPriority, setGreetingPriority] = useState<SkillKey[]>(["gmail_summaries", "sms", "calendar", "weather", "investment_reporting", "web_search"]);

  // Playbooks & Templates (concept)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([
    { id: "pb_sales_intake", name: "Sales Intake", enabled: true, steps: ["sms"] },
    { id: "pb_owner_update", name: "Owner Update", enabled: false, steps: ["gmail_summaries"] },
  ]);

  const [templates, setTemplates] = useState<Template[]>([
    {
      id: "tpl_default",
      name: "Default Program",
      enabled: true,
      sequence: [{ kind: "playbook", id: "pb_sales_intake" }, { kind: "skill", key: "gmail_summaries" }],
    },
  ]);

  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>("pb_sales_intake");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("tpl_default");

  const [memoryEngagementPrompt, setMemoryEngagementPrompt] = useState<string>("");
  const [memorySearch, setMemorySearch] = useState<string>("");

  const [chitchatDelaySec, setChitchatDelaySec] = useState<string>("2.0");

  const [logToggles, setLogToggles] = useState<Record<string, boolean>>({
    REALTIME_LOG_DELTAS: false,
    REALTIME_LOG_TEXT: false,
    REALTIME_LOG_ALL_EVENTS: false,
    OBS_ENABLED: false,
    OBS_LOG_JSON: false,
  });

  const [open, setOpen] = useState<Record<string, boolean>>({
    skills: false,
    playbooks: false,
    templates: false,
    agentMemory: false,
    chitchat: false,
    logging: false,
    core: false,
    email: false,
    renderLogs: false,
  });

  const primaryEmail = (session?.user?.email as string | undefined) || "";

  const tiles: Tile[] = useMemo(() => {
    const gmailEnabled = !!settings.gmail_summary_enabled;
    return [
      { key: "gmail_summaries", title: "Gmail Summaries", description: "Summarize inboxes and answer “what did I miss?”", enabled: gmailEnabled },
      { key: "sms", title: "SMS", description: "Send follow-ups, confirmations, and owner notifications.", enabled: true },
      { key: "calendar", title: "Calendar", description: "Read availability and capture scheduling intent.", enabled: false },
      { key: "weather", title: "Weather", description: "Weather lookups based on tenant default location.", enabled: false },
      { key: "investment_reporting", title: "Investment Reporting", description: "Ticker-based reporting using tenant defaults.", enabled: false },
      { key: "web_search", title: "Web Search", description: "Fetch fresh info when needed (tools capability).", enabled: false },
    ];
  }, [settings.gmail_summary_enabled]);

  function skillTitle(k: SkillKey) {
    return tiles.find((t) => t.key === k)?.title || k;
  }

  function playbookName(id: string) {
    return playbooks.find((p) => p.id === id)?.name || id;
  }

  function templateName(id: string) {
    return templates.find((t) => t.id === id)?.name || id;
  }

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

          // Gmail (currently wired)
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

  function toggleEnabledGmailId(id: string) {
    const cur: string[] = Array.isArray(settings.gmail_enabled_account_ids) ? settings.gmail_enabled_account_ids : [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSettings((p: any) => ({ ...p, gmail_enabled_account_ids: next }));
  }

  function setDefaultGmailId(id: string) {
    setSettings((p: any) => ({ ...p, gmail_account_id: id }));
  }

  const selectedPlaybook = playbooks.find((p) => p.id === selectedPlaybookId) || playbooks[0];
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  return (
    <div className="page">
      <div className="bg-watermark" />

      <div className="wrap">
        <header className="top">
          <div>
            <div className="brand">Vozlia</div>
            <div className="subtitle">Admin Portal — Concept</div>
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
            subtitle="Capabilities/tools (email, sms, calendar, web search, etc.). Click a tile to configure. Drag tiles into playbooks/templates."
            open={open.skills}
            onToggle={() => setOpen((p) => ({ ...p, skills: !p.skills }))}
            rightSlot={<Pill>{settings.gmail_summary_enabled ? "Gmail enabled" : "Gmail disabled"}</Pill>}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="gridTiles">
                {tiles.map((t) => (
                  <SkillTile
                    key={t.key}
                    tile={t}
                    active={activeSkill === t.key}
                    onClick={() => setActiveSkill((s) => (s === t.key ? null : t.key))}
                  />
                ))}
              </div>

              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Greeting Priority (Admin-configurable)</div>
                    <div className="panelSub">
                      Controls which skill runs first when multiple skills have <b>Add to greeting</b> enabled. Drag to reorder.
                      (Concept only; wiring comes next.)
                    </div>
                  </div>
                  <Pill>drag to reorder</Pill>
                </div>

                <DragList
                  title="Priority List"
                  subtitle="Drag items within this list to reorder. (Drop from tiles to add.)"
                  items={greetingPriority.map((k) => `skill:${k}`)}
                  allowDropKinds={["skill"]}
                  itemLabel={(id) => {
                    const [, key] = id.split(":", 2);
                    return skillTitle(key as SkillKey);
                  }}
                  onMove={(from, to) => {
                    const keys = greetingPriority.slice();
                    setGreetingPriority(moveItem(keys, from, to));
                  }}
                  onDropAppend={(p) => {
                    if (p.kind !== "skill") return;
                    setGreetingPriority((cur) => (cur.includes(p.key) ? cur : [...cur, p.key]));
                  }}
                />
              </div>

              {activeSkill === "gmail_summaries" ? (
                <div className="panel">
                  <div className="panelHeader">
                    <div>
                      <div className="panelTitle">Gmail Summaries</div>
                      <div className="panelSub">Concept controls. Only the main enable + inbox selection are wired today.</div>
                    </div>
                    <Pill>{settings.gmail_summary_enabled ? "Enabled" : "Disabled"}</Pill>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <Switch
                      checked={!!settings.gmail_summary_enabled}
                      onChange={(v) => setSettings((p: any) => ({ ...p, gmail_summary_enabled: v }))}
                      label="Enable / Disable"
                      helper="Wired today."
                    />

                    <Switch
                      checked={gmailAddToGreeting}
                      onChange={setGmailAddToGreeting}
                      label="Add to greeting"
                      helper="When enabled, the agent runs this skill immediately after the greeting as if the caller requested it. (Concept only.)"
                    />

                    <TextField
                      label="Engagement Prompt"
                      value={gmailEngagementPrompt}
                      onChange={setGmailEngagementPrompt}
                      placeholder='Example: "If the caller asks about email, offer a Gmail summary."'
                      helper="Concept — will be used by intent routing."
                    />

                    <TextField
                      label="LLM Prompt"
                      value={gmailLlmPrompt}
                      onChange={setGmailLlmPrompt}
                      multiline
                      placeholder="(Full prompt text used when this skill is engaged.)"
                      helper="Concept — stored per skill."
                    />

                    <div className="panel" style={{ background: "rgba(246,249,255,0.65)" }}>
                      <div className="panelHeader" style={{ marginBottom: 10 }}>
                        <div>
                          <div className="panelTitle">Inbox Selection</div>
                          <div className="panelSub">These determine which inbox Gmail Summaries uses.</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 14 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: "#0F172A" }}>Default Inbox</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#64748B" }}>
                            Writes to <span className="mono">gmail_account_id</span>.
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            {gmailAccounts.length === 0 ? (
                              <div className="muted">No active Gmail accounts found.</div>
                            ) : (
                              <select
                                value={settings.gmail_account_id || ""}
                                onChange={(e) => setDefaultGmailId(e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: 12,
                                  borderRadius: 14,
                                  border: "1px solid rgba(15,23,42,0.12)",
                                  background: "rgba(255,255,255,0.92)",
                                  color: "#0F172A",
                                  boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
                                }}
                              >
                                <option value="">(unset)</option>
                                {gmailAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {(a.email_address || a.display_name || a.id) + (a.is_primary ? " (Primary)" : "")}
                                  </option>
                                ))}
                              </select>
                            )}

                            <button
                              type="button"
                              className="btnSecondary"
                              onClick={() => {
                                const primary = gmailAccounts.find((a) => a.is_primary);
                                if (primary) setDefaultGmailId(primary.id);
                              }}
                            >
                              Use Primary Inbox as Default
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, color: "#0F172A" }}>Enabled Inboxes</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#64748B" }}>
                            Writes to <span className="mono">gmail_enabled_account_ids</span> (multi-inbox).
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            {gmailAccounts.map((a) => {
                              const enabledIds: string[] = Array.isArray(settings.gmail_enabled_account_ids)
                                ? settings.gmail_enabled_account_ids
                                : [];
                              const checked = enabledIds.includes(a.id);
                              const label = a.email_address || a.display_name || a.id;
                              return (
                                <label
                                  key={a.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: 12,
                                    borderRadius: 14,
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    background: "rgba(255,255,255,0.98)",
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 900, color: "#0F172A" }}>{label}</div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>
                                      {a.is_primary ? "Primary" : "Secondary"} • <span className="mono">{a.id}</span>
                                    </div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEnabledGmailId(a.id)}
                                    style={{ width: 18, height: 18 }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="actions">
                      <button className="btnPrimary" type="button" disabled={saving} onClick={saveWiredSettings}>
                        {saving ? "Saving…" : "Save (wired settings)"}
                      </button>
                      <button
                        className="btnSecondary"
                        type="button"
                        onClick={() => {
                          setGmailEngagementPrompt("");
                          setGmailLlmPrompt("");
                          setGmailAddToGreeting(false);
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
            title="Playbooks"
            subtitle="Reusable workflow building blocks. Build a playbook by dragging enabled skills into its container, then reorder."
            open={open.playbooks}
            onToggle={() => setOpen((p) => ({ ...p, playbooks: !p.playbooks }))}
            rightSlot={<Pill>{playbooks.length} playbook(s)</Pill>}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Playbook List</div>
                    <div className="panelSub">Select a playbook to edit. (Concept only.)</div>
                  </div>
                  <button
                    className="btnSecondary"
                    type="button"
                    onClick={() => {
                      const id = `pb_${Math.random().toString(16).slice(2, 8)}`;
                      setPlaybooks((p) => [...p, { id, name: "New Playbook", enabled: false, steps: [] }]);
                      setSelectedPlaybookId(id);
                    }}
                  >
                    + New Playbook
                  </button>
                </div>

                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={selectedPlaybookId}
                      onChange={(e) => setSelectedPlaybookId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(15,23,42,0.12)",
                        background: "rgba(255,255,255,0.92)",
                        color: "#0F172A",
                        boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
                      }}
                    >
                      {playbooks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.enabled ? "" : "(disabled)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "0 0 auto", width: 240 }}>
                    <Switch
                      checked={!!selectedPlaybook?.enabled}
                      onChange={(v) =>
                        setPlaybooks((cur) => cur.map((p) => (p.id === selectedPlaybookId ? { ...p, enabled: v } : p)))
                      }
                      label="Enabled"
                      helper="Concept"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                <div className="panel">
                  <div className="panelHeader">
                    <div>
                      <div className="panelTitle">Enabled Skills</div>
                      <div className="panelSub">Drag these into the playbook container.</div>
                    </div>
                    <Pill>drag</Pill>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {tiles.filter((t) => t.enabled).map((t) => (
                      <div
                        key={`pick-${t.key}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `skill:${t.key}`);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(15,23,42,0.10)",
                          background: "rgba(255,255,255,0.98)",
                          cursor: "grab",
                        }}
                        title="Drag into playbook"
                      >
                        <div style={{ fontWeight: 900, color: "#0F172A" }}>{t.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>{t.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <DragList
                  title={`Playbook Steps — ${selectedPlaybook?.name || "Playbook"}`}
                  subtitle="Drop enabled skills here. Drag to reorder. (Concept only.)"
                  items={(selectedPlaybook?.steps || []).map((k) => `skill:${k}`)}
                  allowDropKinds={["skill"]}
                  itemLabel={(id) => {
                    const [, key] = id.split(":", 2);
                    return skillTitle(key as SkillKey);
                  }}
                  rightSlot={<Pill>{(selectedPlaybook?.steps || []).length} step(s)</Pill>}
                  onMove={(from, to) => {
                    setPlaybooks((cur) =>
                      cur.map((p) => (p.id === selectedPlaybookId ? { ...p, steps: moveItem(p.steps, from, to) } : p))
                    );
                  }}
                  onDropAppend={(p) => {
                    if (p.kind !== "skill") return;
                    setPlaybooks((cur) =>
                      cur.map((pb) => {
                        if (pb.id !== selectedPlaybookId) return pb;
                        const next = pb.steps.includes(p.key) ? pb.steps : [...pb.steps, p.key];
                        return { ...pb, steps: next };
                      })
                    );
                  }}
                />
              </div>

              <div className="actions">
                <button className="btnPrimary" type="button" onClick={() => alert("Concept only: will save playbook config to control plane.")}>
                  Save Playbook (concept)
                </button>
                <button
                  className="btnSecondary"
                  type="button"
                  onClick={() =>
                    setPlaybooks((cur) =>
                      cur.map((p) => (p.id === selectedPlaybookId ? { ...p, steps: [] } : p))
                    )
                  }
                >
                  Clear steps
                </button>
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Templates"
            subtitle="Tenant program: templates orchestrate playbooks + skills. Drag playbooks/skills into a template container, reorder as needed."
            open={open.templates}
            onToggle={() => setOpen((p) => ({ ...p, templates: !p.templates }))}
            rightSlot={<Pill>{templates.length} template(s)</Pill>}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Template List</div>
                    <div className="panelSub">Select a template to edit. (Concept only.)</div>
                  </div>
                  <button
                    className="btnSecondary"
                    type="button"
                    onClick={() => {
                      const id = `tpl_${Math.random().toString(16).slice(2, 8)}`;
                      setTemplates((t) => [...t, { id, name: "New Template", enabled: false, sequence: [] }]);
                      setSelectedTemplateId(id);
                    }}
                  >
                    + New Template
                  </button>
                </div>

                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(15,23,42,0.12)",
                        background: "rgba(255,255,255,0.92)",
                        color: "#0F172A",
                        boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
                      }}
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.enabled ? "" : "(disabled)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "0 0 auto", width: 240 }}>
                    <Switch
                      checked={!!selectedTemplate?.enabled}
                      onChange={(v) =>
                        setTemplates((cur) => cur.map((t) => (t.id === selectedTemplateId ? { ...t, enabled: v } : t)))
                      }
                      label="Enabled"
                      helper="Concept"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                <div className="panel">
                  <div className="panelHeader">
                    <div>
                      <div className="panelTitle">Available Tiles</div>
                      <div className="panelSub">Drag playbooks or enabled skills into the template container.</div>
                    </div>
                    <Pill>drag</Pill>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontWeight: 900, color: "#0F172A" }}>Playbooks</div>
                    {playbooks.map((p) => (
                      <div
                        key={`pb-tile-${p.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `playbook:${p.id}`);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(15,23,42,0.10)",
                          background: "rgba(255,255,255,0.98)",
                          cursor: "grab",
                        }}
                        title="Drag into template"
                      >
                        <div style={{ fontWeight: 900, color: "#0F172A" }}>
                          {p.name}{" "}
                          <span style={{ fontSize: 12, color: "#64748B" }}>
                            ({p.enabled ? "enabled" : "disabled"})
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>
                          Steps: {p.steps.map(skillTitle).join(" → ") || "(empty)"}
                        </div>
                      </div>
                    ))}

                    <div style={{ marginTop: 8, fontWeight: 900, color: "#0F172A" }}>Enabled Skills</div>
                    {tiles.filter((t) => t.enabled).map((t) => (
                      <div
                        key={`skill-tile-${t.key}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `skill:${t.key}`);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(15,23,42,0.10)",
                          background: "rgba(255,255,255,0.98)",
                          cursor: "grab",
                        }}
                        title="Drag into template"
                      >
                        <div style={{ fontWeight: 900, color: "#0F172A" }}>{t.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>{t.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <DragList
                  title={`Template Sequence — ${selectedTemplate?.name || "Template"}`}
                  subtitle="Drop playbooks/skills here. Drag to reorder. (Concept only.)"
                  items={(selectedTemplate?.sequence || []).map((x) => (x.kind === "skill" ? `skill:${x.key}` : `playbook:${x.id}`))}
                  allowDropKinds={["skill", "playbook"]}
                  itemLabel={(id) => {
                    const [kind, key] = id.split(":", 2);
                    if (kind === "skill") return `Skill: ${skillTitle(key as SkillKey)}`;
                    return `Playbook: ${playbookName(key)}`;
                  }}
                  rightSlot={<Pill>{(selectedTemplate?.sequence || []).length} item(s)</Pill>}
                  onMove={(from, to) => {
                    setTemplates((cur) =>
                      cur.map((t) =>
                        t.id === selectedTemplateId ? { ...t, sequence: moveItem(t.sequence, from, to) } : t
                      )
                    );
                  }}
                  onDropAppend={(p) => {
                    setTemplates((cur) =>
                      cur.map((t) => {
                        if (t.id !== selectedTemplateId) return t;
                        const exists =
                          p.kind === "skill"
                            ? t.sequence.some((x) => x.kind === "skill" && x.key === p.key)
                            : t.sequence.some((x) => x.kind === "playbook" && x.id === p.id);

                        if (exists) return t;
                        const next = p.kind === "skill" ? [...t.sequence, { kind: "skill", key: p.key }] : [...t.sequence, { kind: "playbook", id: p.id }];
                        return { ...t, sequence: next };
                      })
                    );
                  }}
                />
              </div>

              <div className="actions">
                <button className="btnPrimary" type="button" onClick={() => alert("Concept only: will save template config to control plane.")}>
                  Save Template (concept)
                </button>
                <button
                  className="btnSecondary"
                  type="button"
                  onClick={() =>
                    setTemplates((cur) => cur.map((t) => (t.id === selectedTemplateId ? { ...t, sequence: [] } : t)))
                  }
                >
                  Clear sequence
                </button>
              </div>

              <div className="hint">
                Later: add “Execute Template” and “Execute Playbook” test actions with sandbox mode and runtime re-ordering driven by user intent.
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Agent Memory"
            subtitle="Short-term and long-term toggles, engagement prompt, and Memory Bank (concept DB view)."
            open={open.agentMemory}
            onToggle={() => setOpen((p) => ({ ...p, agentMemory: !p.agentMemory }))}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="panel">
                <div className="panelHeader">
                  <div>
                    <div className="panelTitle">Memory</div>
                    <div className="panelSub">Concept UI — wiring comes next.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <Switch
                    checked={!!settings.shortterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, shortterm_memory_enabled: v }))}
                    label="Enable Short-Term Memory"
                    helper="Concept now; backend wiring later."
                  />
                  <Switch
                    checked={!!settings.longterm_memory_enabled}
                    onChange={(v) => setSettings((p: any) => ({ ...p, longterm_memory_enabled: v }))}
                    label="Enable Long-Term Memory"
                    helper="Concept now; backend wiring later."
                  />

                  <TextField
                    label="Engagement Prompt"
                    value={memoryEngagementPrompt}
                    onChange={setMemoryEngagementPrompt}
                    placeholder='Example: "If caller says earlier / last time / remember, consult long-term memory."'
                    helper="Phrases to tell the routing layer to engage long-term memory."
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
                    helper="Concept: will query control plane endpoint like /admin/memory?search=..."
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
            subtitle="Conversational tuning."
            open={open.chitchat}
            onToggle={() => setOpen((p) => ({ ...p, chitchat: !p.chitchat }))}
          >
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Chit-Chat</div>
                  <div className="panelSub">Response delay and other controls (concept).</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <TextField
                  label="Response Delay Time (seconds)"
                  value={chitchatDelaySec}
                  onChange={setChitchatDelaySec}
                  placeholder="2.0"
                  helper="Time of dead air before Vozlia responds."
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
                  <div className="panelSub">Concept UI. (We can persist these later.)</div>
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
                  Recommended for stability: keep <b>REALTIME_LOG_DELTAS</b> off, keep stats on.
                </div>
              </div>
            </div>
          </SectionRow>

          <SectionRow
            title="Agent Core"
            subtitle="Greeting and realtime prompt addendum (existing wired settings)."
            open={open.core}
            onToggle={() => setOpen((p) => ({ ...p, core: !p.core }))}
          >
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Agent Core</div>
                  <div className="panelSub">Already wired to the control plane.</div>
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
                  placeholder="(Rules for the realtime assistant...)"
                  helper="Affects prompt shaping."
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
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <div className="panelTitle">Email Accounts</div>
                  <div className="panelSub">
                    These flags (Primary/Active) don’t automatically change Gmail Summaries default inbox unless you set Default Inbox above.
                  </div>
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
                        <div style={{ fontWeight: 950, color: "#0F172A" }}>
                          {a.email_address || a.display_name || a.id}
                        </div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {a.is_primary ? "Primary" : "Secondary"} · {a.is_active ? "Active" : "Inactive"} ·{" "}
                          <span className="mono">{a.id}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button className={a.is_primary ? "btnPrimary" : "btnSecondary"} type="button" onClick={() => setPrimaryAccount(a.id)}>
                          {a.is_primary ? "Primary" : "Make Primary"}
                        </button>

                        <button className="btnSecondary" type="button" onClick={() => toggleAccountActive(a.id, !a.is_active)}>
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
            subtitle="Live logs fetched from Render (existing panel)."
            open={open.renderLogs}
            onToggle={() => setOpen((p) => ({ ...p, renderLogs: !p.renderLogs }))}
          >
            <div className="panel" style={{ padding: 0 }}>
              <div style={{ padding: 14 }}>
                <div className="panelTitle">Render Logs</div>
                <div className="panelSub">Existing panel embedded near the bottom.</div>
              </div>
              <div style={{ padding: 14, paddingTop: 0 }}>
                <RenderLogsPanel />
              </div>
            </div>
          </SectionRow>
        </div>

        <footer className="foot">
          <div className="muted">
            Concept UI only — next step is wiring Skills/Playbooks/Templates configs into the control plane and agent runtime.
          </div>
        </footer>
      </div>

      <style jsx global>{`
        :root {
          --bg: #F6F9FF;
          --card: rgba(255,255,255,0.82);
          --cardSolid: #FFFFFF;
          --border: rgba(15,23,42,0.12);
          --text: #0F172A;
          --muted: #64748B;
          --accent: #06B6D4;
          --accentSoft: rgba(6,182,212,0.12);
        }

        html, body {
          margin: 0;
          padding: 0;
          background: var(--bg);
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }

        .page { min-height: 100vh; position: relative; overflow-x: hidden; }

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

        .wrap { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; padding: 26px 18px 44px; }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--card);
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
        }

        .brand { font-size: 22px; font-weight: 950; letter-spacing: -0.02em; }
        .subtitle { margin-top: 4px; color: var(--muted); font-size: 13px; }
        .signedin { text-align: right; min-width: 220px; }
        .muted { color: var(--muted); font-size: 12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

        .alert {
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(248, 113, 113, 0.4);
          background: rgba(254, 226, 226, 0.7);
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
        }
        .alertTitle { font-weight: 950; }
        .alertBody { margin-top: 6px; white-space: pre-wrap; color: #7f1d1d; font-size: 13px; }

        .stack { margin-top: 16px; display: grid; gap: 14px; }

        .panel {
          padding: 14px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
        }

        .panelHeader { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
        .panelTitle { font-weight: 950; font-size: 15px; }
        .panelSub { margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.35; }

        .actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .btnPrimary {
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(6,182,212,0.55);
          background: rgba(6,182,212,0.16);
          color: var(--text);
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 12px 26px rgba(15,23,42,0.08);
        }
        .btnPrimary:disabled { opacity: 0.55; cursor: not-allowed; }

        .btnSecondary {
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.92);
          color: var(--text);
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 26px rgba(15,23,42,0.08);
        }

        .rowCard {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.98);
        }

        .gridTiles {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
        }

        .row {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .tableShell { border-radius: 18px; border: 1px solid rgba(15,23,42,0.10); overflow: hidden; background: rgba(255,255,255,0.98); }
        .tableHeader { display: flex; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid rgba(15,23,42,0.08); }
        .tableEmpty { padding: 18px 12px; color: var(--muted); font-size: 13px; line-height: 1.5; }

        .hint { margin-top: 10px; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(15,23,42,0.10); background: rgba(6,182,212,0.06); color: var(--muted); font-size: 12px; }

        .foot { margin-top: 18px; padding: 14px 4px 0; }
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
