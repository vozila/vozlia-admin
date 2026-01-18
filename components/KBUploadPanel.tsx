import React, { useEffect, useMemo, useState } from "react";

type KBKind = "knowledge" | "policy";
type KBQueryMode = "retrieve" | "answer";

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

type EmailAccount = {
  id: string;
  provider_type: string;
  oauth_provider?: string | null;
  email_address?: string | null;
  display_name?: string | null;
  is_primary: boolean;
  is_active: boolean;

  // Depending on Control Plane schema, tenant mapping may appear in one of these fields.
  tenant_id?: string | null;
  tenantId?: string | null;

  // Current deployed behavior: email accounts include user_id; in Vozlia today, user_id is the tenant UUID.
  user_id?: string | null;
  userId?: string | null;
};

type ListResp = { items: KBFileRow[]; has_more?: boolean; next_offset?: number | null };

type UploadTokenResp = { upload_url: string; upload_token: string; expires_in_s: number };

type DownloadTokenResp = { download_url: string; download_token: string; expires_in_s: number };

type IngestJob = {
  id: string;
  tenant_id: string;
  file_id: string;
  status: string;
  error?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

type IngestStatusResp = {
  ok: boolean;
  status: string; // none|queued|running|ready|failed
  job?: IngestJob | null;
};

type IngestEnqueueResp = {
  ok: boolean;
  job?: IngestJob | null;
};

type KBQuerySource = {
  file_id: string;
  filename: string;
  content_type: string;
  kind: string;
  chunk_index: number;
  snippet: string;
  score?: number | null;
};

type KBQueryResp = {
  ok: boolean;
  tenant_id: string;
  mode: KBQueryMode;
  retrieval_strategy?: string | null;
  answer?: string | null;
  sources?: KBQuerySource[];
  policy_chars?: number | null;
  context_chars?: number | null;
  model?: string | null;
  latency_ms?: number | null;
};

const DEFAULT_LIMIT = 50;

function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = n;
  let u = 0;
  while (x >= 1024 && u < units.length - 1) {
    x /= 1024;
    u += 1;
  }
  return `${x.toFixed(x >= 10 ? 1 : 2)} ${units[u]}`;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function shortErr(s: string, max = 140): string {
  const t = (s || "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

const LS_TENANT_KEY = "vozlia.kb.tenant_id";
const LS_EMAIL_ACCOUNT_KEY = "vozlia.kb.email_account_id";

export function KBUploadPanel() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsErr, setAccountsErr] = useState("");

  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string>("");

  // tenantId is editable as a fallback (if tenant mapping isn't returned by /email-accounts).
  const [tenantId, setTenantId] = useState<string>("");

  const [kind, setKind] = useState<KBKind>("knowledge");
  const [q, setQ] = useState<string>("");

  const [items, setItems] = useState<KBFileRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [autoIngestAfterUpload, setAutoIngestAfterUpload] = useState(true);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string>("");
  const [uploadOk, setUploadOk] = useState<string>("");

  // Ingest status cache per file_id
  const [ingestByFile, setIngestByFile] = useState<Record<string, IngestStatusResp | null>>({});
  const [ingestBusyByFile, setIngestBusyByFile] = useState<Record<string, boolean>>({});

  // KB Q&A
  const [chatQuery, setChatQuery] = useState<string>("");
  const [chatMode, setChatMode] = useState<KBQueryMode>("answer");
  const [chatIncludePolicy, setChatIncludePolicy] = useState<boolean>(true);
  const [chatLimit, setChatLimit] = useState<number>(8);

  const [chatBusy, setChatBusy] = useState<boolean>(false);
  const [chatErr, setChatErr] = useState<string>("");
  const [chatResp, setChatResp] = useState<KBQueryResp | null>(null);

  const canQuery = useMemo(() => !!tenantId.trim(), [tenantId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedEmailAccountId) || null,
    [accounts, selectedEmailAccountId],
  );

  function tenantFromAccount(a: EmailAccount | null): string {
    if (!a) return "";
    // Prefer explicit tenant_id fields, then fallback to user_id (current model behavior).
    return ((a.tenant_id || a.tenantId || a.user_id || a.userId || "") as string).toString().trim();
  }

  async function copyValue(label: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setUploadOk(`Copied ${label}.`);
      setUploadErr("");
    } catch {
      // Fallback for environments where clipboard API is blocked
      window.prompt(`Copy ${label}:`, value);
    }
  }

  async function loadAccounts() {
    setAccountsLoading(true);
    setAccountsErr("");
    try {
      const r = await fetch("/api/admin/email-accounts?include_inactive=true", { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const data = safeJsonParse<any>(t);
      const rows: EmailAccount[] = Array.isArray(data) ? data : [];
      setAccounts(rows);

      // Default selection: localStorage -> primary active -> first active -> first
      let prev = "";
      try {
        prev = window.localStorage.getItem(LS_EMAIL_ACCOUNT_KEY) || "";
      } catch {}

      const isActive = (x: EmailAccount) => x.is_active !== false;
      const byId = prev ? rows.find((x) => x.id === prev) : null;
      const primary = rows.find((x) => x.is_primary && isActive(x)) || null;
      const firstActive = rows.find((x) => isActive(x)) || null;
      const fallback = rows[0] || null;

      const chosen = byId || primary || firstActive || fallback;
      if (chosen) {
        setSelectedEmailAccountId(chosen.id);
        const tid = tenantFromAccount(chosen);
        if (tid) setTenantId(tid);
      }
    } catch (e: any) {
      setAccountsErr(e?.message || String(e));
    } finally {
      setAccountsLoading(false);
    }
  }

  async function refresh() {
    setListBusy(true);
    setListErr("");
    try {
      if (!tenantId.trim()) {
        setItems([]);
        return;
      }

      const url = new URL("/api/admin/kb/files", window.location.origin);
      url.searchParams.set("tenant_id", tenantId.trim());
      url.searchParams.set("limit", String(DEFAULT_LIMIT));
      url.searchParams.set("offset", "0");
      if (q.trim()) url.searchParams.set("q", q.trim());

      const r = await fetch(url.toString(), { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = safeJsonParse<ListResp>(t);
      setItems(json?.items || []);
    } catch (e: any) {
      setListErr(e?.message || String(e));
      setItems([]);
    } finally {
      setListBusy(false);
    }
  }

  async function enqueueIngest(fileId: string, force: boolean) {
    if (!tenantId.trim()) {
      setUploadErr("Select an email account / tenant first.");
      return;
    }

    setUploadErr("");
    setUploadOk("");
    setIngestBusyByFile((p) => ({ ...p, [fileId]: true }));
    try {
      const r = await fetch(`/api/admin/kb/files/${encodeURIComponent(fileId)}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId.trim(), force }),
      });

      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = safeJsonParse<IngestEnqueueResp>(t);
      const jobStatus = json?.job?.status || "queued";
      setIngestByFile((p) => ({ ...p, [fileId]: { ok: true, status: jobStatus, job: json?.job || null } }));
      setUploadOk(force ? "Re-ingest queued." : "Ingest queued.");
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    } finally {
      setIngestBusyByFile((p) => ({ ...p, [fileId]: false }));
    }
  }

  async function fetchIngestStatus(fileId: string) {
    if (!tenantId.trim()) return;

    setIngestBusyByFile((p) => ({ ...p, [fileId]: true }));
    try {
      const url = new URL(`/api/admin/kb/files/${encodeURIComponent(fileId)}/ingest-status`, window.location.origin);
      url.searchParams.set("tenant_id", tenantId.trim());

      const r = await fetch(url.toString(), { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = safeJsonParse<IngestStatusResp>(t);
      if (json) setIngestByFile((p) => ({ ...p, [fileId]: json }));
    } catch (e: any) {
      // Don't spam global error; keep it local
      setIngestByFile((p) => ({
        ...p,
        [fileId]: { ok: false, status: "unknown", job: { id: "", tenant_id: tenantId.trim(), file_id: fileId, status: "unknown", error: String(e?.message || e) } },
      }));
    } finally {
      setIngestBusyByFile((p) => ({ ...p, [fileId]: false }));
    }
  }

  async function refreshAllIngestStatuses() {
    const ids = items.map((x) => x.id);
    if (!ids.length) return;

    // Simple concurrency limiter (batch size 4)
    const batchSize = 4;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await Promise.all(batch.map((id) => fetchIngestStatus(id)));
    }
  }

  async function upload() {
    setUploadBusy(true);
    setUploadErr("");
    setUploadOk("");
    try {
      if (!tenantId.trim()) throw new Error("Select an email account / tenant first.");
      if (!file) throw new Error("Select a file first.");

      // Step A: mint upload token (server-side proxy keeps admin key secret)
      const tokenRes = await fetch("/api/admin/kb/files/upload-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          kind,
        }),
      });

      const tokenText = await tokenRes.text();
      if (!tokenRes.ok) throw new Error(tokenText || `HTTP ${tokenRes.status}`);
      const tokenJson = safeJsonParse<UploadTokenResp>(tokenText);
      if (!tokenJson) throw new Error("Invalid JSON from /api/admin/kb/files/upload-token");

      // Step B: browser uploads directly to Control Plane with short-lived token
      const fd = new FormData();
      fd.append("file", file, file.name);

      const r = await fetch(tokenJson.upload_url, {
        method: "POST",
        headers: { "X-Vozlia-Upload-Token": tokenJson.upload_token },
        body: fd,
      });

      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      // Optional: auto-ingest (enqueue) to populate kb_chunks for Q&A
      const uploadJson = safeJsonParse<any>(t);
      const newFileId: string | null = uploadJson?.file?.id || null;

      setUploadOk("Uploaded.");
      setFile(null);

      await refresh();

      if (autoIngestAfterUpload && newFileId) {
        // Fire and forget (but surface error if it fails)
        await enqueueIngest(newFileId, false);
        await fetchIngestStatus(newFileId);
      }
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  async function requestDownload(fileId: string) {
    setUploadErr("");
    setUploadOk("");

    if (!tenantId.trim()) {
      setUploadErr("Select an email account / tenant first.");
      return;
    }

    try {
      const url = new URL(`/api/admin/kb/files/${encodeURIComponent(fileId)}/download-token`, window.location.origin);
      url.searchParams.set("tenant_id", tenantId.trim());

      const r = await fetch(url.toString(), { method: "GET" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = safeJsonParse<DownloadTokenResp>(t);
      if (!json?.download_url || !json?.download_token) throw new Error("Invalid download token response");

      const dl = new URL(json.download_url);
      dl.searchParams.set("token", json.download_token);

      window.open(dl.toString(), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    }
  }

  async function deleteFile(fileId: string) {
    setUploadErr("");
    setUploadOk("");

    if (!tenantId.trim()) {
      setUploadErr("Select an email account / tenant first.");
      return;
    }

    const ok = confirm("Delete this KB file? This removes the object and metadata.");
    if (!ok) return;

    try {
      const url = new URL(`/api/admin/kb/files/${encodeURIComponent(fileId)}`, window.location.origin);
      url.searchParams.set("tenant_id", tenantId.trim());

      const r = await fetch(url.toString(), { method: "DELETE" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      setUploadOk("Deleted.");
      setIngestByFile((p) => {
        const copy = { ...p };
        delete copy[fileId];
        return copy;
      });
      await refresh();
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    }
  }

  async function runKbQuery() {
    setChatBusy(true);
    setChatErr("");
    setChatResp(null);

    try {
      if (!tenantId.trim()) throw new Error("Select an email account / tenant first.");
      if (!chatQuery.trim()) throw new Error("Enter a question first.");

      const r = await fetch("/api/admin/kb/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId.trim(),
          query: chatQuery.trim(),
          mode: chatMode,
          limit: Number.isFinite(chatLimit) ? chatLimit : 8,
          include_policy: chatIncludePolicy,
        }),
      });

      const t = await r.text();
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = safeJsonParse<KBQueryResp>(t);
      if (!json) throw new Error("Invalid JSON from /api/admin/kb/query");
      setChatResp(json);
    } catch (e: any) {
      setChatErr(e?.message || String(e));
    } finally {
      setChatBusy(false);
    }
  }

  // Load accounts once on mount
  useEffect(() => {
    loadAccounts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On account selection, update tenant id
  useEffect(() => {
    if (!selectedAccount) return;
    const tid = tenantFromAccount(selectedAccount);
    if (tid) setTenantId(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmailAccountId]);

  // Load list once tenant becomes available
  useEffect(() => {
    if (!tenantId.trim()) return;
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Persist selection/tenant in localStorage
  useEffect(() => {
    try {
      const prevTenant = window.localStorage.getItem(LS_TENANT_KEY) || "";
      const prevEmail = window.localStorage.getItem(LS_EMAIL_ACCOUNT_KEY) || "";
      if (!selectedEmailAccountId && prevEmail) setSelectedEmailAccountId(prevEmail);
      if (!tenantId && prevTenant) setTenantId(prevTenant);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (tenantId.trim()) window.localStorage.setItem(LS_TENANT_KEY, tenantId.trim());
    } catch {}
  }, [tenantId]);

  useEffect(() => {
    try {
      if (selectedEmailAccountId) window.localStorage.setItem(LS_EMAIL_ACCOUNT_KEY, selectedEmailAccountId);
    } catch {}
  }, [selectedEmailAccountId]);

  // Fetch ingest statuses whenever the file list changes
  useEffect(() => {
    if (!tenantId.trim()) return;
    if (!items.length) return;

    // Only fetch for rows we don't already have cached, or non-terminal statuses.
    const shouldFetch = (id: string) => {
      const st = ingestByFile[id];
      if (!st) return true;
      return ["queued", "running", "unknown"].includes(st.status);
    };

    const ids = items.map((x) => x.id).filter(shouldFetch);
    if (!ids.length) return;

    (async () => {
      const batchSize = 4;
      for (let i = 0; i < ids.length; i += batchSize) {
        await Promise.all(ids.slice(i, i + batchSize).map((id) => fetchIngestStatus(id)));
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tenantId]);

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">KB Files</div>
      <div className="panelSub">
        Upload tenant KB documents (knowledge) and tenant policy/rules documents (policy). Uploads go WebUI → Control Plane.
      </div>

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div>
          <div className="label">Email account</div>
          <select
            value={selectedEmailAccountId}
            onChange={(e) => setSelectedEmailAccountId(e.target.value)}
            disabled={accountsLoading}
            style={{ minWidth: 320 }}
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name || a.email_address || a.id}
                {a.is_primary ? " (primary)" : ""}
                {a.is_active === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          {accountsErr ? <div className="help" style={{ color: "#b91c1c" }}>{accountsErr}</div> : null}
        </div>

        <div>
          <div className="label">tenant_id</div>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="tenant uuid"
            style={{ minWidth: 320 }}
          />
          <div className="help">Must match the tenant_id used on Control Plane KB operations.</div>
        </div>

        <div>
          <div className="label">kind</div>
          <select value={kind} onChange={(e) => setKind(e.target.value as KBKind)} disabled={!canQuery}>
            <option value="knowledge">knowledge</option>
            <option value="policy">policy</option>
          </select>
        </div>

        <div>
          <div className="label">search</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filename contains…" disabled={!canQuery} />
        </div>

        <div style={{ alignSelf: "flex-end", display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="btnPrimary" onClick={upload} disabled={!canQuery || uploadBusy || !file}>
            {uploadBusy ? "Uploading…" : "Upload"}
          </button>

          <button type="button" className="btnSecondary" onClick={refresh} disabled={!canQuery || listBusy}>
            {listBusy ? "Refreshing…" : "Refresh"}
          </button>

          <button type="button" className="btnSecondary" onClick={refreshAllIngestStatuses} disabled={!canQuery || !items.length}>
            Refresh ingest statuses
          </button>

          <button type="button" className="btnSecondary" onClick={loadAccounts} disabled={accountsLoading} style={{ marginLeft: 8 }}>
            Reload accounts
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div>
          <div className="label">Select file</div>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <div className="help">Supported: .txt, .pdf, .docx (depends on Control Plane worker dependencies).</div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
          <input
            type="checkbox"
            checked={autoIngestAfterUpload}
            onChange={(e) => setAutoIngestAfterUpload(e.target.checked)}
          />
          Auto-ingest after upload
        </label>
      </div>

      {uploadErr ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div className="alertTitle">Error</div>
          <div className="alertBody">{uploadErr}</div>
        </div>
      ) : null}

      {uploadOk ? (
        <div className="ok" style={{ marginTop: 12 }}>
          {uploadOk}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div className="label">Files</div>
        {listErr ? <div className="help" style={{ color: "#b91c1c" }}>{listErr}</div> : null}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Filename</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Kind</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>File Status</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Ingest</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Size</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Created</th>
                <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(15,23,42,0.12)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ingest = ingestByFile[it.id];
                const ingestStatus = ingest?.status || "";
                const ingestErr = ingest?.job?.error ? shortErr(String(ingest.job.error)) : "";
                const ingestBusy = !!ingestBusyByFile[it.id];

                return (
                  <tr key={it.id}>
                    <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                      <div style={{ fontWeight: 600 }}>{it.filename}</div>
                      <div className="help" style={{ marginTop: 2 }}>
                        {it.content_type} {it.sha256 ? `• sha256 ${it.sha256.slice(0, 10)}…` : ""}
                      </div>
                      <div className="help" style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span>
                          File ID: <span className="mono">{it.id}</span>
                        </span>
                        <button type="button" className="btnSecondary" onClick={() => copyValue("file id", it.id)}>
                          Copy ID
                        </button>
                      </div>
                    </td>

                    <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>{it.kind}</td>

                    <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>{it.status}</td>

                    <td style={{ padding: 6, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                      <div style={{ fontWeight: 600 }}>{ingestStatus || "—"}</div>
                      {ingestErr ? <div className="help" style={{ color: "#b91c1c" }}>{ingestErr}</div> : null}

                      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btnSecondary"
                          onClick={() => enqueueIngest(it.id, false)}
                          disabled={!canQuery || ingestBusy}
                        >
                          Ingest
                        </button>

                        <button
                          type="button"
                          className="btnSecondary"
                          onClick={() => enqueueIngest(it.id, true)}
                          disabled={!canQuery || ingestBusy}
                        >
                          Force
                        </button>

                        <button
                          type="button"
                          className="btnSecondary"
                          onClick={() => fetchIngestStatus(it.id)}
                          disabled={!canQuery || ingestBusy}
                        >
                          Status
                        </button>
                      </div>
                    </td>

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
                );
              })}

              {!items.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 10, opacity: 0.75 }}>
                    {tenantId.trim() ? "No KB files yet." : "Select an email account (or enter a tenant_id) to list KB files."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="panelTitle" style={{ fontSize: 16 }}>KB Q&A (Admin test)</div>
        <div className="panelSub">
          This is a quick way to validate retrieval and policy behavior after ingestion. For best results, upload + ingest a <b>knowledge</b> doc and optionally a <b>policy</b> doc.
        </div>

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div className="label">Question</div>
            <input
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder="e.g., What are your business hours?"
              disabled={!canQuery}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <div className="label">mode</div>
            <select value={chatMode} onChange={(e) => setChatMode(e.target.value as KBQueryMode)} disabled={!canQuery}>
              <option value="answer">answer</option>
              <option value="retrieve">retrieve</option>
            </select>
          </div>

          <div>
            <div className="label">limit</div>
            <input
              type="number"
              value={chatLimit}
              onChange={(e) => setChatLimit(parseInt(e.target.value || "8", 10))}
              min={1}
              max={20}
              disabled={!canQuery}
              style={{ width: 90 }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
            <input type="checkbox" checked={chatIncludePolicy} onChange={(e) => setChatIncludePolicy(e.target.checked)} />
            include policy
          </label>

          <div style={{ alignSelf: "flex-end" }}>
            <button type="button" className="btnPrimary" onClick={runKbQuery} disabled={!canQuery || chatBusy}>
              {chatBusy ? "Running…" : "Ask"}
            </button>
          </div>
        </div>

        {chatErr ? (
          <div className="alert" style={{ marginTop: 12 }}>
            <div className="alertTitle">KB query error</div>
            <div className="alertBody">{chatErr}</div>
          </div>
        ) : null}

        {chatResp ? (
          <div style={{ marginTop: 12 }}>
            <div className="help">
              strategy: <span className="mono">{chatResp.retrieval_strategy || "—"}</span>
              {" • "}
              context_chars: <span className="mono">{String(chatResp.context_chars ?? "—")}</span>
              {" • "}
              policy_chars: <span className="mono">{String(chatResp.policy_chars ?? "—")}</span>
              {" • "}
              model: <span className="mono">{chatResp.model || "—"}</span>
              {" • "}
              latency_ms: <span className="mono">{String(chatResp.latency_ms ?? "—")}</span>
            </div>

            {chatResp.answer ? (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.7)" }}>
                <div className="label">Answer</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{chatResp.answer}</div>
              </div>
            ) : null}

            <div style={{ marginTop: 12 }}>
              <div className="label">Sources</div>
              {chatResp.sources?.length ? (
                <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                  {chatResp.sources.map((s, idx) => (
                    <div key={`${s.file_id}:${s.chunk_index}:${idx}`} style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.65)" }}>
                      <div style={{ fontWeight: 700 }}>
                        {s.filename} <span className="help">• {s.kind} • chunk {s.chunk_index}</span>
                      </div>
                      <div className="help" style={{ marginTop: 2 }}>
                        {s.content_type} {s.score !== undefined && s.score !== null ? `• score ${s.score.toFixed(3)}` : ""}
                      </div>
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
                        {s.snippet}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="help" style={{ marginTop: 8 }}>
                  No sources returned. This usually means: (1) files were uploaded but not ingested, or (2) the tenant_id is wrong.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
