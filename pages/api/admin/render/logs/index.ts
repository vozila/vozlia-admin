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
  const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_API_KEY");

  const { service_id, instance_id, start_ms, end_ms, q, limit, page } = req.query;

  if (!service_id) return res.status(400).json({ error: "missing_service_id" });

  const params = new URLSearchParams();
  params.set("service_id", String(Array.isArray(service_id) ? service_id[0] : service_id));
  if (instance_id) params.set("instance_id", String(Array.isArray(instance_id) ? instance_id[0] : instance_id));
  if (start_ms) params.set("start_ms", String(Array.isArray(start_ms) ? start_ms[0] : start_ms));
  if (end_ms) params.set("end_ms", String(Array.isArray(end_ms) ? end_ms[0] : end_ms));
  if (q) params.set("q", String(Array.isArray(q) ? q[0] : q));
  if (limit) params.set("limit", String(Array.isArray(limit) ? limit[0] : limit));
  if (page) params.set("page", String(Array.isArray(page) ? page[0] : page));

  const url = `${CONTROL_BASE}/admin/render/logs?${params.toString()}`;

  try {
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
    return res.status(502).json({ detail: "Upstream request failed", error: err?.message ?? String(err) });
  }
}
