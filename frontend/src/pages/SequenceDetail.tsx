import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Upload, Clock, GripVertical, ChevronDown, ChevronRight,
  Search, Eye, Pencil, Check, X, Users, Send, MessageSquare, ThumbsUp, Play, Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { sanitizeHtml } from "@/lib/sanitize";
import StatusBadge from "../components/StatusBadge";
import EmailPreview, { TemplateVarChips } from "../components/EmailPreview";
import api from "../api";

interface Step {
  id: number;
  step_order: number;
  subject: string;
  body_html: string;
  delay_minutes: number;
}

interface Seq { id: number; name: string; steps: Step[]; }
interface Candidate {
  id: number; email: string; name: string; current_step: number;
  status: string; enrolled_at: string;
}

const STATUS_TABS = ["all", "pending", "active", "replied", "interested", "not_interested", "neutral", "referred"];

export default function SequenceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [seq, setSeq] = useState<Seq | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");

  // Step editor state
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [stepEdit, setStepEdit] = useState({ subject: "", body_html: "", delay_minutes: 0 });
  const [newStep, setNewStep] = useState({ subject: "", body_html: "", delay_minutes: 0 });
  const [showNewStep, setShowNewStep] = useState(false);
  const [previewStep, setPreviewStep] = useState<Step | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Candidate state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const newBodyRef = useRef<HTMLTextAreaElement>(null);

  const loadSeq = () => api.get(`/sequences/${id}`).then((r) => { setSeq(r.data); setNameVal(r.data.name); });
  const loadCandidates = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    api.get(`/candidates/sequence/${id}?${params}`).then((r) => setCandidates(r.data));
  }, [id, search, statusFilter]);

  useEffect(() => { loadSeq(); }, [id]);
  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // --- Sequence name edit ---
  const saveName = async () => {
    if (!nameVal.trim() || !seq) return;
    await api.put(`/sequences/${id}`, { name: nameVal });
    setEditingName(false);
    loadSeq();
  };

  // --- Step actions ---
  const addStep = async () => {
    if (!seq || !newStep.subject.trim()) return;
    await api.post(`/sequences/${id}/steps`, { ...newStep, step_order: seq.steps.length });
    setNewStep({ subject: "", body_html: "", delay_minutes: 0 });
    setShowNewStep(false);
    loadSeq();
  };

  const saveStep = async (stepId: number) => {
    await api.put(`/sequences/steps/${stepId}`, { ...stepEdit, step_order: seq!.steps.find(s => s.id === stepId)!.step_order });
    setEditingStep(null);
    loadSeq();
  };

  const deleteStep = async (stepId: number) => {
    await api.delete(`/sequences/steps/${stepId}`);
    loadSeq();
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || !seq) return;
    const steps = [...seq.steps];
    const [moved] = steps.splice(dragIdx, 1);
    steps.splice(targetIdx, 0, moved);
    await api.post(`/sequences/${id}/reorder-steps`, { step_ids: steps.map(s => s.id) });
    setDragIdx(null);
    loadSeq();
  };

  const insertVar = (v: string, ref: React.RefObject<HTMLTextAreaElement | null>, setter: (val: string) => void, field: string) => {
    const el = ref.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const current = field;
      const newVal = current.substring(0, start) + v + current.substring(end);
      setter(newVal);
    }
  };

  // --- Candidate actions ---
  const uploadCsv = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await api.post(`/candidates/upload/${id}`, form);
    loadCandidates();
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleSelect = (cid: number) => {
    const s = new Set(selected);
    s.has(cid) ? s.delete(cid) : s.add(cid);
    setSelected(s);
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map(c => c.id)));
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    await api.post("/candidates/bulk-action", { candidate_ids: [...selected], action: "delete" });
    setSelected(new Set());
    loadCandidates();
  };

  const startSequence = async () => {
    await api.post(`/candidates/start/${id}`);
    loadCandidates();
  };

  if (!seq) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const statusCounts = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input value={nameVal} onChange={(e) => setNameVal(e.target.value)} className="text-2xl font-bold h-auto py-1" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              />
              <Button size="icon" variant="ghost" onClick={saveName}><Check className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingName(true)}>
              <h1 className="text-3xl font-bold tracking-tight">{seq.name}</h1>
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <p className="text-muted-foreground mt-1">{seq.steps.length} steps &middot; {candidates.length} candidates</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={async () => {
            if (!window.confirm("Delete this sequence and all its candidates?")) return;
            await api.delete(`/sequences/${id}`);
            navigate("/sequences");
          }}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      {/* ===== STEP EDITOR ===== */}
      <section>
        {seq.steps.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Email Sequence</h2>
            <Button size="sm" variant="outline" onClick={() => setShowNewStep(!showNewStep)}>
              <Plus className="h-4 w-4 mr-1" /> Add Step
            </Button>
          </div>
        )}

        {seq.steps.length === 0 && !showNewStep && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Build your email sequence</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                Add your first email step to start crafting your outreach. You can add follow-ups, set delays, and use template variables like {"{{name}}"}.
              </p>
              <Button onClick={() => setShowNewStep(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add First Step
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-0">
          {seq.steps.map((step, idx) => {
            const isExpanded = expandedStep === step.id;
            const isEditing = editingStep === step.id;

            return (
              <div key={step.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                className="relative"
              >
                {/* Connector line */}
                {idx > 0 && (
                  <div className="flex items-center gap-2 py-1.5 pl-8">
                    <div className="w-px h-4 bg-border ml-3" />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      wait {step.delay_minutes} min
                    </div>
                  </div>
                )}

                <Card className={`transition-all ${dragIdx === idx ? "opacity-50" : ""} ${isExpanded ? "ring-2 ring-primary/20" : ""}`}>
                  <CardContent className="p-0">
                    {/* Collapsed header */}
                    <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{step.subject}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setPreviewStep(previewStep?.id === step.id ? null : step); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                          e.stopPropagation();
                          setEditingStep(isEditing ? null : step.id);
                          setStepEdit({ subject: step.subject, body_html: step.body_html, delay_minutes: step.delay_minutes });
                          setExpandedStep(step.id);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteStep(step.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t space-y-3">
                        {isEditing ? (
                          <>
                            <Input value={stepEdit.subject} onChange={(e) => setStepEdit({ ...stepEdit, subject: e.target.value })} placeholder="Subject" className="mt-3" />
                            <TemplateVarChips onInsert={(v) => insertVar(v, bodyRef, (val) => setStepEdit({ ...stepEdit, body_html: val }), stepEdit.body_html)} />
                            <Textarea ref={bodyRef} value={stepEdit.body_html} onChange={(e) => setStepEdit({ ...stepEdit, body_html: e.target.value })} placeholder="Email body (HTML)" className="min-h-[120px]" />
                            <div className="flex items-center gap-3">
                              <label className="text-sm text-muted-foreground">Delay:</label>
                              <Input type="number" min={0} value={stepEdit.delay_minutes} onChange={(e) => setStepEdit({ ...stepEdit, delay_minutes: parseInt(e.target.value) || 0 })} className="w-20" />
                              <span className="text-xs text-muted-foreground">min</span>
                              <div className="flex-1" />
                              <Button size="sm" variant="outline" onClick={() => setEditingStep(null)}>Cancel</Button>
                              <Button size="sm" onClick={() => saveStep(step.id)}>Save</Button>
                            </div>
                          </>
                        ) : (
                          <div className="mt-3 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.body_html) }} />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Preview pane */}
        {previewStep && (
          <div className="mt-4">
            <EmailPreview subject={previewStep.subject} bodyHtml={previewStep.body_html} />
          </div>
        )}

        {/* New step form */}
        {showNewStep && (
          <Card className="mt-4 border-dashed border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Subject line" value={newStep.subject} onChange={(e) => setNewStep({ ...newStep, subject: e.target.value })} />
              <TemplateVarChips onInsert={(v) => insertVar(v, newBodyRef, (val) => setNewStep({ ...newStep, body_html: val }), newStep.body_html)} />
              <Textarea ref={newBodyRef} placeholder="Email body (HTML)" value={newStep.body_html} onChange={(e) => setNewStep({ ...newStep, body_html: e.target.value })} className="min-h-[100px]" />
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Delay:</label>
                <Input type="number" min={0} value={newStep.delay_minutes} onChange={(e) => setNewStep({ ...newStep, delay_minutes: parseInt(e.target.value) || 0 })} className="w-20" />
                <span className="text-xs text-muted-foreground">min</span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => setShowNewStep(false)}>Cancel</Button>
                <Button size="sm" onClick={addStep}>Add Step</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {seq.steps.length > 0 && <>
      <Separator />

      {/* ===== CANDIDATES ===== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Candidates ({candidates.length})</h2>
          <div className="flex items-center gap-2">
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={uploadCsv} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Upload CSV
            </Button>
            {(statusCounts["pending"] || 0) > 0 && (
              <Button size="sm" onClick={startSequence}>
                <Play className="h-4 w-4 mr-1" /> Start Sequence ({statusCounts["pending"]} pending)
              </Button>
            )}
          </div>
        </div>

        {/* Status summary badges */}
        {candidates.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <StatBadge icon={Users} label="Total" value={candidates.length} />
            <StatBadge icon={Send} label="Active" value={statusCounts["active"] || 0} color="text-blue-600" />
            <StatBadge icon={MessageSquare} label="Replied" value={statusCounts["replied"] || 0} color="text-amber-600" />
            <StatBadge icon={ThumbsUp} label="Interested" value={statusCounts["interested"] || 0} color="text-emerald-600" />
          </div>
        )}

        {/* Search + filter */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search candidates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "all" ? "All" : s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {/* Table */}
        {candidates.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No candidates enrolled yet. Upload a CSV to get started.</p>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 px-3 w-10">
                      <input type="checkbox" checked={selected.size === candidates.length && candidates.length > 0} onChange={toggleAll} className="rounded" />
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Progress</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Enrolled</th>
                    <th className="py-3 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-3">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                      </td>
                      <td className="py-3 px-3 font-medium">{c.email}</td>
                      <td className="py-3 px-3 text-muted-foreground">{c.name || "—"}</td>
                      <td className="py-3 px-3">
                        <StepDots current={c.current_step} total={seq.steps.length} />
                      </td>
                      <td className="py-3 px-3"><StatusBadge status={c.status} /></td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">{new Date(c.enrolled_at).toLocaleDateString()}</td>
                      <td className="py-3 px-3">
                        <Link to={`/candidates/${c.id}`} className="text-primary text-xs hover:underline">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
      </>}
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i < current ? "bg-primary" : i === current ? "bg-primary/50 ring-2 ring-primary/30" : "bg-muted-foreground/20"
          }`}
          title={`Step ${i + 1}`}
        />
      ))}
      <span className="text-[10px] text-muted-foreground ml-1">{current + 1}/{total}</span>
    </div>
  );
}

function StatBadge({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color || "text-muted-foreground"}`} />
      <span className="text-sm font-medium">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
