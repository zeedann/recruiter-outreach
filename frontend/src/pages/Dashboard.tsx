import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

interface Analytics {
  sequence_id: number;
  sequence_name: string;
  total_candidates: number;
  sent_count: number;
  replied_count: number;
  interested_count: number;
  not_interested_count: number;
  neutral_count: number;
}

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/analytics")
      .then((r) => setAnalytics(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  const totals = analytics.reduce(
    (acc, a) => ({
      candidates: acc.candidates + a.total_candidates,
      sent: acc.sent + a.sent_count,
      replied: acc.replied + a.replied_count,
      interested: acc.interested + a.interested_count,
    }),
    { candidates: 0, sent: 0, replied: 0, interested: 0 }
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Dashboard</h1>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Candidates" value={totals.candidates} color="#4f46e5" />
        <StatCard label="Emails Sent" value={totals.sent} color="#0891b2" />
        <StatCard label="Replies" value={totals.replied} color="#ca8a04" />
        <StatCard label="Interested" value={totals.interested} color="#16a34a" />
      </div>

      {/* Per-Sequence Table */}
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Sequence Analytics</h2>
      {analytics.length === 0 ? (
        <p style={{ color: "#666" }}>
          No sequences yet. <Link to="/sequences" style={{ color: "#4f46e5" }}>Create one</Link>
        </p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Sequence</th>
              <th style={th}>Candidates</th>
              <th style={th}>Sent</th>
              <th style={th}>Replied</th>
              <th style={th}>Interested</th>
              <th style={th}>Not Interested</th>
              <th style={th}>Neutral</th>
              <th style={th}>Reply Rate</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.sequence_id}>
                <td style={td}>
                  <Link to={`/sequences/${a.sequence_id}`} style={{ color: "#4f46e5", fontWeight: 600 }}>
                    {a.sequence_name}
                  </Link>
                </td>
                <td style={td}>{a.total_candidates}</td>
                <td style={td}>{a.sent_count}</td>
                <td style={td}>{a.replied_count}</td>
                <td style={{ ...td, color: "#16a34a", fontWeight: 600 }}>{a.interested_count}</td>
                <td style={{ ...td, color: "#dc2626" }}>{a.not_interested_count}</td>
                <td style={td}>{a.neutral_count}</td>
                <td style={td}>
                  {a.sent_count > 0
                    ? `${((a.replied_count / a.sent_count) * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 8,
      padding: 20,
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #eee", fontSize: 13, fontWeight: 600, color: "#666" };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 14 };
