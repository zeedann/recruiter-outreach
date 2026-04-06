import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Copy, Users, Send, MessageSquare, TrendingUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import api from "../api";

interface Seq {
  id: number;
  name: string;
  recruiter_id: number;
  created_at: string;
  candidate_count: number;
  sent_count: number;
  replied_count: number;
  reply_rate: number;
}

export default function Sequences() {
  const [sequences, setSequences] = useState<Seq[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
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
    setModalOpen(false);
    navigate(`/sequences/${r.data.id}`);
  };

  const duplicate = async (e: React.MouseEvent, seqId: number) => {
    e.preventDefault();
    e.stopPropagation();
    await api.post(`/sequences/${seqId}/duplicate`);
    load();
  };

  const deleteSeq = async (e: React.MouseEvent, seqId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this sequence and all its candidates?")) return;
    await api.delete(`/sequences/${seqId}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sequences</h1>
          <p className="text-muted-foreground mt-1">Create and manage your email outreach sequences.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Sequence
        </Button>
      </div>

      {/* Create Modal */}
      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) setName(""); }}>
        <DialogHeader>
          <DialogTitle>Create Sequence</DialogTitle>
          <DialogDescription>Give your new outreach sequence a name. You can add email steps after.</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <Input
            placeholder="e.g. Senior Engineer Outreach"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            autoFocus
          />
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setModalOpen(false); setName(""); }}>Cancel</Button>
          <Button onClick={create} disabled={creating || !name.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </Dialog>

      {sequences.length === 0 ? (
        <div className="text-center py-16">
          <Send className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No sequences yet. Create one to get started.</p>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Sequence
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sequences.map((s) => (
            <Link key={s.id} to={`/sequences/${s.id}`} className="group">
              <Card className="hover:border-primary/50 hover:shadow-md transition-all h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                        {s.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={(e) => duplicate(e, s.id)}
                        title="Duplicate sequence"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => deleteSeq(e, s.id)}
                        title="Delete sequence"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <Stat icon={Users} label="Candidates" value={s.candidate_count} />
                    <Stat icon={Send} label="Sent" value={s.sent_count} />
                    <Stat icon={MessageSquare} label="Replied" value={s.replied_count} />
                    <Stat icon={TrendingUp} label="Reply Rate" value={`${s.reply_rate}%`} />
                  </div>

                  {s.candidate_count > 0 && (
                    <div className="mt-4">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(s.reply_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="text-center">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
