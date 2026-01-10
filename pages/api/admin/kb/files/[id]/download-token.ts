import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Vercel API Route: /api/admin/kb/files/:id/download-token
 * GET -> /admin/kb/files/:id/download-token on control plane.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
    const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_KEY");

    const id = req.query.id;
    if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

    // tenant_id is REQUIRED by control plane for isolation
    const tenant_id = req.query.tenant_id;
    if (!tenant_id || typeof tenant_id !== "string") {
      return res.status(400).json({ error: "Missing tenant_id" });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const url = `${CONTROL_BASE}/admin/kb/files/${encodeURIComponent(id)}/download-token?tenant_id=${encodeURIComponent(tenant_id)}`;

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: String(err?.message || err) });
  }
}
