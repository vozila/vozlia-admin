import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { Readable } from "stream";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export const config = {
  api: {
    responseLimit: false, // allow larger downloads
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ error: "unauthorized" });

    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

    const {
      service_id,
      instance_id,
      start_ms,
      end_ms,
      q,
      format,
    } = req.query;

    const sid = Array.isArray(service_id) ? service_id[0] : service_id;
    if (!sid) return res.status(400).json({ error: "missing_service_id" });

    const CONTROL_BASE = (env("VOZLIA_CONTROL_BASE_URL") || "").replace(/\/+$/, "");
    const ADMIN_KEY = env("VOZLIA_ADMIN_API_KEY") || "";
    if (!CONTROL_BASE) return res.status(500).json({ error: "missing_env", name: "VOZLIA_CONTROL_BASE_URL" });
    if (!ADMIN_KEY) return res.status(500).json({ error: "missing_env", name: "VOZLIA_ADMIN_API_KEY" });

    const params = new URLSearchParams();
    params.set("service_id", sid);
    if (instance_id) params.set("instance_id", Array.isArray(instance_id) ? instance_id[0] : String(instance_id));
    if (start_ms) params.set("start_ms", Array.isArray(start_ms) ? start_ms[0] : String(start_ms));
    if (end_ms) params.set("end_ms", Array.isArray(end_ms) ? end_ms[0] : String(end_ms));
    if (q) params.set("q", Array.isArray(q) ? q[0] : String(q));
    if (format) params.set("format", Array.isArray(format) ? format[0] : String(format));

    const url = `${CONTROL_BASE}/admin/render/logs/export?${params.toString()}`;

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vozlia-Admin-Key": ADMIN_KEY,
      },
    });

    // Forward status + headers that matter
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) res.setHeader("content-disposition", cd);

    const body = upstream.body;
    if (!body) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    }

    const nodeStream = Readable.fromWeb(body as any);
    nodeStream.on("error", () => {
      try { res.end(); } catch {}
    });
    return nodeStream.pipe(res);
  } catch (err: any) {
    return res.status(502).json({ error: "upstream_failed", detail: err?.message ?? String(err) });
  }
}
