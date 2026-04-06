import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api";
import StatusBadge from "../components/StatusBadge";

interface CandidateData {
  id: number;
  email: string;
  name: string;
  sequence_id: number;
  current_step: number;
  status: string;
  enrolled_at: string;
  updated_at: string;
}

interface StateLog {
  id: number;
  from_status: string;
  to_status: string;
  timestamp: string;
  note: string | null;
}

interface SentEmail {
  id: number;
  step_id: number;
  nylas_message_id: string | null;
  sent_at: string;
}

interface ReplyData {
  id: number;
  candidate_id: number;
  nylas_message_id: string | null;
  body: string;
  classification: string | null;
  received_at: string;
}

interface ReferralData {
  id: number;
  referred_email: string;
  referred_name: string;
  new_candidate_id: number | null;
}

interface Detail {
  candidate: CandidateData;
  state_logs: StateLog[];
  sent_emails: SentEmail[];
  replies: ReplyData[];
  referrals: ReferralData[];
}

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => api.get(`/candidates/${id}`).then((r) => setDetail(r.data));

  useEffect(() => { load(); }, [id]);

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    await api.post(`/replies/candidate/${id}/send`, { body: replyBody });
    setReplyBody("");
    setSending(false);
    load();
  };

  if (!detail) return <p>Loading...</p>;

  const { candidate: c, state_logs, sent_emails, replies, referrals } = detail;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{c.name || c.email}</h1>
      <p style={{ color: "#666", marginBottom: 4, fontSize: 14 }}>{c.email}</p>
      <div style={{ marginBottom: 24 }}>
        <StatusBadge status={c.status} />
        <span style={{ fontSize: 12, color: "#888", marginLeft: 12 }}>
          Step {c.current_step + 1} &middot; Enrolled {new Date(c.enrolled_at).toLocaleString()}
        </span>
      </div>

      {/* Sent Emails */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={h2}>Sent Emails ({sent_emails.length})</h2>
        {sent_emails.map((e) => (
          <div key={e.id} style={{ ...card, marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>Step {e.step_id}</span>
            <span style={{ fontSize: 12, color: "#888", marginLeft: 12 }}>
              {new Date(e.sent_at).toLocaleString()}
            </span>
          </div>
        ))}
      </section>

      {/* Replies / Thread */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={h2}>Conversation ({replies.length})</h2>
        {replies.map((r) => (
          <div
            key={r.id}
            style={{
              ...card,
              marginBottom: 8,
              borderLeft: r.classification === "recruiter_reply"
                ? "3px solid #4f46e5"
                : "3px solid #16a34a",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: r.classification === "recruiter_reply" ? "#4f46e5" : "#16a34a" }}>
                {r.classification === "recruiter_reply" ? "You" : "Candidate"}
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>
                {new Date(r.received_at).toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: r.body }} />
            {r.classification && r.classification !== "recruiter_reply" && (
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={r.classification} />
              </div>
            )}
          </div>
        ))}

        {/* Reply compose */}
        <div style={{ ...card, marginTop: 12 }}>
          <textarea
            placeholder="Type your reply..."
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            style={{ ...inputStyle, minHeight: 80, marginBottom: 8 }}
          />
          <button onClick={sendReply} disabled={sending} style={btn}>
            {sending ? "Sending..." : "Send Reply"}
          </button>
        </div>
      </section>

      {/* Referrals */}
      {referrals.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={h2}>Referrals</h2>
          {referrals.map((ref) => (
            <div key={ref.id} style={{ ...card, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{ref.referred_name || ref.referred_email}</span>
              <span style={{ fontSize: 13, color: "#666", marginLeft: 8 }}>{ref.referred_email}</span>
            </div>
          ))}
        </section>
      )}

      {/* State History */}
      <section>
        <h2 style={h2}>State History</h2>
        <div style={card}>
          {state_logs.length === 0 ? (
            <p style={{ color: "#888", fontSize: 13 }}>No state transitions yet.</p>
          ) : (
            state_logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#888", minWidth: 140 }}>
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <StatusBadge status={log.from_status} />
                <span>&rarr;</span>
                <StatusBadge status={log.to_status} />
                {log.note && <span style={{ color: "#666" }}>{log.note}</span>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: 16, marginBottom: 8, fontWeight: 600 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 8, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 };
const btn: React.CSSProperties = { background: "#4f46e5", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 };
