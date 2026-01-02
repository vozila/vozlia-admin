import React, { useEffect, useMemo, useState } from "react";

type LogRow = {
  ts?: string;
  message?: string;
  level?: string;
};

type LogsResponse = {
  rows?: LogRow[];
  has_more?: boolean;
  next_start_ms?: number;
  next_end_ms?: number;
  trace?: string;
  error?: string;
  [k: string]: any;
};

type RenderService = { id: string; name: string; type?: string };
type RenderInstance = { id: string; name?: string; status?: string };

function nowMs() {
  return Date.now();
}

function msAgo(ms: number) {
  return nowMs() - ms;
}

function fmtTs(ts?: string) {
  if (!ts) return "";
  // If backend already provides a nice string, keep it
  if (!ts.includes("T")) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function RenderLogsPanel() {
  const [services, setServices] = useState<RenderService[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [instances, setInstances] = useState<RenderInstance[]>([]);
  const [instanceId, setInstanceId] = useState<string>("");

  const [startMs, setStartMs] = useState<number>(msAgo(15 * 60 * 1000));
  const [endMs, setEndMs] = useState<number>(nowMs());
  const [limit, setLimit] = useState<number>(200);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const serviceOptions = useMemo(() => services.slice().sort((a, b) => a.name.localeCompare(b.name)), [services]);

  async function loadServices() {
    const res = await fetch("/api/admin/render/services?limit=50");
    const data = await res.json();
    const list: RenderService[] = Array.isArray(data?.services) ? data.services : Array.isArray(data) ? data : [];
    setServices(list);

    if (!serviceId && list.length) {
      setServiceId(list[0].id);
    }
  }

  async function loadInstances(sid: string) {
    if (!sid) return;
    const res = await fetch(`/api/admin/render/services/${encodeURIComponent(sid)}/instances?limit=50`);
    const data = await res.json();
    const list: RenderInstance[] = Array.isArray(data?.instances) ? data.instances : Array.isArray(data) ? data : [];
    setInstances(list);
    if (list.length) setInstanceId(list[0].id);
  }

  async function loadLogs() {
    if (!serviceId) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/render/logs", window.location.origin);
      url.searchParams.set("service_id", serviceId);
      if (instanceId) url.searchParams.set("instance_id", instanceId);
      url.searchParams.set("start_ms", String(startMs));
      url.searchParams.set("end_ms", String(endMs));
      url.searchParams.set("limit", String(limit));

      const res = await fetch(url.toString());
      const data: LogsResponse = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load logs");
      const out: LogRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(out);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    loadInstances(serviceId).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  return (
    <div className="rlp">
      {error ? <div className="rlpErr">{error}</div> : null}

      <div className="rlpRow">
        <label className="rlpLabel">
          Service
          <select className="rlpSel" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {serviceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.type ? `(${s.type})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="rlpLabel">
          Instance
          <select className="rlpSel" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
            <option value="">(any)</option>
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name || inst.id} {inst.status ? `(${inst.status})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="rlpLabel">
          Limit
          <input className="rlpInp" type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value || "200", 10))} />
        </label>
      </div>

      <div className="rlpRow">
        <button
          className="rlpBtn"
          onClick={() => {
            setStartMs(msAgo(15 * 60 * 1000));
            setEndMs(nowMs());
          }}
        >
          Last 15m
        </button>
        <button
          className="rlpBtn"
          onClick={() => {
            setStartMs(msAgo(60 * 60 * 1000));
            setEndMs(nowMs());
          }}
        >
          Last 60m
        </button>
        <button
          className="rlpBtn primary"
          disabled={loading || !serviceId}
          onClick={() => {
            setEndMs(nowMs());
            loadLogs();
          }}
        >
          {loading ? "Loading..." : "Load logs"}
        </button>
      </div>

      <div className="rlpTable">
        {rows.length === 0 ? (
          <div className="rlpEmpty">No log rows loaded.</div>
        ) : (
          rows.map((r, idx) => (
            <div key={idx} className="rlpLine">
              <span className="rlpTs">{fmtTs(r.ts)}</span>
              <span className="rlpMsg">{r.message || ""}</span>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .rlp { border:1px solid #1f2740; border-radius:14px; padding:12px; background:#0e1322; }
        .rlpRow { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin-bottom:10px; }
        .rlpLabel { display:flex; flex-direction:column; gap:6px; font-size:12px; opacity:.9; }
        .rlpSel, .rlpInp { min-width: 220px; padding:8px 10px; border-radius:10px; border:1px solid #2a334d; background:#0b0e14; color:#e6e6e6; }
        .rlpInp { min-width: 90px; width: 90px; }
        .rlpBtn { padding:8px 10px; border-radius:10px; border:1px solid #2a334d; background:#121726; color:#e6e6e6; cursor:pointer; font-weight:800; }
        .rlpBtn.primary { background:#2b7cff; border-color:#2b7cff; color:white; }
        .rlpBtn:disabled { opacity:.6; cursor:not-allowed; }
        .rlpErr { background:#2a1212; border:1px solid #5a1d1d; padding:10px; border-radius:12px; margin-bottom:10px; font-size:13px; }
        .rlpTable { max-height: 520px; overflow:auto; border-top:1px solid #1f2740; padding-top:10px; }
        .rlpLine { display:flex; gap:10px; padding:6px 0; border-bottom:1px dashed rgba(42,51,77,.6); }
        .rlpTs { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; opacity:.75; min-width: 160px; }
        .rlpMsg { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; white-space:pre-wrap; }
        .rlpEmpty { opacity:.7; font-size:13px; padding:10px 0; }
      `}</style>
    </div>
  );
}
