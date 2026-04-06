const colors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#f3f4f6", text: "#6b7280" },
  active: { bg: "#dbeafe", text: "#2563eb" },
  replied: { bg: "#fef3c7", text: "#d97706" },
  interested: { bg: "#dcfce7", text: "#16a34a" },
  not_interested: { bg: "#fee2e2", text: "#dc2626" },
  neutral: { bg: "#f3f4f6", text: "#6b7280" },
  referred: { bg: "#e0e7ff", text: "#4f46e5" },
  referral: { bg: "#e0e7ff", text: "#4f46e5" },
};

export default function StatusBadge({ status }: { status: string }) {
  const c = colors[status] || colors.neutral;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
