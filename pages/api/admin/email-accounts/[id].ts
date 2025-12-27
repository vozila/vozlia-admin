import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

/**
 * Vercel API Route: /api/admin/email-accounts/:id
 *
 * Proxies to vozlia-control:
 *   PATCH  /admin/email-accounts/:id
 *   DELETE /admin/email-accounts/:id
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ detail: "Unauthorized" });

  const id = (req.query.id ?? "").toString();
  if (!id) return res.status(400).json({ detail: "Missing id" });

  if (req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const baseUrl = process.env.VOZLIA_CONTROL_BASE_URL;
  const adminKey = process.env.VOZLIA_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    return res.status(500).json({ detail: "Missing VOZLIA_CONTROL_BASE_URL or VOZLIA_ADMIN_KEY" });
  }

  const upstreamUrl = `${baseUrl.replace(/\/$/, "")}/admin/email-accounts/${encodeURIComponent(id)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        "X-Vozlia-Admin-Key": adminKey,
        "Accept": "application/json",
        ...(req.method === "PATCH" ? { "Content-Type": "application/json" } : {}),
      },
      body: req.method === "PATCH" ? JSON.stringify(req.body ?? {}) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);

    try {
      const json = text ? JSON.parse(text) : {};
      return res.json(json);
    } catch {
      return res.send(text);
    }
  } catch (err: any) {
    return res.status(502).json({
      detail: "Upstream request failed",
      error: err?.message ?? String(err),
    });
  }
}
