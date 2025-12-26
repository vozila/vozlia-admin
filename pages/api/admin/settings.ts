import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Vercel API Route: /api/admin/settings
 *
 * Server-side proxy to the Render "vozlia-control" service.
 * - avoids CORS issues
 * - keeps admin key secret (never exposed to the browser)
 *
 * Required env vars (set in Vercel → Project → Settings → Environment Variables):
 * - VOZLIA_CONTROL_BASE_URL   (e.g. https://vozlia-control.onrender.com)
 * - VOZLIA_ADMIN_KEY          (your X-Vozlia-Admin-Key for the control service)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const BACKEND_BASE = process.env.VOZLIA_CONTROL_BASE_URL;
  const ADMIN_KEY = process.env.VOZLIA_ADMIN_KEY;

  if (!BACKEND_BASE || !ADMIN_KEY) {
    return res.status(500).json({
      detail:
        "Missing env vars. Set VOZLIA_CONTROL_BASE_URL and VOZLIA_ADMIN_KEY in Vercel.",
    });
  }

  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  const url = `${BACKEND_BASE.replace(/\/$/, "")}/admin/settings`;

  try {
    const headers: Record<string, string> = {
      "X-Vozlia-Admin-Key": ADMIN_KEY,
      Accept: "application/json",
    };

    let upstream: Response;

    if (req.method === "GET") {
      upstream = await fetch(url, { method: "GET", headers });
    } else {
      headers["Content-Type"] = "application/json";

      upstream = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(req.body ?? {}),
      });
    }

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);

    // Try JSON first, but don't die if upstream sends plain-text.
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
