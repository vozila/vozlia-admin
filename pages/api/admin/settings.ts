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
    // Basic request logging shows up in Vercel "Functions" logs.
    console.log("/api/admin/settings", req.method, "->", url);

    // Prevent long hangs.
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15_000);

    const headers: Record<string, string> = {
      "X-Vozlia-Admin-Key": ADMIN_KEY,
      Accept: "application/json",
    };

    let upstream: Response;

    if (req.method === "GET") {
      upstream = await fetch(url, { method: "GET", headers, signal: ac.signal });
    } else {
      headers["Content-Type"] = "application/json";

      upstream = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(req.body ?? {}),
        signal: ac.signal,
      });
    }

    clearTimeout(timeout);

    console.log("/api/admin/settings upstream status", upstream.status);

    const text = await upstream.text();
    res.status(upstream.status);

    // Prefer JSON responses for clients (even if upstream forgets the header).
    // If upstream returns non-JSON, fall back to text.
    try {
      const json = text ? JSON.parse(text) : {};
      return res.json(json);
    } catch {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(text);
    }
  } catch (err: any) {
    const aborted = err?.name === "AbortError";
    return res.status(502).json({
      detail: "Upstream request failed",
      error: aborted ? "Timeout contacting control service" : (err?.message ?? String(err)),
    });
  }
}
