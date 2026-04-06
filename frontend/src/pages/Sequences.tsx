import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";

interface Seq {
  id: number;
  name: string;
  recruiter_id: number;
  created_at: string;
}

export default function Sequences() {
  const [sequences, setSequences] = useState<Seq[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/sequences/").then((r) => setSequences(r.data));

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const r = await api.post("/sequences/", { name, steps: [] });
    setName("");
    setCreating(false);
    navigate(`/sequences/${r.data.id}`);
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Sequences</h1>

      <div style={{ ...card, marginBottom: 24, display: "flex", gap: 12 }}>
        <input
          placeholder="New sequence name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          style={input}
        />
        <button onClick={create} disabled={creating} style={btn}>
          Create
        </button>
      </div>

      {sequences.length === 0 ? (
        <p style={{ color: "#666" }}>No sequences yet. Create one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sequences.map((s) => (
            <Link
              key={s.id}
              to={`/sequences/${s.id}`}
              style={{
                ...card,
                textDecoration: "none",
                color: "#333",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: 12, color: "#999" }}>
                {new Date(s.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const input: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
};

const btn: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "8px 20px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
