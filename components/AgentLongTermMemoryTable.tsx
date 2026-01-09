import { useEffect, useMemo, useState } from "react";

type MemoryRow = {
  id: string;
  created_at?: string;
  tenant_id?: string;
  caller_id?: string;
  call_sid?: string | null;
  kind?: string;
  skill_key?: string;
  text?: string;
  data_json?: any;
  tags_json?: any;
};

type ListPayload =
  | MemoryRow[]
  | {
      items?: MemoryRow[];
      rows?: MemoryRow[];
      data?: MemoryRow[];
      total?: number;
      next_offset?: number | null;
      offset?: number;
      limit?: number;
    };

function normalizeList(payload: ListPayload): { rows: MemoryRow[]; total?: number; nextOffset: number | null } {
  if (Array.isArray(payload)) return { rows: payload, nextOffset: null };

  const anyPayload = payload as any;
  const rows =
    (Array.isArray(anyPayload?.items) && anyPayload.items) ||
    (Array.isArray(anyPayload?.rows) && anyPayload.rows) ||
    (Array.isArray(anyPayload?.data) && anyPayload.data) ||
    [];

  const total = typeof anyPayload?.total === "number" ? anyPayload.total : undefined;
  const nextOffset = typeof anyPayload?.next_offset === "number" ? anyPayload.next_offset : null;

  return { rows, total, nextOffset };
}

async function fetchJsonOrThrow<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  // Always read as text first so we can handle "Internal Server Error" bodies safely.
  const text = await res.text();

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  // If upstream returned an error, surface a useful message.
  if (!res.ok) {
    const msg =
      (data && (data.error || data.detail || data.message)) ||
      (text ? text.slice(0, 500) : res.statusText) ||
      `HTTP ${res.status}`;

    throw new Error(`${url} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }

  // Success responses should be JSON for these endpoints.
  if (data === null) {
    throw new Error(`${url} returned non-JSON (HTTP ${res.status}). First bytes:\n${text.slice(0, 500)}`);
  }

  return data as T;
}

export default function AgentLongTermMemoryTable() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce search so we don't spam the API.
  const debouncedQ = useMemo(() => q.trim(), [q]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (debouncedQ) params.set("q", debouncedQ);

      const payload = await fetchJsonOrThrow<ListPayload>(`/api/admin/memory/longterm?${params.toString()}`);
      const norm = normalizeList(payload);

      setRows(norm.rows);
      setTotal(norm.total);
      setNextOffset(norm.nextOffset ?? null); // <- build-safe (never undefined)
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
      setTotal(undefined);
      setNextOffset(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      // Reset to first page when searching
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [debouncedQ]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, limit, offset]);

  async function onDelete(id: string) {
    const ok = confirm("Delete this memory row permanently? This cannot be undone.");
    if (!ok) return;

    setDeletingId(id);
    setError(null);
    try {
      await fetchJsonOrThrow(`/api/admin/memory/longterm/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panelTitle">Agent Long-Term Memory (Debug)</div>
      <div className="panelSub">
        Backed by the persistent <span className="mono">caller_memory_events</span> table via the Control Plane API.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search text / caller / skill / call sid…"
          className="input"
          style={{ minWidth: 260, flex: "1 1 260px" }}
        />

        <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Limit
          <select className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btnSecondary" onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="panel" style={{ marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}>
          <div className="panelTitle" style={{ color: "#b91c1c" }}>
            Error
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{error}</pre>
        </div>
      ) : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 120 }}>Created</th>
              <th style={{ minWidth: 220 }}>Tenant / Caller</th>
              <th style={{ minWidth: 140 }}>Skill / Kind</th>
              <th style={{ minWidth: 420 }}>Text</th>
              <th style={{ minWidth: 180 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No memory rows found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>

                  <td style={{ minWidth: 0 }}>
                    <div className="mono" style={{ whiteSpace: "nowrap" }}>
                      {r.tenant_id || "—"}
                    </div>
                    <div className="mono" style={{ whiteSpace: "nowrap", marginTop: 4 }}>
                      {r.caller_id || "—"}
                    </div>
                    {r.call_sid ? (
                      <div className="muted mono" style={{ marginTop: 4 }}>
                        {r.call_sid}
                      </div>
                    ) : null}
                  </td>

                  <td>
                    <div className="mono" style={{ whiteSpace: "nowrap" }}>
                      {r.skill_key || "—"}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {r.kind || "—"}
                    </div>
                  </td>

                  {/* No truncation: wrap and show full text */}
                  <td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {r.text || "—"}
                    {r.tags_json || r.data_json ? (
                      <details style={{ marginTop: 8 }}>
                        <summary className="muted" style={{ cursor: "pointer" }}>
                          meta
                        </summary>
                        <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify({ tags_json: r.tags_json, data_json: r.data_json }, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btnSecondary"
                      onClick={() => onDelete(r.id)}
                      disabled={deletingId === r.id}
                    >
                      {deletingId === r.id ? "Deleting…" : "Delete"}
                    </button>
                    <div className="muted mono" style={{ marginTop: 6 }}>
                      {r.id}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <button type="button" className="btnSecondary" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={loading || offset === 0}>
          Prev
        </button>

        <button
          type="button"
          className="btnSecondary"
          onClick={() => setOffset((o) => o + limit)}
          disabled={loading || (rows.length < limit && nextOffset === null)}
        >
          Next
        </button>

        <div className="muted">
          Offset: {offset}
          {typeof total === "number" ? ` · Total: ${total}` : ""}
        </div>
      </div>
    </div>
  );
}
