import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { Readable } from "stream";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export const config = {
  api: {
    responseLimit: false, // allow streaming larger payloads
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "unauthorized" });

  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const service_id = pickFirst(req.query.service_id);
  if (!service_id) return res.status(400).json({ error: "missing_service_id" });

  const CONTROL_BASE = mustEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/+$/, "");
  const ADMIN_KEY = mustEnv("VOZLIA_ADMIN_KEY");

  const params = new URLSearchParams();
  params.set("service_id", service_id);

  const instance_id = pickFirst(req.query.instance_id);
  if (instance_id) params.set("instance_id", instance_id);

  const start_ms = pickFirst(req.query.start_ms);
  const end_ms = pickFirst(req.query.end_ms);
  const format = pickFirst(req.query.format);
  const q = pickFirst(req.query.q);

  if (start_ms) params.set("start_ms", start_ms);
  if (end_ms) params.set("end_ms", end_ms);
  if (format) params.set("format", format);
  if (q) params.set("q", q);

  const url = `${CONTROL_BASE}/admin/render/logs/export?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
        Accept: "*/*",
      },
    });

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      return res.status(502).json({ error: "upstream_error", status: upstream.status, detail: t.slice(0, 2000) });
    }

    // Forward content headers
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    const disposition = upstream.headers.get("content-disposition");
    if (disposition) res.setHeader("Content-Disposition", disposition);

    // Stream body
    const body = upstream.body;
    if (!body) {
      const t = await upstream.text().catch(() => "");
      return res.status(200).send(t);
    }

    // Node stream from web stream (works on Vercel Node runtime)
    const nodeStream = Readable.fromWeb(body as any);
    nodeStream.pipe(res);
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: err?.message ?? String(err) });
  }
}
