import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Plus, X, ChevronLeft, ChevronRight, ArrowUpDown, Edit3, Check, RotateCcw, Save, List } from "lucide-react";

export function createAgendaPage(dependencies) {
  const { api, ACTION_PRESETS, fmtDate, dateKey, badge, useEscapeClose, IconButton, Toast, Empty, ClientForm, DetailModal } = dependencies;

  function Agenda() {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [view, setView] = useState("today");
    const [agendaDisplay, setAgendaDisplay] = useState("list");
    const [actionStatus, setActionStatus] = useState("pending");
    const [agendaTypeFilter, setAgendaTypeFilter] = useState("all");
    const [items, setItems] = useState([]);
    const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
    const [showNewAction, setShowNewAction] = useState(false);
    const [editingAgendaAction, setEditingAgendaAction] = useState(null);
    const [agendaDateOrder, setAgendaDateOrder] = useState("asc");
    const [selectedAgendaClient, setSelectedAgendaClient] = useState(null);
    const [agendaClientForm, setAgendaClientForm] = useState(null);
    const [completingAction, setCompletingAction] = useState(null);
    const [lastCompletedAction, setLastCompletedAction] = useState(null);
    const [agendaToast, setAgendaToast] = useState("");
    const agendaRequestId = useRef(0);
    const load = useCallback(
      () => {
        const requestId = ++agendaRequestId.current;
        const calendarQuery = agendaDisplay === "calendar"
          ? `view=calendar&scope=${view}&month=${calendarMonth}${agendaTypeFilter === "collections" ? "&collections=all" : ""}`
          : `view=${view}`;
        return api(`/actions?${calendarQuery}&status=${actionStatus}`).then((nextItems) => {
          if (requestId === agendaRequestId.current) setItems(nextItems);
          return nextItems;
        });
      },
      [view, agendaDisplay, actionStatus, calendarMonth, agendaTypeFilter],
    );
    useEffect(() => {
      load();
    }, [load]);
    useEffect(() => {
      if (!lastCompletedAction) return undefined;
      const undoCompletion = async (event) => {
        const editable = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)
          || event.target?.isContentEditable;
        if (!event.ctrlKey || event.key.toLowerCase() !== "z" || editable) return;
        event.preventDefault();
        const action = lastCompletedAction;
        const actionId = action.standalone ? String(action.id).replace("standalone-", "") : action.id;
        await api(`/${action.standalone ? "standalone-actions" : "actions"}/${actionId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "pending" }),
        });
        setLastCompletedAction(null);
        setAgendaToast("Se deshizo la acción completada");
        load();
      };
      window.addEventListener("keydown", undoCompletion);
      return () => window.removeEventListener("keydown", undoCompletion);
    }, [lastCompletedAction, load]);
    async function setAgendaStatus(action, status, completedDate = null) {
      const actionId = action.standalone ? String(action.id).replace("standalone-", "") : action.id;
      await api(`/${action.standalone ? "standalone-actions" : "actions"}/${actionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status === "completed" && completedDate ? { completed_date: completedDate } : {}),
        }),
      });
      if (status === "completed") {
        setLastCompletedAction(action);
        setAgendaToast("Acción completada. Podés deshacer con Ctrl+Z");
      }
      load();
    }
    const filteredAgendaItems = useMemo(() => items.filter((item) => {
      const isCollection = ["collection_payment", "collection_projection"].includes(item.action_type)
        || Boolean(item.payment_id);
      if (agendaTypeFilter === "collections") return isCollection;
      if (agendaTypeFilter === "actions") return !isCollection;
      return true;
    }), [items, agendaTypeFilter]);
    const calendarDays = useMemo(() => {
      const [year, month] = calendarMonth.split("-").map(Number);
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
      const gridStart = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
      const counts = filteredAgendaItems.reduce((result, action) => {
        if (action.due_date) result[action.due_date] = (result[action.due_date] || 0) + 1;
        return result;
      }, {});
      return Array.from({ length: 42 }, (_, index) => {
        const current = new Date(gridStart);
        current.setUTCDate(gridStart.getUTCDate() + index);
        const iso = current.toISOString().slice(0, 10);
        return { iso, day: current.getUTCDate(), currentMonth: current.getUTCMonth() === month - 1, count: counts[iso] || 0 };
      });
    }, [calendarMonth, filteredAgendaItems]);
    const selectedDayItems = selectedCalendarDate
      ? filteredAgendaItems.filter((action) => action.due_date === selectedCalendarDate)
      : [];
    const sortedAgendaItems = useMemo(() => [...filteredAgendaItems].sort((first, second) => {
      if (!first.due_date && !second.due_date) return String(first.id).localeCompare(String(second.id));
      if (!first.due_date) return 1;
      if (!second.due_date) return -1;
      const dateComparison = first.due_date.localeCompare(second.due_date);
      const titleComparison = first.title.localeCompare(second.title, "es", { sensitivity: "base" });
      return (agendaDateOrder === "asc" ? dateComparison : -dateComparison) || titleComparison;
    }), [filteredAgendaItems, agendaDateOrder]);
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
            ["undated", "Sin fecha"],
          ].map(([id, label]) => (
            <button
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                setSelectedCalendarDate(null);
                if (id === "undated") setAgendaDisplay("list");
              }}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="agenda-display-switch" aria-label="Cambiar vista de la agenda">
          <button
            type="button"
            className={agendaDisplay === "list" ? "active" : ""}
            onClick={() => setAgendaDisplay("list")}
            aria-pressed={agendaDisplay === "list"}
          >
            <List size={16} />
            Lista
          </button>
          <button
            type="button"
            className={agendaDisplay === "calendar" ? "active" : ""}
            onClick={() => {
              if (view === "today" || view === "week") {
                setCalendarMonth(dateKey().slice(0, 7));
              }
              setAgendaDisplay("calendar");
              setSelectedCalendarDate(null);
            }}
            aria-pressed={agendaDisplay === "calendar"}
            disabled={view === "undated"}
            title={view === "undated" ? "Las acciones sin fecha no pueden ubicarse en un calendario" : undefined}
          >
            <CalendarDays size={16} />
            Calendario
          </button>
        </div>
        <p className="agenda-total" aria-live="polite">
          <strong>{filteredAgendaItems.length}</strong>{" "}
          {filteredAgendaItems.length === 1 ? "acción" : "acciones"}
          {agendaDisplay === "calendar" ? ` en ${calendarTitle}` : " en total"}
        </p>
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
        <div className="agenda-type-filter">
          <label className="dashboard-status-filter">
            Mostrar
            <select
              value={agendaTypeFilter}
              onChange={(event) => {
                setAgendaTypeFilter(event.target.value);
                setSelectedCalendarDate(null);
              }}
            >
              <option value="all">Todos</option>
              <option value="collections">Solo cobros</option>
              <option value="actions">Solo acciones</option>
            </select>
          </label>
        </div>
        {agendaDisplay === "list" && view !== "undated" && (
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
        {agendaDisplay === "calendar" ? (
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
                  className={`${day.currentMonth ? "" : "outside"} ${day.iso === todayIso ? "today" : ""} ${selectedCalendarDate === day.iso ? "selected" : ""}`}
                  aria-current={day.iso === todayIso ? "date" : undefined}
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
                    <AgendaItem key={a.id} action={a} onStatus={setAgendaStatus} onComplete={setCompletingAction} onEdit={setEditingAgendaAction} onOpenClient={setSelectedAgendaClient} />
                  ))}
                  {!selectedDayItems.length && <p>Sin acciones para este día.</p>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="agenda-list">
            {sortedAgendaItems.map((a) => (
              <AgendaItem key={a.id} action={a} onStatus={setAgendaStatus} onComplete={setCompletingAction} onEdit={setEditingAgendaAction} onOpenClient={setSelectedAgendaClient} />
            ))}
          </div>
        )}
        {agendaDisplay === "list" && !filteredAgendaItems.length && <Empty />}
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
              window.dispatchEvent(new Event("crm-dashboard-refresh"));
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
        {completingAction && (
          <CompleteActionModal
            action={completingAction}
            onClose={() => setCompletingAction(null)}
            onConfirm={async (completedDate) => {
              await setAgendaStatus(completingAction, "completed", completedDate);
              setCompletingAction(null);
            }}
          />
        )}
        {agendaToast && <Toast message={agendaToast} onClose={() => setAgendaToast("")} />}
      </section>
    );
  }

  function CompleteActionModal({ action, onClose, onConfirm }) {
    const completedDate = dateKey();
    const [saving, setSaving] = useState(false);
    useEscapeClose(onClose, !saving);
    async function submit(event) {
      event.preventDefault();
      setSaving(true);
      try {
        await onConfirm(completedDate);
      } finally {
        setSaving(false);
      }
    }
    return (
      <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
        <div className="form-modal complete-action-modal" role="dialog" aria-modal="true" aria-label="Confirmar acción completada">
          <div className="modal-head">
            <div>
              <span className="eyebrow">Confirmación</span>
              <h2>¿Completar esta acción?</h2>
            </div>
            <IconButton label="Cerrar" onClick={onClose} disabled={saving}><X /></IconButton>
          </div>
          <form onSubmit={submit}>
            <p className="complete-action-name">{action.title}</p>
            <label>
              Fecha completada
              <input
                type="date"
                value={completedDate}
                readOnly
              />
            </label>
            <p className="complete-action-hint">Después de confirmar, podés deshacer con Ctrl+Z.</p>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button>
              <button className="primary" disabled={saving}><Check size={17} />{saving ? "Guardando…" : "Completar acción"}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function AgendaNewAction({ undated, onClose, onSaved }) {
    const [clients, setClients] = useState([]);
    const [actionPreset, setActionPreset] = useState("");
    const [customClient, setCustomClient] = useState(false);
    const [customAction, setCustomAction] = useState(false);
    const [form, setForm] = useState({
      client_id: "",
      custom_context: "",
      title: "",
      description: "",
      due_date: new Date().toISOString().slice(0, 10),
      priority: "medium",
    });
    const [saving, setSaving] = useState(false);
    useEscapeClose(onClose, !saving);
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
                    <select
                      value={customClient ? "" : form.client_id}
                      onChange={(event) => setForm({ ...form, client_id: event.target.value })}
                      required={!customClient}
                      disabled={customClient}
                    >
                      <option value="">Elegí un cliente</option>
                      {clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.business_name}</option>)}
                    </select>
                  </label>
                  <label className="urgent-action-check span-2">
                    <input
                      type="checkbox"
                      checked={customClient}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCustomClient(checked);
                        setForm({ ...form, client_id: checked ? "__custom" : "", custom_context: "" });
                      }}
                    />
                    <span>
                      <strong>Cliente personalizado / sin cliente</strong>
                      <small>Usar un nombre o contexto que no está en la lista de clientes</small>
                    </span>
                  </label>
                  {customClient && (
                    <label className="span-2">
                      ¿Para quién o para qué es?
                      <input value={form.custom_context} onChange={(event) => setForm({ ...form, custom_context: event.target.value })} placeholder="Ej.: proveedor, trámite, tarea interna..." required />
                    </label>
                  )}
                  <label className="span-2">
                    Acción
                    <select
                      value={customAction ? "" : actionPreset}
                      onChange={(event) => setActionPreset(event.target.value)}
                      required={!customAction}
                      disabled={customAction}
                    >
                      <option value="">Elegí una acción</option>
                      {ACTION_PRESETS.map((preset) => <option value={preset} key={preset}>{preset}</option>)}
                    </select>
                  </label>
                  <label className="urgent-action-check span-2">
                    <input
                      type="checkbox"
                      checked={customAction}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCustomAction(checked);
                        setActionPreset(checked ? "__custom" : "");
                        setForm({ ...form, title: "" });
                      }}
                    />
                    <span>
                      <strong>Acción personalizada</strong>
                      <small>Escribir una acción que no está en la lista</small>
                    </span>
                  </label>
                  {customAction && (
                    <label className="span-2">Nombre de la acción<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
                  )}
                  <label>Fecha prevista<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>
                  <label>
                    Prioridad
                    <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                      <option value="medium">Media</option><option value="high">Alta</option>
                    </select>
                  </label>
                </>
              )}
              <label className="urgent-action-check span-2">
                <input
                  type="checkbox"
                  checked={form.priority === "urgent"}
                  onChange={(event) => setForm({
                    ...form,
                    priority: event.target.checked ? "urgent" : "medium",
                  })}
                />
                <span>
                  <strong>Acción urgente</strong>
                  <small>Mostrar también en Acciones urgentes del Resumen</small>
                </span>
              </label>
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
      completed_date: action.completed_at?.slice(0, 10) || "",
      status: action.status || "pending",
      priority: action.priority || "medium",
      description: action.description || "",
    });
    const [saving, setSaving] = useState(false);
    useEscapeClose(onClose, !saving);
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
              {action.due_date && <label>Fecha prevista<input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} required /></label>}
              <label>
                Estado
                <select
                  value={form.status}
                  onChange={(event) => setForm((value) => ({
                    ...value,
                    status: event.target.value,
                    ...(event.target.value === "completed" && !value.completed_date
                      ? { completed_date: dateKey() }
                      : {}),
                  }))}
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En curso</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </label>
              <label>
                Fecha completada
                <input
                  type="date"
                  value={form.completed_date}
                  onChange={(event) => setForm({ ...form, completed_date: event.target.value })}
                  required={form.status === "completed"}
                />
              </label>
              <label className="urgent-action-check">
                <input
                  type="checkbox"
                  checked={form.priority === "urgent"}
                  onChange={(event) => setForm({ ...form, priority: event.target.checked ? "urgent" : "medium" })}
                />
                <span>
                  <strong>Urgente</strong>
                  <small>Mostrar también en Acciones urgentes del Resumen</small>
                </span>
              </label>
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

  function AgendaItem({ action: a, onStatus, onComplete, onEdit, onOpenClient }) {
    const openAction = () => {
      if (a.client_id) {
        onOpenClient(a.client_id);
      } else if (!a.projected) {
        onEdit(a);
      }
    };
    const isClickable = Boolean(a.client_id || !a.projected);
    return (
      <article
        key={a.id}
        className={isClickable ? "clickable-action" : ""}
        onClick={isClickable ? openAction : undefined}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={(event) => {
          if (isClickable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openAction();
          }
        }}
      >
        <div className={`priority ${a.priority}`} />
        <div>
          <time>Prevista: {fmtDate(a.due_date)}</time>
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
            onClick={(event) => { event.stopPropagation(); onComplete(a); }}
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

  return { Agenda, AgendaNewAction, AgendaActionEditor };
}
