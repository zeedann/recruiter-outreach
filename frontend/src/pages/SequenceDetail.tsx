import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api";
import StatusBadge from "../components/StatusBadge";

interface Step {
  id: number;
  step_order: number;
  subject: string;
  body_html: string;
  delay_minutes: number;
}

interface Seq {
  id: number;
  name: string;
  steps: Step[];
}

interface Candidate {
  id: number;
  email: string;
  name: string;
  current_step: number;
  status: string;
  enrolled_at: string;
}

export default function SequenceDetail() {
  const { id } = useParams<{ id: string }>();
  const [seq, setSeq] = useState<Seq | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newStep, setNewStep] = useState({ subject: "", body_html: "", delay_minutes: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSeq = () =>
    api.get(`/sequences/${id}`).then((r) => setSeq(r.data));
  const loadCandidates = () =>
    api.get(`/candidates/sequence/${id}`).then((r) => setCandidates(r.data));

  useEffect(() => {
    loadSeq();
    loadCandidates();
  }, [id]);

  const addStep = async () => {
    if (!seq || !newStep.subject.trim()) return;
    await api.post(`/sequences/${id}/steps`, {
      ...newStep,
      step_order: seq.steps.length,
    });
    setNewStep({ subject: "", body_html: "", delay_minutes: 0 });
    loadSeq();
  };

  const deleteStep = async (stepId: number) => {
    await api.delete(`/sequences/steps/${stepId}`);
    loadSeq();
  };

  const uploadCsv = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await api.post(`/candidates/upload/${id}`, form);
    loadCandidates();
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!seq) return <p>Loading...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{seq.name}</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>Sequence #{seq.id}</p>

      {/* Steps */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          Steps ({seq.steps.length})
        </h2>
        {seq.steps.map((step) => (
          <div key={step.id} style={{ ...card, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                Step {step.step_order + 1} &middot; Delay: {step.delay_minutes} min (day{step.delay_minutes !== 1 ? "s" : ""})
              </div>
              <div style={{ fontWeight: 600 }}>{step.subject}</div>
              <div
                style={{ fontSize: 13, color: "#555", marginTop: 4, maxHeight: 60, overflow: "hidden" }}
                dangerouslySetInnerHTML={{ __html: step.body_html }}
              />
            </div>
            <button onClick={() => deleteStep(step.id)} style={delBtn}>
              Delete
            </button>
          </div>
        ))}

        <div style={{ ...card, marginTop: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Add Step</h3>
          <input
            placeholder="Subject line"
            value={newStep.subject}
            onChange={(e) => setNewStep({ ...newStep, subject: e.target.value })}
            style={{ ...input, marginBottom: 8 }}
          />
          <textarea
            placeholder="Email body (HTML)"
            value={newStep.body_html}
            onChange={(e) => setNewStep({ ...newStep, body_html: e.target.value })}
            style={{ ...input, minHeight: 80, marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 13 }}>Delay (minutes = days):</label>
            <input
              type="number"
              min={0}
              value={newStep.delay_minutes}
              onChange={(e) =>
                setNewStep({ ...newStep, delay_minutes: parseInt(e.target.value) || 0 })
              }
              style={{ ...input, width: 80 }}
            />
            <button onClick={addStep} style={btn}>Add Step</button>
          </div>
        </div>
      </section>

      {/* CSV Upload */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Upload Candidates</h2>
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center" }}>
          <input type="file" accept=".csv" ref={fileRef} />
          <button onClick={uploadCsv} style={btn}>Upload CSV</button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          CSV format: email, name (header row required)
        </p>
      </section>

      {/* Candidates */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          Candidates ({candidates.length})
        </h2>
        {candidates.length === 0 ? (
          <p style={{ color: "#666" }}>No candidates enrolled yet.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Name</th>
                <th style={th}>Step</th>
                <th style={th}>Status</th>
                <th style={th}>Enrolled</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.email}</td>
                  <td style={td}>{c.name || "—"}</td>
                  <td style={td}>{c.current_step + 1}</td>
                  <td style={td}><StatusBadge status={c.status} /></td>
                  <td style={td}>{new Date(c.enrolled_at).toLocaleString()}</td>
                  <td style={td}>
                    <Link to={`/candidates/${c.id}`} style={{ color: "#4f46e5", fontSize: 13 }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 8, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const input: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 };
const btn: React.CSSProperties = { background: "#4f46e5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
const delBtn: React.CSSProperties = { background: "#ef4444", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600, color: "#666" };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
