import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Send, MessageSquare, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import StatusBadge from "../components/StatusBadge";
import { sanitizeHtml } from "@/lib/sanitize";
import api from "../api";

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

  if (!detail) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const { candidate: c, state_logs, sent_emails, replies, referrals } = detail;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{c.name || c.email}</h1>
        <p className="text-muted-foreground mt-1">{c.email}</p>
        <div className="flex items-center gap-3 mt-3">
          <StatusBadge status={c.status} />
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Step {c.current_step + 1}
          </span>
          <span className="text-sm text-muted-foreground">
            Enrolled {new Date(c.enrolled_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation */}
        <div className="lg:col-span-2 space-y-4">
          {/* Sent Emails */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Sent Emails ({sent_emails.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sent_emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails sent yet.</p>
              ) : (
                <div className="space-y-2">
                  {sent_emails.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className="text-sm">Step {e.step_id}</span>
                      <span className="text-xs text-muted-foreground">{new Date(e.sent_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversation Thread */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation ({replies.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {replies.map((r) => {
                const isRecruiter = r.classification === "recruiter_reply";
                return (
                  <div
                    key={r.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      isRecruiter ? "border-l-indigo-500 bg-indigo-50/50" : "border-l-emerald-500 bg-emerald-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={isRecruiter ? "default" : "success"} className="text-xs">
                        {isRecruiter ? "You" : "Candidate"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(r.received_at).toLocaleString()}</span>
                    </div>
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.body) }} />
                    {r.classification && !isRecruiter && (
                      <div className="mt-2">
                        <StatusBadge status={r.classification} />
                      </div>
                    )}
                  </div>
                );
              })}

              <Separator />

              <div className="space-y-3">
                <Textarea
                  placeholder="Type your reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                />
                <Button onClick={sendReply} disabled={sending}>
                  <Send className="h-4 w-4 mr-1" />
                  {sending ? "Sending..." : "Send Reply"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Referrals */}
          {referrals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Referrals</CardTitle>
              </CardHeader>
              <CardContent>
                {referrals.map((ref) => (
                  <div key={ref.id} className="py-2 border-b last:border-0">
                    <p className="font-medium text-sm">{ref.referred_name || ref.referred_email}</p>
                    <p className="text-xs text-muted-foreground">{ref.referred_email}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* State History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">State History</CardTitle>
              <CardDescription>Status transitions over time</CardDescription>
            </CardHeader>
            <CardContent>
              {state_logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transitions yet.</p>
              ) : (
                <div className="space-y-3">
                  {state_logs.map((log) => (
                    <div key={log.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={log.from_status} />
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <StatusBadge status={log.to_status} />
                      </div>
                      <div className="flex items-center gap-2 ml-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        {log.note && (
                          <span className="text-xs text-muted-foreground">- {log.note}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
