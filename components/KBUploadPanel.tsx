import { useEffect, useState } from "react";

type DocRow = {
  id: string;
  filename?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function KBUploadPanel() {
  const [toNumber, setToNumber] = useState("");
  const [note, setNote] = useState("Upload your business document here:");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsErr, setDocsErr] = useState<string>("");

  async function refreshDocs() {
    try {
      setDocsErr("");
      const r = await fetch("/api/admin/kb/docs");
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      setDocs(JSON.parse(t));
    } catch (e: any) {
      setDocsErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendLink() {
    setBusy(true);
    setResult("");
    try {
      const r = await fetch("/api/admin/kb/send-upload-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_number: toNumber, note }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      const j = JSON.parse(t);
      setResult(`Sent. Link: ${j.public_url}`);
      await refreshDocs();
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 16, marginTop: 20 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Knowledge Base Upload (SMS link)</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Send upload link to (E.164)</div>
          <input
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
            placeholder="+15551234567"
            style={{ width: "100%", padding: 8 }}
            disabled={busy}
          />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>SMS note (optional)</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", padding: 8 }}
            disabled={busy}
          />
        </label>

        <button onClick={sendLink} disabled={busy || !toNumber.trim()} style={{ padding: "10px 14px", width: "fit-content" }}>
          {busy ? "Sending…" : "Send upload link"}
        </button>

        {result ? <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre> : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Recent KB Documents</h3>
          <button onClick={refreshDocs} style={{ padding: "6px 10px" }}>Refresh</button>
        </div>
        {docsErr ? <pre style={{ whiteSpace: "pre-wrap" }}>{docsErr}</pre> : null}
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Filename</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Status</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{d.filename || "(pending)"}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{d.status}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{new Date(d.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!docs.length ? (
                <tr><td colSpan={3} style={{ padding: 6, opacity: 0.75 }}>No documents yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
