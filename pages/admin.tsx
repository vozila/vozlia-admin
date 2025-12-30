import type { GetServerSidePropsContext } from "next";
import { useEffect, useMemo, useState } from "react";
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

export default function AdminPage() {
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<any>({});
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState<boolean>(true);

  const primaryEmail = (session?.user?.email as string | undefined) || "";

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    setSettings(data);
  }

  async function loadAccounts() {
    setAccountsLoading(true);
    const res = await fetch("/api/admin/email-accounts?include_inactive=true");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Failed to load email accounts: ${res.status} ${t}`);
    }
    const data = await res.json();
    setAccounts(data || []);
    setAccountsLoading(false);
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await Promise.all([loadSettings(), loadAccounts()]);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gmailAccounts = useMemo(
    () => accounts.filter((a) => a.provider_type === "gmail" && a.is_active),
    [accounts]
  );

  async function saveSettingsPatch(patch: any) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
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

  async function patchAccount(id: string, patch: any) {
    setError(null);
    const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${text}`);
    await loadAccounts();
    return text;
  }

  async function disconnectAccount(id: string) {
    if (!confirm("Disconnect this email account? (It will be set inactive and tokens cleared.)")) return;
    setError(null);
    const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DELETE failed: ${res.status} ${text}`);
    await loadAccounts();
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Vozlia Admin</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Signed in as <b>{primaryEmail || "unknown"}</b>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 8 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {/* Settings */}
      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Agent Settings</h2>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Greeting</label>
          <textarea
            value={settings.agent_greeting || ""}
            onChange={(e) => setSettings({ ...settings, agent_greeting: e.target.value })}
            rows={2}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Realtime Prompt Addendum</label>
          <textarea
            value={settings.realtime_prompt_addendum || ""}
            onChange={(e) => setSettings({ ...settings, realtime_prompt_addendum: e.target.value })}
            rows={4}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!settings.gmail_summary_enabled}
              onChange={(e) => setSettings({ ...settings, gmail_summary_enabled: e.target.checked })}
            />
            Enable Gmail Summaries
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Selected Gmail Account (legacy setting)</label>
          <input
            value={settings.gmail_account_id || ""}
            onChange={(e) => setSettings({ ...settings, gmail_account_id: e.target.value })}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            This is kept for backward compatibility. New multi-inbox selection uses <code>gmail_enabled_account_ids</code>.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Enabled/Searchable Gmail Account IDs</label>
          <input
            value={Array.isArray(settings.gmail_enabled_account_ids) ? settings.gmail_enabled_account_ids.join(",") : ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                gmail_enabled_account_ids: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
            placeholder="comma-separated UUIDs, empty = all active"
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            onClick={() =>
              saveSettingsPatch({
                agent_greeting: settings.agent_greeting,
                realtime_prompt_addendum: settings.realtime_prompt_addendum,
                gmail_summary_enabled: settings.gmail_summary_enabled,
                gmail_account_id: settings.gmail_account_id,
                gmail_enabled_account_ids: settings.gmail_enabled_account_ids,
              })
            }
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #333",
              background: saving ? "#eee" : "#111",
              color: saving ? "#666" : "#fff",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>

          <button
            onClick={async () => {
              try {
                setError(null);
                await Promise.all([loadSettings(), loadAccounts()]);
              } catch (e: any) {
                setError(e?.message || String(e));
              }
            }}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
          >
            Refresh
          </button>
        </div>
      </section>

      {/* Email Accounts */}
      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Email Accounts</h2>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/api/admin/gmail/connect"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#111",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Connect Gmail
            </a>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Connect multiple Gmail inboxes here. If more than one is enabled, the voice agent will later prompt you to choose which inbox to check.
        </div>

        {accountsLoading ? (
          <div style={{ marginTop: 12 }}>Loading email accounts…</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Email</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Provider</th>
                  <th style={{ textAlign: "center", padding: 8, borderBottom: "1px solid #ddd" }}>Primary</th>
                  <th style={{ textAlign: "center", padding: 8, borderBottom: "1px solid #ddd" }}>Active</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ fontWeight: 600 }}>{a.display_name || a.email_address || a.id}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{a.email_address || ""}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{a.id}</div>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {a.provider_type}
                      {a.oauth_provider ? ` (${a.oauth_provider})` : ""}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {a.is_primary ? "✅" : ""}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                      {a.is_active ? "✅" : "—"}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                          onClick={() => patchAccount(a.id, { is_active: !a.is_active })}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "#fff" }}
                        >
                          {a.is_active ? "Disable" : "Enable"}
                        </button>

                        <button
                          onClick={() => patchAccount(a.id, { is_primary: true })}
                          disabled={a.is_primary}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            background: a.is_primary ? "#eee" : "#fff",
                            cursor: a.is_primary ? "not-allowed" : "pointer",
                          }}
                        >
                          Make Primary
                        </button>

                        <button
                          onClick={() => disconnectAccount(a.id)}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #f66", background: "#fff" }}
                        >
                          Disconnect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                      No email accounts found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Tip: After connecting multiple Gmail accounts, leave <code>gmail_enabled_account_ids</code> empty to treat all active accounts as enabled.
        </div>
      </section>
      {/* Render Logs */}
      <RenderLogsPanel />

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
