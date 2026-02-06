import { useEffect, useMemo, useRef, useState } from "react";

type RenderService = {
  id: string;
  name?: string;
  type?: string;
  region?: string;
  service_details?: any;
};

type RenderLogRow = {
  ts: string;
  level: string;
  msg: string;
  raw?: string;
};

type RenderLogsOut = {
  service_id: string;
  instance_id: string | null;
  start_ms: number;
  end_ms: number;
  rows: RenderLogRow[];
  has_more: boolean;
  next_start_ms?: number | null;
  next_end_ms?: number | null;
};

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function RenderLogsPanel() {
  const [services, setServices] = useState<RenderService[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(15);
  const [limit, setLimit] = useState<number>(500);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<RenderLogsOut | null>(null);

  const timerRef = useRef<any>(null);

  const timeRange = useMemo(() => {
    const end = Date.now();
    const start = end - Math.max(1, minutes) * 60_000;
    return { start, end };
  }, [minutes]);

  async function loadServices() {
    setError(null);
    try {
      const r = await fetch(`/api/admin/render/services`, { method: "GET" });
      const text = await r.text();
      const j = safeJsonParse(text);

      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
      }

      const list: RenderService[] = Array.isArray(j) ? j : (j?.services ?? []);
      setServices(list);

      if (!serviceId && list.length) {
        // Prefer vozlia services if present
        const preferred = list.find((s) => (s.name || "").includes("vozlia-backend"))
          ?? list.find((s) => (s.name || "").includes("vozlia-control"))
          ?? list[0];
        setServiceId(preferred.id);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function loadLogs(forceServiceId?: string) {
    const sid = forceServiceId ?? serviceId;
    if (!sid) return;

    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({
        service_id: sid,
        start_ms: String(timeRange.start),
        end_ms: String(timeRange.end),
        limit: String(Math.max(50, limit)),
      });

      const r = await fetch(`/api/admin/render/logs?${qs.toString()}`, { method: "GET" });
      const text = await r.text();
      const j = safeJsonParse(text);

      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`);
      }

      setLogs(j as RenderLogsOut);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Load logs whenever the service/time window changes
    if (serviceId) loadLogs(serviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, timeRange.start, timeRange.end, limit]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!autoRefresh) return;

    timerRef.current = setInterval(() => {
      loadLogs();
    }, 10_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, serviceId, timeRange.start, timeRange.end, limit]);

  const rows = logs?.rows ?? [];

  return (
    <div style={{ border: "1px solid #333", borderRadius: 8, padding: 12, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Render Logs</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Service</span>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={{ minWidth: 240 }}>
              <option value="" disabled>
                Select…
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Window</span>
            <input
              type="number"
              value={minutes}
              min={1}
              max={240}
              onChange={(e) => setMinutes(Number(e.target.value))}
              style={{ width: 80 }}
            />
            <span>min</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Limit</span>
            <input
              type="number"
              value={limit}
              min={50}
              max={2000}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ width: 90 }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <span>Auto refresh</span>
          </label>

          <button onClick={() => loadLogs()} disabled={!serviceId || loading} style={{ padding: "6px 10px" }}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button onClick={() => loadServices()} style={{ padding: "6px 10px" }}>
            Reload services
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 10, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
        Showing {rows.length} log rows{logs?.has_more ? " (more available)" : ""}.
      </div>

      <pre
        style={{
          marginTop: 10,
          maxHeight: 520,
          overflow: "auto",
          background: "#0b0b0b",
          border: "1px solid #222",
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {rows.length
          ? rows
              .map((r) => {
                const ts = r.ts ? new Date(r.ts).toISOString() : "";
                const lvl = (r.level || "").toUpperCase().padEnd(5, " ");
                const msg = r.msg || r.raw || "";
                return `${ts} ${lvl} ${msg}`;
              })
              .join("\n")
          : "No logs in the selected window."}
      </pre>
    </div>
  );
}
