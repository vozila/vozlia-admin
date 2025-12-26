import type { NextApiRequest, NextApiResponse } from "next";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function readJsonSafe(r: Response) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const baseUrl = requiredEnv("VOZLIA_CONTROL_BASE_URL").replace(/\/$/, "");
    const adminKey = requiredEnv("VOZLIA_CONTROL_ADMIN_KEY");
    const upstreamUrl = `${baseUrl}/admin/settings`;

    if (req.method === "GET") {
      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: { "X-Vozlia-Admin-Key": adminKey },
      });
      const data = await readJsonSafe(upstream);
      res.status(upstream.status).json(data);
      return;
    }

    if (req.method === "PATCH") {
      const upstream = await fetch(upstreamUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Vozlia-Admin-Key": adminKey,
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const data = await readJsonSafe(upstream);
      res.status(upstream.status).json(data);
      return;
    }

    res.setHeader("Allow", "GET, PATCH");
    res.status(405).json({ detail: "Method Not Allowed" });
  } catch (err: any) {
    res.status(500).json({ detail: "Admin API error", error: err?.message ?? String(err) });
  }
}
