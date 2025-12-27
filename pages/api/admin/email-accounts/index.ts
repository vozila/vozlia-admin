import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

/**
 * Vercel API Route: /api/admin/email-accounts
 *
 * Proxies to vozlia-control:
 *   GET /admin/email-accounts?include_inactive=true|false
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ detail: "Unauthorized" });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const baseUrl = process.env.VOZLIA_CONTROL_BASE_URL;
  const adminKey = process.env.VOZLIA_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    return res.status(500).json({ detail: "Missing VOZLIA_CONTROL_BASE_URL or VOZLIA_ADMIN_KEY" });
  }

  const includeInactive = (req.query.include_inactive ?? "true").toString();
  const upstreamUrl = `${baseUrl.replace(/\/$/, "")}/admin/email-accounts?include_inactive=${encodeURIComponent(includeInactive)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": adminKey,
        "Accept": "application/json",
      },
    });

    const text = await upstream.text();
    res.status(upstream.status);

    try {
      const json = text ? JSON.parse(text) : [];
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
