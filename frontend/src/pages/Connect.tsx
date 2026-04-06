import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, PlugZap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "../App";

export default function Connect() {
  const { recruiter, loading, refresh } = useAuth();
  const [searchParams] = useSearchParams();

  // Refresh auth state when redirected back from Nylas OAuth
  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      refresh();
    }
  }, [searchParams]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-lg mx-auto mt-8">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Connect Your Email</h1>
      <p className="text-muted-foreground mb-6">Link your Gmail account via Nylas to send outreach emails.</p>

      {recruiter ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-lg">Connected</CardTitle>
            </div>
            <CardDescription>Your email is linked and ready to send.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{recruiter.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="success">Active</Badge>
            </div>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => (window.location.href = "/api/auth/connect")}
            >
              Reconnect
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PlugZap className="h-5 w-5 text-indigo-500" />
              <CardTitle className="text-lg">Get Started</CardTitle>
            </div>
            <CardDescription>
              Connect your Gmail account to start sending outreach sequences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => (window.location.href = "/api/auth/connect")}
            >
              Connect Gmail
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
