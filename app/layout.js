import "./globals.css";
import { cfg } from "../src/config.js";

export const metadata = {
  title: "ARS-U — Verified Signal Intelligence",
  description:
    "Automated crypto futures setups with a public, tamper-evident track record. Every signal is measured. Labels are earned, never granted.",
};

export default function RootLayout({ children }) {
  const c = cfg();
  const phase = c.collectingMode ? "COLLECTING" : "LIVE";
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <a href="/" className="brand">
              ARS<span className="brand-accent">-U</span>
            </a>
            <nav className="nav">
              <a href="/track-record">Track record</a>
              <a href="/families">Families</a>
              <a href="/methodology">Methodology</a>
              <a href="/status">Status</a>
              <a href="/pricing">Pricing</a>
            </nav>
            <span className={`badge ${phase === "LIVE" ? "badge-verified" : "badge-collecting"}`}>{phase}</span>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>
              All positions are virtual. This service never places exchange orders and provides
              information, not financial advice. Trading crypto derivatives involves substantial
              risk of loss. Past performance does not guarantee future results.
            </p>
            <p className="mono dim">
              {c.indicatorVersion} · params {c.parameterHash} · engine {c.engineVersion}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
