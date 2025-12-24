export async function getBackendToken(idToken: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE}/admin/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken })
    }
  )

  if (!res.ok) throw new Error("Admin auth failed")
  return res.json()
}
