import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "unauthorized" });

  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { serviceId } = req.query;
  const id = Array.isArray(serviceId) ? serviceId[0] : serviceId;
  if (!id) return res.status(400).json({ error: "missing_service_id" });

  const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
  const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_KEY");

  const url = `${CONTROL_BASE}/admin/render/services/${encodeURIComponent(id)}/instances`;

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
      if (Array.isArray(parsed)) return res.status(200).json({ instances: parsed });
      return res.status(200).json(parsed);
    }

    return res.status(200).send(rawText);
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: err?.message ?? String(err) });
  }
}
