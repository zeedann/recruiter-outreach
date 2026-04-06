import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import {
  Users,
  Send,
  MessageSquare,
  TrendingUp,
  ThumbsUp,
  Clock,
  ArrowRight,
  Mail,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface FunnelData {
  total_candidates: number;
  emails_sent: number;
  unique_candidates_emailed: number;
  replied: number;
  interested: number;
  reply_rate: number;
  interest_rate: number;
}

interface DailyActivity {
  date: string;
  sent: number;
  replied: number;
  interested: number;
}

interface TimeToReply {
  avg_minutes: number;
  median_minutes: number;
  p90_minutes: number;
  total_replies: number;
}

interface StatusDist {
  status: string;
  count: number;
  percentage: number;
}

interface ActivityItem {
  type: string;
  candidate_email: string;
  candidate_name: string;
  detail: string;
  timestamp: string;
  sequence_name: string | null;
}

interface SeqComparison {
  sequence_id: number;
  sequence_name: string;
  total_candidates: number;
  emails_sent: number;
  reply_count: number;
  reply_rate: number;
  interested_count: number;
  interest_rate: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  active: "#3b82f6",
  replied: "#f59e0b",
  interested: "#22c55e",
  not_interested: "#ef4444",
  neutral: "#6b7280",
  referred: "#8b5cf6",
};

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#6b7280"];

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [timeToReply, setTimeToReply] = useState<TimeToReply | null>(null);
  const [statusDist, setStatusDist] = useState<StatusDist[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/analytics"),
      api.get("/dashboard/funnel"),
      api.get("/dashboard/time-to-reply"),
      api.get("/dashboard/status-distribution"),
      api.get("/dashboard/recent-activity?limit=15"),
    ])
      .then(([a, f, t, s, act]) => {
        setAnalytics(a.data);
        setFunnel(f.data);
        setTimeToReply(t.data);
        setStatusDist(s.data);
        setActivity(act.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const totals = analytics.reduce(
    (acc, a) => ({
      candidates: acc.candidates + a.total_candidates,
      sent: acc.sent + a.sent_count,
      replied: acc.replied + a.replied_count,
      interested: acc.interested + a.interested_count,
    }),
    { candidates: 0, sent: 0, replied: 0, interested: 0 }
  );

  const replyRate = totals.sent > 0 ? ((totals.replied / totals.sent) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your outreach performance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={Users} label="Total Candidates" value={totals.candidates} color="text-indigo-600" />
        <KPICard icon={Send} label="Emails Sent" value={totals.sent} color="text-cyan-600" />
        <KPICard icon={MessageSquare} label="Replies" value={totals.replied} color="text-amber-600" />
        <KPICard icon={TrendingUp} label="Reply Rate" value={`${replyRate}%`} color="text-blue-600" />
        <KPICard icon={ThumbsUp} label="Interested" value={totals.interested} color="text-emerald-600" />
        <KPICard
          icon={Clock}
          label="Avg Reply Time"
          value={timeToReply ? formatMinutes(timeToReply.avg_minutes) : "—"}
          color="text-purple-600"
        />
      </div>

      {/* Funnel + Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Conversion Funnel</CardTitle>
            <CardDescription>Candidate journey from outreach to interest</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel && <FunnelChart data={funnel} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
            <CardDescription>Current candidate breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {statusDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={statusDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusDist.map((entry, i) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [value, name.replace(/_/g, " ")]} />
                  <Legend formatter={(value: string) => value.replace(/_/g, " ")} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground py-12">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sequence Analytics Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sequence Analytics</CardTitle>
          <CardDescription>Detailed metrics for each sequence</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No sequences yet.{" "}
              <Link to="/sequences" className="text-primary hover:underline">
                Create one
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Sequence</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Candidates</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Sent</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Replied</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Interested</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Not Interested</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Reply Rate</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Funnel</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((a) => {
                    const rate = a.sent_count > 0 ? (a.replied_count / a.sent_count) * 100 : 0;
                    return (
                      <tr key={a.sequence_id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <Link to={`/sequences/${a.sequence_id}`} className="text-primary font-medium hover:underline">
                            {a.sequence_name}
                          </Link>
                        </td>
                        <td className="text-right py-3 px-4">{a.total_candidates}</td>
                        <td className="text-right py-3 px-4">{a.sent_count}</td>
                        <td className="text-right py-3 px-4">{a.replied_count}</td>
                        <td className="text-right py-3 px-4">
                          <span className="text-emerald-600 font-medium">{a.interested_count}</span>
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className="text-red-500">{a.not_interested_count}</span>
                        </td>
                        <td className="text-right py-3 px-4 font-medium">{rate.toFixed(1)}%</td>
                        <td className="py-3 px-4">
                          <MiniBar total={a.total_candidates} replied={a.replied_count} interested={a.interested_count} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>Latest events across all sequences</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <div className={`mt-0.5 p-1.5 rounded-full ${
                    item.type === "sent" ? "bg-indigo-100 text-indigo-600" :
                    item.type === "reply" ? "bg-amber-100 text-amber-600" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {item.type === "sent" ? <Send className="h-3.5 w-3.5" /> :
                     item.type === "reply" ? <MessageSquare className="h-3.5 w-3.5" /> :
                     <Activity className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.candidate_name}</span>
                      <span className="text-muted-foreground mx-1.5">&middot;</span>
                      <span className="text-muted-foreground">{item.detail}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={
                    item.type === "sent" ? "default" :
                    item.type === "reply" ? "warning" : "secondary"
                  } className="shrink-0">
                    {item.type === "status_change" ? "status" : item.type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function KPICard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function FunnelChart({ data }: { data: FunnelData }) {
  const steps = [
    { label: "Candidates", value: data.total_candidates, color: "#6366f1" },
    { label: "Emailed", value: data.unique_candidates_emailed, color: "#3b82f6" },
    { label: "Replied", value: data.replied, color: "#f59e0b" },
    { label: "Interested", value: data.interested, color: "#22c55e" },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const width = Math.max((step.value / max) * 100, 4);
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
          : null;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-lg font-bold">{step.value}</span>
              </div>
              {convRate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  {convRate}% conversion
                </div>
              )}
            </div>
            <div className="h-8 bg-muted rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{ width: `${width}%`, backgroundColor: step.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniBar({ total, replied, interested }: { total: number; replied: number; interested: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const rw = (replied / total) * 100;
  const iw = (interested / total) * 100;
  return (
    <div className="flex h-2 w-24 bg-muted rounded-full overflow-hidden">
      <div className="bg-amber-400" style={{ width: `${rw}%` }} />
      <div className="bg-emerald-500" style={{ width: `${iw}%` }} />
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m === 0) return "—";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}
