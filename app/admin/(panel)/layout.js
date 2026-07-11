import { requireAdmin } from "../../../src/security/adminSession.js";
import AdminRunButton from "../../../components/AdminRunButton.js";

const LINKS = [
  ["/admin", "Overview"], ["/admin/scanner", "Scanner"], ["/admin/signals", "Signals"],
  ["/admin/positions", "Positions"], ["/admin/families", "Families"],
  ["/admin/discord", "Discord"], ["/admin/settings", "Settings"], ["/admin/tools", "Tools"],
];

export default function AdminPanelLayout({ children }) {
  requireAdmin();
  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <strong style={{ letterSpacing: "0.06em" }}>ARS-U ADMIN</strong>
        <nav className="nav">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>
        <AdminRunButton path="/api/auth/admin/logout" method="POST" label="Log out" redirectTo="/admin/login" small />
      </div>
      {children}
    </div>
  );
}
