import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, X, ChevronLeft, ChevronRight, Clock3, Edit3, Save, ChartNoAxesColumnIncreasing, Trash2 } from "lucide-react";

export function createWorkedHoursPage(dependencies) {
  const { api, fmtDate, fmtMonth, monthKey, dateKey, fromDateKey, addDays, startOfWeek, fmtHours, IconButton } = dependencies;

  function WorkedHours() {
    const today = dateKey();
    const [items, setItems] = useState([]);
    const [view, setView] = useState("calendar");
    const [cursor, setCursor] = useState(fromDateKey(today));
    const [selectedDate, setSelectedDate] = useState(today);
    const [form, setForm] = useState({ work_date: today, hours: "", notes: "" });
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const load = useCallback(() => api("/work-logs").then(setItems), [setItems]);
    useEffect(() => { load(); }, [load]);

    const totalsByDay = useMemo(() => items.reduce((totals, item) => ({
      ...totals,
      [item.work_date]: (totals[item.work_date] || 0) + item.hours,
    }), {}), [items]);
    const selectedMonth = monthKey(cursor);
    const monthTotal = useMemo(() => Object.entries(totalsByDay)
      .filter(([day]) => day.startsWith(selectedMonth))
      .reduce((total, [, hours]) => total + hours, 0), [totalsByDay, selectedMonth]);
    const weekStart = startOfWeek(cursor);
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const weekTotal = weekDays.reduce((total, day) => total + (totalsByDay[dateKey(day)] || 0), 0);
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const calendarStart = startOfWeek(monthStart);
    const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
    const selectedEntries = items.filter((item) => item.work_date === selectedDate);

    async function submit(event) {
      event.preventDefault(); setSaving(true);
      try {
        await api("/work-logs", { method: "POST", body: JSON.stringify(form) });
        const savedDate = fromDateKey(form.work_date);
        setCursor(savedDate); setSelectedDate(form.work_date);
        setForm({ ...form, hours: "", notes: "" });
        await load();
      } finally { setSaving(false); }
    }
    async function remove(item) {
      if (!window.confirm(`¿Eliminar esta carga de ${fmtHours(item.hours)}?`)) return;
      await api(`/work-logs/${item.id}`, { method: "DELETE" });
      await load();
    }
    async function saveEdit(event) {
      event.preventDefault(); setSaving(true);
      try {
        await api(`/work-logs/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing) });
        const savedDate = fromDateKey(editing.work_date);
        setCursor(savedDate); setSelectedDate(editing.work_date);
        setForm((current) => ({ ...current, work_date: editing.work_date }));
        setEditing(null);
        await load();
      } finally { setSaving(false); }
    }
    function move(amount) {
      setCursor((current) => view === "calendar"
        ? new Date(current.getFullYear(), current.getMonth() + amount, 1)
        : addDays(startOfWeek(current), amount * 7));
    }
    function chooseDay(day) {
      const key = dateKey(day);
      setCursor(day); setSelectedDate(key); setForm((current) => ({ ...current, work_date: key }));
    }

    return (
      <section className="page worked-hours-page">
        <div className="page-intro">
          <div><h2>Horas trabajadas</h2><p>Sumá cada bloque de trabajo y consultá tus totales diarios, semanales y mensuales.</p></div>
          <div className="hours-view-toggle">
            <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}><CalendarDays size={16} />Calendario</button>
            <button className={view === "week" ? "active" : ""} onClick={() => {
              setView("week");
              setCursor(startOfWeek(fromDateKey(selectedDate)));
            }}><ChartNoAxesColumnIncreasing size={16} />Semana</button>
          </div>
        </div>
        <div className="hours-summary">
          <article><span><Clock3 /></span><div><small>Hoy</small><strong>{fmtHours(totalsByDay[today])}</strong></div></article>
          <article><span><CalendarDays /></span><div><small>Semana visible</small><strong>{fmtHours(weekTotal)}</strong></div></article>
          <article className="hours-month-filter">
            <span><ChartNoAxesColumnIncreasing /></span>
            <label>
              <small>Total del mes · Elegir mes</small>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => {
                  if (!event.target.value) return;
                  const nextDate = fromDateKey(`${event.target.value}-01`);
                  setCursor(nextDate);
                  setSelectedDate(dateKey(nextDate));
                  setForm((current) => ({ ...current, work_date: dateKey(nextDate) }));
                }}
              />
              <strong>{fmtHours(monthTotal)}</strong>
            </label>
          </article>
        </div>
        <form className="hours-form" onSubmit={submit}>
          <div><span className="eyebrow">Nueva carga</span><h3>Agregar horas</h3><p>Si volvés a cargar el mismo día, las horas se suman.</p></div>
          <label>Fecha<input type="date" value={form.work_date} onChange={(event) => setForm({ ...form, work_date: event.target.value })} required /></label>
          <label>Horas<input type="number" min="0.25" max="24" step="0.25" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} placeholder="Ej.: 4" required /></label>
          <label>Nota opcional<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="¿En qué trabajaste?" /></label>
          <button className="primary" disabled={saving}><Plus size={17} />{saving ? "Guardando..." : "Sumar horas"}</button>
        </form>
        <div className="hours-period">
          <div className="hours-period-head">
            <IconButton label="Período anterior" onClick={() => move(-1)}><ChevronLeft /></IconButton>
            <h3>{view === "calendar" ? fmtMonth(selectedMonth) : `Lunes ${fmtDate(dateKey(weekStart))} — Domingo ${fmtDate(dateKey(weekDays[6]))}`}</h3>
            <IconButton label="Período siguiente" onClick={() => move(1)}><ChevronRight /></IconButton>
            <button className="secondary small" onClick={() => setCursor(view === "week" ? startOfWeek(fromDateKey(today)) : fromDateKey(today))}>Hoy</button>
          </div>
          {view === "calendar" ? (
            <>
              <div className="hours-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="hours-calendar">
                {calendarDays.map((day) => {
                  const key = dateKey(day);
                  return <button key={key} className={`${day.getMonth() !== cursor.getMonth() ? "outside" : ""} ${key === today ? "today" : ""} ${key === selectedDate ? "selected" : ""}`} onClick={() => chooseDay(day)}>
                    <time>{day.getDate()}</time>
                    {totalsByDay[key] > 0 && <strong>{fmtHours(totalsByDay[key])}</strong>}
                  </button>;
                })}
              </div>
            </>
          ) : (
            <div className="hours-week-view">
              {weekDays.map((day) => {
                const key = dateKey(day);
                const hours = totalsByDay[key] || 0;
                const percentage = Math.min(100, (hours / Math.max(8, ...weekDays.map((item) => totalsByDay[dateKey(item)] || 0))) * 100);
                return <button key={key} className={`${key === today ? "today" : ""} ${key === selectedDate ? "selected" : ""}`} onClick={() => chooseDay(day)}>
                  <div><span>{new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(day)}</span><time>{day.getDate()}</time></div>
                  <div className="hours-bar"><i style={{ width: `${percentage}%` }} /></div>
                  <strong>{fmtHours(hours)}</strong>
                </button>;
              })}
            </div>
          )}
          <div className="hours-period-total">
            <div>
              <small>{view === "calendar" ? `Total de ${fmtMonth(selectedMonth)}` : "Total de la semana"}</small>
              <span>{view === "calendar" ? "Suma de todos los días del mes" : `${fmtDate(dateKey(weekStart))} al ${fmtDate(dateKey(weekDays[6]))}`}</span>
            </div>
            <strong>{fmtHours(view === "calendar" ? monthTotal : weekTotal)}</strong>
          </div>
        </div>
        <div className="hours-detail">
          <div><span className="eyebrow">Detalle del día</span><h3>{fmtDate(selectedDate)} · {fmtHours(totalsByDay[selectedDate])}</h3></div>
          {selectedEntries.length ? <div className="hours-entries">{selectedEntries.map((item) => (
            <article key={item.id}>
              <div><strong>+ {fmtHours(item.hours)}</strong><span>{item.notes || "Sin nota"}</span></div>
              <div className="hours-entry-actions">
                <IconButton label="Editar carga" onClick={() => setEditing({ ...item })}><Edit3 /></IconButton>
                <IconButton label="Eliminar carga" onClick={() => remove(item)}><Trash2 /></IconButton>
              </div>
            </article>
          ))}</div> : <p className="hours-empty">Todavía no cargaste horas para este día.</p>}
        </div>
        {editing && (
          <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && !saving && setEditing(null)}>
            <div className="form-modal">
              <div className="modal-head">
                <div><span className="eyebrow">Horas trabajadas</span><h2>Editar carga</h2></div>
                <IconButton label="Cerrar" onClick={() => setEditing(null)}><X /></IconButton>
              </div>
              <form onSubmit={saveEdit}>
                <div className="form-grid">
                  <label>Fecha<input type="date" value={editing.work_date} onChange={(event) => setEditing({ ...editing, work_date: event.target.value })} required /></label>
                  <label>Horas<input type="number" min="0.25" max="24" step="0.25" value={editing.hours} onChange={(event) => setEditing({ ...editing, hours: event.target.value })} required /></label>
                  <label className="span-2">Nota opcional<input value={editing.notes || ""} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} placeholder="¿En qué trabajaste?" /></label>
                </div>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
                  <button className="primary" disabled={saving}><Save size={16} />{saving ? "Guardando..." : "Guardar cambios"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  }

  return { WorkedHours };
}
