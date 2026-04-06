import { Card } from "@/components/ui/card";
import { sanitizeHtml } from "@/lib/sanitize";

const SAMPLE_DATA: Record<string, string> = {
  name: "Alex Chen",
  email: "alex.chen@example.com",
  company: "Acme Corp",
};

function resolveVars(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return SAMPLE_DATA[key] || `{{${key}}}`;
  });
}

export default function EmailPreview({ subject, bodyHtml }: { subject: string; bodyHtml: string }) {
  const resolvedSubject = resolveVars(subject);
  const resolvedBody = resolveVars(bodyHtml);

  return (
    <Card className="border-2 border-dashed">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Preview</span>
          <span>&middot;</span>
          <span>Template variables resolved with sample data</span>
        </div>
        <div className="bg-white rounded-lg border shadow-sm">
          {/* Email header */}
          <div className="p-4 border-b space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">To:</span>
              <span className="text-sm">alex.chen@example.com</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Subject:</span>
              <span className="text-sm font-medium">{resolvedSubject || "No subject"}</span>
            </div>
          </div>
          {/* Email body */}
          <div className="p-4">
            {resolvedBody ? (
              <div className="text-sm leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(resolvedBody) }} />
            ) : (
              <p className="text-sm text-muted-foreground italic">No content yet</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TemplateVarChips({ onInsert }: { onInsert: (v: string) => void }) {
  const vars = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground">Insert:</span>
      {vars.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(`{{${v.key}}}`)}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors cursor-pointer"
        >
          {`{{${v.label.toLowerCase()}}}`}
        </button>
      ))}
    </div>
  );
}
