import type { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function AdminPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<any>({})

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/settings")
      const data = await res.json()
      setSettings(data)
      setLoading(false)
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Vozlia Admin</h1>

      <label>Greeting</label>
      <textarea
        style={{ width: "100%", height: 120 }}
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

      <div style={{ marginTop: 16 }}>
        <button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
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
