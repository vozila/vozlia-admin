import React, { useEffect, useMemo, useState } from "react";

type MemoryRow = {
  id: string;
  created_at: string;
  tenant_id: string;
  caller_id: string;
  call_sid?: string | null;
  kind: string;
  skill_key: string;
  text: string;
  data_json?: any;
  tags_json?: any;
};

type ListResp = {
  items: MemoryRow[];
  has_more?: boolean;
  next_offset?: number | null;
};

function fmtTs(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function AgentLongTermMemoryTable() {
  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [callerId, setCallerId] = useState("");
  const [skillKey, setSkillKey] = useState("");
  const [kind, setKind] = useState("");

  const [limit, setLimit] = useState(100);

  const [items, setItems] = useState<MemoryRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = useMemo(() => {
    return JSON.stringify({
      q: q.trim(),
      tenant_id: tenantId.trim(),
      caller_id: callerId.trim(),
      skill_key: skillKey.trim(),
      kind: kind.trim(),
      limit,
    });
  }, [q, tenantId, callerId, skillKey, kind, limit]);

  function buildUrl(offset: number) {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));

    if (q.trim()) p.set("q", q.trim());
    if (tenantId.trim()) p.set("tenant_id", tenantId.trim());
    if (callerId.trim()) p.set("caller_id", callerId.trim());
    if (skillKey.trim()) p.set("skill_key", skillKey.trim());
    if (kind.trim()) p.set("kind", kind.trim());

    return `/api/admin/memory/longterm?${p.toString()}`;
  }

  async function loadFirstPage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(0));
      const text = await res.text();

      let data: ListResp | any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Bad JSON from /api/admin/memory/longterm (status ${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setHasMore(!!data.has_more);
      setNextOffset(typeof data.next_offset === "number" ? data.next_offset : null);
    } catch (e: any) {
      setError(e?.message || String(e));
      setItems([]);
      setHasMore(false);
      setNextOffset(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!hasMore || nextOffset == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(nextOffset));
      const text = await res.text();

      let data: ListResp | any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Bad JSON from /api/admin/memory/longterm (status ${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      const newItems = Array.isArray(data.items) ? data.items : [];
      setItems((cur) => [...cur, ...newItems]);
      setHasMore(!!data.has_more);
      setNextOffset(typeof data.next_offset === "number" ? data.next_offset : null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(id: string) {
    const ok = confirm("Delete this long-term memory row? This is permanent.");
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/memory/longterm/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // ignore
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      setItems((cur) => cur.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      loadFirstPage();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return (
    <div>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="fieldLabel">Search</div>
          <div className="fieldHelper">Substring match across text, skill_key, caller_id, call_sid, tenant_id.</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 'pricing' or a caller ID" />
        </div>

        <div className="field">
          <div className="fieldLabel">Tenant ID (optional)</div>
          <div className="fieldHelper">Useful if you have multiple tenants sharing the same DB.</div>
          <input className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant UUID" />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="fieldLabel">Caller ID (optional)</div>
          <input className="input" value={callerId} onChange={(e) => setCallerId(e.target.value)} placeholder="caller id / phone hash / etc" />
        </div>

        <div className="field">
          <div className="fieldLabel">Skill Key (optional)</div>
          <input className="input" value={skillKey} onChange={(e) => setSkillKey(e.target.value)} placeholder="e.g. gmail_summary" />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="fieldLabel">Kind (optional)</div>
          <input className="input" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="turn | skill | event" />
        </div>

        <div className="field">
          <div className="fieldLabel">Limit</div>
          <select className="input" value={String(limit)} onChange={(e) => setLimit(parseInt(e.target.value, 10) || 100)}>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button type="button" className="btn" onClick={loadFirstPage} disabled={busy}>
          {busy ? "Loading…" : "Refresh"}
        </button>
        <div className="muted">
          {items.length} rows {hasMore ? "(more available)" : ""}
        </div>
      </div>

      {error ? (
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Tenant</th>
              <th>Caller</th>
              <th>Kind</th>
              <th>Skill</th>
              <th>Call SID</th>
              <th>Text</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {busy ? "Loading…" : "No rows found."}
                </td>
              </tr>
            ) : null}

            {items.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtTs(r.created_at)}</td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                  {truncate(r.tenant_id, 12)}
                </td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                  {truncate(r.caller_id, 14)}
                </td>
                <td>{r.kind}</td>
                <td style={{ whiteSpace: "nowrap" }}>{r.skill_key}</td>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                  {r.call_sid ? truncate(r.call_sid, 14) : ""}
                </td>
                <td style={{ maxWidth: 520 }}>
                  <div title={r.text} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.text}
                  </div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="btn danger" onClick={() => deleteRow(r.id)} disabled={busy}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={loadMore} disabled={busy}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      <div className="muted" style={{ marginTop: 10 }}>
        Deleting a row removes it permanently from <code>caller_memory_events</code>.
      </div>
    </div>
  );
}
