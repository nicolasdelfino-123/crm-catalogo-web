import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, SlidersHorizontal, X, ChevronLeft, ChevronRight, Edit3, Check, RotateCcw, Save, Trash2 } from "lucide-react";

export function createProspectingPage(dependencies) {
  const { api, acquisitionLabel, fmtDate, fmtMonth, dateKey, fromDateKey, addDays, startOfWeek, useEscapeClose, IconButton } = dependencies;

  const PROSPECTING_CHANNELS = [
    ["facebook_marketplace", "Marketplace"],
    ["business_instagram", "Instagram negocio"],
    ["instagram_nicodelfino", "Instagram nicodelfino__"],
    ["instagram_nicod123", "Instagram nicod_123"],
    ["business_whatsapp", "WhatsApp negocio"],
    ["personal_whatsapp", "WhatsApp personal"],
  ];
  const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const prospectingKey = (weekday, channel) => `${weekday}:${channel}`;
  const prospectingOutcomeKey = (activityDate, channel) => `${activityDate}:${channel}`;
  const balanceText = (actual, planned) => {
    const difference = actual - planned;
    if (difference > 0) return { label: `+${difference} sobre el plan`, tone: "ahead" };
    if (difference < 0) return { label: `${Math.abs(difference)} pendientes`, tone: "behind" };
    return { label: planned ? "Objetivo cumplido" : "Sin diferencia", tone: "done" };
  };

  function Prospecting() {
    const today = dateKey();
    const [goals, setGoals] = useState({});
    const [logs, setLogs] = useState([]);
    const [outcomes, setOutcomes] = useState([]);
    const [weekCursor, setWeekCursor] = useState(startOfWeek(fromDateKey(today)));
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
    const [detailFilter, setDetailFilter] = useState("day");
    const [form, setForm] = useState({ activity_date: today, channel: "facebook_marketplace", quantity: "", notes: "" });
    const [quickEntry, setQuickEntry] = useState(null);
    const [editingLog, setEditingLog] = useState(null);
    const [editingGoal, setEditingGoal] = useState(null);
    const [savingPlan, setSavingPlan] = useState(false);
    const [savingLog, setSavingLog] = useState(false);
    useEscapeClose(() => {
      setQuickEntry(null);
      setEditingLog(null);
      setEditingGoal(null);
    }, Boolean(quickEntry || editingLog || editingGoal));
    const load = useCallback(() => api("/prospecting").then((data) => {
      setLogs(data.logs);
      setOutcomes(data.outcomes || []);
      setGoals(data.goals.reduce((result, item) => ({ ...result, [prospectingKey(item.weekday, item.channel)]: item.target }), {}));
    }), [setLogs, setOutcomes, setGoals]);
    useEffect(() => { load(); }, [load]);

    const actualByDayChannel = useMemo(() => logs.reduce((result, item) => {
      const key = `${item.activity_date}:${item.channel}`;
      return { ...result, [key]: (result[key] || 0) + item.quantity };
    }, {}), [logs]);
    const outcomesByDayChannel = useMemo(() => outcomes.reduce((result, item) => ({
      ...result,
      [prospectingOutcomeKey(item.activity_date, item.channel)]: item,
    }), {}), [outcomes]);
    const plannedForDate = useCallback((key) => {
      const weekday = (fromDateKey(key).getDay() + 6) % 7;
      return PROSPECTING_CHANNELS.reduce((total, [channel]) => total + (Number(goals[prospectingKey(weekday, channel)]) || 0), 0);
    }, [goals]);
    const actualForDate = useCallback((key) => PROSPECTING_CHANNELS.reduce(
      (total, [channel]) => total + (actualByDayChannel[`${key}:${channel}`] || 0), 0,
    ), [actualByDayChannel]);
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekCursor, index));
    const weekPlanned = weekDays.reduce((total, day) => total + plannedForDate(dateKey(day)), 0);
    const weekActual = weekDays.reduce((total, day) => total + actualForDate(dateKey(day)), 0);
    const [monthYear, monthNumber] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(monthYear, monthNumber, 0).getDate();
    const monthDays = Array.from({ length: daysInMonth }, (_, index) => new Date(monthYear, monthNumber - 1, index + 1));
    const monthPlanned = monthDays.reduce((total, day) => total + plannedForDate(dateKey(day)), 0);
    const monthActual = monthDays.reduce((total, day) => total + actualForDate(dateKey(day)), 0);
    const dayPlanned = plannedForDate(selectedDate);
    const dayActual = actualForDate(selectedDate);
    const detailDays = detailFilter === "week"
      ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(fromDateKey(today)), index))
      : detailFilter.startsWith("month-")
        ? (() => {
            const [year, month] = detailFilter.slice(6).split("-").map(Number);
            return Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => new Date(year, month - 1, index + 1));
          })()
        : [fromDateKey(selectedDate)];
    const detailDateKeys = new Set(detailDays.map((day) => dateKey(day)));
    const detailLogs = logs.filter((item) => detailDateKeys.has(item.activity_date));
    const detailLabel = detailFilter === "week"
      ? `Esta semana · ${fmtDate(dateKey(detailDays[0]))} — ${fmtDate(dateKey(detailDays[6]))}`
      : detailFilter.startsWith("month-")
        ? fmtMonth(detailFilter.slice(6))
        : fmtDate(selectedDate);
    const filterYear = Number(selectedDate.slice(0, 4));
    const resultsByChannel = PROSPECTING_CHANNELS.map(([channel, label]) => {
      const totals = detailDays.reduce((result, day) => {
        const item = outcomesByDayChannel[prospectingOutcomeKey(dateKey(day), channel)];
        return {
          demos: result.demos + (item?.demos || 0),
          sales: result.sales + (item?.sales || 0),
        };
      }, { demos: 0, sales: 0 });
      return { channel, label, ...totals };
    });
    const detailDemos = resultsByChannel.reduce((total, item) => total + item.demos, 0);
    const detailSales = resultsByChannel.reduce((total, item) => total + item.sales, 0);

    async function savePlan() {
      setSavingPlan(true);
      try {
        const payload = [];
        PROSPECTING_CHANNELS.forEach(([channel]) => WEEKDAY_NAMES.forEach((_, weekday) => {
          payload.push({ weekday, channel, target: Number(goals[prospectingKey(weekday, channel)]) || 0 });
        }));
        await api("/prospecting/goals", { method: "PUT", body: JSON.stringify({ goals: payload }) });
        await load();
      } finally { setSavingPlan(false); }
    }
    async function submitGoalEdit(event) {
      event.preventDefault();
      setSavingPlan(true);
      try {
        const nextGoals = {
          ...goals,
          [prospectingKey(editingGoal.weekday, editingGoal.channel)]: Number(editingGoal.target) || 0,
        };
        const payload = [];
        PROSPECTING_CHANNELS.forEach(([channel]) => WEEKDAY_NAMES.forEach((_, weekday) => {
          payload.push({ weekday, channel, target: Number(nextGoals[prospectingKey(weekday, channel)]) || 0 });
        }));
        await api("/prospecting/goals", { method: "PUT", body: JSON.stringify({ goals: payload }) });
        await api("/prospecting/outcomes", {
          method: "PUT",
          body: JSON.stringify({
            activity_date: selectedDate,
            channel: editingGoal.channel,
            demos: Number(editingGoal.demos) || 0,
            sales: Number(editingGoal.sales) || 0,
          }),
        });
        setGoals(nextGoals);
        setEditingGoal(null);
        await load();
      } finally { setSavingPlan(false); }
    }
    async function submitLog(event) {
      event.preventDefault(); setSavingLog(true);
      try {
        await api("/prospecting/logs", { method: "POST", body: JSON.stringify(form) });
        const chosen = fromDateKey(form.activity_date);
        setSelectedDate(form.activity_date); setWeekCursor(startOfWeek(chosen)); setSelectedMonth(form.activity_date.slice(0, 7));
        setForm({ ...form, quantity: "", notes: "" });
        await load();
      } finally { setSavingLog(false); }
    }
    async function removeLog(item) {
      if (!window.confirm(`¿Eliminar la carga de ${item.quantity} mensajes?`)) return;
      await api(`/prospecting/logs/${item.id}`, { method: "DELETE" });
      await load();
    }
    async function completeChannel(channel, actual, planned) {
      const pending = planned - actual;
      if (pending <= 0) return;
      await api("/prospecting/logs", {
        method: "POST",
        body: JSON.stringify({
          activity_date: selectedDate, channel, quantity: pending,
          notes: "Objetivo marcado como completado",
        }),
      });
      await load();
    }
    async function undoCompleteChannel(item) {
      await api(`/prospecting/logs/${item.id}`, { method: "DELETE" });
      await load();
    }
    async function submitQuickEntry(event) {
      event.preventDefault();
      setSavingLog(true);
      try {
        await api("/prospecting/logs", {
          method: "POST",
          body: JSON.stringify({
            activity_date: selectedDate,
            channel: quickEntry.channel,
            quantity: quickEntry.quantity,
            notes: quickEntry.notes,
          }),
        });
        setQuickEntry(null);
        await load();
      } finally { setSavingLog(false); }
    }
    async function submitLogEdit(event) {
      event.preventDefault();
      setSavingLog(true);
      try {
        await api(`/prospecting/logs/${editingLog.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            activity_date: editingLog.activity_date,
            channel: editingLog.channel,
            quantity: editingLog.quantity,
            notes: editingLog.notes,
          }),
        });
        const chosen = fromDateKey(editingLog.activity_date);
        setSelectedDate(editingLog.activity_date);
        setWeekCursor(startOfWeek(chosen));
        setSelectedMonth(editingLog.activity_date.slice(0, 7));
        setForm((current) => ({ ...current, activity_date: editingLog.activity_date }));
        setEditingLog(null);
        await load();
      } finally { setSavingLog(false); }
    }
    function selectDay(day) {
      const key = dateKey(day);
      setSelectedDate(key); setSelectedMonth(key.slice(0, 7));
      setDetailFilter("day");
      setForm((current) => ({ ...current, activity_date: key }));
    }
    function changeDetailFilter(value) {
      setDetailFilter(value);
      if (value === "day") return;
      if (value === "week") {
        setWeekCursor(startOfWeek(fromDateKey(today)));
        return;
      }
      const month = value.slice(6);
      setSelectedMonth(month);
    }
    const dayBalance = balanceText(dayActual, dayPlanned);
    const weekBalance = balanceText(weekActual, weekPlanned);
    const monthBalance = balanceText(monthActual, monthPlanned);

    return (
      <section className="page prospecting-page">
        <div className="page-intro"><div><h2>Prospección</h2><p>Planificá tus mensajes semanales y comparalos con lo que realmente enviaste.</p></div></div>
        <div className="prospecting-balances">
          {[
            ["Día seleccionado", dayActual, dayPlanned, dayBalance],
            ["Semana visible", weekActual, weekPlanned, weekBalance],
            [fmtMonth(selectedMonth), monthActual, monthPlanned, monthBalance],
          ].map(([title, actual, planned, balance]) => <article key={title}>
            <small>{title}</small><strong>{actual} <span>/ {planned} planificados</span></strong>
            <em className={balance.tone}>{balance.label}</em>
          </article>)}
        </div>

        <details className="prospecting-plan">
          <summary><div><span className="eyebrow">Objetivos</span><strong>Armar semana promedio</strong><small>Definí cuántos mensajes querés enviar por canal cada día.</small></div><SlidersHorizontal /></summary>
          <div className="prospecting-plan-scroll">
            <div className="prospecting-plan-grid">
              <strong>Canal</strong>{WEEKDAY_NAMES.map((day) => <strong key={day}>{day.slice(0, 3)}</strong>)}
              {PROSPECTING_CHANNELS.map(([channel, label]) => [
                <span key={`${channel}-label`}>{label}</span>,
                ...WEEKDAY_NAMES.map((_, weekday) => <input key={prospectingKey(weekday, channel)} type="number" min="0" value={goals[prospectingKey(weekday, channel)] ?? ""} onChange={(event) => setGoals({ ...goals, [prospectingKey(weekday, channel)]: event.target.value })} aria-label={`${label}, ${WEEKDAY_NAMES[weekday]}`} placeholder="0" />),
              ])}
            </div>
          </div>
          <div className="prospecting-plan-actions"><span>Objetivo semanal: <strong>{PROSPECTING_CHANNELS.reduce((total, [channel]) => total + WEEKDAY_NAMES.reduce((sum, _, weekday) => sum + (Number(goals[prospectingKey(weekday, channel)]) || 0), 0), 0)} mensajes</strong></span><button className="primary" onClick={savePlan} disabled={savingPlan}><Save size={16} />{savingPlan ? "Guardando..." : "Guardar planificación"}</button></div>
        </details>

        <form className="prospecting-form" onSubmit={submitLog}>
          <div><span className="eyebrow">Avance real</span><h3>Registrar mensajes enviados</h3><p>Podés hacer varias cargas; se acumulan en el día.</p></div>
          <label>Fecha<input type="date" value={form.activity_date} onChange={(event) => setForm({ ...form, activity_date: event.target.value })} required /></label>
          <label>Canal<select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>{PROSPECTING_CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Cantidad<input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
          <label>Nota<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opcional" /></label>
          <button className="primary" disabled={savingLog}><Plus size={16} />{savingLog ? "Guardando..." : "Registrar"}</button>
        </form>

        <div className="prospecting-week">
          <div className="prospecting-week-head">
            <IconButton label="Semana anterior" onClick={() => setWeekCursor(addDays(weekCursor, -7))}><ChevronLeft /></IconButton>
            <h3>Lunes {fmtDate(dateKey(weekCursor))} — Domingo {fmtDate(dateKey(weekDays[6]))}</h3>
            <IconButton label="Semana siguiente" onClick={() => setWeekCursor(addDays(weekCursor, 7))}><ChevronRight /></IconButton>
            <button className="secondary small" onClick={() => setWeekCursor(startOfWeek(fromDateKey(today)))}>Esta semana</button>
          </div>
          <div className="prospecting-week-grid">
            {weekDays.map((day) => {
              const key = dateKey(day);
              const actual = actualForDate(key);
              const planned = plannedForDate(key);
              const balance = balanceText(actual, planned);
              return <button key={key} className={`${key === selectedDate ? "selected" : ""} ${key === today ? "today" : ""}`} onClick={() => selectDay(day)}>
                <span>{WEEKDAY_NAMES[(day.getDay() + 6) % 7]}</span><time>{day.getDate()}</time>
                <strong>{actual} / {planned}</strong><em className={balance.tone}>{balance.label}</em>
              </button>;
            })}
          </div>
          <div className="prospecting-week-total">
            <div><span>Balance del día</span><small>{fmtDate(selectedDate)}</small></div>
            <div className="prospecting-total-values"><small>Cumplido / esperado</small><strong>{dayActual} / {dayPlanned}</strong></div>
            <em className={dayBalance.tone}>{dayBalance.label}</em>
            <div className="prospecting-week-summary"><span>Total semanal</span><strong>{weekActual} / {weekPlanned}</strong><em className={weekBalance.tone}>{weekBalance.label}</em></div>
          </div>
        </div>

        <div className="prospecting-month-selector">
          <label>Balance mensual<input type="month" value={selectedMonth} onChange={(event) => event.target.value && setSelectedMonth(event.target.value)} /></label>
          <div><span>Realizados</span><strong>{monthActual}</strong></div><div><span>Planificados</span><strong>{monthPlanned}</strong></div>
          <em className={monthBalance.tone}>{monthBalance.label}</em>
        </div>

        <div className="prospecting-detail">
          <div className="prospecting-detail-head">
            <div><span className="eyebrow">Detalle de prospección</span><h3>{detailLabel}</h3></div>
            <label>Período<select value={detailFilter} onChange={(event) => changeDetailFilter(event.target.value)}>
              <option value="day">Este día</option>
              <option value="week">Esta semana</option>
              {Array.from({ length: 12 }, (_, index) => {
                const month = `${filterYear}-${String(index + 1).padStart(2, "0")}`;
                return <option key={month} value={`month-${month}`}>{fmtMonth(month)}</option>;
              })}
            </select></label>
          </div>
          <div className="prospecting-channel-list">
            {PROSPECTING_CHANNELS.map(([channel, label]) => {
              const actual = detailDays.reduce((total, day) => total + (actualByDayChannel[`${dateKey(day)}:${channel}`] || 0), 0);
              const weekday = (fromDateKey(selectedDate).getDay() + 6) % 7;
              const completionLog = detailFilter === "day"
                ? logs.find((item) => item.activity_date === selectedDate && item.channel === channel && item.notes === "Objetivo marcado como completado")
                : null;
              const planned = detailDays.reduce((total, day) => {
                const dayWeekday = (day.getDay() + 6) % 7;
                return total + (Number(goals[prospectingKey(dayWeekday, channel)]) || 0);
              }, 0);
              const balance = balanceText(actual, planned);
              const channelResults = resultsByChannel.find((item) => item.channel === channel);
              const dailyOutcome = outcomesByDayChannel[prospectingOutcomeKey(selectedDate, channel)] || { demos: 0, sales: 0 };
              return <article
                key={channel}
                className="prospecting-channel-card"
                role="button"
                tabIndex={0}
                onClick={() => setQuickEntry({ channel, label, quantity: "", notes: "" })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setQuickEntry({ channel, label, quantity: "", notes: "" });
                  }
                }}
              >
                <div className="prospecting-channel-head"><span>{label}</span>{detailFilter === "day" && <IconButton label={`Editar objetivo de ${label}`} onClick={(event) => {
                  event.stopPropagation();
                  setEditingGoal({
                    channel,
                    label,
                    weekday,
                    target: planned || "",
                    demos: dailyOutcome.id ? dailyOutcome.demos : "",
                    sales: dailyOutcome.id ? dailyOutcome.sales : "",
                  });
                }}><Edit3 /></IconButton>}</div>
                <strong>{actual} / {planned}</strong><em className={balance.tone}>{balance.label}</em>
                <div className="prospecting-channel-results"><span>Demos <b>{channelResults.demos}</b></span><span>Ventas <b>{channelResults.sales}</b></span></div>
                {completionLog
                  ? <button className="secondary small prospecting-undo" onClick={(event) => { event.stopPropagation(); undoCompleteChannel(completionLog); }}><RotateCcw size={14} />Deshacer completado</button>
                  : detailFilter === "day" && planned > actual && <button className="secondary small" onClick={(event) => { event.stopPropagation(); completeChannel(channel, actual, planned); }}><Check size={14} />Marcar completado</button>}
              </article>;
            })}
          </div>
          <div className="prospecting-results-summary">
            <div className="prospecting-results-title"><div><span className="eyebrow">Resultados comerciales</span><h3>{detailLabel}</h3></div><div><small>Demos enviadas</small><strong>{detailDemos}</strong></div><div><small>Ventas concretadas</small><strong>{detailSales}</strong></div></div>
            <div className="prospecting-sales-channels">
              {resultsByChannel.map((item) => <div key={item.channel}><span>{item.label}</span><strong>{item.sales} {item.sales === 1 ? "venta" : "ventas"}</strong><small>{item.demos} {item.demos === 1 ? "demo" : "demos"}</small></div>)}
            </div>
          </div>
          {detailLogs.length > 0 && <div className="prospecting-log-list">{detailLogs.map((item) => <div key={item.id}><span><strong>+{item.quantity} · {acquisitionLabel(item.channel)}</strong><small>{detailFilter === "day" ? (item.notes || "Sin nota") : `${fmtDate(item.activity_date)} · ${item.notes || "Sin nota"}`}</small></span><div className="prospecting-log-actions"><IconButton label="Editar carga" onClick={() => setEditingLog({ ...item })}><Edit3 /></IconButton><IconButton label="Eliminar carga" onClick={() => removeLog(item)}><Trash2 /></IconButton></div></div>)}</div>}
        </div>
        {quickEntry && (
          <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setQuickEntry(null)}>
            <div className="form-modal prospecting-quick-modal">
              <div className="modal-head">
                <div><span className="eyebrow">Carga rápida · {fmtDate(selectedDate)}</span><h2>{quickEntry.label}</h2></div>
                <IconButton label="Cerrar" onClick={() => setQuickEntry(null)}><X /></IconButton>
              </div>
              <form onSubmit={submitQuickEntry}>
                <div className="form-grid">
                  <label>Cantidad enviada<input type="number" min="1" value={quickEntry.quantity} onChange={(event) => setQuickEntry({ ...quickEntry, quantity: event.target.value })} placeholder="Ej.: 20" required autoFocus /></label>
                  <label>Nota opcional<input value={quickEntry.notes} onChange={(event) => setQuickEntry({ ...quickEntry, notes: event.target.value })} placeholder="Ej.: tanda de la mañana" /></label>
                </div>
                <div className="form-actions"><button type="button" className="secondary" onClick={() => setQuickEntry(null)}>Cancelar</button><button className="primary" disabled={savingLog}><Plus size={16} />{savingLog ? "Guardando..." : "Sumar mensajes"}</button></div>
              </form>
            </div>
          </div>
        )}
        {editingLog && (
          <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setEditingLog(null)}>
            <div className="form-modal prospecting-quick-modal">
              <div className="modal-head">
                <div><span className="eyebrow">Detalle diario</span><h2>Editar carga</h2></div>
                <IconButton label="Cerrar" onClick={() => setEditingLog(null)}><X /></IconButton>
              </div>
              <form onSubmit={submitLogEdit}>
                <div className="form-grid">
                  <label>Fecha<input type="date" value={editingLog.activity_date} onChange={(event) => setEditingLog({ ...editingLog, activity_date: event.target.value })} required /></label>
                  <label>Canal<select value={editingLog.channel} onChange={(event) => setEditingLog({ ...editingLog, channel: event.target.value })}>{PROSPECTING_CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Cantidad enviada<input type="number" min="1" value={editingLog.quantity} onChange={(event) => setEditingLog({ ...editingLog, quantity: event.target.value })} required autoFocus /></label>
                  <label>Nota opcional<input value={editingLog.notes || ""} onChange={(event) => setEditingLog({ ...editingLog, notes: event.target.value })} placeholder="Ej.: tanda de la mañana" /></label>
                </div>
                <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditingLog(null)}>Cancelar</button><button className="primary" disabled={savingLog}><Save size={16} />{savingLog ? "Guardando..." : "Guardar cambios"}</button></div>
              </form>
            </div>
          </div>
        )}
        {editingGoal && (
          <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setEditingGoal(null)}>
            <div className="form-modal prospecting-quick-modal">
              <div className="modal-head">
                <div><span className="eyebrow">{WEEKDAY_NAMES[editingGoal.weekday]} · {fmtDate(selectedDate)}</span><h2>Editar objetivo de {editingGoal.label}</h2></div>
                <IconButton label="Cerrar" onClick={() => setEditingGoal(null)}><X /></IconButton>
              </div>
              <form onSubmit={submitGoalEdit}>
                <div className="form-grid">
                  <label>Mensajes planificados<input type="number" min="0" value={editingGoal.target} onChange={(event) => setEditingGoal({ ...editingGoal, target: event.target.value })} required autoFocus /></label>
                  <label>Demos enviadas<input type="number" min="0" value={editingGoal.demos} onChange={(event) => setEditingGoal({ ...editingGoal, demos: event.target.value })} required /></label>
                  <label>Ventas concretadas<input type="number" min="0" max={editingGoal.demos || undefined} value={editingGoal.sales} onChange={(event) => setEditingGoal({ ...editingGoal, sales: event.target.value })} required /></label>
                </div>
                <p className="prospecting-goal-note">Las demos y ventas corresponden al {fmtDate(selectedDate)}. El objetivo se aplica a todos los {WEEKDAY_NAMES[editingGoal.weekday].toLowerCase()}.</p>
                <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditingGoal(null)}>Cancelar</button><button className="primary" disabled={savingPlan}><Save size={16} />{savingPlan ? "Guardando..." : "Guardar objetivo"}</button></div>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  }

  return { Prospecting };
}
