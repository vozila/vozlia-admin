import React, { useEffect, useMemo, useState } from "react";

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

type ExportFormat = "ndjson" | "csv";

function nowMs() {
  return Date.now();
}
function minutesAgoMs(m: number) {
  return Date.now() - m * 60 * 1000;
}

function formatFileName(serviceName: string, minutes: number, fmt: ExportFormat) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `render-logs_${serviceName || "service"}_${minutes}min_${ts}.${fmt}`;
}

async function apiGet<T>(path: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const resp = await fetch(`${path}${qs}`, { method: "GET" });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`${resp.status} ${resp.statusText} ${t}`.trim());
  }
  return (await resp.json()) as T;
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

  const [cursor, setCursor] = useState<{ start_ms: number; end_ms: number; has_more: boolean } | null>(null);

  async function loadServices() {
    const data = await apiGet<{ services: RenderService[] }>("/api/admin/render/services");
    setServices(data.services || []);
  }

  async function loadInstances(svcId: string) {
    if (!svcId) return;
    const data = await apiGet<{ instances: RenderInstance[] }>(`/api/admin/render/services/${svcId}/instances`);
    setInstances(data.instances || []);
  }

  async function loadLogsFresh() {
    if (!serviceId) return;
    setBusy(true);
    setError(null);
    try {
      const end_ms = nowMs();
      const start_ms = minutesAgoMs(windowMin);

      const data = await apiGet<LogsResponse>("/api/admin/render/logs", {
        service_id: serviceId,
        instance_id: instanceId || "",
        start_ms: String(start_ms),
        end_ms: String(end_ms),
        q: search || "",
        limit: "300",
      });

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
      const data = await apiGet<LogsResponse>("/api/admin/render/logs", {
        service_id: serviceId,
        instance_id: instanceId || "",
        start_ms: String(cursor.start_ms),
        end_ms: String(cursor.end_ms),
        q: search || "",
        limit: "300",
        page: "next",
      });

      setRows((prev) => [...prev, ...(data.rows || [])]);
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

  async function downloadLast(minutes: number, format: ExportFormat = "ndjson") {
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
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Render Logs</h2>
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
            {[5, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                Last {m} minutes
              </option>
            ))}
          </select>
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
              onClick={() => downloadLast(m, "ndjson")}
              disabled={!serviceId || busyDl !== null}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: busyDl === m ? "#eee" : "#fff",
                cursor: !serviceId || busyDl !== null ? "not-allowed" : "pointer",
              }}
              title={`Download last ${m} minutes`}
            >
              {busyDl === m ? "Downloading…" : `Download ${m}m`}
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
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, color: "#444" }}>{r.ts || ""}</td>
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

        <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
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
