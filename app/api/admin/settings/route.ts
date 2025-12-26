import { NextResponse } from "next/server";

export const runtime = "nodejs"; // important: keep this on server

const BASE = process.env.VOZLIA_CONTROL_BASE_URL;
const KEY = process.env.VOZLIA_ADMIN_KEY;

function requireEnv(name: string, value?: string) {
  if (!value) throw new Error(`Missing env var: ${name}`);
}

async function forward(req: Request, method: "GET" | "PATCH") {
  requireEnv("VOZLIA_CONTROL_BASE_URL", BASE);
  requireEnv("VOZLIA_ADMIN_KEY", KEY);

  const url = `${BASE}/admin/settings`;

  const headers: Record<string, string> = {
    "X-Vozlia-Admin-Key": KEY!,
    "Accept": "application/json",
  };

  let body: string | undefined;
  if (method === "PATCH") {
    headers["Content-Type"] = "application/json";
    body = await req.text();
  }

  const resp = await fetch(url, {
    method,
    headers,
    body,
    // keep it simple + predictable
    cache: "no-store",
  });

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") || "application/json" },
  });
}

export async function GET(req: Request) {
  return forward(req, "GET");
}

export async function PATCH(req: Request) {
  return forward(req, "PATCH");
}
