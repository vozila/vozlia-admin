import { NextResponse } from "next/server";

const CONTROL_BASE = process.env.VOZLIA_CONTROL_BASE_URL;
const ADMIN_KEY = process.env.VOZLIA_ADMIN_KEY;

function requireEnv() {
  if (!CONTROL_BASE) {
    return NextResponse.json(
      { detail: "Missing VOZLIA_CONTROL_BASE_URL env var" },
      { status: 500 }
    );
  }
  if (!ADMIN_KEY) {
    return NextResponse.json(
      { detail: "Missing VOZLIA_ADMIN_KEY env var" },
      { status: 500 }
    );
  }
  return null;
}

function controlUrl(path: string) {
  return `${CONTROL_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function GET() {
  const envErr = requireEnv();
  if (envErr) return envErr;

  const r = await fetch(controlUrl("/admin/settings"), {
    headers: {
      "X-Vozlia-Admin-Key": ADMIN_KEY!,
    },
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: Request) {
  const envErr = requireEnv();
  if (envErr) return envErr;

  const body = await req.text();

  const r = await fetch(controlUrl("/admin/settings"), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Vozlia-Admin-Key": ADMIN_KEY!,
    },
    body,
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
  });
}
