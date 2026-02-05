import React, { useEffect, useMemo, useState } from "react";

/**
 * Minimal Render Logs panel.
 *
 * This file exists to keep the Admin page buildable even if the repo didn't previously
 * include a RenderLogsPanel component.
 *
 * It is safe if unused (renders nothing unless DEBUG_UI is enabled).
 */
const DEBUG_UI: boolean = process.env.NEXT_PUBLIC_DEBUG_UI === "1";

type LogRow = {
  ts?: string;
  level?: string;
  msg?: string;
  raw: string;
};

function formatEastern(ts?: string) {
  if (!ts) return "";
  if (!ts.includes("T")) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
}

export function RenderLogsPanel() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // In most deployments this is not essential; keep behind a flag.
  const shouldShow = DEBUG_UI;

  const summary = useMemo(() => {
    if (!rows.length) return "";
    const last = rows[0];
    return `${rows.length} lines (latest: ${formatEastern(last.ts)})`;
  }, [rows]);

  useEffect(() => {
    if (!shouldShow) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        // Optional endpoint; if it doesn't exist, just show empty panel.
        const r = await fetch("/api/admin/render/logs?service=control&tail=100");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const items: LogRow[] = Array.isArray(j?.rows) ? j.rows : [];
        if (!cancelled) setRows(items);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div style={{ border: "1px solid #333", padding: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>Render Logs (debug)</div>
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          {loading ? "Loading…" : err ? `Error: ${err}` : summary}
        </div>
      </div>

      <pre style={{ marginTop: 10, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>
        {rows.map((r, i) => {
          const ts = r.ts ? formatEastern(r.ts) : "";
          const lvl = r.level ? `[${r.level}] ` : "";
          const msg = r.msg ?? r.raw;
          return `${ts} ${lvl}${msg}`.trim();
        }).join("\n")}
      </pre>
    </div>
  );
}

export default RenderLogsPanel;
