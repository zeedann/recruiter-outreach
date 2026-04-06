import { useEffect, useState } from "react";
import api from "../api";

interface Recruiter {
  id: number;
  email: string;
  nylas_grant_id: string;
  created_at: string;
}

export default function Connect() {
  const [recruiter, setRecruiter] = useState<Recruiter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/me").then((r) => {
      setRecruiter(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Connect Your Email</h1>
      {recruiter ? (
        <div style={card}>
          <p style={{ color: "#16a34a", fontWeight: 600, marginBottom: 8 }}>
            Connected
          </p>
          <p><strong>Email:</strong> {recruiter.email}</p>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Grant ID: {recruiter.nylas_grant_id}
          </p>
          <button
            onClick={() => (window.location.href = "/api/auth/connect")}
            style={{ ...btn, marginTop: 12, background: "#6366f1" }}
          >
            Reconnect
          </button>
        </div>
      ) : (
        <div style={card}>
          <p style={{ marginBottom: 12 }}>
            Connect your Gmail account via Nylas to start sending outreach emails.
          </p>
          <button
            onClick={() => (window.location.href = "/api/auth/connect")}
            style={btn}
          >
            Connect Gmail
          </button>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  maxWidth: 480,
};

const btn: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "10px 20px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
