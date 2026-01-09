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
      total?: number;
      has_more?: boolean;
      next_offset?: number | null;
      nextOffset?: number | null;
    };

function normalizeList(payload: ListPayload): { rows: MemoryRow[]; total?: number; nextOffset: number | null } {
  if (Array.isArray(payload)) {
    return { rows: payload, nextOffset: null };
  }

  if (payload && typeof payload === "object") {
    const anyPayload = payload as any;
    const rows: MemoryRow[] = Array.isArray(anyPayload.items)
      ? anyPayload.items
      : Array.isArray(anyPayload.rows)
        ? anyPayload.rows
        : [];

    const total: number | undefined = typeof anyPayload.total === "number" ? anyPayload.total : undefined;

    const nextOffset =
      typeof anyPayload.next_offset === "number"
        ? anyPayload.next_offset
        : typeof anyPayload.nextOffset === "number"
          ? anyPayload.nextOffset
          : null;

    return { rows, total, nextOffset };
  }

  return { rows: [], nextOffset: null };
}

function formatCreated(ts?: string): string {
  if (!ts) return "—";
  const s = String(ts);

  // If the API returns an ISO timestamp *without* a timezone (e.g. 2026-01-08T01:56:05),
  // browsers will treat it as LOCAL time. Our DB/app timestamps are UTC, so we force UTC
  // by appending "Z" when no offset is present.
  const isoNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s);
  const d = new Date(isoNoTz ? `${s}Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

async function fetchJsonOrThrow<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  // Try to parse JSON if possible (some upstream errors return plain text)
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = data?.error || data?.detail || data?.message || text || "Request failed";
    throw new Error(`${url} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }

  if (data === null) {
    // some successful endpoints might return empty body; treat as empty object
    if (!text) return {} as T;
    throw new Error(`${url} returned non-JSON (HTTP ${res.status}). First bytes:\n${text.slice(0, 800)}`);
  }

  return data as T;
}

export default function AgentLongTermMemoryTable() {
  const [q, setQ] = useState("");
  const qTrim = useMemo(() => q.trim(), [q]);

  // Real debounce so we don't spam the API on every keystroke.
  const [qDebounced, setQDebounced] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(qTrim), 250);
    return () => clearTimeout(t);
  }, [qTrim]);

  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset to first page when the debounced search changes
  useEffect(() => {
    setOffset(0);
  }, [qDebounced, limit]);

  async function load(currentOffset: number) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(currentOffset));
      if (qDebounced) params.set("q", qDebounced);

      const payload = await fetchJsonOrThrow<ListPayload>(`/api/admin/memory/longterm?${params.toString()}`);
      const norm = normalizeList(payload);

      setRows(norm.rows);
      setTotal(norm.total);
      setNextOffset(norm.nextOffset ?? null);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
      setTotal(undefined);
      setNextOffset(null);
    } finally {
      setLoading(false);
    }
  }

  // Load whenever pagination/search changes
  useEffect(() => {
    load(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, limit, qDebounced]);

  async function onDelete(id: string) {
    if (!id) return;
    if (!confirm("Delete this memory row permanently?")) return;

    setDeletingId(id);
    setError(null);
    try {
      await fetchJsonOrThrow(`/api/admin/memory/longterm/${encodeURIComponent(id)}`, { method: "DELETE" });
      // reload current page (but if this page becomes empty, step back one page)
      const nextOff = offset > 0 && rows.length === 1 ? Math.max(0, offset - limit) : offset;
      if (nextOff !== offset) setOffset(nextOff);
      else await load(nextOff);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {error ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div className="alertTitle">Memory Bank Error</div>
          <div className="alertBody">{error}</div>
        </div>
      ) : null}

      <div className="form" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="fieldLabel">Search</div>
          <div className="fieldHelper">Server-side substring search across text/meta (debug).</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories…" />
        </div>

        <div className="actions" style={{ alignItems: "center" }}>
          <div className="muted">
            {loading ? "Loading…" : qDebounced ? `Searching: “${qDebounced}”` : "Latest rows"}
            {typeof total === "number" ? ` · Total: ${total}` : rows.length ? ` · Showing: ${rows.length}` : ""}
          </div>

          <div style={{ flex: 1 }} />

          <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Limit
            <select className="input" style={{ width: 120 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[25, 50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btnSecondary" onClick={() => load(offset)} disabled={loading}>
            Refresh
          </button>

          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setQ("");
              setQDebounced("");
            }}
            disabled={loading && !qDebounced}
          >
            Clear Search
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Created (local)</th>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 12 }}>
                  No memory rows found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>

                  <td>
                    <div className="mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
                      {r.tenant_id || "—"}
                    </div>
                    <div className="mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280, marginTop: 6 }}>
                      {r.caller_id || "—"}
                    </div>
                    {r.call_sid ? (
                      <div className="mono muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280, marginTop: 6 }}>
                        {r.call_sid}
                      </div>
                    ) : null}
                  </td>

                  <td>
                    <div className="mono">{r.skill_key || "—"}</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {r.kind || "—"}
                    </div>
                  </td>

                  {/* no truncation — wrap and show full text */}
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
                    <button type="button" className="btnSecondary" onClick={() => onDelete(r.id)} disabled={deletingId === r.id}>
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

      <div className="actions" style={{ marginTop: 12, justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="btnSecondary" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={loading || offset === 0}>
          Prev
        </button>

        <button
          type="button"
          className="btnSecondary"
          onClick={() => nextOffset !== null && setOffset(nextOffset)}
          disabled={loading || nextOffset === null}
        >
          Next
        </button>

        <div className="muted">Offset: {offset}</div>
      </div>
    </div>
  );
}
