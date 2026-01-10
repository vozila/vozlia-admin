import { useEffect, useMemo, useState } from "react";

type KBFileRow = {
  id: string;
  tenant_id: string;
  kind: string;
  status: string;
  filename: string;
  content_type?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  uploaded_by?: string | null;
  created_at: string;
};

type ListPayload = {
  items: KBFileRow[];
  has_more: boolean;
  next_offset?: number | null;
};

function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let x = n;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function KBUploadPanel() {
  const [tenantId, setTenantId] = useState("");
  const [kind, setKind] = useState<"knowledge" | "policy">("knowledge");
  const [q, setQ] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [rows, setRows] = useState<KBFileRow[]>([]);
  const [err, setErr] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const canQuery = useMemo(() => tenantId.trim().length > 0, [tenantId]);

  async function refresh() {
    if (!tenantId.trim()) {
      setRows([]);
      return;
    }
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("tenant_id", tenantId.trim());
      if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/admin/kb/files?${params.toString()}`);
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      const payload = JSON.parse(t) as ListPayload;
      setRows(payload.items || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    // Don't auto-fetch until tenant_id provided.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload() {
    if (!tenantId.trim()) {
      setStatus("Error: tenant_id is required");
      return;
    }
    if (!file) {
      setStatus("Error: choose a file first");
      return;
    }

    setBusy(true);
    setStatus("");
    setErr("");

    try {
      // 1) Get a short-lived upload token from the control plane via Vercel API route (admin-authenticated).
      const tokenRes = await fetch(`/api/admin/kb/files/upload-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          kind,
        }),
      });

      const tokenText = await tokenRes.text();
      if (!tokenRes.ok) throw new Error(tokenText);

      const tokenJson = JSON.parse(tokenText) as { upload_url: string; upload_token: string };

      // 2) Upload directly to the Control Plane (NOT through Vercel), using the signed token.
      const form = new FormData();
      form.append("file", file, file.name);

      const upRes = await fetch(tokenJson.upload_url, {
        method: "POST",
        headers: {
          "X-Vozlia-Upload-Token": tokenJson.upload_token,
        },
        body: form,
      });

      const upText = await upRes.text();
      if (!upRes.ok) throw new Error(upText);

      setStatus("Uploaded.");
      setFile(null);

      await refresh();
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!tenantId.trim()) {
      setStatus("Error: tenant_id is required");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      params.set("tenant_id", tenantId.trim());
      const r = await fetch(`/api/admin/kb/files/${encodeURIComponent(id)}?${params.toString()}`, { method: "DELETE" });
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      setStatus("Deleted.");
      await refresh();
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(id: string) {
    if (!tenantId.trim()) {
      setStatus("Error: tenant_id is required");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      params.set("tenant_id", tenantId.trim());

      const r = await fetch(`/api/admin/kb/files/${encodeURIComponent(id)}/download-token?${params.toString()}`);
      const t = await r.text();
      if (!r.ok) throw new Error(t);

      const j = JSON.parse(t) as { download_url: string };
      window.open(j.download_url, "_blank", "noopener,noreferrer");
      setStatus("Download started.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, marginTop: 18 }}>
      <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>KB Files</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          Upload tenant documents (knowledge + policy/rules). Stored in object storage; metadata in Postgres.
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <span style={{ opacity: 0.85 }}>tenant_id (required)</span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. b4d2353b-667f-4fd2-8ca7-a882e20b9ec3"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "white" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
            <span style={{ opacity: 0.85 }}>kind</span>
            <select
              value={kind}
              onChange={(e) => setKind((e.target.value as any) || "knowledge")}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "white" }}
            >
              <option value="knowledge">knowledge</option>
              <option value="policy">policy</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <span style={{ opacity: 0.85 }}>file</span>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              style={{ color: "white" }}
            />
          </label>

          <button
            type="button"
            onClick={onUpload}
            disabled={busy || !canQuery || !file}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: busy ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              color: "white",
              cursor: busy ? "not-allowed" : "pointer",
              marginTop: 22,
            }}
          >
            {busy ? "Working..." : "Upload"}
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={busy || !canQuery}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: busy ? "not-allowed" : "pointer",
              marginTop: 22,
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search filename..."
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "white", minWidth: 260 }}
          />
          <button
            type="button"
            onClick={refresh}
            disabled={busy || !canQuery}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Search
          </button>
        </div>

        {status ? <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{status}</div> : null}
        {err ? <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", color: "#ffb3b3" }}>{err}</pre> : null}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Filename</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Kind</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Status</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Size</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Created</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{r.filename}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{r.kind}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{r.status}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{fmtBytes(r.size_bytes)}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <button
                      type="button"
                      onClick={() => onDownload(r.id)}
                      disabled={busy || !canQuery}
                      style={{ marginRight: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "white" }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      disabled={busy || !canQuery}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "white" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 6, opacity: 0.75 }}>
                    {tenantId.trim() ? "No KB files yet." : "Enter a tenant_id to list KB files."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.4 }}>
          Note: Uploads/downloads go directly from the browser to the Control Plane using a short-lived token.
          If uploads fail with CORS errors, set <code>CONTROL_CORS_ORIGINS</code> (or <code>CONTROL_CORS_ORIGIN_REGEX</code>)
          on the Control Plane service to allow your Admin Portal origin.
        </div>
      </div>
    </section>
  );
}
