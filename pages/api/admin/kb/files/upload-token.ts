import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Vercel API Route: /api/admin/kb/files/upload-token
 * POST -> /admin/kb/files/upload-token on control plane.
 *
 * We add `uploaded_by` from the authenticated admin session (email) server-side
 * so the browser never sends it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
    const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_KEY");

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "object" && req.body ? req.body : {};
    const uploaded_by = typeof session.user?.email === "string" ? session.user.email : undefined;

    const upstream = await fetch(`${CONTROL_BASE}/admin/kb/files/upload-token`, {
      method: "POST",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...body, uploaded_by }),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: String(err?.message || err) });
  }
}
