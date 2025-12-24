import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

export default function Admin() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<any>({})

  useEffect(() => {
    if (!session?.backendToken) return

    fetch(`${API}/settings/me`, {
      headers: {
        Authorization: `Bearer ${session.backendToken}`
      }
    })
      .then(res => res.json())
      .then(setSettings)
  }, [session])

  const save = async () => {
    await fetch(`${API}/settings/me`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.backendToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(settings)
    })
  }

  return (
    <div>
      <h1>Vozlia Admin</h1>

      <textarea
        value={settings.agent_greeting || ""}
        onChange={e =>
          setSettings({ ...settings, agent_greeting: e.target.value })
        }
      />

      <label>
        Email summaries
        <input
          type="checkbox"
          checked={settings.gmail_summary_enabled}
          onChange={e =>
            setSettings({ ...settings, gmail_summary_enabled: e.target.checked })
          }
        />
      </label>

      <button onClick={save}>Save</button>
    </div>
  )
}
