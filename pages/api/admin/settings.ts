import type { NextApiRequest, NextApiResponse } from "next"

const BACKEND_BASE = process.env.BACKEND_BASE_URL!
const ADMIN_KEY = process.env.ADMIN_API_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = `${BACKEND_BASE}/admin/settings`

  const headers: Record<string, string> = {
    "X-Vozlia-Admin-Key": ADMIN_KEY,
  }

  if (req.headers["content-type"]) {
    headers["Content-Type"] = String(req.headers["content-type"])
  }

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body),
  })

  const text = await upstream.text()
  res.status(upstream.status).send(text)
}
