import { createContext, useContext, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Mail, ListChecks, PlugZap, LogOut } from "lucide-react";
import Connect from "./pages/Connect";
import Sequences from "./pages/Sequences";
import SequenceDetail from "./pages/SequenceDetail";
import CandidateDetail from "./pages/CandidateDetail";
import Dashboard from "./pages/Dashboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import api from "./api";

interface Recruiter {
  id: number;
  email: string;
  nylas_grant_id: string;
}

interface AuthCtx {
  recruiter: Recruiter | null;
  loading: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  recruiter: null,
  loading: true,
  refresh: () => {},
  logout: async () => {},
});
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [recruiter, setRecruiter] = useState<Recruiter | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    api.get("/auth/me")
      .then((r) => setRecruiter(r.data))
      .catch(() => setRecruiter(null))
      .finally(() => setLoading(false));
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setRecruiter(null);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <AuthContext.Provider value={{ recruiter, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function Nav() {
  const loc = useLocation();
  const { recruiter, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sequences", label: "Sequences", icon: ListChecks },
    { to: "/connect", label: "Connect Email", icon: PlugZap },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/connect");
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-14">
        <Link to="/" className="flex items-center gap-2 mr-8">
          <Mail className="h-5 w-5 text-indigo-400" />
          <span className="text-white font-bold text-lg">Outreach</span>
        </Link>
        {recruiter && (
          <div className="flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
        {recruiter && (
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-slate-400">{recruiter.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { recruiter, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  if (!recruiter) {
    return <Connect />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <main className="max-w-7xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/connect" element={<Connect />} />
            <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/sequences" element={<RequireAuth><Sequences /></RequireAuth>} />
            <Route path="/sequences/:id" element={<RequireAuth><SequenceDetail /></RequireAuth>} />
            <Route path="/candidates/:id" element={<RequireAuth><CandidateDetail /></RequireAuth>} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
