import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Connect from "./pages/Connect";
import Sequences from "./pages/Sequences";
import SequenceDetail from "./pages/SequenceDetail";
import CandidateDetail from "./pages/CandidateDetail";
import Dashboard from "./pages/Dashboard";

function Nav() {
  const loc = useLocation();
  const linkStyle = (path: string) => ({
    padding: "8px 16px",
    textDecoration: "none",
    color: loc.pathname === path ? "#fff" : "#ccc",
    background: loc.pathname === path ? "#4f46e5" : "transparent",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: loc.pathname === path ? 600 : 400,
  });

  return (
    <nav
      style={{
        background: "#1e1b4b",
        padding: "12px 24px",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginRight: 24 }}>
        Recruiter Outreach
      </span>
      <Link to="/" style={linkStyle("/")}>Dashboard</Link>
      <Link to="/sequences" style={linkStyle("/sequences")}>Sequences</Link>
      <Link to="/connect" style={linkStyle("/connect")}>Connect Email</Link>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 24px" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/sequences" element={<Sequences />} />
          <Route path="/sequences/:id" element={<SequenceDetail />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
