import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  CalendarDays,
  WalletCards,
  ReceiptText,
  Server,
  LayoutDashboard,
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ArrowUpDown,
  Menu,
  RefreshCw,
  ExternalLink,
  MapPin,
  Instagram,
  Mail,
  Phone,
  Edit3,
  Check,
  RotateCcw,
  FileText,
  TrendingUp,
  Pin,
  Save,
  ChartNoAxesColumnIncreasing,
  Trash2,
  Eye,
  EyeOff,
  LogOut,
  KeyRound,
  Copy,
} from "lucide-react";
import "./expenses.css";
import "./payment-summary.css";
import "./vps.css";
import "./instagram-links.css";

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
const fmtDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : "Sin fecha";
const fmtMonth = (value) => value
  ? new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`))
  : "Sin mes";
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
const badge = (value) => (
  <span className={`badge ${value} ${/^month_\d+$/.test(value || "") ? "third_month" : ""}`}>
    {stageLabel(value)}
  </span>
);
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

function Sidebar({ page, setPage, open, setOpen }) {
  const nav = [
    ["dashboard", "Resumen", LayoutDashboard],
    ["clients", "Clientes", Users],
    ["agenda", "Agenda", CalendarDays],
    ["payments", "Pagos", WalletCards],
    ["expenses", "Gastos", ReceiptText],
    ["vps", "VPS", Server],
    ["messages", "Mensajes", Mail],
  ];
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-mark">F</div>
        <div>
          <strong>Catálogo Web</strong>
          <span>CRM interno</span>
        </div>
        <IconButton label="Cerrar menú" onClick={() => setOpen(false)}>
          <X />
        </IconButton>
      </div>
      <nav>
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => {
              setPage(id);
              setOpen(false);
            }}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span>Catálogo-Web</span>
        <small>Año 2026</small>
      </div>
    </aside>
  );
}
function Header({ title, onMenu, onLogout }) {
  return (
    <header className="topbar">
      <IconButton label="Abrir menú" onClick={onMenu}>
        <Menu />
      </IconButton>
      <div>
        <h1>{title}</h1>
        <p>
          {new Intl.DateTimeFormat("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </p>
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
function Shell({ page, setPage, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const titles = {
    dashboard: "Resumen operativo",
    clients: "Clientes",
    agenda: "Agenda de acciones",
    payments: "Pagos",
    expenses: "Gastos",
    vps: "VPS",
    messages: "Mensajes enviados",
  };
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} open={open} setOpen={setOpen} />
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <main>
        <Header title={titles[page]} onMenu={() => setOpen(true)} onLogout={onLogout} />
        {children}
      </main>
    </div>
  );
}

function Dashboard({ goClients }) {
  const [data, setData] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  useEffect(() => {
    api("/dashboard/summary").then(setData);
  }, []);
  if (!data) return <Loading />;
  const cards = [
    ["active_clients", "Clientes activos", data.active_clients, Users, "green"],
    ["at_risk_clients", "Necesitan atención", data.at_risk_clients, AlertTriangle, "amber"],
    ["pending_actions", "Acciones pendientes", data.pending_actions, Clock3, "blue"],
    ["overdue_actions", "Acciones vencidas", data.overdue_actions, AlertTriangle, "red"],
    ["renewals_week", "Renuevan esta semana", data.renewals_week, CalendarDays, "violet"],
    ["new_clients_month", "Altas del mes", data.new_clients_month, TrendingUp, "green"],
  ];
  return (
    <section className="page">
      <div className="page-intro">
        <div>
          <h2>Lo importante, a primera vista</h2>
          <p>Estado comercial y tareas que requieren movimiento.</p>
        </div>
        <button className="primary" onClick={goClients}>
          <Users size={18} />
          Ver clientes
        </button>
      </div>
      <div className="metrics-grid">
        {cards.map(([key, label, value, Icon, color]) => (
          <button
            type="button"
            className="metric metric-button"
            key={key}
            onClick={() => setSelectedMetric({ key, label })}
            aria-label={`Ver detalle de ${label}`}
          >
            <span className={color}>
              <Icon size={20} />
            </span>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          </button>
        ))}
      </div>
      <div className="dashboard-band">
        <div>
          <span className="eyebrow">Cobrado este mes</span>
          <h3>Ingresos separados por moneda</h3>
          <p>Los totales no mezclan ARS con USD.</p>
        </div>
        <div className="money-list">
          {Object.entries(data.collected).length ? (
            Object.entries(data.collected).map(([currency, total]) => (
              <strong key={currency}>{fmtMoney(total, currency)}</strong>
            ))
          ) : (
            <span>Sin cobros registrados</span>
          )}
        </div>
      </div>
      {selectedMetric && (
        <DashboardMetricModal
          title={selectedMetric.label}
          metricKey={selectedMetric.key}
          items={data.details?.[selectedMetric.key] || []}
          onClose={() => setSelectedMetric(null)}
        />
      )}
    </section>
  );
}

function DashboardMetricModal({ title, metricKey, items, onClose }) {
  const actionMetric = metricKey === "pending_actions" || metricKey === "overdue_actions";
  const [dateOrder, setDateOrder] = useState(metricKey === "active_clients" ? "desc" : "asc");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthlyItems, setMonthlyItems] = useState(items);
  const [loadingMonth, setLoadingMonth] = useState(false);
  async function changeMonth(event) {
    const month = event.target.value;
    setSelectedMonth(month);
    if (!month) return;
    setLoadingMonth(true);
    try {
      setMonthlyItems(await api(`/dashboard/new-clients?month=${month}`));
    } finally {
      setLoadingMonth(false);
    }
  }
  const sourceItems = metricKey === "new_clients_month" ? monthlyItems : items;
  const displayedItems = useMemo(() => {
    const dateField = metricKey === "pending_actions"
      ? "due_date"
      : metricKey === "active_clients"
        ? "signup_date"
        : null;
    if (!dateField) return sourceItems;
    return [...sourceItems].sort((first, second) => {
      const firstDate = first[dateField];
      const secondDate = second[dateField];
      if (!firstDate && !secondDate) return first.id - second.id;
      if (!firstDate) return 1;
      if (!secondDate) return -1;
      const comparison = firstDate.localeCompare(secondDate);
      return (dateOrder === "asc" ? comparison : -comparison) || first.id - second.id;
    });
  }, [sourceItems, metricKey, dateOrder]);
  return (
    <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dashboard-metric-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Detalle del resumen</span>
            <h2>{title} ({sourceItems.length})</h2>
          </div>
          <IconButton label="Cerrar" onClick={onClose}><X /></IconButton>
        </div>
        <div className="dashboard-metric-list">
          {metricKey === "new_clients_month" && (
            <div className="dashboard-month-filter">
              <label>
                Ver altas del mes
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={changeMonth}
                />
              </label>
            </div>
          )}
          {(metricKey === "pending_actions" || metricKey === "active_clients") && (
            <div className="dashboard-metric-toolbar">
              <button
                type="button"
                className="secondary small"
                onClick={() => setDateOrder((order) => order === "asc" ? "desc" : "asc")}
              >
                <ArrowUpDown size={14} />
                {metricKey === "active_clients"
                  ? dateOrder === "desc" ? "Altas más recientes primero" : "Altas más antiguas primero"
                  : dateOrder === "asc" ? "Más próximas primero" : "Más lejanas primero"}
              </button>
            </div>
          )}
          {!loadingMonth && displayedItems.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{actionMetric ? item.title : item.name}</strong>
                <span>
                  {actionMetric
                    ? `${item.client_name} · ${item.business_name}`
                    : item.business_name}
                </span>
              </div>
              <div className="dashboard-metric-meta">
                {actionMetric ? (
                  <>
                    <small>Fecha</small>
                    <strong>{fmtDate(item.due_date)}</strong>
                    {badge(item.status)}
                  </>
                ) : metricKey === "renewals_week" ? (
                  <><small>Renovación</small><strong>{fmtDate(item.next_renewal_date)}</strong></>
                ) : metricKey === "new_clients_month" ? (
                  <><small>Fecha de alta</small><strong>{fmtDate(item.signup_date)}</strong></>
                ) : metricKey === "active_clients" ? (
                  <><small>Fecha de alta</small><strong>{fmtDate(item.signup_date)}</strong>{badge(item.service_stage)}</>
                ) : (
                  <><small>Etapa</small><strong>{stageLabel(item.service_stage)}</strong>{badge(item.status)}</>
                )}
              </div>
            </article>
          ))}
          {loadingMonth && <Loading />}
          {!loadingMonth && !displayedItems.length && <Empty />}
        </div>
      </section>
    </div>
  );
}

function ClientForm({ client, onClose, onSaved }) {
  const initial = client || {
    name: "",
    business_name: "",
    signup_date: new Date().toISOString().slice(0, 10),
    next_renewal_date: "",
    country: "Argentina",
    city: "",
    acquisition_source: "",
    currency: "ARS",
    payment_amount: "",
    status: "active",
    service_stage: "first_month",
    service_stage_manual: false,
    email: "",
    phone: "",
    instagram_username: "",
    website_url: "",
    notes_summary: "",
    followers_count: 0,
    publications_count: 0,
    generate_schedule: false,
  };
  const [form, setForm] = useState(initial);
  const isKnownAcquisition = ACQUISITION_OPTIONS.some(
    ([value]) => value === initial.acquisition_source,
  );
  const [acquisitionChoice, setAcquisitionChoice] = useState(
    isKnownAcquisition ? initial.acquisition_source : initial.acquisition_source ? "__custom" : "",
  );
  const [customAcquisition, setCustomAcquisition] = useState(
    !isKnownAcquisition ? initial.acquisition_source || "" : "",
  );
  const [saving, setSaving] = useState(false);
  const change = (e) =>
    setForm((v) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      const updated = { ...v, [e.target.name]: value };
      if (e.target.name === "signup_date") {
        updated.next_renewal_date = addCalendarMonth(value);
        updated.service_stage = stageForDates(value, updated.next_renewal_date);
        updated.service_stage_manual = false;
      }
      if (e.target.name === "next_renewal_date") {
        updated.service_stage = stageForDates(updated.signup_date, value);
        updated.service_stage_manual = false;
      }
      return updated;
    });
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await api(client ? `/clients/${client.id}` : "/clients", {
        method: client ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          acquisition_source:
            acquisitionChoice === "__custom"
              ? customAcquisition.trim()
              : acquisitionChoice,
        }),
      });
      onSaved(saved);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-layer">
      <div className="form-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="eyebrow">
              {client ? "Editar ficha" : "Alta de cliente"}
            </span>
            <h2>{client ? "Actualizar información" : "Nuevo cliente"}</h2>
          </div>
          <IconButton label="Cerrar" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <form onSubmit={submit}>
          <fieldset>
            <legend>Datos principales</legend>
            <div className="form-grid">
              <label>
                Nombre y apellido *
                <input
                  name="name"
                  value={form.name || ""}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Negocio o página *
                <input
                  name="business_name"
                  value={form.business_name || ""}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email || ""}
                  onChange={change}
                />
              </label>
              <label>
                Teléfono
                <input
                  name="phone"
                  value={form.phone || ""}
                  onChange={change}
                />
              </label>
              <label>
                Instagram
                <input
                  name="instagram_username"
                  value={form.instagram_username || ""}
                  onChange={change}
                  placeholder="@usuario"
                />
              </label>
              <label>
                Sitio web
                <input
                  type="url"
                  name="website_url"
                  value={form.website_url || ""}
                  onChange={change}
                  placeholder="https://"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Servicio y cobro</legend>
            <div className="form-grid">
              <label>
                {form.status === "no_signup" ? "Fecha de alta" : "Fecha de alta *"}
                {form.status === "no_signup" ? (
                  <input value="Sin alta" readOnly />
                ) : (
                  <input
                    type="date"
                    name="signup_date"
                    value={form.signup_date || ""}
                    onChange={change}
                    required
                  />
                )}
              </label>
              <label>
                Próxima renovación
                {form.status === "no_signup" ? (
                  <input value="Sin alta" readOnly />
                ) : (
                  <input
                    type="date"
                    name="next_renewal_date"
                    value={form.next_renewal_date || ""}
                    onChange={change}
                  />
                )}
              </label>
              <label>
                Estado
                <select name="status" value={form.status} onChange={change}>
                  <option value="active">Activo</option>
                  <option value="at_risk">En riesgo</option>
                  <option value="paused">Pausado</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="no_signup">Sin alta</option>
                </select>
              </label>
              <label>
                Etapa
                <input value={stageLabel(stageForDates(form.signup_date, form.next_renewal_date))} readOnly />
              </label>
              <label>
                País *
                <input
                  name="country"
                  value={form.country || ""}
                  onChange={change}
                  required
                />
              </label>
              <label>
                Ciudad
                <input name="city" value={form.city || ""} onChange={change} />
              </label>
              <label className="span-2">
                ¿Por dónde lo adquirí?
                <select
                  value={acquisitionChoice}
                  onChange={(event) => setAcquisitionChoice(event.target.value)}
                >
                  <option value="">Sin registrar</option>
                  {ACQUISITION_OPTIONS.map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                  <option value="__custom">Otro canal...</option>
                </select>
                {acquisitionChoice === "__custom" && (
                  <input
                    value={customAcquisition}
                    onChange={(event) => setCustomAcquisition(event.target.value)}
                    placeholder="Escribí por dónde llegó este cliente"
                    required
                  />
                )}
              </label>
              <label>
                Moneda
                <select name="currency" value={form.currency} onChange={change}>
                  <option>ARS</option>
                  <option>USD</option>
                </select>
              </label>
              <label>
                Mensualidad
                <input
                  type="number"
                  min="0"
                  name="payment_amount"
                  value={form.payment_amount || ""}
                  onChange={change}
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Seguimiento</legend>
            <div className="form-grid">
              <label>
                Seguidores
                <input
                  type="number"
                  min="0"
                  name="followers_count"
                  value={form.followers_count || 0}
                  onChange={change}
                />
              </label>
              <label>
                Publicaciones
                <input
                  type="number"
                  min="0"
                  name="publications_count"
                  value={form.publications_count || 0}
                  onChange={change}
                />
              </label>
              <label className="span-2">
                Nota resumen
                <textarea
                  name="notes_summary"
                  value={form.notes_summary || ""}
                  onChange={change}
                />
              </label>
            </div>
          </fieldset>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={saving}>
              <Save size={17} />
              {saving ? "Guardando..." : "Guardar cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MiniForm({ type, clientId, defaultDueDate, onDone }) {
  const schemas = {
    action: {
      title: "Nueva acción",
      fields: [
        ["title", "Acción", "actionpreset"],
        ["due_date", "Fecha prevista", "date"],
        ["priority", "Prioridad", "select"],
        ["description", "Nota", "textarea"],
      ],
    },
    payment: {
      title: "Registrar mensualidad",
      fields: [
        ["amount", "Importe", "number"],
        ["due_date", "Vencimiento", "date"],
        ["status", "Estado", "payselect"],
        ["notes", "Nota", "textarea"],
      ],
    },
    extra_work: {
      title: "Registrar trabajo extra",
      fields: [
        ["amount", "Importe", "number"],
        ["due_date", "Fecha", "date"],
        ["status", "Estado", "payselect"],
        ["notes", "Nota", "textarea"],
      ],
    },
    metric: {
      title: "Nueva medición",
      fields: [
        ["followers_count", "Seguidores", "number"],
        ["publications_count", "Publicaciones", "number"],
        ["recorded_at", "Fecha", "date"],
      ],
    },
    note: {
      title: "Nueva nota",
      fields: [["content", "Contenido", "textarea"]],
    },
  };
  const conf = schemas[type];
  const [form, setForm] = useState(
    type === "payment"
      ? { status: "pending", due_date: defaultDueDate || "", payment_type: "monthly" }
      : type === "extra_work"
        ? { status: "pending", due_date: new Date().toISOString().slice(0, 10), payment_type: "extra_work" }
        : {},
  );
  const [actionPreset, setActionPreset] = useState("");
  async function submit(e) {
    e.preventDefault();
    const payload =
      type === "action"
        ? {
          ...form,
          title: actionPreset === "__custom" ? form.title : actionPreset,
        }
        : form;
    await api(
      `/clients/${clientId}/${type === "action" ? "actions" : ["payment", "extra_work"].includes(type) ? "payments" : type === "metric" ? "metrics" : "notes"}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    onDone();
  }
  return (
    <form className="mini-form" onSubmit={submit}>
      <strong>{conf.title}</strong>
      <div>
        {conf.fields.map(([name, label, kind]) => (
          <label key={name}>
            {label}
            {kind === "actionpreset" ? (
              <>
                <select
                  value={actionPreset}
                  onChange={(e) => setActionPreset(e.target.value)}
                  required
                >
                  <option value="">Elegí una acción</option>
                  {ACTION_PRESETS.map((preset) => (
                    <option value={preset} key={preset}>{preset}</option>
                  ))}
                  <option value="__custom">ACCIÓN PERSONALIZADA...</option>
                </select>
                {actionPreset === "__custom" && (
                  <input
                    value={form.title || ""}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Escribí el nombre de la acción"
                    required
                  />
                )}
              </>
            ) : kind === "select" ? (
              <select
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              >
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            ) : kind === "payselect" ? (
              <select
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              >
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado</option>
                <option value="partial">Parcial</option>
                <option value="overdue">Vencido</option>
              </select>
            ) : kind === "textarea" ? (
              <textarea
                required={type === "note"}
                placeholder={type === "extra_work"
                  ? "Describí qué trabajo se realizó"
                  : type === "payment"
                    ? "Escribí una nota sobre la mensualidad"
                    : type === "action" ? "Escribí una nota sobre la acción" : undefined}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              />
            ) : (
              <input
                type={kind}
                min={kind === "number" ? 0 : undefined}
                defaultValue={form[name] || ""}
                required={name === "title" || name === "amount"}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <button className="primary">
        <Plus size={16} />
        Agregar
      </button>
    </form>
  );
}

function ActionEditor({ action, onCancel, onSaved }) {
  const [form, setForm] = useState(action);
  const [saving, setSaving] = useState(false);
  const change = (e) =>
    setForm((v) => ({ ...v, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="action-editor" onSubmit={submit}>
      <div className="editor-grid">
        <label className="span-2">
          Título
          <input
            name="title"
            value={form.title || ""}
            onChange={change}
            required
          />
        </label>
        <label>
          Fecha prevista
          <input
            type="date"
            name="due_date"
            value={form.due_date || ""}
            onChange={change}
          />
        </label>
        <label>
          Prioridad
          <select
            name="priority"
            value={form.priority || "medium"}
            onChange={change}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <label>
          Estado
          <select
            name="status"
            value={form.status || "pending"}
            onChange={change}
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En curso</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </label>
        <label>
          Tipo
          <select
            name="action_type"
            value={form.action_type || "custom"}
            onChange={change}
          >
            <option value="custom">Personalizada</option>
            <option value="call">Llamada</option>
            <option value="message">Mensaje</option>
            <option value="price_review">Revisión de precios</option>
            <option value="analytics_report">Analytics</option>
            <option value="instagram_story">Historia</option>
            <option value="coupon">Cupón</option>
          </select>
        </label>
        <label className="span-2">
          Descripción
          <textarea
            name="description"
            value={form.description || ""}
            onChange={change}
          />
        </label>
        <label className="span-2">
          Resultado o comentario
          <textarea
            name="result_notes"
            value={form.result_notes || ""}
            onChange={change}
          />
        </label>
      </div>
      <div className="editor-actions">
        <button type="button" className="secondary small" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary small" disabled={saving}>
          <Save size={15} />
          {saving ? "Guardando..." : "Guardar acción"}
        </button>
      </div>
    </form>
  );
}

function PaymentEditor({ payment, onCancel, onSaved }) {
  const [form, setForm] = useState(payment);
  const [saving, setSaving] = useState(false);
  const change = (event) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="action-editor payment-editor" onSubmit={submit}>
      <div className="editor-grid">
        <label>Importe<input type="number" min="0" name="amount" value={form.amount || ""} onChange={change} required /></label>
        <label>Moneda<select name="currency" value={form.currency || "ARS"} onChange={change}><option value="ARS">ARS</option><option value="USD">USD</option></select></label>
        <label>Concepto<select name="payment_type" value={form.payment_type || "monthly"} onChange={change}><option value="monthly">Mensualidad</option><option value="deposit">Seña</option><option value="domain">Dominio</option><option value="extra_work">Trabajo extra</option><option value="discount">Descuento</option><option value="other">Otro</option></select></label>
        <label>Estado<select name="status" value={form.status || "pending"} onChange={change}><option value="pending">Pendiente</option><option value="paid">Pagado</option><option value="partial">Parcial</option><option value="overdue">Vencido</option><option value="waived">Bonificado</option></select></label>
        <label>Vencimiento<input type="date" name="due_date" value={form.due_date || ""} onChange={change} /></label>
        <label>Método de pago<input name="payment_method" value={form.payment_method || ""} onChange={change} placeholder="Transferencia, efectivo..." /></label>
        <label className="span-2">Notas<textarea name="notes" value={form.notes || ""} onChange={change} /></label>
      </div>
      <div className="editor-actions">
        <button type="button" className="secondary small" onClick={onCancel}>Cancelar</button>
        <button className="primary small" disabled={saving}><Save size={15} />{saving ? "Guardando..." : "Guardar pago"}</button>
      </div>
    </form>
  );
}

function MetricEditor({ metric, onCancel, onSaved }) {
  const [form, setForm] = useState(metric);
  const change = (event) => setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    await api(`/metrics/${metric.id}`, { method: "PATCH", body: JSON.stringify(form) });
    onSaved();
  }
  return (
    <form className="inline-record-editor" onSubmit={submit}>
      <label>Fecha<input type="date" name="recorded_at" value={form.recorded_at || ""} onChange={change} required /></label>
      <label>Seguidores<input type="number" min="0" name="followers_count" value={form.followers_count ?? 0} onChange={change} /></label>
      <label>Publicaciones<input type="number" min="0" name="publications_count" value={form.publications_count ?? 0} onChange={change} /></label>
      <label className="span-3">Comentario<textarea name="notes" value={form.notes || ""} onChange={change} /></label>
      <div className="inline-editor-actions span-3"><button type="button" className="secondary small" onClick={onCancel}>Cancelar</button><button className="primary small"><Save size={15} />Guardar</button></div>
    </form>
  );
}

function NoteEditor({ note, onCancel, onSaved }) {
  const [form, setForm] = useState(note);
  async function submit(event) {
    event.preventDefault();
    await api(`/notes/${note.id}`, { method: "PATCH", body: JSON.stringify(form) });
    onSaved();
  }
  return (
    <form className="note-editor" onSubmit={submit}>
      <textarea value={form.content || ""} onChange={(event) => setForm({ ...form, content: event.target.value })} required />
      <label className="check"><input type="checkbox" checked={Boolean(form.is_pinned)} onChange={(event) => setForm({ ...form, is_pinned: event.target.checked })} />Fijar nota</label>
      <div className="inline-editor-actions"><button type="button" className="secondary small" onClick={onCancel}>Cancelar</button><button className="primary small"><Save size={15} />Guardar</button></div>
    </form>
  );
}

function EditableStatus({ label, field, value, options, onSave }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value || options[0][0]);
  async function save() {
    await onSave(field, current);
    setEditing(false);
  }
  return (
    <div className="editable-status">
      <div>
        <small>{label}</small>
        {!editing && badge(value)}
      </div>
      {editing ? (
        <div className="status-editor">
          <select value={current} onChange={(e) => setCurrent(e.target.value)}>
            {options.map(([id, text]) => (
              <option value={id} key={id}>
                {text}
              </option>
            ))}
          </select>
          <IconButton label={`Guardar ${label}`} onClick={save}>
            <Check />
          </IconButton>
          <IconButton label="Cancelar" onClick={() => setEditing(false)}>
            <X />
          </IconButton>
        </div>
      ) : (
        <IconButton label={`Editar ${label}`} onClick={() => setEditing(true)}>
          <Edit3 />
        </IconButton>
      )}
    </div>
  );
}

function EditableNumber({ label, field, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value || 0);
  async function save() {
    await onSave(field, Math.max(0, Number(current) || 0));
    setEditing(false);
  }
  return (
    <div className="editable-status editable-number">
      <div><small>{label}</small>{!editing && <strong>{value || 0}</strong>}</div>
      {editing ? (
        <div className="status-editor">
          <input type="number" min="0" value={current} onChange={(event) => setCurrent(event.target.value)} autoFocus />
          <IconButton label={`Guardar ${label}`} onClick={save}><Check /></IconButton>
          <IconButton label="Cancelar" onClick={() => setEditing(false)}><X /></IconButton>
        </div>
      ) : (
        <IconButton label={`Editar ${label}`} onClick={() => setEditing(true)}><Edit3 /></IconButton>
      )}
    </div>
  );
}

function EditableMonthlyAmount({ client, onSave }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(client.payment_amount || 0);
  async function save() {
    await onSave("payment_amount", Math.max(0, Number(amount) || 0));
    setEditing(false);
  }
  return (
    <div className="quick-edit-stat">
      <small>Mensualidad</small>
      {editing ? (
        <div className="quick-amount-editor">
          <span>{client.currency}</span>
          <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
          <IconButton label="Guardar mensualidad" onClick={save}><Check /></IconButton>
          <IconButton label="Cancelar" onClick={() => setEditing(false)}><X /></IconButton>
        </div>
      ) : (
        <>
          <strong>{fmtMoney(client.payment_amount, client.currency)}</strong>
          <span>Importe mensual</span>
          <IconButton label="Editar mensualidad" onClick={() => setEditing(true)}><Edit3 /></IconButton>
        </>
      )}
    </div>
  );
}

function ClientCredentials({ clientId }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [hasCredentials, setHasCredentials] = useState(false);
  useEffect(() => {
    api(`/clients/${clientId}/credentials`).then((data) => {
      setForm({ username: data.username || "", password: data.password || "" });
      setHasCredentials(Boolean(data.has_credentials));
    }).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [clientId]);
  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const saved = await api(`/clients/${clientId}/credentials`, { method: "PUT", body: JSON.stringify(form) });
      setForm({ username: saved.username, password: saved.password });
      setHasCredentials(true); setMessage("Credenciales guardadas correctamente.");
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm("¿Eliminar el usuario y la contraseña guardados?")) return;
    await api(`/clients/${clientId}/credentials`, { method: "DELETE" });
    setForm({ username: "", password: "" }); setHasCredentials(false); setVisible(false); setMessage("Credenciales eliminadas.");
  }
  async function copy(value, label) {
    await navigator.clipboard.writeText(value); setMessage(`${label} copiado.`);
  }
  if (loading) return <Loading />;
  return (
    <section className="credentials-card">
      <div className="credentials-heading"><span><KeyRound size={20} /></span><div><h3>Acceso del cliente</h3><p>Estos datos se guardan cifrados y solo se cargan al abrir esta pestaña.</p></div></div>
      <form onSubmit={submit}>
        <label>Usuario<span className="credential-field"><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="off" required /><IconButton type="button" label="Copiar usuario" onClick={() => copy(form.username, "Usuario")} disabled={!form.username}><Copy /></IconButton></span></label>
        <label>Contraseña<span className="credential-field"><input type={visible ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required /><IconButton type="button" label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</IconButton><IconButton type="button" label="Copiar contraseña" onClick={() => copy(form.password, "Contraseña")} disabled={!form.password}><Copy /></IconButton></span></label>
        {message && <p className="credential-message" role="status">{message}</p>}
        <div className="form-actions">{hasCredentials && <button type="button" className="secondary credential-delete" onClick={remove}><Trash2 size={16} />Eliminar</button>}<button className="primary" disabled={saving}><Save size={16} />{saving ? "Guardando..." : "Guardar credenciales"}</button></div>
      </form>
    </section>
  );
}

function DetailModal({ clientId, onClose, onRefresh, onEdit, initialTab = "summary" }) {
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [adding, setAdding] = useState(null);
  const [editingAction, setEditingAction] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingMetric, setEditingMetric] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [actionView, setActionView] = useState("pending");
  const load = useCallback(
    () => api(`/clients/${clientId}`).then(setClient),
    [clientId],
  );
  useEffect(() => {
    load();
    document.body.classList.add("locked");
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("locked");
      window.removeEventListener("keydown", esc);
    };
  }, [load, onClose]);
  async function patchAction(id, status) {
    await api(`/actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
    onRefresh();
  }
  async function deleteAction(action) {
    if (!window.confirm(`¿Eliminar definitivamente "${action.title}"?`)) return;
    await api(`/actions/${action.id}`, { method: "DELETE" });
    load();
    onRefresh();
  }
  async function patchPayment(id, status) {
    await api(`/payments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
    onRefresh();
  }
  async function deletePayment(payment) {
    if (!window.confirm(`¿Eliminar el pago de ${fmtMoney(payment.amount, payment.currency)}?`)) return;
    await api(`/payments/${payment.id}`, { method: "DELETE" });
    load();
    onRefresh();
  }
  async function deleteMetric(metric) {
    if (!window.confirm("¿Eliminar esta medición?")) return;
    await api(`/metrics/${metric.id}`, { method: "DELETE" });
    load(); onRefresh();
  }
  async function deleteNote(note) {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    await api(`/notes/${note.id}`, { method: "DELETE" });
    load();
  }
  async function patchClient(field, value) {
    const updated = await api(`/clients/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    setClient(updated);
    onRefresh();
  }
  if (!client)
    return (
      <div className="modal-layer">
        <div className="detail-modal">
          <Loading />
        </div>
      </div>
    );
  const tabs = [
    ["summary", "Resumen"],
    ["actions", "Acciones"],
    ["payments", "Pagos"],
    ["metrics", "Métricas"],
    ["notes", "Notas"],
    ["credentials", "Usuario y contraseña"],
  ];
  return (
    <div className="modal-layer">
      <article className="detail-modal" role="dialog" aria-modal="true">
        <div className="detail-hero">
          <div className="avatar">
            {client.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="detail-title">
            <span>{client.business_name}</span>
            <h2>{client.name}</h2>
            <div>
              {badge(client.status)}
              {badge(client.service_stage)}
            </div>
          </div>
          <div className="detail-actions">
            <button className="secondary" onClick={() => onEdit(client)}>
              <Edit3 size={16} />
              Editar
            </button>
            <IconButton label="Cerrar" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        </div>
        <div className="quick-stats">
          <div>
            <small>Alta</small>
            <strong>{client.status === "no_signup" ? "Sin alta" : fmtDate(client.signup_date)}</strong>
            <span>{client.days_as_client} días</span>
          </div>
          <div>
            <small>Próxima renovación</small>
            <strong>{fmtDate(client.next_renewal_date)}</strong>
            <span>Próximo vencimiento</span>
          </div>
          <EditableMonthlyAmount client={client} onSave={patchClient} />
          <div>
            <small>Próxima acción</small>
            <strong>{client.next_action?.title || "Sin pendientes"}</strong>
            <span>{fmtDate(client.next_action?.due_date)}</span>
          </div>
          <div className={client.overdue_actions_count ? "danger" : ""}>
            <small>Acciones vencidas</small>
            <strong>{client.overdue_actions_count}</strong>
            <span>
              {client.overdue_actions_count
                ? "Requiere atención"
                : "Todo al día"}
            </span>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setAdding(null);
                setEditingAction(null);
              }}
              key={id}
            >
              {label}
              {id === "actions" && <b>{client.actions.length}</b>}
            </button>
          ))}
        </div>
        <div className="detail-body">
          {tab === "summary" && (
            <Summary client={client} onUpdate={patchClient} onEdit={onEdit} />
          )}{" "}
          {tab === "actions" && (
            <>
              <TabHead
                title="Cronograma y acciones"
                onAdd={() => setAdding("action")}
              />
              <div className="action-tabs">
                <button
                  className={actionView === "pending" ? "active" : ""}
                  onClick={() => setActionView("pending")}
                >
                  Pendientes
                  <b>{client.actions.filter((action) => action.status !== "completed").length}</b>
                </button>
                <button
                  className={actionView === "completed" ? "active" : ""}
                  onClick={() => setActionView("completed")}
                >
                  Acciones completadas
                  <b>{client.actions.filter((action) => action.status === "completed").length}</b>
                </button>
              </div>
              {adding === "action" && (
                <MiniForm
                  type="action"
                  clientId={client.id}
                  onDone={() => {
                    setAdding(null);
                    load();
                    onRefresh();
                  }}
                />
              )}
              <div className="item-list">
                {client.actions
                  .filter((action) =>
                    actionView === "completed"
                      ? action.status === "completed"
                      : action.status !== "completed",
                  )
                  .map((a) =>
                    editingAction === a.id ? (
                      <ActionEditor
                        key={a.id}
                        action={a}
                        onCancel={() => setEditingAction(null)}
                        onSaved={() => {
                          setEditingAction(null);
                          load();
                          onRefresh();
                        }}
                      />
                    ) : (
                      <div
                        className={`list-item ${a.status === "pending" && a.due_date && new Date(a.due_date) < new Date() ? "overdue" : ""} ${a.status === "cancelled" ? "cancelled-action" : ""}`}
                        key={a.id}
                      >
                        <span className="item-check">
                          {a.status === "completed" ? <CheckCircle2 /> : <Clock3 />}
                        </span>
                        <div>
                          <strong>{a.title}</strong>
                          <p>
                            {fmtDate(a.due_date)} · {LABEL[a.priority] || a.priority}
                          </p>
                          {a.description && <p>{a.description}</p>}
                          {a.status === "cancelled" && <span className="badge cancelled">Anulada</span>}
                        </div>
                        <IconButton
                          label={`Editar ${a.title}`}
                          onClick={() => setEditingAction(a.id)}
                        >
                          <Edit3 />
                        </IconButton>
                        <IconButton
                          label={`Eliminar ${a.title}`}
                          onClick={() => deleteAction(a)}
                        >
                          <Trash2 />
                        </IconButton>
                        {a.status === "completed" ? (
                          <button
                            className="text-btn"
                            onClick={() => patchAction(a.id, "pending")}
                          >
                            <RotateCcw size={15} />
                            Reabrir
                          </button>
                        ) : (
                          <div className="action-row-buttons">
                            {a.status === "cancelled" ? (
                              <button className="text-btn" onClick={() => patchAction(a.id, "pending")}>
                                <RotateCcw size={15} />Reactivar
                              </button>
                            ) : (
                              <button className="text-btn cancel" onClick={() => patchAction(a.id, "cancelled")}>
                                <X size={16} />Anular
                              </button>
                            )}
                            <button
                              className="text-btn complete"
                              onClick={() => patchAction(a.id, "completed")}
                            >
                              <Check size={16} />
                              Completar
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )}
              </div>
            </>
          )}
          {tab === "payments" && (
            <>
              <div className="tab-head">
                <h3>Historial de pagos</h3>
                <div className="payment-add-buttons">
                  <button className="secondary small" onClick={() => setAdding("payment")}><Plus size={16} />Registrar mensualidad</button>
                  <button className="secondary small" onClick={() => setAdding("extra_work")}><Plus size={16} />Registrar trabajo extra</button>
                </div>
              </div>
              <div className="client-payment-totals">
                {Object.entries(
                  client.payments
                    .filter((payment) => payment.status === "paid")
                    .reduce((totals, payment) => ({
                      ...totals,
                      [payment.currency]: (totals[payment.currency] || 0) + payment.amount,
                    }), {}),
                ).map(([currency, total]) => (
                  <div key={currency}><small>Total cobrado · {currency}</small><strong>{fmtMoney(total, currency)}</strong></div>
                ))}
                {!client.payments.some((payment) => payment.status === "paid") && <span className="no-paid">Todavía no hay pagos completados.</span>}
              </div>
              {(adding === "payment" || adding === "extra_work") && (
                <MiniForm
                  type={adding}
                  clientId={client.id}
                  defaultDueDate={client.next_renewal_date}
                  onDone={() => {
                    setAdding(null);
                    load();
                    onRefresh();
                  }}
                />
              )}
              <div className="item-list">
                {client.payments.map((p) => editingPayment === p.id ? (
                  <PaymentEditor key={p.id} payment={p} onCancel={() => setEditingPayment(null)} onSaved={() => { setEditingPayment(null); load(); onRefresh(); }} />
                ) : (
                  <div className="list-item" key={p.id}>
                    <span className="item-check">
                      <WalletCards />
                    </span>
                    <div>
                      <strong>{fmtMoney(p.amount, p.currency)}</strong>
                      <p>
                        {LABEL[p.payment_type] || "Mensual"} · vence{" "}
                        {fmtDate(p.due_date)}
                      </p>
                      {p.notes && <p>{p.notes}</p>}
                    </div>
                    {badge(p.status)}
                    <IconButton label="Editar pago" onClick={() => setEditingPayment(p.id)}><Edit3 /></IconButton>
                    <IconButton label="Eliminar pago" onClick={() => deletePayment(p)}><Trash2 /></IconButton>
                    {p.status !== "paid" ? (
                      <button className="text-btn complete" onClick={() => patchPayment(p.id, "paid")}><Check size={16} />Marcar pagado</button>
                    ) : (
                      <button className="text-btn" onClick={() => patchPayment(p.id, "pending")}><RotateCcw size={15} />Reabrir</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "metrics" && (
            <>
              <TabHead
                title="Evolución de la cuenta"
                onAdd={() => setAdding("metric")}
              />
              {adding === "metric" && (
                <MiniForm
                  type="metric"
                  clientId={client.id}
                  onDone={() => {
                    setAdding(null);
                    load();
                    onRefresh();
                  }}
                />
              )}
              <div className="metric-history">
                {client.metrics.map((m) => editingMetric === m.id ? (
                  <MetricEditor key={m.id} metric={m} onCancel={() => setEditingMetric(null)} onSaved={() => { setEditingMetric(null); load(); onRefresh(); }} />
                ) : (
                  <div className="metric-record" key={m.id}>
                    <time>{fmtDate(m.recorded_at)}</time>
                    <strong>{m.followers_count} seguidores</strong>
                    <span>{m.publications_count} publicaciones</span>
                    {m.notes && <p>{m.notes}</p>}
                    <div className="record-actions"><IconButton label="Editar métrica" onClick={() => setEditingMetric(m.id)}><Edit3 /></IconButton><IconButton label="Eliminar métrica" onClick={() => deleteMetric(m)}><Trash2 /></IconButton></div>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "notes" && (
            <>
              <TabHead
                title="Notas de seguimiento"
                onAdd={() => setAdding("note")}
              />
              {adding === "note" && (
                <MiniForm
                  type="note"
                  clientId={client.id}
                  onDone={() => {
                    setAdding(null);
                    load();
                  }}
                />
              )}
              <div className="notes">
                {client.notes.map((n) => editingNote === n.id ? (
                  <NoteEditor key={n.id} note={n} onCancel={() => setEditingNote(null)} onSaved={() => { setEditingNote(null); load(); }} />
                ) : (
                  <article key={n.id}>
                    {n.is_pinned && <Pin size={15} />}
                    <p>{n.content}</p>
                    <time>{fmtDate(n.created_at)}</time>
                    <div className="record-actions"><IconButton label="Editar nota" onClick={() => setEditingNote(n.id)}><Edit3 /></IconButton><IconButton label="Eliminar nota" onClick={() => deleteNote(n)}><Trash2 /></IconButton></div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "credentials" && <ClientCredentials clientId={client.id} />}
        </div>
      </article>
    </div>
  );
}
function TabHead({ title, onAdd }) {
  return (
    <div className="tab-head">
      <h3>{title}</h3>
      <button className="secondary small" onClick={onAdd}>
        <Plus size={16} />
        Agregar
      </button>
    </div>
  );
}
function Summary({ client, onUpdate, onEdit }) {
  const contact = [
    [
      "Ubicación",
      `${client.city ? client.city + ", " : ""}${client.country}`,
      MapPin,
    ],
    ["Instagram", client.instagram_username || "Sin cargar", Instagram, instagramUrl(client.instagram_username)],
    ["Adquisición", acquisitionLabel(client.acquisition_source), ChartNoAxesColumnIncreasing],
    ["Email", client.email || "Sin cargar", Mail],
    ["Teléfono", client.phone || "Sin cargar", Phone],
  ];
  return (
    <div className="summary-grid">
      <section>
        <div className="section-title">
          <h3>Contacto y negocio</h3>
          <IconButton label="Editar contacto" onClick={() => onEdit(client)}>
            <Edit3 />
          </IconButton>
        </div>
        {contact.map(([label, value, Icon, href]) => (
          <div className="info-row" key={label}>
            <Icon />
            <span>
              <small>{label}</small>
              {href ? <a className="instagram-link" href={href} target="_blank" rel="noreferrer">{value}<ExternalLink size={13} /></a> : <strong>{value}</strong>}
            </span>
          </div>
        ))}
        {client.website_url && (
          <a className="website-link" href={client.website_url} target="_blank" rel="noreferrer" title={client.website_url}>
            <ExternalLink size={15} />
            {client.website_url}
          </a>
        )}
      </section>
      <section>
        <h3>Estado operativo</h3>
        <div className="status-grid">
          <EditableStatus label="Link en bio" field="link_in_bio_status" value={client.link_in_bio_status} options={[["pending", "Pendiente"], ["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Historia" field="story_status" value={client.story_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Precios" field="prices_status" value={client.prices_status} options={[["pending", "Pendiente"], ["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Google Analytics" field="google_analytics_status" value={client.google_analytics_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="QR generado" field="qr_generated_status" value={client.qr_generated_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Carrusel instalado" field="carousel_installed_status" value={client.carousel_installed_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Cupón" field="coupon_status" value={client.coupon_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="Más vendidos" field="best_sellers_status" value={client.best_sellers_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableStatus label="12 productos en inicio" field="twelve_products_status" value={client.twelve_products_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableNumber label="Cantidad de productos activos" field="active_products_count" value={client.active_products_count} onSave={onUpdate} />
          <EditableStatus label="Compró dominio" field="domain_purchased_status" value={client.domain_purchased_status || "no"} options={[["no", "No"], ["yes", "Sí"]]} onSave={onUpdate} />
          <EditableNumber label="Ventas por web" field="web_sales_count" value={client.web_sales_count} onSave={onUpdate} />
        </div>
      </section>
      <section className="summary-note">
        <div className="section-title">
          <h3>Contexto rápido</h3>
          <IconButton label="Editar contexto" onClick={() => onEdit(client)}><Edit3 /></IconButton>
        </div>
        <p>
          {client.notes_summary ||
            "Todavía no hay un resumen cargado para este cliente."}
        </p>
      </section>
      <section>
        <div className="section-title">
          <h3>Métricas actuales</h3>
          <IconButton label="Editar métricas" onClick={() => onEdit(client)}><Edit3 /></IconButton>
        </div>
        <div className="big-numbers">
          <div>
            <strong>{client.followers_count}</strong>
            <small>Seguidores</small>
          </div>
          <div>
            <strong>{client.publications_count}</strong>
            <small>Publicaciones</small>
          </div>
        </div>
      </section>
    </div>
  );
}

function AcquisitionModal({ onClose }) {
  const [data, setData] = useState(null);
  const [expandedSource, setExpandedSource] = useState(null);
  useEffect(() => {
    api("/dashboard/acquisition").then(setData);
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="modal-layer">
      <section className="acquisition-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Origen de clientes</span>
            <h2>Canales de adquisición</h2>
          </div>
          <IconButton label="Cerrar" onClick={onClose}><X /></IconButton>
        </div>
        {!data ? <Loading /> : (
          <div className="acquisition-body">
            <div className="acquisition-total">
              <ChartNoAxesColumnIncreasing />
              <span><small>Total de clientes</small><strong>{data.total}</strong></span>
            </div>
            <div className="acquisition-list">
              {data.items.map((item) => (
                <article className={expandedSource === item.source ? "expanded" : ""} key={item.source}>
                  <button
                    type="button"
                    className="acquisition-channel"
                    aria-expanded={expandedSource === item.source}
                    onClick={() => setExpandedSource((source) => source === item.source ? null : item.source)}
                  >
                    <div>
                      <strong>{acquisitionLabel(item.source)}</strong>
                      <span>{item.percentage}% del total</span>
                    </div>
                    <div className="acquisition-bar"><i style={{ width: `${item.percentage}%` }} /></div>
                    <b>{item.count}</b>
                    <ChevronRight size={18} />
                  </button>
                  {expandedSource === item.source && (
                    <div className="acquisition-detail">
                      <div className="acquisition-insights">
                        <span><strong>{item.active_count}</strong> activos</span>
                        <span><strong>{item.count - item.active_count}</strong> no activos</span>
                        <span><strong>{item.count}</strong> adquiridos</span>
                      </div>
                      <div className="acquisition-clients">
                        {item.clients.map((client) => (
                          <div key={client.id}>
                            <div>
                              <strong>{client.name}</strong>
                              <span>{client.business_name}</span>
                            </div>
                            <div>
                              {badge(client.status)}
                              <span>{stageLabel(client.service_stage)} · Alta {fmtDate(client.signup_date)}</span>
                            </div>
                            <div>
                              <strong>{fmtMoney(client.payment_amount, client.currency)}</strong>
                              <span>{[client.city, client.country].filter(Boolean).join(", ") || "Sin ubicación"}</span>
                            </div>
                            <div className="acquisition-contact">
                              {client.instagram_username && <a className="instagram-link" href={instagramUrl(client.instagram_username)} target="_blank" rel="noreferrer">{client.instagram_username}<ExternalLink size={11} /></a>}
                              {client.phone && <span>{client.phone}</span>}
                              {client.email && <span>{client.email}</span>}
                              {!client.instagram_username && !client.phone && !client.email && <span>Sin contacto registrado</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DeleteClientModal({ client, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const close = (event) => event.key === "Escape" && !deleting && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [deleting, onClose]);
  async function confirmDelete() {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="modal-layer">
      <section className="acquisition-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-client-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Confirmar eliminación</span>
            <h2 id="delete-client-title">¿Eliminar a {client.name}?</h2>
          </div>
          <IconButton label="Cerrar" onClick={onClose} disabled={deleting}><X /></IconButton>
        </div>
        <div className="acquisition-body">
          <p>El cliente <strong>{client.business_name}</strong> dejará de aparecer en la tabla general.</p>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={deleting}>Cancelar</button>
            <button
              type="button"
              className="primary"
              style={{ background: "var(--red)" }}
              onClick={confirmDelete}
              disabled={deleting}
            >
              <Trash2 size={17} />
              {deleting ? "Eliminando..." : "Eliminar cliente"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Clients() {
  const [data, setData] = useState({ items: [], pagination: {} });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [acquisition, setAcquisition] = useState("");
  const [showAcquisition, setShowAcquisition] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [toast, setToast] = useState("");
  const [sort, setSort] = useState({ by: "billing_day", dir: "asc" });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(
        `/clients?search=${encodeURIComponent(query)}&status=${status}&acquisition_source=${encodeURIComponent(acquisition)}&sort_by=${sort.by}&sort_dir=${sort.dir}&per_page=100`,
      );
      if (sort.by === "billing_day") {
        const direction = sort.dir === "desc" ? -1 : 1;
        result.items = [...result.items].sort((first, second) => {
          const dayDifference = billingDay(first.signup_date) - billingDay(second.signup_date);
          return dayDifference ? dayDifference * direction : first.name.localeCompare(second.name, "es");
        });
      }
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [query, status, acquisition, sort]);
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);
  function toggleSort(by) {
    setSort((s) => ({
      by,
      dir: s.by === by && s.dir === "asc" ? "desc" : "asc",
    }));
  }
  async function deleteClient() {
    try {
      await api(`/clients/${clientToDelete.id}`, { method: "DELETE" });
      setClientToDelete(null);
      await load();
      setToast("Cliente eliminado de la tabla general");
    } catch (error) {
      alert(error.message);
      throw error;
    }
  }
  return (
    <section className="page clients-page">
      <div className="page-intro">
        <div>
          <h2>{data.pagination.total || 0} clientes</h2>
          <p>Seguimiento, renovaciones y retención en un solo lugar.</p>
        </div>
        <div className="intro-actions">
          <button className="secondary" onClick={() => setShowAcquisition(true)}>
            <ChartNoAxesColumnIncreasing size={17} />
            Adquisición
          </button>
          <a className="secondary" href={`${API}/exports/clients.csv`}>
            <Download size={17} />
            Exportar
          </a>
          <button className="primary" onClick={() => setForm({ mode: "new" })}>
            <Plus size={18} />
            Nuevo cliente
          </button>
        </div>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, negocio o Instagram"
          />
        </label>
        <label className="filter">
          <SlidersHorizontal />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="active_no_signup">Activos y sin alta</option>
            <option value="active">Activos</option>
            <option value="at_risk">En riesgo</option>
            <option value="paused">Pausados</option>
            <option value="cancelled">Cancelados</option>
            <option value="no_signup">Sin alta</option>
          </select>
        </label>
        <label className="filter acquisition-filter">
          <ChartNoAxesColumnIncreasing />
          <select
            value={acquisition}
            onChange={(e) => setAcquisition(e.target.value)}
          >
            <option value="">Todos los canales</option>
            {ACQUISITION_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        {(query || status || acquisition) && (
          <button
            className="text-btn"
            onClick={() => {
              setQuery("");
              setStatus("");
              setAcquisition("");
            }}
          >
            <X size={15} />
            Limpiar
          </button>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <Th
                    label="Día cobro"
                    name="billing_day"
                    sort={sort}
                    toggle={toggleSort}
                  />
                  <Th
                    label="Cliente"
                    name="name"
                    sort={sort}
                    toggle={toggleSort}
                  />
                  <th>Estado</th>
                  <Th
                    label="Etapa"
                    name="service_stage"
                    sort={sort}
                    toggle={toggleSort}
                  />
                  <Th
                    label="Alta"
                    name="signup_date"
                    sort={sort}
                    toggle={toggleSort}
                  />
                  <Th
                    label="Renueva"
                    name="next_renewal_date"
                    sort={sort}
                    toggle={toggleSort}
                  />
                  <th>Próxima acción</th>
                  <th>Operativo</th>
                  <th>Métricas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} onClick={() => setSelected(c.id)}>
                    <td className="billing-day-cell">
                      <strong>{c.status === "no_signup" ? "—" : billingDay(c.signup_date)}</strong>
                    </td>
                    <td>
                      <strong>{c.name}</strong>
                      <span>{c.business_name}</span>
                    </td>
                    <td>{badge(c.status)}</td>
                    <td>{badge(c.service_stage)}</td>
                    <td>
                      <strong>{c.status === "no_signup" ? "Sin alta" : fmtDate(c.signup_date)}</strong>
                      {c.status !== "no_signup" && <span>{c.days_as_client} días</span>}
                    </td>
                    <td>
                      <strong>{c.status === "no_signup" ? "Sin alta" : fmtDate(c.next_renewal_date)}</strong>
                      {c.status !== "no_signup" && <span>{fmtMoney(c.payment_amount, c.currency)}</span>}
                    </td>
                    <td className="action-cell">
                      <strong>
                        {c.next_action?.title || "Sin pendientes"}
                      </strong>
                      <span
                        className={c.overdue_actions_count ? "red-text" : ""}
                      >
                        {c.overdue_actions_count
                          ? `${c.overdue_actions_count} vencidas`
                          : fmtDate(c.next_action?.due_date)}
                      </span>
                    </td>
                    <td>
                      <span className="operational">
                        Bio {LABEL[c.link_in_bio_status] || "Pend."}
                      </span>
                      <span className="operational">
                        Precios {LABEL[c.prices_status] || "Pend."}
                      </span>
                    </td>
                    <td>
                      <strong>{c.followers_count}</strong>
                      <span>{c.publications_count} publ.</span>
                    </td>
                    <td>
                      <IconButton
                        label={`Eliminar a ${c.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setClientToDelete(c);
                        }}
                      >
                        <Trash2 />
                      </IconButton>
                      <IconButton label="Ver detalle">
                        <ChevronRight />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-list">
            {data.items.map((c) => (
              <article key={c.id} onClick={() => setSelected(c.id)}>
                <div>
                  <div className="avatar small">
                    {c.name
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.business_name}</small>
                  </span>
                  {badge(c.status)}
                  <IconButton
                    label={`Eliminar a ${c.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setClientToDelete(c);
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
                <dl>
                  <div>
                    <dt>Día de cobro</dt>
                    <dd>{c.status === "no_signup" ? "Sin alta" : billingDay(c.signup_date)}</dd>
                  </div>
                  <div>
                    <dt>Renueva</dt>
                    <dd>{c.status === "no_signup" ? "Sin alta" : fmtDate(c.next_renewal_date)}</dd>
                  </div>
                  <div>
                    <dt>Próxima acción</dt>
                    <dd>{c.next_action?.title || "Sin pendientes"}</dd>
                  </div>
                </dl>
                {c.overdue_actions_count > 0 && (
                  <p className="mobile-alert">
                    <AlertTriangle size={15} />
                    {c.overdue_actions_count} acciones vencidas
                  </p>
                )}
              </article>
            ))}
          </div>
          {!data.items.length && <Empty />}
        </>
      )}
      {selected && (
        <DetailModal
          clientId={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
          onEdit={(c) => {
            setSelected(null);
            setForm({ mode: "edit", client: c });
          }}
        />
      )}
      {form && (
        <ClientForm
          client={form.client}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
            setToast("Cambios guardados correctamente");
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
      {showAcquisition && <AcquisitionModal onClose={() => setShowAcquisition(false)} />}
      {clientToDelete && (
        <DeleteClientModal
          client={clientToDelete}
          onClose={() => setClientToDelete(null)}
          onConfirm={deleteClient}
        />
      )}
    </section>
  );
}
function Th({ label, name, sort, toggle }) {
  return (
    <th>
      <button onClick={() => toggle(name)}>
        {label}
        <ArrowUpDown className={sort.by === name ? "active" : ""} size={14} />
      </button>
    </th>
  );
}

function Agenda() {
  const [view, setView] = useState("today");
  const [actionStatus, setActionStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [showNewAction, setShowNewAction] = useState(false);
  const [editingAgendaAction, setEditingAgendaAction] = useState(null);
  const [agendaDateOrder, setAgendaDateOrder] = useState("asc");
  const [selectedAgendaClient, setSelectedAgendaClient] = useState(null);
  const [agendaClientForm, setAgendaClientForm] = useState(null);
  const load = useCallback(
    () => api(`/actions?view=${view}&status=${actionStatus}${view === "calendar" ? `&month=${calendarMonth}` : ""}`).then(setItems),
    [view, actionStatus, calendarMonth],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function setAgendaStatus(action, status) {
    const actionId = action.standalone ? String(action.id).replace("standalone-", "") : action.id;
    await api(`/${action.standalone ? "standalone-actions" : "actions"}/${actionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    load();
  }
  const calendarDays = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
    const gridStart = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
    const counts = items.reduce((result, action) => {
      if (action.due_date) result[action.due_date] = (result[action.due_date] || 0) + 1;
      return result;
    }, {});
    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(gridStart);
      current.setUTCDate(gridStart.getUTCDate() + index);
      const iso = current.toISOString().slice(0, 10);
      return { iso, day: current.getUTCDate(), currentMonth: current.getUTCMonth() === month - 1, count: counts[iso] || 0 };
    });
  }, [calendarMonth, items]);
  const selectedDayItems = selectedCalendarDate
    ? items.filter((action) => action.due_date === selectedCalendarDate)
    : [];
  const sortedAgendaItems = useMemo(() => [...items].sort((first, second) => {
    if (!first.due_date && !second.due_date) return String(first.id).localeCompare(String(second.id));
    if (!first.due_date) return 1;
    if (!second.due_date) return -1;
    const dateComparison = first.due_date.localeCompare(second.due_date);
    const titleComparison = first.title.localeCompare(second.title, "es", { sensitivity: "base" });
    return (agendaDateOrder === "asc" ? dateComparison : -dateComparison) || titleComparison;
  }), [items, agendaDateOrder]);
  const calendarTitle = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${calendarMonth}-01T12:00:00Z`));
  function moveCalendarMonth(offset) {
    const [year, month] = calendarMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    setCalendarMonth(next.toISOString().slice(0, 7));
    setSelectedCalendarDate(null);
  }
  return (
    <section className="page">
      <div className="page-intro">
        <div>
          <h2>Acciones por fecha</h2>
          <p>Prioriza el trabajo sin perder el contexto del cliente.</p>
        </div>
        <button className="primary" onClick={() => setShowNewAction(true)}>
          <Plus size={18} />
          Agregar acción
        </button>
      </div>
      <div className="segmented">
        {[
          ["today", "Hoy"],
          ["week", "Próximos 7 días"],
          ["overdue", "Vencidas"],
          ["all", "Todas"],
          ["calendar", "Calendario"],
          ["undated", "Sin fecha"],
        ].map(([id, label]) => (
          <button
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="segmented action-status-tabs" aria-label="Filtrar acciones por estado">
        {[
          ["pending", "Pendientes"],
          ["completed", "Completadas"],
        ].map(([id, label]) => (
          <button
            className={actionStatus === id ? "active" : ""}
            onClick={() => setActionStatus(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      {view !== "calendar" && view !== "undated" && (
        <div className="agenda-sort-toolbar">
          <button
            type="button"
            className="secondary small"
            onClick={() => setAgendaDateOrder((order) => order === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown size={14} />
            {agendaDateOrder === "asc" ? "Más próximas primero" : "Más lejanas primero"}
          </button>
        </div>
      )}
      {view === "calendar" ? (
        <div className="action-calendar">
          <div className="calendar-head">
            <button className="icon-btn" onClick={() => moveCalendarMonth(-1)} aria-label="Mes anterior"><ChevronLeft /></button>
            <h3>{calendarTitle}</h3>
            <button className="icon-btn" onClick={() => moveCalendarMonth(1)} aria-label="Mes siguiente"><ChevronRight /></button>
          </div>
          <div className="calendar-grid calendar-weekdays">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid calendar-days">
            {calendarDays.map((day) => (
              <button
                type="button"
                key={day.iso}
                className={`${day.currentMonth ? "" : "outside"} ${selectedCalendarDate === day.iso ? "selected" : ""}`}
                onClick={() => setSelectedCalendarDate(day.iso)}
              >
                <time>{day.day}</time>
                {day.count > 0 && <strong>{day.count} {day.count === 1 ? "acción" : "acciones"}</strong>}
              </button>
            ))}
          </div>
          {selectedCalendarDate && (
            <div className="calendar-selection">
              <h3>Acciones del {fmtDate(selectedCalendarDate)}</h3>
              <div className="agenda-list">
                {selectedDayItems.map((a) => (
                  <AgendaItem key={a.id} action={a} onStatus={setAgendaStatus} onEdit={setEditingAgendaAction} onOpenClient={setSelectedAgendaClient} />
                ))}
                {!selectedDayItems.length && <p>Sin acciones para este día.</p>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="agenda-list">
        {sortedAgendaItems.map((a) => (
          <AgendaItem key={a.id} action={a} onStatus={setAgendaStatus} onEdit={setEditingAgendaAction} onOpenClient={setSelectedAgendaClient} />
          ))}
        </div>
      )}
      {view !== "calendar" && !items.length && <Empty />}
      {showNewAction && (
        <AgendaNewAction
          undated={view === "undated"}
          onClose={() => setShowNewAction(false)}
          onSaved={() => {
            setShowNewAction(false);
            setActionStatus("pending");
            if (actionStatus === "pending") load();
          }}
        />
      )}
      {editingAgendaAction && (
        <AgendaActionEditor
          action={editingAgendaAction}
          onClose={() => setEditingAgendaAction(null)}
          onSaved={() => {
            setEditingAgendaAction(null);
            load();
          }}
        />
      )}
      {selectedAgendaClient && (
        <DetailModal
          clientId={selectedAgendaClient}
          onClose={() => setSelectedAgendaClient(null)}
          onRefresh={load}
          onEdit={(client) => {
            setSelectedAgendaClient(null);
            setAgendaClientForm(client);
          }}
        />
      )}
      {agendaClientForm && (
        <ClientForm
          client={agendaClientForm}
          onClose={() => setAgendaClientForm(null)}
          onSaved={() => {
            setAgendaClientForm(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function AgendaNewAction({ undated, onClose, onSaved }) {
  const [clients, setClients] = useState([]);
  const [actionPreset, setActionPreset] = useState("");
  const [form, setForm] = useState({
    client_id: "",
    custom_context: "",
    title: "",
    description: "",
    due_date: new Date().toISOString().slice(0, 10),
    priority: "medium",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadAllClients() {
      const first = await api("/clients?per_page=100&page=1&sort_by=name&sort_dir=asc");
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, first.pagination.pages - 1) }, (_, index) =>
          api(`/clients?per_page=100&page=${index + 2}&sort_by=name&sort_dir=asc`),
        ),
      );
      if (active) setClients([first, ...remaining].flatMap((result) => result.items));
    }
    loadAllClients();
    return () => { active = false; };
  }, []);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const customContext = form.client_id === "__custom";
      const unassignedUndated = undated && !form.client_id;
      await api(unassignedUndated || customContext ? "/standalone-actions" : `/clients/${form.client_id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          context_name: undated ? undefined : customContext ? form.custom_context : undefined,
          title: undated ? form.title : actionPreset === "__custom" ? form.title : actionPreset,
          description: form.description,
          due_date: undated ? null : form.due_date,
          priority: form.priority,
          status: "pending",
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="form-modal agenda-action-modal">
        <div className="modal-head">
          <div><span className="eyebrow">Agenda</span><h2>{undated ? "Agregar acción sin fecha" : "Agregar acción pendiente"}</h2></div>
          <IconButton label="Cerrar" onClick={onClose}><X /></IconButton>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {undated ? (
              <>
                <label className="span-2">
                  Cliente
                  <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} autoFocus>
                    <option value="">Sin asignar</option>
                    {clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.business_name}</option>)}
                  </select>
                </label>
                <label className="span-2">Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="¿Qué tenés pendiente?" required /></label>
                <label className="span-2">Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Agregá los detalles necesarios..." required /></label>
              </>
            ) : (
              <>
            <label className="span-2">
              Cliente
              <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} required>
                <option value="">Elegí un cliente</option>
                {clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.business_name}</option>)}
                <option value="__custom">PERSONALIZADO / SIN CLIENTE...</option>
              </select>
            </label>
            {form.client_id === "__custom" && (
              <label className="span-2">
                ¿Para quién o para qué es?
                <input value={form.custom_context} onChange={(event) => setForm({ ...form, custom_context: event.target.value })} placeholder="Ej.: proveedor, trámite, tarea interna..." required />
              </label>
            )}
            <label className="span-2">
              Acción
              <select value={actionPreset} onChange={(event) => setActionPreset(event.target.value)} required>
                <option value="">Elegí una acción</option>
                {ACTION_PRESETS.map((preset) => <option value={preset} key={preset}>{preset}</option>)}
                <option value="__custom">ACCIÓN PERSONALIZADA...</option>
              </select>
            </label>
            {actionPreset === "__custom" && (
              <label className="span-2">Nombre de la acción<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
            )}
            <label>Fecha<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>
            <label>
              Prioridad
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                <option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select>
            </label>
              </>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button className="primary" disabled={saving}><Save size={17} />{saving ? "Guardando..." : "Guardar acción"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgendaActionEditor({ action, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: action.title,
    context_name: action.client_name,
    due_date: action.due_date || "",
    priority: action.priority || "medium",
    description: action.description || "",
  });
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const actionId = action.standalone ? String(action.id).replace("standalone-", "") : action.id;
      await api(`/${action.standalone ? "standalone-actions" : "actions"}/${actionId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="form-modal agenda-action-modal">
        <div className="modal-head">
          <div><span className="eyebrow">Agenda</span><h2>Editar acción</h2></div>
          <IconButton label="Cerrar" onClick={onClose}><X /></IconButton>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {action.standalone ? (
              <label className="span-2">¿Para quién o para qué es?<input value={form.context_name} onChange={(event) => setForm({ ...form, context_name: event.target.value })} required /></label>
            ) : (
              <label className="span-2">Cliente<input value={`${action.client_name} · ${action.business_name}`} readOnly /></label>
            )}
            <label className="span-2">Acción<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
            {!action.due_date && <label className="span-2">Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>}
            {action.due_date && <label>Fecha<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>}
            <label>Prioridad<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button className="primary" disabled={saving}><Save size={17} />{saving ? "Guardando..." : "Guardar cambios"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgendaItem({ action: a, onStatus, onEdit, onOpenClient }) {
  const openClient = () => a.client_id && onOpenClient(a.client_id);
  return (
          <article
            key={a.id}
            className={a.client_id ? "clickable-action" : ""}
            onClick={openClient}
            role={a.client_id ? "button" : undefined}
            tabIndex={a.client_id ? 0 : undefined}
            onKeyDown={(event) => {
              if (a.client_id && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                openClient();
              }
            }}
          >
      <div className={`priority ${a.priority}`} />
            <div>
              <time>{fmtDate(a.due_date)}</time>
              <h3>{a.title}</h3>
              {a.client_id && <p>{a.client_name} · {a.business_name}</p>}
              {(a.description || !a.client_id || a.projected) && (
                <p>{a.description || `${a.client_name} · ${a.business_name}`}{a.projected ? " · Cobro previsto" : ""}</p>
              )}
            </div>
            {badge(a.status)}
            {!a.projected && <IconButton label={`Editar ${a.title}`} onClick={(event) => { event.stopPropagation(); onEdit(a); }}><Edit3 /></IconButton>}
            {a.status !== "completed" && !a.projected && (
        <button
          className="secondary small"
                onClick={(event) => { event.stopPropagation(); onStatus(a, "completed"); }}
        >
          <Check size={16} />
          Completar
        </button>
      )}
            {a.status === "completed" && !a.projected && (
              <button className="secondary small" onClick={(event) => { event.stopPropagation(); onStatus(a, "pending"); }}><RotateCcw size={16} />Reabrir</button>
            )}
    </article>
  );
}
function Messages() {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const [items, setItems] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterChannel, setFilterChannel] = useState("");
  const [form, setForm] = useState({ entry_type: "monthly", month: currentMonth, sent_date: today, channel: "", quantity: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api("/messages").then(setItems), []);
  useEffect(() => { load(); }, [load]);
  const availableMonths = useMemo(
    () => [...new Set(items.map((item) => item.sent_date?.slice(0, 7)).filter(Boolean))].sort().reverse(),
    [items],
  );
  const monthItems = useMemo(
    () => selectedMonth ? items.filter((item) => item.sent_date?.startsWith(selectedMonth)) : items,
    [items, selectedMonth],
  );
  const filteredMonthItems = useMemo(
    () => selectedChannel ? monthItems.filter((item) => item.channel === selectedChannel) : monthItems,
    [monthItems, selectedChannel],
  );
  const filteredAllItems = useMemo(
    () => selectedChannel ? items.filter((item) => item.channel === selectedChannel) : items,
    [items, selectedChannel],
  );
  const totals = useMemo(() => filteredMonthItems.reduce((result, item) => ({
    ...result,
    [item.channel]: (result[item.channel] || 0) + item.quantity,
  }), {}), [filteredMonthItems]);
  const todayTotal = filteredAllItems.filter((item) => item.entry_type !== "monthly" && item.sent_date === today).reduce((total, item) => total + item.quantity, 0);
  const monthTotal = filteredMonthItems.reduce((total, item) => total + item.quantity, 0);
  const allTimeTotal = filteredAllItems.reduce((total, item) => total + item.quantity, 0);
  const monthLabel = selectedMonth ? fmtMonth(selectedMonth) : "todos los meses";
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try {
      await api("/messages", { method: "POST", body: JSON.stringify(form) });
      const savedMonth = form.entry_type === "monthly" ? form.month : form.sent_date.slice(0, 7);
      setSelectedMonth(savedMonth);
      setFilterMonth(savedMonth);
      setForm({ ...form, channel: "", quantity: "", notes: "" });
      await load();
    } finally { setSaving(false); }
  }
  async function remove(item) {
    if (!window.confirm(`¿Eliminar el registro de ${item.quantity} mensajes?`)) return;
    await api(`/messages/${item.id}`, { method: "DELETE" }); load();
  }
  async function saveEdit(event) {
    event.preventDefault();
    await api(`/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing) });
    setEditing(null); await load();
  }
  return (
    <section className="page messages-page">
      <div className="page-intro"><div><h2>Mensajes enviados</h2><p>Registrá cuántos mensajes mandaste por cada canal.</p></div></div>
      <div className="message-overview">
        <div className="message-today"><span><Mail size={20} /></span><div><small>Enviados hoy</small><strong>{todayTotal}</strong></div></div>
        <div className="message-today month-total"><span><CalendarDays size={20} /></span><div><small>Total de {monthLabel}</small><strong>{monthTotal}</strong></div></div>
        <div className="message-today all-time-total"><span><ChartNoAxesColumnIncreasing size={20} /></span><div><small>Total de todos los meses</small><strong>{allTimeTotal}</strong></div></div>
      </div>
      <form className="message-form" onSubmit={submit}>
        <label>Tipo de carga<select value={form.entry_type} onChange={(event) => setForm({ ...form, entry_type: event.target.value })}><option value="monthly">Total del mes</option><option value="daily">Detalle por día</option></select></label>
        {form.entry_type === "monthly"
          ? <label>Mes<input type="month" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} required /></label>
          : <label>Fecha<input type="date" value={form.sent_date} onChange={(event) => setForm({ ...form, sent_date: event.target.value })} required /></label>}
        <label>Canal<select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} required><option value="">Elegí un canal</option>{ACQUISITION_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
        <label className="message-notes">Nota opcional<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ej.: campaña de seguimiento" /></label>
        <button className="primary" disabled={saving}><Plus size={17} />{saving ? "Guardando..." : "Registrar"}</button>
      </form>
      <form className="message-search" onSubmit={(event) => { event.preventDefault(); setSelectedMonth(filterMonth); setSelectedChannel(filterChannel); }}>
        <div><span className="eyebrow">Buscar registros</span><h3>Consultar totales cargados</h3></div>
        <label>Mes<select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)}><option value="">Todos los meses</option>{availableMonths.map((month) => <option value={month} key={month}>{fmtMonth(month)}</option>)}</select></label>
        <label>Canal<select value={filterChannel} onChange={(event) => setFilterChannel(event.target.value)}><option value="">Todos los canales</option>{ACQUISITION_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <button className="primary"><Search size={16} />Buscar</button>
        <button type="button" className="secondary" onClick={() => { setFilterMonth(""); setFilterChannel(""); setSelectedMonth(""); setSelectedChannel(""); }}>Ver todos</button>
      </form>
      <div className="message-channel-totals">
        <div className="all-channels-total"><small>Total · todos los canales</small><strong>{monthTotal}</strong><span>{monthLabel}</span></div>
        {Object.entries(totals).sort(([first], [second]) => acquisitionLabel(first).localeCompare(acquisitionLabel(second), "es")).map(([channel, total]) => <div key={channel}><small>{acquisitionLabel(channel)}</small><strong>{total}</strong><span>mensajes</span></div>)}
      </div>
      <div className="table-wrap messages-table"><table><thead><tr><th>Período</th><th>Tipo</th><th>Canal</th><th>Cantidad</th><th>Nota</th><th /></tr></thead><tbody>{filteredMonthItems.map((item) => <tr key={item.id}><td><strong>{item.entry_type === "monthly" ? fmtMonth(item.sent_date) : fmtDate(item.sent_date)}</strong></td><td>{item.entry_type === "monthly" ? "Total mensual" : "Carga diaria"}</td><td>{acquisitionLabel(item.channel)}</td><td><strong>{item.quantity}</strong></td><td>{item.notes || "—"}</td><td><IconButton label="Editar registro" onClick={() => setEditing({ ...item, month: item.sent_date.slice(0, 7) })}><Edit3 /></IconButton><IconButton label="Eliminar registro" onClick={() => remove(item)}><Trash2 /></IconButton></td></tr>)}</tbody></table></div>
      {!filteredMonthItems.length && <Empty />}
      {editing && (
        <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}>
          <div className="form-modal message-edit-modal">
            <div className="modal-head"><div><span className="eyebrow">Mensajes</span><h2>Editar total cargado</h2></div><IconButton label="Cerrar" onClick={() => setEditing(null)}><X /></IconButton></div>
            <form onSubmit={saveEdit}>
              <div className="form-grid">
                <label>Tipo de carga<select value={editing.entry_type} onChange={(event) => setEditing({ ...editing, entry_type: event.target.value })}><option value="monthly">Total del mes</option><option value="daily">Detalle por día</option></select></label>
                {editing.entry_type === "monthly" ? <label>Mes<input type="month" value={editing.month} onChange={(event) => setEditing({ ...editing, month: event.target.value })} required /></label> : <label>Fecha<input type="date" value={editing.sent_date} onChange={(event) => setEditing({ ...editing, sent_date: event.target.value })} required /></label>}
                <label>Canal<select value={editing.channel} onChange={(event) => setEditing({ ...editing, channel: event.target.value })} required>{ACQUISITION_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Cantidad<input type="number" min="1" value={editing.quantity} onChange={(event) => setEditing({ ...editing, quantity: event.target.value })} required /></label>
                <label className="span-2">Nota opcional<input value={editing.notes || ""} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
              </div>
              <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary"><Save size={16} />Guardar cambios</button></div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Vps() {
  const [data, setData] = useState({ items: [], counts: { vape: 0, shatha: 0 } });
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ vps_name: "vape", selection: "", custom_name: "" });
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => Promise.all([
    api("/vps"), api("/clients?per_page=100&sort_by=name"),
  ]).then(([vpsData, clientData]) => {
    setData(vpsData); setClients(clientData.items);
  }), []);
  useEffect(() => { load(); }, [load]);
  const assignedClientIds = useMemo(() => new Set(data.items.filter((item) => item.client_id).map((item) => item.client_id)), [data.items]);
  const searchResults = useMemo(() => {
    const normalized = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    if (!normalized) return [];
    return data.items.filter((item) => `${item.name} ${item.business_name}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").includes(normalized));
  }, [data.items, query]);
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try {
      await api("/vps", {
        method: "POST",
        body: JSON.stringify({
          vps_name: form.vps_name,
          client_id: form.selection.startsWith("client:") ? Number(form.selection.slice(7)) : null,
          custom_name: form.selection === "custom" ? form.custom_name : "",
        }),
      });
      setForm({ ...form, selection: "", custom_name: "" });
      await load();
    } catch (error) { alert(error.message); }
    finally { setSaving(false); }
  }
  async function move(item, vpsName) {
    await api(`/vps/${item.id}`, { method: "PATCH", body: JSON.stringify({ vps_name: vpsName }) });
    await load();
  }
  async function remove(item) {
    if (!window.confirm(`¿Quitar "${item.name}" de ${item.vps_name === "vape" ? "VPS Vape" : "VPS Shatha"}?`)) return;
    await api(`/vps/${item.id}`, { method: "DELETE" }); await load();
  }
  const servers = [["vape", "VPS Vape"], ["shatha", "VPS Shatha"]];
  return (
    <section className="page vps-page">
      <div className="page-intro"><div><h2>Distribución de VPS</h2><p>Organizá clientes y aplicaciones según el servidor donde están alojados.</p></div></div>
      <form className="vps-form" onSubmit={submit}>
        <div><span className="eyebrow">Nueva asignación</span><h3>Agregar a un VPS</h3></div>
        <label>VPS<select value={form.vps_name} onChange={(event) => setForm({ ...form, vps_name: event.target.value })}><option value="vape">VPS Vape</option><option value="shatha">VPS Shatha</option></select></label>
        <label>Cliente o aplicación<select value={form.selection} onChange={(event) => setForm({ ...form, selection: event.target.value, custom_name: "" })} required><option value="">Elegí una opción</option>{clients.filter((client) => !assignedClientIds.has(client.id)).map((client) => <option value={`client:${client.id}`} key={client.id}>{client.name} · {client.business_name}</option>)}<option value="custom">Nombre personalizado…</option></select></label>
        {form.selection === "custom" && <label>Nombre personalizado<input value={form.custom_name} onChange={(event) => setForm({ ...form, custom_name: event.target.value })} placeholder="Nombre de la aplicación" required autoFocus /></label>}
        <button className="primary" disabled={saving}><Plus size={17} />{saving ? "Agregando…" : "Agregar"}</button>
      </form>
      <div className="vps-search">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o aplicación..." />{query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><X size={16} /></button>}</label>
        {query.trim() && <div className="vps-search-results">{searchResults.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.business_name}</span></div><b>{item.vps_name === "vape" ? "VPS Vape" : "VPS Shatha"}</b></article>)}{!searchResults.length && <p>No se encontró ningún cliente o aplicación asignada.</p>}</div>}
      </div>
      <div className="vps-lists">
        {servers.map(([id, title]) => {
          const entries = data.items.filter((item) => item.vps_name === id);
          const otherId = id === "vape" ? "shatha" : "vape";
          return <section className="vps-card" key={id}><header><span><Server size={20} /></span><div><h3>{title}</h3><p>{entries.length} {entries.length === 1 ? "elemento alojado" : "elementos alojados"}</p></div><strong>{entries.length}</strong></header><div className="vps-items">{entries.map((item) => <article key={item.id}><div className="vps-item-name"><strong>{item.name}</strong><span>{item.business_name}</span></div><select aria-label={`Mover ${item.name}`} value={item.vps_name} onChange={(event) => move(item, event.target.value)}><option value={id}>{title}</option><option value={otherId}>{otherId === "vape" ? "VPS Vape" : "VPS Shatha"}</option></select><IconButton label={`Quitar ${item.name}`} onClick={() => remove(item)}><Trash2 /></IconButton></article>)}{!entries.length && <div className="vps-empty"><Server /><span>Este VPS todavía está vacío.</span></div>}</div></section>;
        })}
      </div>
    </section>
  );
}

function Expenses() {
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [scope, setScope] = useState("month");
  const [data, setData] = useState({ items: [], summary: { server_income_ars: 0, server_expenses_ars: 0, net_server_cost_ars: 0, extra_expenses_ars: 0, expenses_ars: 0, balance_ars: 0 } });
  const [form, setForm] = useState({ expense_date: today, category: "server", description: "Servidor", amount: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api(`/expenses?scope=${scope}&month=${month}`).then(setData), [month, scope]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) {
    event.preventDefault(); setSaving(true);
    try {
      await api(editing ? `/expenses/${editing.id}` : "/expenses", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      setEditing(null);
      setForm({ expense_date: scope === "month" ? `${month}-01` : today, category: "server", description: "Servidor", amount: "", notes: "" });
      await load();
    } catch (error) {
      alert(error.message);
    } finally { setSaving(false); }
  }
  function changeCategory(category) {
    setForm((current) => ({
      ...current,
      category,
      description: ["Servidor", "Aporte VPS"].includes(current.description) || !current.description
        ? category === "server" ? "Servidor" : category === "server_income" ? "Aporte VPS" : ""
        : current.description,
    }));
  }
  function edit(expense) {
    setEditing(expense);
    setForm({ expense_date: expense.expense_date, category: expense.category, description: expense.description, amount: expense.amount, notes: expense.notes || "" });
  }
  async function remove(expense) {
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
    await api(`/expenses/${expense.id}`, { method: "DELETE" });
    await load();
  }
  const summary = data.summary;
  return (
    <section className="page expenses-page">
      <div className="page-intro">
        <div><h2>Gastos y balance</h2><p>Control de servidor, aportes y gastos extra, todo expresado en pesos.</p></div>
        <div className="expense-period-filter"><label>Período<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="month">Por mes</option><option value="all">Total acumulado</option></select></label>{scope === "month" && <label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}</div>
      </div>
      <div className="balance-grid">
        <article className="balance-card contribution"><small>Ganancia / aportes VPS</small><strong>{fmtMoney(summary.server_income_ars, "ARS")}</strong><span>Aportes cargados manualmente</span></article>
        <article className="balance-card spent"><small>Gasto bruto de servidor</small><strong>{fmtMoney(summary.server_expenses_ars, "ARS")}</strong><span>Antes de descontar aportes</span></article>
        <article className="balance-card server-net"><small>Costo real del servidor</small><strong>{fmtMoney(summary.net_server_cost_ars, "ARS")}</strong><span>Servidor menos aportes</span></article>
        <article className="balance-card spent"><small>Gastos extra</small><strong>{fmtMoney(summary.extra_expenses_ars, "ARS")}</strong><span>Otros gastos registrados</span></article>
        <article className={`balance-card final ${summary.balance_ars < 0 ? "negative" : ""}`}><small>Balance final</small><strong>{fmtMoney(summary.balance_ars, "ARS")}</strong><span>Aportes VPS menos todos los gastos</span></article>
      </div>
      <form className="expense-form" onSubmit={submit}>
        <div className="expense-form-title"><span className="eyebrow">{editing ? "Editar movimiento" : "Nuevo movimiento"}</span><h3>{editing ? form.description : "Registrar gasto o aporte"}</h3></div>
        <label>Fecha<input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} required /></label>
        <label>Tipo<select value={form.category} onChange={(event) => changeCategory(event.target.value)}><option value="server">Gasto de servidor</option><option value="server_income">Ganancia / aporte VPS</option><option value="extra">Gasto extra</option></select></label>
        <label>Concepto<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej.: dominio, publicidad…" required /></label>
        <label>Importe en pesos<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
        <label className="expense-notes">Nota opcional<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <div className="expense-form-actions">
          {editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm({ expense_date: scope === "month" ? `${month}-01` : today, category: "server", description: "Servidor", amount: "", notes: "" }); }}>Cancelar</button>}
          <button className="primary" disabled={saving}><Save size={16} />{saving ? "Guardando…" : editing ? "Guardar" : "Registrar"}</button>
        </div>
      </form>
      <div className="table-wrap expenses-table"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Nota</th><th /></tr></thead><tbody>{data.items.map((expense) => <tr key={expense.id}><td><strong>{fmtDate(expense.expense_date)}</strong></td><td>{expense.category === "server" ? "Gasto de servidor" : expense.category === "server_income" ? "Ganancia / aporte VPS" : "Gasto extra"}</td><td><strong>{expense.description}</strong></td><td><strong className={expense.category === "server_income" ? "income-text" : ""}>{expense.category === "server_income" ? "+ " : ""}{fmtMoney(expense.amount, "ARS")}</strong></td><td>{expense.notes || "—"}</td><td><IconButton label="Editar movimiento" onClick={() => edit(expense)}><Edit3 /></IconButton><IconButton label="Eliminar movimiento" onClick={() => remove(expense)}><Trash2 /></IconButton></td></tr>)}</tbody></table></div>
      {!data.items.length && <Empty />}
    </section>
  );
}

function Payments() {
  const [items, setItems] = useState([]);
  const [forecast, setForecast] = useState({ items: [], totals: {} });
  const [editing, setEditing] = useState(null);
  const [summaryDetail, setSummaryDetail] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientForm, setClientForm] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientNameOrder, setClientNameOrder] = useState("asc");
  const [dueDateOrder, setDueDateOrder] = useState(null);
  const [statusOrder, setStatusOrder] = useState(null);
  const load = useCallback(() => Promise.all([
    api("/payments"), api("/payments/monthly-forecast"),
  ]).then(([payments, monthlyForecast]) => {
    setItems(payments); setForecast(monthlyForecast);
  }), []);
  useEffect(() => {
    load();
  }, [load]);
  const totals = useMemo(
    () =>
      items.reduce((r, p) => {
        const key = `${p.currency}-${p.status}`;
        r[key] = (r[key] || 0) + p.amount;
        return r;
      }, {}),
    [items],
  );
  const paidTotals = useMemo(
    () => items.filter((payment) => payment.status === "paid").reduce((result, payment) => ({
      ...result,
      [payment.currency]: (result[payment.currency] || 0) + payment.amount,
    }), {}),
    [items],
  );
  const monthlyPaidTotals = useMemo(
    () => items
      .filter((payment) => payment.status === "paid" && payment.payment_type === "monthly")
      .reduce((result, payment) => ({
        ...result,
        [payment.currency]: (result[payment.currency] || 0) + payment.amount,
      }), {}),
    [items],
  );
  const extraWorkPaidTotals = useMemo(
    () => items
      .filter((payment) => payment.status === "paid" && payment.payment_type !== "monthly")
      .reduce((result, payment) => ({
        ...result,
        [payment.currency]: (result[payment.currency] || 0) + payment.amount,
      }), {}),
    [items],
  );
  const paymentCurrencies = useMemo(
    () => [...new Set(items.map((payment) => payment.currency))].sort(),
    [items],
  );
  const sortedItems = useMemo(() => {
    const normalizedQuery = clientQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    const visibleItems = normalizedQuery
      ? items.filter((payment) => payment.client_name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es")
        .includes(normalizedQuery))
      : items;
    const byClient = (first, second) => {
      const clientOrder = first.client_name.localeCompare(second.client_name, "es", {
        sensitivity: "base",
      });
      if (clientOrder) return clientOrder;
      if (!first.due_date && !second.due_date) return first.id - second.id;
      if (!first.due_date) return 1;
      if (!second.due_date) return -1;
      return first.due_date.localeCompare(second.due_date) || first.id - second.id;
    };
    if (statusOrder) {
      const statusPriority = { pending: 0, partial: 1, overdue: 2, waived: 3, paid: 4 };
      return [...visibleItems].sort((first, second) => {
        const firstPriority = statusPriority[first.status] ?? 2;
        const secondPriority = statusPriority[second.status] ?? 2;
        const statusDifference = firstPriority - secondPriority;
        return (statusOrder === "asc" ? statusDifference : -statusDifference) || byClient(first, second);
      });
    }
    if (!dueDateOrder) {
      return [...visibleItems].sort((first, second) => {
        const clientOrder = first.client_name.localeCompare(second.client_name, "es", {
          sensitivity: "base",
        });
        return (clientNameOrder === "asc" ? clientOrder : -clientOrder) || byClient(first, second);
      });
    }
    return [...visibleItems].sort((first, second) => {
      if (!first.due_date && !second.due_date) return byClient(first, second);
      if (!first.due_date) return 1;
      if (!second.due_date) return -1;
      const dateOrder = first.due_date.localeCompare(second.due_date);
      return (dueDateOrder === "asc" ? dateOrder : -dateOrder) || byClient(first, second);
    });
  }, [items, clientQuery, clientNameOrder, dueDateOrder, statusOrder]);
  async function setPaymentStatus(id, status) {
    await api(`/payments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setSummaryDetail((current) => current?.kind === "payments" ? {
      ...current,
      items: current.items.map((payment) => payment.id === id ? {
        ...payment,
        status,
        paid_at: status === "paid" ? new Date().toISOString() : null,
      } : payment),
    } : current);
    await load();
  }
  async function removePayment(payment) {
    if (!window.confirm(`¿Eliminar el pago de ${payment.client_name}?`)) return;
    await api(`/payments/${payment.id}`, { method: "DELETE" });
    load();
  }
  function showSummary(title, predicate) {
    setSummaryDetail({ title, items: items.filter(predicate), kind: "payments" });
  }
  function showForecast(currency) {
    setSummaryDetail({
      title: `Mensualidad a cobrar por mes · ${currency}`,
      items: forecast.items.filter((client) => client.currency === currency),
      kind: "forecast",
    });
  }
  function openClientPayments(clientId) {
    setSummaryDetail(null);
    setSelectedClient(clientId);
  }
  return (
    <section className="page">
      <div className="page-intro">
        <div>
          <h2>Control de pagos</h2>
          <p>Mensualidades, señas y trabajos extra por cliente.</p>
        </div>
      </div>
      <button type="button" className="global-paid-total payment-summary-trigger" onClick={() => showSummary("Todos los pagos completados", (payment) => payment.status === "paid")}>
        <div><span className="eyebrow">Total general realizado</span><h3>Todos los pagos completados</h3></div>
        <div>{Object.entries(paidTotals).map(([currency, total]) => <strong key={currency}>{fmtMoney(total, currency)}</strong>)}{!Object.keys(paidTotals).length && <span>Sin pagos completados</span>}</div>
      </button>
      <div className="payment-summary">
        {Object.entries(forecast.totals).sort(([first], [second]) => first.localeCompare(second)).map(([currency, total]) => (
          <button type="button" className="payment-summary-trigger monthly-forecast-card" key={`monthly-forecast-${currency}`} onClick={() => showForecast(currency)}>
            <small>Mensualidad a cobrar por mes · {currency}</small>
            <strong>{fmtMoney(total, currency)}</strong>
          </button>
        ))}
        {paymentCurrencies.map((currency) => (
          <button type="button" className="payment-summary-trigger" key={`monthly-paid-${currency}`} onClick={() => showSummary(`Mensualidades pagadas · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid" && payment.payment_type === "monthly")}>
            <small>Pagos Mensualidades · {currency}</small>
            <strong>{fmtMoney(monthlyPaidTotals[currency] || 0, currency)}</strong>
          </button>
        ))}
        {paymentCurrencies.map((currency) => (
          <button type="button" className="payment-summary-trigger" key={`extra-work-paid-${currency}`} onClick={() => showSummary(`Trabajos extra pagados · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid" && payment.payment_type !== "monthly")}>
            <small>Pagos Trabajos extra · {currency}</small>
            <strong>{fmtMoney(extraWorkPaidTotals[currency] || 0, currency)}</strong>
          </button>
        ))}
        {paymentCurrencies.map((currency) => (
          <button type="button" className="payment-summary-trigger" key={`total-paid-${currency}`} onClick={() => showSummary(`Todos los pagos completados · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid")}>
            <small>Pagos Totales · {currency}</small>
            <strong>{fmtMoney(
              (monthlyPaidTotals[currency] || 0) + (extraWorkPaidTotals[currency] || 0),
              currency,
            )}</strong>
          </button>
        ))}
        {Object.entries(totals).filter(([key]) => !key.endsWith("-paid")).map(([key, total]) => {
          const [currency, status] = key.split("-");
          return (
            <button type="button" className="payment-summary-trigger" key={key} onClick={() => showSummary(`${LABEL[status] || status} · ${currency}`, (payment) => payment.currency === currency && payment.status === status)}>
              <small>
                {LABEL[status] || status} · {currency}
              </small>
              <strong>{fmtMoney(total, currency)}</strong>
            </button>
          );
        })}
      </div>
      <div className="toolbar">
        <label className="search">
          <Search />
          <input
            value={clientQuery}
            onChange={(event) => setClientQuery(event.target.value)}
            placeholder="Buscar por nombre de cliente"
          />
        </label>
        {clientQuery && (
          <button className="text-btn" onClick={() => setClientQuery("")}>
            <X size={15} />
            Limpiar
          </button>
        )}
      </div>
      <div className="table-wrap payments-table">
        <table>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  onClick={() => {
                    setClientNameOrder((order) => dueDateOrder ? "asc" : order === "asc" ? "desc" : "asc");
                    setDueDateOrder(null);
                    setStatusOrder(null);
                  }}
                  title={clientNameOrder === "asc" ? "Ordenar clientes de Z a A" : "Ordenar clientes de A a Z"}
                >
                  Cliente
                  <ArrowUpDown className={!dueDateOrder && !statusOrder ? "active" : ""} size={14} />
                </button>
              </th>
              <th>Importe</th>
              <th>Concepto</th>
              <th>
                <button
                  type="button"
                  onClick={() => {
                    setDueDateOrder((order) => order === "asc" ? "desc" : "asc");
                    setStatusOrder(null);
                  }}
                  title={dueDateOrder === "asc" ? "Ordenar del más lejano al más próximo" : "Ordenar del más próximo al más lejano"}
                >
                  Vencimiento
                  <ArrowUpDown className={dueDateOrder ? "active" : ""} size={14} />
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => {
                    setStatusOrder((order) => order === "asc" ? "desc" : "asc");
                    setDueDateOrder(null);
                  }}
                  title={statusOrder === "asc" ? "Mostrar pagados primero" : "Mostrar pendientes primero"}
                >
                  Estado
                  <ArrowUpDown className={statusOrder ? "active" : ""} size={14} />
                </button>
              </th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.client_name}</strong>
                </td>
                <td>
                  <strong>{fmtMoney(p.amount, p.currency)}</strong>
                </td>
                <td>{LABEL[p.payment_type] || p.payment_type}</td>
                <td>{fmtDate(p.due_date)}</td>
                <td>{badge(p.status)}</td>
                <td className="payment-actions">
                  <IconButton label="Editar pago" onClick={() => setEditing(p)}><Edit3 /></IconButton>
                  <IconButton label="Eliminar pago" onClick={() => removePayment(p)}><Trash2 /></IconButton>
                  {p.status !== "paid" ? <button className="text-btn complete" onClick={() => setPaymentStatus(p.id, "paid")}><Check />Pagado</button> : <button className="text-btn" onClick={() => setPaymentStatus(p.id, "pending")}><RotateCcw />Reabrir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-layer">
          <div className="payment-edit-modal">
            <div className="modal-head"><div><span className="eyebrow">{editing.client_name}</span><h2>Editar pago</h2></div><IconButton label="Cerrar" onClick={() => setEditing(null)}><X /></IconButton></div>
            <PaymentEditor payment={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
          </div>
        </div>
      )}
      {summaryDetail && (
        <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setSummaryDetail(null)}>
          <div className="payment-summary-modal">
            <div className="modal-head"><div><span className="eyebrow">Desglose del total</span><h2>{summaryDetail.title}</h2></div><IconButton label="Cerrar" onClick={() => setSummaryDetail(null)}><X /></IconButton></div>
            <div className="summary-payment-count">{summaryDetail.items.length} {summaryDetail.kind === "forecast" ? summaryDetail.items.length === 1 ? "cliente incluido" : "clientes incluidos" : summaryDetail.items.length === 1 ? "pago incluido" : "pagos incluidos"}</div>
            {summaryDetail.items.length && summaryDetail.kind === "payments" ? (
              <div className="table-wrap summary-payments-table"><table><thead><tr><th>Cliente</th><th>Importe</th><th>Concepto</th><th>Vencimiento</th><th>Fecha de pago</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{summaryDetail.items.map((payment) => <tr key={payment.id} className="clickable-payment-row" tabIndex={0} role="button" onClick={() => openClientPayments(payment.client_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClientPayments(payment.client_id); } }}><td><button type="button" className="client-link" onClick={(event) => { event.stopPropagation(); openClientPayments(payment.client_id); }}>{payment.client_name}</button></td><td><strong>{fmtMoney(payment.amount, payment.currency)}</strong></td><td>{LABEL[payment.payment_type] || payment.payment_type}</td><td>{fmtDate(payment.due_date)}</td><td>{payment.paid_at ? fmtDate(payment.paid_at) : "Todavía no pagado"}</td><td>{badge(payment.status)}</td><td>{payment.status !== "paid" ? <button className="text-btn complete" onClick={(event) => { event.stopPropagation(); setPaymentStatus(payment.id, "paid"); }}><Check size={16} />Marcar pagado</button> : <span>Pagado</span>}</td></tr>)}</tbody></table></div>
            ) : summaryDetail.items.length ? (
              <div className="table-wrap summary-payments-table forecast-detail-table"><table><thead><tr><th>Cliente</th><th>Negocio</th><th>Estado</th><th>Mensualidad</th></tr></thead><tbody>{summaryDetail.items.map((client) => <tr key={client.id}><td><strong>{client.name}</strong></td><td>{client.business_name}</td><td>{badge(client.status)}</td><td><strong>{client.amount > 0 ? fmtMoney(client.amount, client.currency) : "Sin monto configurado"}</strong></td></tr>)}</tbody></table></div>
            ) : <div className="summary-payment-empty">Este total no contiene registros.</div>}
          </div>
        </div>
      )}
      {selectedClient && (
        <DetailModal
          clientId={selectedClient}
          initialTab="payments"
          onClose={() => setSelectedClient(null)}
          onRefresh={load}
          onEdit={(client) => {
            setSelectedClient(null);
            setClientForm(client);
          }}
        />
      )}
      {clientForm && (
        <ClientForm
          client={clientForm}
          onClose={() => setClientForm(null)}
          onSaved={() => { setClientForm(null); load(); }}
        />
      )}
    </section>
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
  const [page, setPage] = useState("clients");
  const [session, setSession] = useState(() => ({ checking: Boolean(getToken()), user: null }));
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
  return (
    <Shell page={page} setPage={setPage} onLogout={logout}>
      {page === "dashboard" && (
        <Dashboard goClients={() => setPage("clients")} />
      )}{" "}
      {page === "clients" && <Clients />}
      {page === "agenda" && <Agenda />}
      {page === "payments" && <Payments />}
      {page === "expenses" && <Expenses />}
      {page === "vps" && <Vps />}
      {page === "messages" && <Messages />}
    </Shell>
  );
}
