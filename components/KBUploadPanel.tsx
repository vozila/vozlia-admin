import React, { useEffect, useMemo, useState } from "react";

type KBKind = "knowledge" | "policy";

type KBFileRow = {
  id: string;
  tenant_id: string;
  kind: string;
  status: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  storage_bucket?: string | null;
  storage_key?: string | null;
  uploaded_by?: string | null;
  created_at: string;
};

type ListResp = {
  items: KBFileRow[];
  has_more: boolean;
  next_offset: number | null;
};

type UploadTokenResp = {
  upload_url: string;
  upload_token: string;
  expires_in_s: number;
};

type DownloadTokenResp = {
  download_url: string;
  expires_in_s: number;
};

const DEFAULT_LIMIT = 50;
const LS_TENANT_KEY = "vozlia.admin.kb.tenant_id";

function formatBytes(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded = i === 0 ? String(Math.round(v)) : v.toFixed(1);
  return `${rounded} ${units[i]}`;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function KBUploadPanel() {
  const [tenantId, setTenantId] = useState<string>("");
  const [kind, setKind] = useState<KBKind>("knowledge");

  const [q, setQ] = useState<string>("");
  const [items, setItems] = useState<KBFileRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string>("");
  const [uploadOk, setUploadOk] = useState<string>("");

  const canQuery = useMemo(() => !!tenantId.trim(), [tenantId]);

  // Load last tenant id for convenience (debug UX)
  useEffect(() => {
    try {
      const prev = window.localStorage.getItem(LS_TENANT_KEY);
      if (prev && prev.trim()) setTenantId(prev.trim());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (tenantId.trim()) window.localStorage.setItem(LS_TENANT_KEY, tenantId.trim());
    } catch {
      // ignore
    }
  }, [tenantId]);

  async function refresh() {
    if (!tenantId.trim()) {
      setItems([]);
      setListErr("Enter a tenant_id to list files.");
      return;
    }

    setListBusy(true);
    setListErr("");
    try {
      const url = new URL("/api/admin/kb/files", window.location.origin);
      url.searchParams.set("tenant_id", tenantId.trim());
      if (q.trim()) url.searchParams.set("q", q.trim());
      url.searchParams.set("limit", String(DEFAULT_LIMIT));
      url.searchParams.set("offset", "0");

      const r = await fetch(url.toString(), { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
      const json = safeJsonParse<ListResp>(t);
      if (!json) throw new Error("Invalid JSON from /api/admin/kb/files");
      setItems(json.items || []);
    } catch (e: any) {
      setItems([]);
      setListErr(e?.message || String(e));
    } finally {
      setListBusy(false);
    }
  }

  useEffect(() => {
    // Auto-refresh list when tenant id becomes available (but not on every keystroke)
    if (!tenantId.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadSelectedFile() {
    setUploadErr("");
    setUploadOk("");

    const tid = tenantId.trim();
    if (!tid) {
      setUploadErr("tenant_id is required.");
      return;
    }
    if (!file) {
      setUploadErr("Choose a file to upload.");
      return;
    }

    setUploadBusy(true);
    try {
      // 1) Mint upload token via WebUI → Control Plane proxy
      const tokenResp = await fetch("/api/admin/kb/files/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tid,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          kind,
        }),
      });

      const tokenText = await tokenResp.text();
      if (!tokenResp.ok) throw new Error(tokenText || `HTTP ${tokenResp.status}`);
      const tokenJson = safeJsonParse<UploadTokenResp>(tokenText);
      if (!tokenJson?.upload_url || !tokenJson?.upload_token) {
        throw new Error("Invalid upload token response from /api/admin/kb/files/upload-token");
      }

      // 2) Upload directly to Control Plane (browser → control plane)
      const fd = new FormData();
      fd.append("file", file, file.name);

      const up = await fetch(tokenJson.upload_url, {
        method: "POST",
        headers: {
          "X-Vozlia-Upload-Token": tokenJson.upload_token,
        },
        body: fd,
      });

      const upText = await up.text();
      if (!up.ok) throw new Error(upText || `Upload failed (HTTP ${up.status})`);

      setUploadOk(`Uploaded: ${file.name}`);
      setFile(null);

      // 3) Refresh list
      await refresh();
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  async function requestDownload(fileId: string) {
    setUploadErr("");
    setUploadOk("");
    const tid = tenantId.trim();
    if (!tid) {
      setUploadErr("tenant_id is required.");
      return;
    }

    try {
      const url = new URL(`/api/admin/kb/files/${fileId}/download-token`, window.location.origin);
      url.searchParams.set("tenant_id", tid);

      const r = await fetch(url.toString(), { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
      const json = safeJsonParse<DownloadTokenResp>(t);
      if (!json?.download_url) throw new Error("Invalid download token response");

      // Open in a new tab/window to trigger the download via Control Plane /kb/download.
      window.open(json.download_url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    }
  }

  async function deleteFile(fileId: string) {
    setUploadErr("");
    setUploadOk("");
    const tid = tenantId.trim();
    if (!tid) {
      setUploadErr("tenant_id is required.");
      return;
    }

    const ok = window.confirm("Delete this KB file? This will remove the object and metadata.");
    if (!ok) return;

    try {
      const url = new URL(`/api/admin/kb/files/${fileId}`, window.location.origin);
      url.searchParams.set("tenant_id", tid);

      const r = await fetch(url.toString(), { method: "DELETE" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      setUploadOk("Deleted.");
      await refresh();
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">KB Files</div>
      <div className="panelSub">
        Upload tenant KB documents (knowledge) and tenant policy/rules documents (policy). Uploads go WebUI → Control Plane.
      </div>

      <div className="form" style={{ marginTop: 12 }}>
        <div className="field">
          <label className="label">tenant_id</label>
          <input
            className="input"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="TENANT_UUID"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <div className="help">Required. All KB operations are tenant-scoped.</div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label">Kind</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as KBKind)}>
              <option value="knowledge">knowledge</option>
              <option value="policy">policy</option>
            </select>
            <div className="help">policy docs will later become high-priority instructions; knowledge docs become retrieval context.</div>
          </div>

          <div className="field">
            <label className="label">Search</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="filename contains…" />
            <div className="help">Optional. Search is filename-based (q=).</div>
          </div>
        </div>

        <div className="grid2" style={{ alignItems: "end" }}>
          <div className="field">
            <label className="label">File</label>
            <input
              className="input"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!canQuery || uploadBusy}
            />
            <div className="help">
              {file ? (
                <>
                  Selected: <b>{file.name}</b> ({formatBytes(file.size)}) {file.type ? `• ${file.type}` : ""}
                </>
              ) : (
                "Choose a file to upload."
              )}
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btnSecondary" onClick={refresh} disabled={!canQuery || listBusy}>
              {listBusy ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" className="btnPrimary" onClick={uploadSelectedFile} disabled={!canQuery || uploadBusy || !file}>
              {uploadBusy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>

        {uploadErr ? <div className="error" style={{ marginTop: 10 }}>{uploadErr}</div> : null}
        {uploadOk ? <div className="ok" style={{ marginTop: 10 }}>{uploadOk}</div> : null}
        {listErr ? <div className="error" style={{ marginTop: 10 }}>{listErr}</div> : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 700 }}>Files</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>{items.length} shown</div>
        </div>

        <div style={{ marginTop: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Filename</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Kind</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Status</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Size</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Created</th>
                <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                    <div style={{ fontWeight: 600 }}>{it.filename}</div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                      {it.content_type} {it.sha256 ? `• sha256 ${it.sha256.slice(0, 10)}…` : ""}
                    </div>
                  </td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>{it.kind}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>{it.status}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>{formatBytes(it.size_bytes)}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                    {it.created_at ? new Date(it.created_at).toLocaleString() : ""}
                  </td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)", textAlign: "right" }}>
                    <button type="button" className="btnSecondary" onClick={() => requestDownload(it.id)} style={{ marginRight: 8 }}>
                      Download
                    </button>
                    <button type="button" className="btnSecondary" onClick={() => deleteFile(it.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, opacity: 0.75 }}>
                    {tenantId.trim() ? "No KB files yet." : "Enter a tenant_id to list KB files."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
