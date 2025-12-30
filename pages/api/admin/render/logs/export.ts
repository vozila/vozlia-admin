import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

import { Readable } from "stream";

export const config = {
  api: {
    responseLimit: false, // allow large log exports
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "unauthorized" });

  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
  const ADMIN_KEY = process.env.VOZLIA_ADMIN_KEY || process.env.VOZLIA_ADMIN_API_KEY;
  if (!ADMIN_KEY) return res.status(500).json({ error: "missing_env", name: "VOZLIA_ADMIN_KEY" });

  const { service_id, instance_id, start_ms, end_ms, q, format } = req.query;
  if (!service_id) return res.status(400).json({ error: "missing_service_id" });

  const params = new URLSearchParams();
  params.set("service_id", String(Array.isArray(service_id) ? service_id[0] : service_id));
  if (instance_id) params.set("instance_id", String(Array.isArray(instance_id) ? instance_id[0] : instance_id));
  if (start_ms) params.set("start_ms", String(Array.isArray(start_ms) ? start_ms[0] : start_ms));
  if (end_ms) params.set("end_ms", String(Array.isArray(end_ms) ? end_ms[0] : end_ms));
  if (q) params.set("q", String(Array.isArray(q) ? q[0] : q));
  if (format) params.set("format", String(Array.isArray(format) ? format[0] : format));

  const url = `${CONTROL_BASE}/admin/render/logs/export?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        Accept: "application/octet-stream",
      },
    });

    res.status(upstream.status);

    // Pass through headers relevant for download
    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("content-type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) res.setHeader("content-disposition", cd);

    // Stream the body if possible
    const body = upstream.body;
    if (!body) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    }

    // Convert web stream to Node stream
    const nodeStream = Readable.fromWeb(body as any);
    nodeStream.on("error", () => {
      try { res.end(); } catch {}
    });
    return nodeStream.pipe(res);
  } catch (err: any) {
    return res.status(502).json({ detail: "Upstream request failed", error: err?.message ?? String(err) });
  }
}
