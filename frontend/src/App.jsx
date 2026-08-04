import { useCallback, useEffect, useState } from "react";
import {
  X,
  CheckCircle2,
  RefreshCw,
  FileText,
  Eye,
  EyeOff,
} from "lucide-react";
import AppShell from "./app/AppShell";
import TabPages from "./app/TabPages";
import "./expenses.css";
import "./payment-summary.css";
import "./vps.css";
import "./instagram-links.css";
import "./worked-hours.css";
import "./prospecting.css";
import { createDashboardPage } from "./pages/DashboardPage";
import { createClientsPage } from "./pages/ClientsPage";
import { createAgendaPage } from "./pages/AgendaPage";
import { createMessagesPage } from "./pages/MessagesPage";
import { createWorkedHoursPage } from "./pages/WorkedHoursPage";
import { createProspectingPage } from "./pages/ProspectingPage";
import { createVpsPage } from "./pages/VpsPage";
import { createExpensesPage } from "./pages/ExpensesPage";
import { createPaymentsPage } from "./pages/PaymentsPage";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV
    ? `http://${window.location.hostname}:5000`
    : window.location.origin);
const API = `${BACKEND_URL.replace(/\/$/, "")}/api`;
const TOKEN_KEY = "persistent_token";
const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
  localStorage.removeItem("token_expiry");
};
const getToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem("token_expiry"));
  if (!token || !expiry || Date.now() >= expiry) {
    clearSession();
    return null;
  }
  return token;
};
async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("crm-session-expired"));
  }
  if (!response.ok)
    throw new Error(body.error?.message || "No se pudo completar la operación");
  return body.data;
}
async function downloadApiFile(path, filename) {
  const token = getToken();
  const response = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("crm-session-expired"));
  }
  if (!response.ok) {
    const rawBody = await response.text();
    let message;
    try {
      const body = JSON.parse(rawBody);
      message = body.error?.message || body.msg || "";
    } catch {
      message = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    }
    throw new Error(message || `No se pudo descargar el archivo (HTTP ${response.status})`);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
const LABEL = {
  active: "Activo",
  at_risk: "En riesgo",
  paused: "Pausado",
  cancelled: "Cancelado",
  no_signup: "Sin alta",
  lead: "Potencial",
  onboarding: "Inicio",
  first_month: "1er mes",
  second_month: "2do mes",
  third_month: "3er mes",
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  paid: "Pagado",
  overdue: "Vencido",
  partial: "Parcial",
  monthly: "Mensualidad",
  extra_work: "Trabajo extra",
  deposit: "Seña",
  domain: "Dominio",
  discount: "Descuento",
  other: "Otro",
  yes: "Sí",
  no: "No",
  published: "Publicada",
  optimized: "Optimizadas",
};
const ACQUISITION_OPTIONS = [
  ["business_whatsapp", "WhatsApp del negocio"],
  ["personal_whatsapp", "WhatsApp personal"],
  ["facebook_marketplace", "Facebook Marketplace"],
  ["facebook_group", "Facebook grupo"],
  ["instagram_nicodelfino", "Instagram personal nicodelfino__"],
  ["instagram_nicod123", "Instagram personal nicod_123"],
  ["business_instagram", "Instagram del negocio"],
  ["footer", "Footer"],
  ["recommended", "Recomendado"],
];
const ACTION_PRESETS = [
  "ENTREGA",
  "CONTROL SILENCIOSO",
  "REVISIÓN DE PRECIOS",
  "CARGA PRECIOS GRATIS",
  "CARGA DE PRODUCTOS CON COBRO",
  "QR",
  "LINK EN BIO",
  "1ER ANALYTIC CON REPORTE PRODUCTOS MÁS VISTOS",
  "HISTORIA IG",
  "REVISIÓN DE PORTADA (OPCIONAL)",
  "CARRUSEL FOTOS",
  "ANALYTIC",
  "TARJETAS CATEGORÍAS POR MARCAS",
  "MÁS VENDIDOS",
  "ANALYTICS",
  "CUPÓN",
  "PRECIO MASIVO",
];
const acquisitionLabel = (value) => {
  if (!value || value === "not_set") return "Sin registrar";
  return ACQUISITION_OPTIONS.find(([id]) => id === value)?.[1] || value;
};
const instagramUrl = (value) => value
  ? `https://www.instagram.com/${value.trim().replace(/^@/, "")}/`
  : null;
const externalUrl = (value) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
};
const fmtDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : "Sin fecha";
const fmtMonth = (value) => {
  if (value === "all") return "Todos los meses";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || "")) return "Sin mes";
  const parsed = new Date(`${value}-01T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Sin mes";
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};
const monthKey = (value = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
const nextMonthKey = (value = new Date()) =>
  monthKey(new Date(value.getFullYear(), value.getMonth() + 1, 1));
const billingDay = (value) => value ? Number(value.slice(8, 10)) : 32;
const fmtMoney = (value, currency = "ARS") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" ? 0 : 2,
  }).format(value || 0);
const addCalendarMonths = (isoDate, months = 1) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const targetMonth = (monthIndex % 12) + 1;
  const targetYear = year + Math.floor(monthIndex / 12);
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const addCalendarMonth = (isoDate) => addCalendarMonths(isoDate, 1);
const clientBillingDateInMonth = (client, month) => {
  if (!["active", "at_risk"].includes(client.status) || !client.signup_date || !client.next_renewal_date) {
    return null;
  }
  if (month < client.next_renewal_date.slice(0, 7)) return null;
  const day = Number(client.signup_date.slice(8, 10));
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const stageForDates = (signupDate, renewalDate) => {
  if (!signupDate) return "first_month";
  const reference = renewalDate || new Date().toISOString().slice(0, 10);
  const [signupYear, signupMonth] = signupDate.split("-").map(Number);
  const [referenceYear, referenceMonth] = reference.split("-").map(Number);
  let elapsedMonths = Math.max(0, (referenceYear - signupYear) * 12 + referenceMonth - signupMonth);
  if (reference < addCalendarMonths(signupDate, elapsedMonths)) {
    elapsedMonths = Math.max(0, elapsedMonths - 1);
  }
  const monthNumber = Math.max(1, renewalDate ? elapsedMonths : elapsedMonths + 1);
  return [null, "first_month", "second_month", "third_month"][monthNumber] || `month_${monthNumber}`;
};
const stageLabel = (value) => {
  const monthNumber = Number(value?.match(/^month_(\d+)$/)?.[1]);
  return monthNumber ? `${monthNumber}.º mes` : LABEL[value] || value || "Sin definir";
};
const stageMonthNumber = (value) => {
  const namedMonths = { first_month: 1, second_month: 2, third_month: 3 };
  return namedMonths[value] || Number(value?.match(/^month_(\d+)$/)?.[1]) || 0;
};
const badge = (value) => {
  const monthNumber = stageMonthNumber(value);
  const monthHue = monthNumber ? Math.round((monthNumber * 137.508) % 360) : null;
  return (
    <span
      className={`badge ${value} ${monthNumber ? "service-month" : ""}`}
      style={monthNumber ? { "--month-hue": monthHue } : undefined}
    >
      {stageLabel(value)}
    </span>
  );
};
function useEscapeClose(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const close = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [enabled, onClose]);
}
function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function Toast({ message, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 3200);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="toast">
      <CheckCircle2 size={18} />
      {message}
      <button onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading">
      <RefreshCw />
      <span>Cargando información...</span>
    </div>
  );
}
function Empty() {
  return (
    <div className="empty">
      <FileText />
      <h3>No hay resultados</h3>
      <p>Probá con otros filtros o registrá información nueva.</p>
    </div>
  );
}
const messagePages = createMessagesPage({ api, ACQUISITION_OPTIONS, acquisitionLabel, fmtDate, fmtMonth, useEscapeClose, IconButton, Empty });
const { Messages, dateKey, fromDateKey, addDays, startOfWeek, fmtHours } = messagePages;
const clientPages = createClientsPage({ api, downloadApiFile, LABEL, ACQUISITION_OPTIONS, ACTION_PRESETS, acquisitionLabel, instagramUrl, externalUrl, fmtDate, billingDay, fmtMoney, addCalendarMonth, stageForDates, stageLabel, badge, dateKey, useEscapeClose, IconButton, Toast, Loading, Empty });
const { Clients, ClientForm, DetailModal, PaymentEditor } = clientPages;
const agendaPages = createAgendaPage({ api, ACTION_PRESETS, fmtDate, dateKey, badge, useEscapeClose, IconButton, Toast, Empty, ClientForm, DetailModal });
const { Agenda, AgendaNewAction, AgendaActionEditor } = agendaPages;
const { Dashboard } = createDashboardPage({ api, downloadApiFile, LABEL, fmtDate, fmtMonth, monthKey, nextMonthKey, fmtMoney, dateKey, fromDateKey, addDays, startOfWeek, clientBillingDateInMonth, badge, useEscapeClose, IconButton, Loading, Empty, ClientForm, DetailModal, AgendaNewAction, AgendaActionEditor });
const { WorkedHours } = createWorkedHoursPage({ api, fmtDate, fmtMonth, monthKey, dateKey, fromDateKey, addDays, startOfWeek, fmtHours, IconButton });
const { Prospecting } = createProspectingPage({ api, acquisitionLabel, fmtDate, fmtMonth, dateKey, fromDateKey, addDays, startOfWeek, useEscapeClose, IconButton });
const { Vps } = createVpsPage({ api, Loading, Empty });
const { Expenses } = createExpensesPage({ api, fmtDate, fmtMoney, IconButton, Empty });
const { Payments } = createPaymentsPage({ api, LABEL, fmtDate, fmtMoney, badge, useEscapeClose, IconButton, ClientForm, DetailModal, PaymentEditor });

function Login({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const base = BACKEND_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/auth/login-persistent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw new Error(data.error || "Credenciales inválidas");
      const expiry = Date.now() + data.expires_in_days * 24 * 60 * 60 * 1000;
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("token_expiry", String(expiry));
      const userResponse = await fetch(`${base}/user/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      const user = await userResponse.json().catch(() => ({}));
      if (!userResponse.ok || !user.is_admin) { clearSession(); throw new Error(user.error || "No tenés permisos de administrador"); }
      onAuthenticated(user);
    } catch (loginError) {
      clearSession(); setError(loginError.message || "No se pudo conectar con el servidor");
    } finally { setLoading(false); }
  };
  return (
    <main className="login-page"><section className="login-card">
      <div className="login-brand"><span>F</span></div><p className="login-eyebrow">Catálogo Web</p>
      <h1>Ingresá al CRM</h1><p className="login-copy">Usá tu cuenta de administrador para continuar.</p>
      <form onSubmit={submit}>
        {error && <div className="login-error" role="alert">{error}</div>}
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></label>
        <label>Contraseña<span className="password-field">
          <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span></label>
        <button className="login-submit" type="submit" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </section></main>
  );
}
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [visitedPages, setVisitedPages] = useState(() => new Set(["dashboard"]));
  const [session, setSession] = useState(() => ({ checking: Boolean(getToken()), user: null }));
  const navigate = useCallback((nextPage) => {
    setVisitedPages((current) => {
      if (current.has(nextPage)) return current;
      const next = new Set(current);
      next.add(nextPage);
      return next;
    });
    setPage(nextPage);
  }, []);
  useEffect(() => {
    const expire = () => setSession({ checking: false, user: null });
    window.addEventListener("crm-session-expired", expire);
    const token = getToken();
    if (token) {
      fetch(`${BACKEND_URL.replace(/\/$/, "")}/user/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => { const user = await response.json().catch(() => ({})); if (!response.ok || !user.is_admin) throw new Error(); setSession({ checking: false, user }); })
        .catch(() => { clearSession(); setSession({ checking: false, user: null }); });
    }
    return () => window.removeEventListener("crm-session-expired", expire);
  }, []);
  if (session.checking) return <div className="login-page"><Loading /></div>;
  if (!session.user) return <Login onAuthenticated={(user) => setSession({ checking: false, user })} />;
  const logout = () => { clearSession(); setSession({ checking: false, user: null }); };
  const pages = {
    dashboard: <Dashboard goClients={() => navigate("clients")} />,
    clients: <Clients />,
    agenda: <Agenda />,
    payments: <Payments />,
    expenses: <Expenses />,
    vps: <Vps />,
    messages: <Messages />,
    "worked-hours": <WorkedHours />,
    prospecting: <Prospecting />,
  };
  return (
    <AppShell activeTab={page} onNavigate={navigate} onLogout={logout}>
      <TabPages activeTab={page} visitedTabs={visitedPages} pages={pages} />
    </AppShell>
  );
}
