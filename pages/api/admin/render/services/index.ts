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
  const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_KEY");

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
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      return res.status(502).json({
        error: "upstream_error",
        status: upstream.status,
        detail: rawText.slice(0, 2000),
      });
    }

    if (contentType.includes("application/json")) {
      const parsed = rawText ? JSON.parse(rawText) : [];
      // control-plane returns an array for services
      if (Array.isArray(parsed)) return res.status(200).json({ services: parsed });
      // if control-plane ever returns an object, pass it through
      return res.status(200).json(parsed);
    }

    // Unexpected content-type; pass through
    return res.status(200).send(rawText);
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: err?.message ?? String(err) });
  }
}
