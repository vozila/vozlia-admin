import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ error: "unauthorized" });

    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

    const { serviceId } = req.query;
    const id = Array.isArray(serviceId) ? serviceId[0] : serviceId;
    if (!id) return res.status(400).json({ error: "missing_service_id" });

    const CONTROL_BASE = (env("VOZLIA_CONTROL_BASE_URL") || "").replace(/\/+$/, "");
    const ADMIN_KEY = env("VOZLIA_ADMIN_API_KEY") || "";

    if (!CONTROL_BASE) return res.status(500).json({ error: "missing_env", name: "VOZLIA_CONTROL_BASE_URL" });
    if (!ADMIN_KEY) return res.status(500).json({ error: "missing_env", name: "VOZLIA_ADMIN_API_KEY" });

    const url = `${CONTROL_BASE}/admin/render/services/${encodeURIComponent(id)}/instances`;

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        Accept: "application/json",
      },
    });

    const ct = upstream.headers.get("content-type") || "application/json";
    const text = await upstream.text();

    // Normalize shape for UI: always { instances: [...] }
    if (ct.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return res.status(upstream.status).json({ instances: parsed });
        }
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).instances)) {
          return res.status(upstream.status).json(parsed);
        }
        return res.status(upstream.status).json({ instances: parsed });
      } catch {
        // fallthrough
      }
    }

    res.status(upstream.status);
    res.setHeader("content-type", ct);
    return res.send(text);
  } catch (err: any) {
    return res.status(502).json({ error: "upstream_failed", detail: err?.message ?? String(err) });
  }
}
