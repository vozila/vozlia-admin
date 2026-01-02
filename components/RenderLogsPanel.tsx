import React, { useEffect, useMemo, useState } from "react";

// Enable extra UI debug panel via NEXT_PUBLIC_DEBUG_UI=1 on Vercel
const DEBUG_UI: boolean = process.env.NEXT_PUBLIC_DEBUG_UI === "1";


function formatEastern(ts?: string) {
  if (!ts) return "";

  // If backend already returns "2025-12-30 11:23:45 EST", leave it alone
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

type LogRow = {
  ts?: string;
  level?: string;
  msg?: string;
  raw: string;
};

type LogsResponse = {
  service_id: string;
  instance_id?: string | null;
  start_ms: number;
  end_ms: number;
  rows: LogRow[];
  has_more?: boolean;
  next_start_ms?: number;
  next_end_ms?: number;
};

type RenderService = { id: string; name: string; type?: string };
type RenderInstance = { id: string; name?: string; status?: string };

type ExportFormat = "csv";

function nowMs() {
  return Date.now();
}
function minutesAgoMs(m: number) {
  return Date.now() - m * 60 * 1000;
}


const WINDOW_OPTIONS: { label: string; minutes: number }[] = [
  { label: "Last 5 minutes", minutes: 5 },
  { label: "Last 15 minutes", minutes: 15 },
  { label: "Last 30 minutes", minutes: 30 },
  { label: "Last 60 minutes", minutes: 60 },

  { label: "Last 6 hours", minutes: 6 * 60 },
  { label: "Last 12 hours", minutes: 12 * 60 },
  { label: "Last 24 hours", minutes: 24 * 60 },
  { label: "Last 1 day", minutes: 24 * 60 },

  { label: "Last 3 days", minutes: 3 * 24 * 60 },
  { label: "Last 1 week", minutes: 7 * 24 * 60 },
  // Approximate month = 30 days
  { label: "Last 1 month", minutes: 30 * 24 * 60 },
];


function formatFileName(serviceName: string, minutes: number, fmt: ExportFormat) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `render-logs_${serviceName || "service"}_${minutes}min_${ts}.${fmt}`;
}

async function apiGet<T>(
  path: string,
  params?: Record<string, string>,
  onTrace?: (trace: string) => void
): Promise<{ status: number; data: T }> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const resp = await fetch(`${path}${qs}`, { method: "GET" });
  const trace = resp.headers.get("x-vozlia-trace") || resp.headers.get("X-Vozlia-Trace") || "";
  if (trace && onTrace) onTrace(trace);

  const contentType = resp.headers.get("content-type") || "";
  const raw = await resp.text();

  let data: any = raw;
  if (contentType.includes("application/json")) {
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: "bad_json", raw };
    }
  }

  return { status: resp.status, data: data as T };
}

