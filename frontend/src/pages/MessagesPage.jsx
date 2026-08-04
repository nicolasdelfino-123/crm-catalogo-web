import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Search, X, Mail, Edit3, Save, ChartNoAxesColumnIncreasing, Trash2 } from "lucide-react";

export function createMessagesPage(dependencies) {
  const { api, ACQUISITION_OPTIONS, acquisitionLabel, fmtDate, fmtMonth, useEscapeClose, IconButton, Empty } = dependencies;

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
    useEscapeClose(() => setEditing(null), Boolean(editing));
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

  const dateKey = (value = new Date()) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const fromDateKey = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const addDays = (value, amount) => {
    const result = new Date(value);
    result.setDate(result.getDate() + amount);
    return result;
  };
  const startOfWeek = (value) => addDays(value, -((value.getDay() + 6) % 7));
  const fmtHours = (value) => `${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })} h`;

  return { Messages, dateKey, fromDateKey, addDays, startOfWeek, fmtHours };
}
