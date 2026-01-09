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
      has_more?: boolean;
    };

function normalizeList(payload: ListPayload): { rows: MemoryRow[]; total?: number; nextOffset: number | null } {
  // Support a few common shapes so the UI stays resilient while endpoints evolve.
  if (Array.isArray(payload)) return { rows: payload, nextOffset: null };

  const anyPayload = payload as any;
  const rows =
    (Array.isArray(anyPayload?.items) && anyPayload.items) ||
    (Array.isArray(anyPayload?.rows) && anyPayload.rows) ||
    (Array.isArray(anyPayload?.data) && anyPayload.data) ||
    [];

  const total = typeof anyPayload?.total === "number" ? anyPayload.total : undefined;

  // Prefer explicit next_offset. If absent but has_more=true, assume simple offset pagination.
  const nextOffset =
    typeof anyPayload?.next_offset === "number"
      ? anyPayload.next_offset
      : anyPayload?.has_more
        ? (typeof anyPayload?.offset === "number" && typeof anyPayload?.limit === "number"
            ? anyPayload.offset + anyPayload.limit
            : null)
        : null;

  return { rows, total, nextOffset };
}

async function fetchJsonOrThrow<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.detail || data.message)) ||
      (text ? text.slice(0, 800) : res.statusText) ||
      `HTTP ${res.status}`;
    throw new Error(`${url} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }

  if (data === null) {
    if (!text) return {} as T;
    throw new Error(`${url} returned non-JSON (HTTP ${res.status}). First bytes:\n${text.slice(0, 800)}`);
  }

  return data as T;
}

export default function AgentLongTermMemoryTable() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input to avoid firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Whenever the search term or page size changes, go back to page 1.
  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, limit]);

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
      setNextOffset(norm.nextOffset);
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, limit, debouncedQ]);

  async function onDelete(id: string) {
    const ok = window.confirm("Delete this long-term memory row? This cannot be undone.");
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

  const showingLabel = useMemo(() => {
    const base = `Showing ${rows.length}`;
    const totalStr = typeof total === "number" ? ` of ${total}` : "";
    return `${base}${totalStr}`;
  }, [rows.length, total]);

  const canPrev = offset > 0;
  const canNext = nextOffset !== null;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search text, skill, call SID, kind, tenant/caller IDs…"
            className="input"
            style={{ minWidth: 320 }}
          />
        </label>

        <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Page size
          <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10) || 50)} className="input">
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="muted">{showingLabel}</div>

        <button type="button" className="btnSecondary" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="error" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Created</th>
              <th style={{ minWidth: 220 }}>Tenant / Caller</th>
              <th style={{ minWidth: 140 }}>Skill / Kind</th>
              <th style={{ minWidth: 520 }}>Text</th>
              <th style={{ minWidth: 140 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 12 }}>
                  Loading…
                </td>
              </tr>
            ) : null}

            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 12 }}>
                  No rows found.
                </td>
              </tr>
            ) : null}

            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>

                <td>
                  <div className="mono">{r.tenant_id || "—"}</div>
                  <div className="mono muted">{r.caller_id || "—"}</div>
                  {r.call_sid ? <div className="mono muted">SID: {r.call_sid}</div> : null}
                </td>

                <td>
                  <div className="mono">{r.skill_key || "—"}</div>
                  <div className="muted">{r.kind || "—"}</div>
                </td>

                {/* No truncation — wrap and show full text */}
                <td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {r.text || "—"}
                  {r.tags_json || r.data_json ? (
                    <details style={{ marginTop: 8 }}>
                      <summary className="muted" style={{ cursor: "pointer" }}>
                        JSON
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
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <button
          type="button"
          className="btnSecondary"
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          disabled={loading || !canPrev}
        >
          Prev
        </button>

        <button
          type="button"
          className="btnSecondary"
          onClick={() => canNext && setOffset(nextOffset!)}
          disabled={loading || !canNext}
        >
          Next
        </button>

        <div className="muted">Offset: {offset}</div>
      </div>
    </div>
  );
}
