import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { CRM_TABS, titleForTab } from "./navigation";

function IconButton({ label, children, ...props }) {
  return <button className="icon-btn" aria-label={label} title={label} {...props}>{children}</button>;
}

function Sidebar({ activeTab, onNavigate, open, onClose }) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-mark">F</div>
        <div><strong>Catálogo Web</strong><span>CRM interno</span></div>
        <IconButton label="Cerrar menú" onClick={onClose}><X /></IconButton>
      </div>
      <nav>
        {CRM_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "active" : ""}
            onClick={() => { onNavigate(id); onClose(); }}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot"><span>Catálogo-Web</span><small>Año 2026</small></div>
    </aside>
  );
}

function Header({ activeTab, onMenu, onLogout }) {
  return (
    <header className="topbar">
      <IconButton label="Abrir menú" onClick={onMenu}><Menu /></IconButton>
      <div>
        <h1>{titleForTab(activeTab)}</h1>
        <p>{new Intl.DateTimeFormat("es-AR", {
          weekday: "long", day: "numeric", month: "long",
        }).format(new Date())}</p>
      </div>
      <div className="header-session">
        <div className="status-dot"><i />Sistema operativo</div>
        <button className="logout-btn" onClick={onLogout} title="Cerrar sesión">
          <LogOut size={17} /><span>Salir</span>
        </button>
      </div>
    </header>
  );
}

export default function AppShell({ activeTab, onNavigate, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onNavigate={onNavigate} open={menuOpen}
        onClose={() => setMenuOpen(false)} />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main>
        <Header activeTab={activeTab} onMenu={() => setMenuOpen(true)} onLogout={onLogout} />
        {children}
      </main>
    </div>
  );
}
