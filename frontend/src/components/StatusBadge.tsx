import { Badge } from "@/components/ui/badge";

const variantMap: Record<string, "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline"> = {
  pending: "secondary",
  active: "info",
  replied: "warning",
  interested: "success",
  not_interested: "destructive",
  neutral: "secondary",
  referred: "default",
  referral: "default",
};

export default function StatusBadge({ status }: { status: string }) {
  const variant = variantMap[status] || "secondary";
  return (
    <Badge variant={variant}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
