import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

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

  // Optional: if not supplied, let control-plane default window
  const start_ms = pickFirst(req.query.start_ms);
  const end_ms = pickFirst(req.query.end_ms);
  const limit = pickFirst(req.query.limit);
  const q = pickFirst(req.query.q);
  const page = pickFirst(req.query.page);

  if (start_ms) params.set("start_ms", start_ms);
  if (end_ms) params.set("end_ms", end_ms);
  if (limit) params.set("limit", limit);
  if (q) params.set("q", q);
  if (page) params.set("page", page);

  const url = `${CONTROL_BASE}/admin/render/logs?${params.toString()}`;

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
      const parsed = rawText ? JSON.parse(rawText) : {};
      // Prefer pass-through; UI expects object with rows/has_more
      return res.status(200).json(parsed);
    }

    // Unexpected content-type; wrap raw lines so UI at least shows something
    return res.status(200).json({
      service_id,
      rows: rawText
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => ({ raw: line })),
    });
  } catch (err: any) {
    return res.status(502).json({ error: "proxy_failed", detail: err?.message ?? String(err) });
  }
}
