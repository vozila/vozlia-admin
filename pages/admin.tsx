import type { GetServerSidePropsContext } from "next";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Settings = {
  agent_greeting?: string;
  realtime_prompt_addendum?: string;
  gmail_summary_enabled?: boolean;
  gmail_account_id?: string | null;
  gmail_enabled_account_ids?: string[]; // [] means "all active Gmail accounts enabled"
};

type EmailAccount = {
  id: string;
  user_id: string;
  provider_type: string;
  oauth_provider?: string | null;
  email_address: string;
  display_name?: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function prettyDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>({});
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);

  async function loadSettings() {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) throw new Error(`settings fetch failed (${res.status})`);
    return (await res.json()) as Settings;
  }

  async function loadAccounts() {
    const res = await fetch("/api/admin/email-accounts?include_inactive=true");
    if (!res.ok) throw new Error(`email accounts fetch failed (${res.status})`);
    return (await res.json()) as EmailAccount[];
  }

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const [s, a] = await Promise.all([loadSettings(), loadAccounts()]);
        setSettings(s);
        setAccounts(a);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`save failed (${res.status}): ${txt}`);
      }
      const updated = (await res.json()) as Settings;
      setSettings(updated);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const refreshAccounts = async () => {
    setAccountsLoading(true);
    setErr(null);
    try {
      const a = await loadAccounts();
      setAccounts(a);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setAccountsLoading(false);
    }
  };

  const patchAccount = async (id: string, patch: Partial<EmailAccount>) => {
    setErr(null);
    const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`account patch failed (${res.status}): ${txt}`);
    }
    await refreshAccounts();
  };

  const disconnectAccount = async (id: string) => {
    setErr(null);
    const ok = confirm("Disconnect this email account? This will disable it and remove credentials (you can reconnect later).");
    if (!ok) return;

    const res = await fetch(`/api/admin/email-accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`disconnect failed (${res.status}): ${txt}`);
    }
    await refreshAccounts();
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Vozlia Admin</h1>
      <div style={{ color: "#444", marginBottom: 16 }}>
        Signed in as <b>{session?.user?.email ?? "unknown"}</b>
      </div>

      {err && (
        <div style={{ background: "#fee", border: "1px solid #f99", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <b>Error:</b> {err}
        </div>
      )}

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Agent Settings</h2>

        <label style={{ display: "block", marginTop: 8 }}>Greeting</label>
        <input
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          value={settings.agent_greeting ?? ""}
          onChange={(e) => setSettings({ ...settings, agent_greeting: e.target.value })}
        />

        <div style={{ marginTop: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={!!settings.gmail_summary_enabled}
              onChange={(e) => setSettings({ ...settings, gmail_summary_enabled: e.target.checked })}
            />
            {" "}Enable email summaries
          </label>
        </div>

        <label style={{ display: "block", marginTop: 16 }}>Realtime prompt addendum</label>
        <textarea
          style={{ width: "100%", height: 120, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          value={settings.realtime_prompt_addendum ?? ""}
          onChange={(e) => setSettings({ ...settings, realtime_prompt_addendum: e.target.value })}
        />

        <div style={{ marginTop: 16 }}>
          <button onClick={saveSettings} disabled={saving} style={{ padding: "10px 14px", borderRadius: 10 }}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ marginTop: 0 }}>Email Accounts</h2>
          <button onClick={refreshAccounts} disabled={accountsLoading} style={{ padding: "8px 12px", borderRadius: 10 }}>
            {accountsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div style={{ marginBottom: 12, color: "#444" }}>
          Active accounts: <b>{activeAccounts.length}</b> (Total: {accounts.length})
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Email</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Provider</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Primary</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Active</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Updated</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    <div><b>{a.email_address}</b></div>
                    <div style={{ color: "#666", fontSize: 12 }}>{a.id}</div>
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {a.provider_type}{a.oauth_provider ? ` (${a.oauth_provider})` : ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {a.is_primary ? "✅" : ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {a.is_active ? "✅" : "—"}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {prettyDate(a.updated_at)}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, whiteSpace: "nowrap" }}>
                    <button
                      style={{ marginRight: 8, padding: "6px 10px", borderRadius: 10 }}
                      onClick={() => patchAccount(a.id, { is_active: !a.is_active })}
                    >
                      {a.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      style={{ marginRight: 8, padding: "6px 10px", borderRadius: 10 }}
                      onClick={() => patchAccount(a.id, { is_primary: true })}
                      disabled={a.is_primary}
                      title={a.is_primary ? "Already primary" : "Make primary"}
                    >
                      Make primary
                    </button>
                    <button
                      style={{ padding: "6px 10px", borderRadius: 10 }}
                      onClick={() => disconnectAccount(a.id)}
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#666" }}>
                    No email accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
          Note: “Disconnect” is a safe soft-disconnect (disables the account and clears stored credentials). Reconnect flow will be added next.
        </div>
      </section>
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
