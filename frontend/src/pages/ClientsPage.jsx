import { useCallback, useEffect, useState } from "react";
import { CalendarDays, WalletCards, Server, Plus, Search, SlidersHorizontal, Download, X, ChevronRight, AlertTriangle, CheckCircle2, Clock3, ArrowUpDown, ExternalLink, MapPin, Instagram, Mail, Phone, Edit3, Check, RotateCcw, Pin, Save, ChartNoAxesColumnIncreasing, Trash2, Eye, EyeOff, KeyRound, Copy } from "lucide-react";

export function createClientsPage(dependencies) {
  const { api, downloadApiFile, LABEL, ACQUISITION_OPTIONS, ACTION_PRESETS, acquisitionLabel, instagramUrl, externalUrl, fmtDate, billingDay, fmtMoney, addCalendarMonth, stageForDates, stageLabel, badge, dateKey, useEscapeClose, IconButton, Toast, Loading, Empty } = dependencies;

  function ClientForm({ client, onClose, onSaved }) {
    const initial = client || {
      name: "",
      business_name: "",
      sale_date: new Date().toISOString().slice(0, 10),
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
    useEscapeClose(onClose, !saving);
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
                  Fecha de venta *
                  <input
                    type="date"
                    name="sale_date"
                    value={form.sale_date || ""}
                    onChange={change}
                    required
                  />
                </label>
                {form.status !== "no_signup" && (
                  <>
                    <label>
                      Inicio del servicio y cobro *
                    <input
                      type="date"
                      name="signup_date"
                      value={form.signup_date || ""}
                      onChange={change}
                      required
                    />
                    </label>
                    <label>
                      Próxima renovación
                    <input
                      type="date"
                      name="next_renewal_date"
                      value={form.next_renewal_date || ""}
                      onChange={change}
                    />
                    </label>
                  </>
                )}
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
        title: "Registrar pago",
        fields: [
          ["amount", "Importe", "number"],
          ["payment_type", "Concepto", "paymenttype"],
          ["due_date", "Vencimiento", "date"],
          ["status", "Estado", "payselect"],
          ["paid_at", "Fecha de pago", "date"],
          ["notes", "Nota", "textarea"],
        ],
      },
      extra_work: {
        title: "Registrar trabajo extra",
        fields: [
          ["amount", "Importe", "number"],
          ["due_date", "Fecha", "date"],
          ["status", "Estado", "payselect"],
          ["paid_at", "Fecha de pago", "date"],
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
        ? { status: "pending", due_date: defaultDueDate || "", paid_at: dateKey(), payment_type: "monthly" }
        : type === "extra_work"
          ? { status: "pending", due_date: dateKey(), paid_at: dateKey(), payment_type: "extra_work" }
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
            name === "due_date" && form.payment_type === "deposit" ? null :
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
              ) : kind === "paymenttype" ? (
                <select
                  value={form[name] || "monthly"}
                  onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                >
                  <option value="monthly">Mensualidad</option>
                  <option value="deposit">Seña</option>
                  <option value="domain">Dominio</option>
                  <option value="extra_work">Trabajo extra</option>
                  <option value="discount">Descuento</option>
                  <option value="other">Otro</option>
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
    const [form, setForm] = useState({
      ...action,
      completed_date: action.completed_at?.slice(0, 10) || "",
    });
    const [saving, setSaving] = useState(false);
    const change = (e) => setForm((value) => ({
      ...value,
      [e.target.name]: e.target.value,
      ...(e.target.name === "status" && e.target.value === "completed" && !value.completed_date
        ? { completed_date: dateKey() }
        : {}),
    }));
    async function submit(e) {
      e.preventDefault();
      setSaving(true);
      try {
        await api(`/actions/${action.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        window.dispatchEvent(new Event("crm-dashboard-refresh"));
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
            Fecha completada
            <input
              type="date"
              name="completed_date"
              value={form.completed_date || ""}
              onChange={change}
              required={form.status === "completed"}
            />
          </label>
          <label className="urgent-action-check">
            <input
              type="checkbox"
              checked={form.priority === "urgent"}
              onChange={(event) => setForm((value) => ({
                ...value,
                priority: event.target.checked ? "urgent" : "medium",
              }))}
            />
            <span>
              <strong>Urgente</strong>
              <small>Mostrar también en Acciones urgentes del Resumen</small>
            </span>
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
    const [form, setForm] = useState({
      ...payment,
      paid_at: payment.paid_at ? payment.paid_at.slice(0, 10) : dateKey(),
    });
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
          {form.payment_type !== "deposit" && <label>Vencimiento<input type="date" name="due_date" value={form.due_date || ""} onChange={change} /></label>}
          <label>Fecha de pago<input type="date" name="paid_at" value={form.paid_at || ""} onChange={change} required={form.status === "paid"} /></label>
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

  function DetailModal({ clientId, onClose, onRefresh, onEdit, initialTab = "summary", initialActionId = null }) {
    const [client, setClient] = useState(null);
    const [tab, setTab] = useState(initialTab);
    const [adding, setAdding] = useState(null);
    const [editingAction, setEditingAction] = useState(initialActionId);
    const [editingPayment, setEditingPayment] = useState(null);
    const [editingMetric, setEditingMetric] = useState(null);
    const [editingNote, setEditingNote] = useState(null);
    const [actionView, setActionView] = useState("pending");
    const [focusedActionId, setFocusedActionId] = useState(initialActionId);
    const [paymentView, setPaymentView] = useState("all");
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
    useEffect(() => {
      if (tab !== "actions" || !focusedActionId) return;
      const frame = window.requestAnimationFrame(() => {
        document
          .getElementById(`client-action-${focusedActionId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return () => window.cancelAnimationFrame(frame);
    }, [tab, actionView, focusedActionId]);
    function openAction(actionId) {
      if (!actionId) return;
      setAdding(null);
      setEditingAction(null);
      setActionView("pending");
      setFocusedActionId(actionId);
      setTab("actions");
    }
    async function patchAction(id, status) {
      await api(`/actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status === "completed" ? { completed_date: dateKey() } : {}),
        }),
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
    const visiblePayments = client.payments.filter((payment) =>
      paymentView === "all"
        ? true
        : payment.payment_type === paymentView,
    );
    const paidVisiblePayments = visiblePayments.filter(
      (payment) => payment.status === "paid",
    );
    const paymentViewLabel = {
      all: "Todos",
      monthly: "Mensualidades",
      deposit: "Señas",
      extra_work: "Trabajos extra",
    }[paymentView];
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
              <small>{client.status === "no_signup" ? "Venta" : "Alta"}</small>
              <strong>{fmtDate(client.status === "no_signup" ? client.sale_date : client.signup_date)}</strong>
              <span>{client.status === "no_signup" ? "Pendiente de alta" : `${client.days_as_client} días`}</span>
            </div>
            <div>
              <small>Próxima renovación</small>
              <strong>{fmtDate(client.next_renewal_date)}</strong>
              <span>Próximo vencimiento</span>
            </div>
            <EditableMonthlyAmount client={client} onSave={patchClient} />
            <div className="quick-action-stat">
              <button
                type="button"
                onClick={() => openAction(client.next_action?.id)}
                disabled={!client.next_action}
                aria-label={client.next_action ? `Ver próxima acción: ${client.next_action.title}` : "No hay acciones pendientes"}
              >
                <small>Próxima acción</small>
                <strong>{client.next_action?.title || "Sin pendientes"}</strong>
                <span>{fmtDate(client.next_action?.due_date)}</span>
              </button>
            </div>
            <div className={`quick-action-stat ${client.overdue_actions_count ? "danger" : ""}`}>
              <button
                type="button"
                onClick={() => {
                  const overdue = client.actions.find(
                    (action) =>
                      ["pending", "in_progress"].includes(action.status) &&
                      action.due_date &&
                      new Date(action.due_date) < new Date(),
                  );
                  openAction(overdue?.id);
                }}
                disabled={!client.overdue_actions_count}
                aria-label={client.overdue_actions_count ? `Ver ${client.overdue_actions_count} acciones vencidas` : "No hay acciones vencidas"}
              >
                <small>Acciones vencidas</small>
                <strong>{client.overdue_actions_count}</strong>
                <span>
                  {client.overdue_actions_count
                    ? "Requiere atención"
                    : "Todo al día"}
                </span>
              </button>
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
                  setFocusedActionId(null);
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
                          id={`client-action-${a.id}`}
                          className={`list-item ${["pending", "in_progress"].includes(a.status) && a.due_date && new Date(a.due_date) < new Date() ? "overdue" : ""} ${a.status === "cancelled" ? "cancelled-action" : ""} ${focusedActionId === a.id ? "focused-action" : ""}`}
                          key={a.id}
                        >
                          <span className="item-check">
                            {a.status === "completed" ? <CheckCircle2 /> : <Clock3 />}
                          </span>
                          <div>
                            <strong>{a.title}</strong>
                            <p>
                              Prevista: {fmtDate(a.due_date)}
                              {" · "}{LABEL[a.priority] || a.priority}
                            </p>
                            {a.status === "completed" && (
                              <p>Completada: {fmtDate(a.completed_at)}</p>
                            )}
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
                    <label className="payment-history-filter">
                      <span>Mostrar</span>
                      <select
                        value={paymentView}
                        onChange={(event) => {
                          setPaymentView(event.target.value);
                          setEditingPayment(null);
                        }}
                      >
                        <option value="all">Todos</option>
                        <option value="monthly">Mensualidades</option>
                        <option value="deposit">Señas</option>
                        <option value="extra_work">Trabajos extra</option>
                      </select>
                    </label>
                    <button className="secondary small" onClick={() => setAdding("payment")}><Plus size={16} />Registrar pago</button>
                    <button className="secondary small" onClick={() => setAdding("extra_work")}><Plus size={16} />Registrar trabajo extra</button>
                  </div>
                </div>
                <div className="client-payment-totals">
                  {Object.entries(
                    paidVisiblePayments
                      .reduce((totals, payment) => ({
                        ...totals,
                        [payment.currency]: (totals[payment.currency] || 0) + payment.amount,
                      }), {}),
                  ).map(([currency, total]) => (
                    <div key={currency}><small>Total cobrado · {paymentViewLabel} · {currency}</small><strong>{fmtMoney(total, currency)}</strong></div>
                  ))}
                  {!paidVisiblePayments.length && <span className="no-paid">No hay cobros completados en “{paymentViewLabel}”.</span>}
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
                  {visiblePayments.map((p) => editingPayment === p.id ? (
                    <PaymentEditor key={p.id} payment={p} onCancel={() => setEditingPayment(null)} onSaved={() => { setEditingPayment(null); load(); onRefresh(); }} />
                  ) : (
                    <div className="list-item" key={p.id}>
                      <span className="item-check">
                        <WalletCards />
                      </span>
                      <div>
                        <strong>{fmtMoney(p.amount, p.currency)}</strong>
                        <p>{LABEL[p.payment_type] || "Mensual"}{p.due_date ? ` · vence ${fmtDate(p.due_date)}` : ""}</p>
                        {p.paid_at && <p>Pagado: {fmtDate(p.paid_at)}</p>}
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
                  {!visiblePayments.length && (
                    <div className="payment-filter-empty">
                      No hay pagos registrados en “{paymentViewLabel}”.
                    </div>
                  )}
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
          <div className="info-row">
            <Server />
            <span>
              <small>VPS</small>
              <strong>
                {client.vps_name === "vape"
                  ? "VPS Vape"
                  : client.vps_name === "shatha"
                    ? "VPS Shatha"
                    : "Sin asignar"}
              </strong>
            </span>
          </div>
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
                                {badge(client.service_stage)}
                                <span>Alta {fmtDate(client.signup_date)}</span>
                              </div>
                              <div>
                                <strong>{fmtMoney(client.payment_amount, client.currency)}</strong>
                                <span>{[client.city, client.country].filter(Boolean).join(", ") || "Sin ubicación"}</span>
                              </div>
                              <div className="acquisition-contact">
                                {client.website_url ? (
                                  <a className="instagram-link" href={externalUrl(client.website_url)} target="_blank" rel="noreferrer">
                                    {client.website_url}
                                    <ExternalLink size={11} />
                                  </a>
                                ) : client.instagram_username ? (
                                  <a className="instagram-link" href={instagramUrl(client.instagram_username)} target="_blank" rel="noreferrer">
                                    {client.instagram_username}
                                    <ExternalLink size={11} />
                                  </a>
                                ) : null}
                                {client.phone && <span>{client.phone}</span>}
                                {client.email && <span>{client.email}</span>}
                                {!client.website_url && !client.instagram_username && !client.phone && !client.email && <span>Sin contacto registrado</span>}
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
    const [data, setData] = useState({ items: [], pagination: {}, renewal_totals: { ARS: 0, USD: 0 } });
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("");
    const [acquisition, setAcquisition] = useState("");
    const [stageMonth, setStageMonth] = useState("");
    const [customStageMonth, setCustomStageMonth] = useState("");
    const [showAcquisition, setShowAcquisition] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(null);
    const [clientToDelete, setClientToDelete] = useState(null);
    const [toast, setToast] = useState("");
    const [updatingTrafficLight, setUpdatingTrafficLight] = useState(new Set());
    const [sort, setSort] = useState({ by: "billing_day", dir: "asc" });
    const selectedServiceStage = stageMonth === "custom"
      ? Number(customStageMonth) > 6 ? `month_${Number(customStageMonth)}` : ""
      : {
        1: "first_month",
        2: "second_month",
        3: "third_month",
        4: "month_4",
        5: "month_5",
        6: "month_6",
      }[stageMonth] || "";
    const load = useCallback(async () => {
      setLoading(true);
      try {
        const result = await api(
          `/clients?search=${encodeURIComponent(query)}&status=${status}&service_stage=${encodeURIComponent(selectedServiceStage)}&acquisition_source=${encodeURIComponent(acquisition)}&sort_by=${sort.by}&sort_dir=${sort.dir}&per_page=100`,
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
    }, [query, status, selectedServiceStage, acquisition, sort]);
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
    async function cycleTrafficLight(event, client) {
      event.stopPropagation();
      if (updatingTrafficLight.has(client.id)) return;
      const colors = ["red", "yellow", "green"];
      const current = client.traffic_light || "red";
      const next = colors[(colors.indexOf(current) + 1) % colors.length];
      setUpdatingTrafficLight((ids) => new Set(ids).add(client.id));
      setData((previous) => ({
        ...previous,
        items: previous.items.map((item) => item.id === client.id ? { ...item, traffic_light: next } : item),
      }));
      try {
        await api(`/clients/${client.id}`, {
          method: "PATCH",
          body: JSON.stringify({ traffic_light: next }),
        });
      } catch (error) {
        setData((previous) => ({
          ...previous,
          items: previous.items.map((item) => item.id === client.id ? { ...item, traffic_light: current } : item),
        }));
        window.alert(error.message);
      } finally {
        setUpdatingTrafficLight((ids) => {
          const nextIds = new Set(ids);
          nextIds.delete(client.id);
          return nextIds;
        });
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
            <button
              type="button"
              className="secondary"
              onClick={() => downloadApiFile("/exports/clients.csv", "clientes.csv")
                .catch((error) => window.alert(error.message))}
            >
              <Download size={17} />
              Exportar
            </button>
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
              placeholder="Buscar cliente, negocio, Instagram o ubicación"
            />
          </label>
          <label className="filter">
            <SlidersHorizontal />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="no_signup">Sin alta</option>
              <option value="active_no_signup">Activos y sin alta</option>
              <option value="active">Activos</option>
              <option value="at_risk">En riesgo</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </label>
          <label className="filter stage-month-filter">
            <CalendarDays />
            <select
              value={stageMonth}
              onChange={(event) => {
                setStageMonth(event.target.value);
                if (event.target.value !== "custom") setCustomStageMonth("");
              }}
            >
              <option value="">Todos los meses</option>
              <option value="1">Mes 1</option>
              <option value="2">Mes 2</option>
              <option value="3">Mes 3</option>
              <option value="4">Mes 4</option>
              <option value="5">Mes 5</option>
              <option value="6">Mes 6</option>
              <option value="custom">Otro mes…</option>
            </select>
          </label>
          {stageMonth === "custom" && (
            <label className="filter custom-stage-month">
              <span>Mes</span>
              <input
                type="number"
                min="7"
                step="1"
                value={customStageMonth}
                onChange={(event) => setCustomStageMonth(event.target.value)}
                placeholder="7 o más"
                aria-label="Número de mes de la etapa"
              />
            </label>
          )}
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
          {(query || status || stageMonth || acquisition) && (
            <button
              className="text-btn"
              onClick={() => {
                setQuery("");
                setStatus("");
                setStageMonth("");
                setCustomStageMonth("");
                setAcquisition("");
              }}
            >
              <X size={15} />
              Limpiar
            </button>
          )}
          <div className={`client-renewal-totals${loading ? " loading-totals" : ""}`} aria-live="polite">
            <div>
              <small>Mensualidades · Pesos</small>
              <strong>{fmtMoney(data.renewal_totals?.ARS || 0, "ARS")}</strong>
            </div>
            <div>
              <small>Mensualidades · USD</small>
              <strong>{fmtMoney(data.renewal_totals?.USD || 0, "USD")}</strong>
            </div>
          </div>
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
                    <Th
                      label="Semáforo"
                      name="traffic_light"
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
                      <td className="traffic-light-cell">
                        <button
                          type="button"
                          className={`traffic-light ${c.traffic_light || "red"}`}
                          aria-label={`Semáforo de ${c.name}. Cambiar color`}
                          title="Hacé clic para cambiar el color"
                          disabled={updatingTrafficLight.has(c.id)}
                          onClick={(event) => cycleTrafficLight(event, c)}
                        />
                      </td>
                      <td>{badge(c.status)}</td>
                      <td>{badge(c.service_stage)}</td>
                      <td>
                        <strong>{fmtDate(c.status === "no_signup" ? c.sale_date : c.signup_date)}</strong>
                        <span>{c.status === "no_signup" ? "Fecha de venta" : `${c.days_as_client} días`}</span>
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
                    <button
                      type="button"
                      className={`traffic-light ${c.traffic_light || "red"}`}
                      aria-label={`Semáforo de ${c.name}. Cambiar color`}
                      disabled={updatingTrafficLight.has(c.id)}
                      onClick={(event) => cycleTrafficLight(event, c)}
                    />
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

  return { Clients, ClientForm, DetailModal, PaymentEditor };
}
