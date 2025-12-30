import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "unauthorized" });

  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
  const ADMIN_KEY = process.env.VOZLIA_ADMIN_KEY || process.env.VOZLIA_ADMIN_API_KEY;
  if (!ADMIN_KEY) return res.status(500).json({ error: "missing_env", name: "VOZLIA_ADMIN_KEY" });

  const url = `${CONTROL_BASE}/admin/render/services`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        Accept: "application/json",
      },
    });

const rawText = await upstream.text();
const contentType = upstream.headers.get("content-type") || "application/json";
res.status(upstream.status);
res.setHeader("content-type", contentType);

// Normalize: UI expects { services: [...] }
if (contentType.includes("application/json")) {
  try {
    const parsed = rawText ? JSON.parse(rawText) : [];
    if (Array.isArray(parsed)) return res.json({ services: parsed });
    return res.json(parsed);
  } catch {
    // ignore
  }
}
return res.send(rawText);
  } catch (err: any) {
    return res.status(502).json({ detail: "Upstream request failed", error: err?.message ?? String(err) });
  }
}