export function RenderLogsPanel() {
  const [services, setServices] = useState<RenderService[]>([]);
  const [instances, setInstances] = useState<RenderInstance[]>([]);

  const [serviceId, setServiceId] = useState<string>("");
  const [serviceName, setServiceName] = useState<string>("");

  const [instanceId, setInstanceId] = useState<string>(""); // optional

  const [windowMin, setWindowMin] = useState<number>(15);
  const [search, setSearch] = useState<string>("");

  const [rows, setRows] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [busyDl, setBusyDl] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<string>("");

  const [cursor, setCursor] = useState<{ start_ms: number; end_ms: number; has_more: boolean } | null>(null);

  async function loadServices() {
    const { status, data } = await apiGet<{ services: RenderService[]; trace?: string }>("/api/admin/render/services", undefined, setLastTrace);
      if (status >= 400) throw new Error(`services_fetch_failed status=${status} ${JSON.stringify(data)}`);
    setServices(data.services || []);
  }

  async function loadInstances(svcId: string) {
    if (!svcId) return;
    const { status, data } = await apiGet<{ instances: RenderInstance[]; trace?: string }>(`/api/admin/render/services/${svcId}/instances`, undefined, setLastTrace);
      if (status >= 400) throw new Error(`instances_fetch_failed status=${status} ${JSON.stringify(data)}`);
    setInstances(data.instances || []);
  }

  async function loadLogsFresh() {
    if (!serviceId) return;
    setBusy(true);
    setError(null);
    try {
      const end_ms = nowMs();
      const start_ms = minutesAgoMs(windowMin);

      const { status, data } = await apiGet<LogsResponse & { trace?: string }>("/api/admin/render/logs", {
        service_id: serviceId,
        instance_id: instanceId || "",
        start_ms: String(start_ms),
        end_ms: String(end_ms),
        q: search || "",
        limit: "300",
      }, setLastTrace);
      if (status >= 400) throw new Error(`logs_fetch_failed status=${status} ${JSON.stringify(data)}`);

      setRows(data.rows || []);
      setCursor({
        start_ms: data.next_start_ms ?? data.start_ms,
        end_ms: data.next_end_ms ?? data.end_ms,
        has_more: !!data.has_more,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  
  async function loadMore() {
    if (!serviceId || !cursor?.has_more) return;
    setBusy(true);
    setError(null);
    try {
      let backoffMs = 600;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { status, data } = await apiGet<LogsResponse & { trace?: string }>(
          "/api/admin/render/logs",
          {
            service_id: serviceId,
            instance_id: instanceId || "",
            start_ms: String(cursor.start_ms),
            end_ms: String(cursor.end_ms),
            q: search || "",
            limit: "300",
            page: "next",
          },
          setLastTrace
        );

        if (status === 429) {
          setError(`Rate limited by Render. Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 8000);
          continue;
        }

        if (status >= 400) throw new Error(`logs_fetch_failed status=${status} ${JSON.stringify(data)}`);

        setRows((prev) => [...prev, ...(data.rows || [])]);
        setCursor({
          start_ms: data.next_start_ms ?? data.start_ms,
          end_ms: data.next_end_ms ?? data.end_ms,
          has_more: !!data.has_more,
        });
        setError(null);
        break;
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }


  
  async function loadAll() {
    if (!serviceId) return;
    if (!cursor?.has_more) return;

    setBusy(true);
    setError(null);

    let backoffMs = 600; // base backoff for 429
    try {
      let pages = 0;
      let cur = cursor;

      while (cur?.has_more) {
        pages += 1;
        if (pages > 50) {
          // safety cap: prevents runaway loading for very large windows
          setError("Stopped after 50 pages (safety cap). Narrow the time window or refine search.");
          break;
        }

        const { status, data } = await apiGet<LogsResponse & { trace?: string }>(
          "/api/admin/render/logs",
          {
            service_id: serviceId,
            instance_id: instanceId || "",
            start_ms: String(cur.start_ms),
            end_ms: String(cur.end_ms),
            q: search || "",
            limit: "300",
            page: "next",
          },
          setLastTrace
        );

        if (status === 429) {
          // Render rate limit: back off and retry same page window
          setError(`Rate limited by Render. Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 8000);
          continue;
        }

        if (status >= 400) throw new Error(`logs_fetch_failed status=${status} ${JSON.stringify(data)}`);

        // success: reset backoff
        backoffMs = 600;
        setError(null);

        setRows((prev) => [...prev, ...(data.rows || [])]);

        const nextCur = {
          start_ms: data.next_start_ms ?? data.start_ms,
          end_ms: data.next_end_ms ?? data.end_ms,
          has_more: !!data.has_more,
        };
        setCursor(nextCur);
        cur = nextCur;

        // small pacing to avoid hitting upstream limits
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }



  async function downloadLast(minutes: number, format: ExportFormat = "csv") {
    if (!serviceId) return;
    setBusyDl(minutes);
    setError(null);
    try {
      const end_ms = nowMs();
      const start_ms = minutesAgoMs(minutes);

      const params = new URLSearchParams({
        service_id: serviceId,
        start_ms: String(start_ms),
        end_ms: String(end_ms),
        format,
        q: search || "",
      });
      if (instanceId) params.set("instance_id", instanceId);

      const url = `/api/admin/render/logs/export?${params.toString()}`;
      const resp = await fetch(url, { method: "GET" });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Export failed (${resp.status}): ${t || resp.statusText}`);
      }

      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = formatFileName(serviceName || serviceId, minutes, format);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyDl(null);
    }
  }

  
  function downloadLoadedRows() {
    if (!serviceId) return;
    if (!rows.length) {
      setError("No rows loaded to download.");
      return;
    }
    setError(null);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fname = `render-logs_${(serviceName || serviceId).replace(/[^a-zA-Z0-9_-]+/g, "_")}_table_${ts}.csv`;

    const csvEscape = (v: any) => {
      const s = String(v ?? "");
      const needs = /[",\n\r]/.test(s);
      const inner = s.replace(/"/g, '""');
      return needs ? `"${inner}"` : inner;
    };

    let payload = "ts,level,msg,raw\n";
    for (const r of rows) {
      payload += [
        csvEscape(r.ts || ""),
        csvEscape(r.level || ""),
        csvEscape(r.msg || ""),
        csvEscape(r.raw || ""),
      ].join(",") + "\n";
    }

    const blob = new Blob([payload], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }


  useEffect(() => {
    loadServices().catch((e) => setError(e?.message ?? String(e)));
  }, []);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  useEffect(() => {
    if (selectedService?.name) setServiceName(selectedService.name);
  }, [selectedService]);

  useEffect(() => {
    if (!serviceId) return;
    setRows([]);
    setCursor(null);
    setInstanceId("");
    loadInstances(serviceId).catch((e) => setError(e?.message ?? String(e)));
  }, [serviceId]);

  const canQuery = !!serviceId && !busy;

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      {error ? (
        <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">Logs panel error</div>
          <div className="font-mono text-xs break-all">{error}</div>
        </div>
      ) : null}
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Render Logs</h2>{DEBUG_UI && (
  <div style={{ marginTop: 8, padding: 8, border: "1px solid #ddd", borderRadius: 8, fontSize: 12 }}>
    <div><b>debug</b></div>
    <div>lastTrace: <code>{lastTrace || "-"}</code></div>
    <div>services: {services.length} | instances: {instances.length} | rows: {rows.length}</div>
    <div>serviceId: <code>{serviceId || "-"}</code> | instanceId: <code>{instanceId || "-"}</code></div>
    {error && <div style={{ color: "crimson" }}>error: {error}</div>}
  </div>
)}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Service</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}
          >
            <option value="">Select service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.type ? `(${s.type})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Instance (optional)</label>
          <select
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            disabled={!serviceId}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 220 }}
          >
            <option value="">All instances</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name || i.id} {i.status ? `(${i.status})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Window</label>
          <select
            value={windowMin}
            onChange={(e) => setWindowMin(parseInt(e.target.value, 10))}
            disabled={!serviceId}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.minutes}>
                {opt.label}
              </option>
            ))}</select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", minWidth: 260 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!serviceId}
            placeholder="e.g. ERROR, call_sid, /assistant/route"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <button
          onClick={loadLogsFresh}
          disabled={!canQuery}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: busy ? "#eee" : "#111",
            color: busy ? "#666" : "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Loading…" : "Refresh"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[5, 15, 30, 60].map((m) => (
            <button
              key={m}
              onClick={() => downloadLast(m, "csv")}
              disabled={!serviceId || busyDl !== null}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: busyDl === m ? "#eee" : "#fff",
                cursor: !serviceId || busyDl !== null ? "not-allowed" : "pointer",
              }}
              title={`Download CSV for last ${m} minutes`}
            >
              {busyDl === m ? "Downloading…" : `Download CSV ${m}m`}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, background: "#fee", border: "1px solid #f99", borderRadius: 8 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 10, background: "#fafafa", display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
          <span>{rows.length} rows{selectedService ? ` • ${selectedService.name}` : ""}{instanceId ? ` • instance ${instanceId}` : ""}</span>
          <span style={{ fontFamily: "monospace" }}>{new Date().toLocaleString()}</span>
        </div>

        <div style={{ maxHeight: 520, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #eee" }}>
              <tr>
                <th style={{ textAlign: "left", padding: 8, width: 230, fontSize: 12 }}>Time</th>
                <th style={{ textAlign: "left", padding: 8, width: 90, fontSize: 12 }}>Level</th>
                <th style={{ textAlign: "left", padding: 8, fontSize: 12 }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, color: "#444" }}>{formatEastern(r.ts)}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{r.level || ""}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, wordBreak: "break-word" }} title={r.raw}>
                    {r.msg || r.raw}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={3} style={{ padding: 12, color: "#666" }}>
                    Select a service and click Refresh.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 10, display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
          <button


                      onClick={() => downloadLoadedRows()}


                      disabled={!rows.length || busy || busyDl !== null}


                      style={{


                        padding: "10px 14px",


                        borderRadius: 10,


                        border: "1px solid #ccc",


                        background: !rows.length || busy || busyDl !== null ? "#eee" : "#fff",


                        cursor: !rows.length || busy || busyDl !== null ? "not-allowed" : "pointer",


                      }}


                      title={rows.length ? `Download ${rows.length} loaded rows` : "No rows loaded"}


                    >


                      Download table


                    </button>
          <button
            onClick={loadAll}
            disabled={!cursor?.has_more || busy}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: !cursor?.has_more || busy ? "#eee" : "#fff",
              cursor: !cursor?.has_more || busy ? "not-allowed" : "pointer",
            }}
            title="Load all pages for the selected window (may take a while)"
          >
            Load all
          </button>





          <button
            onClick={loadMore}
            disabled={!cursor?.has_more || busy}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: !cursor?.has_more || busy ? "#eee" : "#fff",
              cursor: !cursor?.has_more || busy ? "not-allowed" : "pointer",
            }}
          >
            Load more
          </button>
        </div>
      </div>
    </section>
  );
}
