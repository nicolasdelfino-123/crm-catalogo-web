import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Save, SlidersHorizontal, Edit3, X, Info } from "lucide-react";

export function createProspectingPage(dependencies) {
  const { api, ACQUISITION_OPTIONS: channels, fmtDate, fmtMonth, dateKey, fromDateKey, addDays, startOfWeek, IconButton } = dependencies;
  const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const goalKey = (weekday, channel, weekStart) => `${weekStart}:${weekday}:${channel}`;
  const metrics = [
    { key: "contacts", label: "Contactados registrados", unit: "contactos", source: "Son los contactos que guardaste en el registro real de este día, sumados por canal." },
    { key: "target", label: "Objetivo del día", unit: "contactos planificados", source: "Es lo que planificaste para esta fecha en Mi semana ideal, sumando los objetivos de cada canal. No es actividad realizada." },
    { key: "prices_sent", label: "Precios enviados", unit: "precios enviados", source: "Son los precios enviados que guardaste para este día, sumados por canal." },
    { key: "sales", label: "Ventas registradas", unit: "ventas", source: "Son las ventas que guardaste para este día, sumadas por canal. Pueden venir de contactos de días anteriores." },
  ];
  const weekdayFor = (key) => (fromDateKey(key).getDay() + 6) % 7;

  function Prospecting() {
    const today = dateKey();
    const [data, setData] = useState({ logs: [], outcomes: [] });
    const [goals, setGoals] = useState({});
    const [savedGoals, setSavedGoals] = useState({});
    const [configuredGoals, setConfiguredGoals] = useState({});
    const [editingPlans, setEditingPlans] = useState({});
    const [planNotice, setPlanNotice] = useState(null);
    const [selectedDate, setSelectedDate] = useState(today);
    const [week, setWeek] = useState(startOfWeek(fromDateKey(today)));
    const weekStart = dateKey(week);
    const [draft, setDraft] = useState({});
    const [editingDate, setEditingDate] = useState(null);
    const [detailDate, setDetailDate] = useState(null);
    const dayDialog = useRef(null);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const metricDialog = useRef(null);
    const [view, setView] = useState("day");
    const [planChannel, setPlanChannel] = useState(channels[0][0]);
    const [period, setPeriod] = useState("day");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingPlan, setSavingPlan] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const load = useCallback(async (refreshGoals = true) => {
      const next = await api("/prospecting");
      setData({ logs: next.logs, outcomes: next.outcomes || [] });
      if (refreshGoals) {
        const loadedGoals = Object.fromEntries((next.weekly_goals || []).map((item) => [goalKey(item.weekday, item.channel, item.week_start), item.target]));
        setGoals(loadedGoals); setSavedGoals(loadedGoals);
        setConfiguredGoals(Object.fromEntries((next.weekly_goals || []).map((item) => [goalKey(item.weekday, item.channel, item.week_start), true])));
      }
    }, []);
    useEffect(() => {
      load().catch((err) => setError(err.message || "No se pudo cargar la prospección.")).finally(() => setLoading(false));
    }, [load]);

    useEffect(() => {
      if (detailDate && dayDialog.current && !dayDialog.current.open) dayDialog.current.showModal();
    }, [detailDate]);

    useEffect(() => {
      if (selectedMetric && metricDialog.current && !metricDialog.current.open) metricDialog.current.showModal();
    }, [selectedMetric]);

    function savedRow(key, channel) {
      const outcome = data.outcomes.find((item) => item.activity_date === key && item.channel === channel);
      return {
        contacts: data.logs.filter((item) => item.activity_date === key && item.channel === channel).reduce((sum, item) => sum + item.quantity, 0),
        prices_sent: outcome?.prices_sent ?? outcome?.demos ?? 0,
        sales: outcome?.sales || 0,
      };
    }
    const accumulatedRow = (channel) => ({
      contacts: data.logs.filter((item) => item.channel === channel).reduce((sum, item) => sum + item.quantity, 0),
      prices_sent: data.outcomes.filter((item) => item.channel === channel).reduce((sum, item) => sum + (item.prices_sent ?? item.demos ?? 0), 0),
      sales: data.outcomes.filter((item) => item.channel === channel).reduce((sum, item) => sum + item.sales, 0),
    });
    const rowFor = (channel) => view === "total" ? accumulatedRow(channel) : draft[channel] || savedRow(selectedDate, channel);
    const dirty = Object.keys(draft).length > 0;
    const daySaved = data.logs.some((item) => item.activity_date === selectedDate) || data.outcomes.some((item) => item.activity_date === selectedDate);
    const dayLocked = daySaved && editingDate !== selectedDate;
    const channelConfigured = (channel) => weekdays.every((_, weekday) => configuredGoals[goalKey(weekday, channel, weekStart)] === true);
    const planSaved = channelConfigured(planChannel);
    const planLocked = planSaved && !editingPlans[`${weekStart}:${planChannel}`];
    const totalFor = (key) => channels.reduce((sum, [channel]) => sum + savedRow(key, channel).contacts, 0);
    const planFor = (key) => channels.reduce((sum, [channel]) => sum + (Number(savedGoals[goalKey(weekdayFor(key), channel, dateKey(startOfWeek(fromDateKey(key))))]) || 0), 0);
    const days = Array.from({ length: 7 }, (_, index) => dateKey(addDays(week, index)));
    const month = selectedDate.slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const monthDays = Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => dateKey(new Date(year, monthNumber - 1, index + 1)));
    const reportDays = period === "week" ? days : period === "month" ? monthDays : [selectedDate];
    const summary = channels.map(([channel, label]) => ({ channel, label, ...(period === "all" ? accumulatedRow(channel) : reportDays.reduce((sum, key) => {
      const row = savedRow(key, channel);
      return { contacts: sum.contacts + row.contacts, prices_sent: sum.prices_sent + row.prices_sent, sales: sum.sales + row.sales };
    }, { contacts: 0, prices_sent: 0, sales: 0 })) }));
    const totals = summary.reduce((sum, row) => ({ contacts: sum.contacts + row.contacts, prices_sent: sum.prices_sent + row.prices_sent, sales: sum.sales + row.sales }), { contacts: 0, prices_sent: 0, sales: 0 });
    const dailyTotals = channels.reduce((sum, [channel]) => {
      const row = rowFor(channel);
      return { contacts: sum.contacts + Number(row.contacts), prices_sent: sum.prices_sent + Number(row.prices_sent), sales: sum.sales + Number(row.sales) };
    }, { contacts: 0, prices_sent: 0, sales: 0 });

    function selectDate(key) {
      if (!key) return false;
      if (key === selectedDate) return true;
      if (dirty && !window.confirm("Tenés cambios sin guardar. ¿Querés cambiar de día y descartarlos?")) return false;
      setSelectedDate(key); setWeek(startOfWeek(fromDateKey(key))); setDraft({}); setEditingDate(null); setMessage(""); setError("");
      return true;
    }
    async function saveDay(event) {
      event.preventDefault();
      if (view !== "day" || dayLocked || saving) return;
      const entries = channels.map(([channel]) => {
        const row = draft[channel] || savedRow(selectedDate, channel);
        return { channel, contacts: Number(row.contacts), prices_sent: Number(row.prices_sent), sales: Number(row.sales) };
      });
      if (entries.some((row) => [row.contacts, row.prices_sent, row.sales].some((value) => !Number.isInteger(value) || value < 0))) {
        setError("Usá cantidades enteras y positivas o dejá el campo vacío."); return;
      }
      setSaving(true); setError(""); setMessage("");
      try {
        const saved = await api("/prospecting/daily", { method: "PUT", body: JSON.stringify({ activity_date: selectedDate, channels: entries }) });
        if (!saved || saved.activity_date !== selectedDate || !Array.isArray(saved.logs) || !Array.isArray(saved.outcomes)) {
          throw new Error("El servidor no confirmó los datos guardados. Reiniciá el backend y volvé a intentar.");
        }
        setData((current) => ({
          logs: [...current.logs.filter((item) => item.activity_date !== selectedDate), ...saved.logs],
          outcomes: [...current.outcomes.filter((item) => item.activity_date !== selectedDate), ...saved.outcomes],
        }));
        setDraft({}); setEditingDate(null); setMessage("Día guardado. Para modificarlo, tocá Editar día.");
      } catch (err) { setError(err.message || "No se pudo guardar. Tus cambios siguen en pantalla."); }
      finally { setSaving(false); }
    }
    async function savePlan(event) {
      event.preventDefault();
      if (planLocked || savingPlan) return;
      const channel = planChannel;
      const payload = weekdays.map((_, weekday) => ({ weekday, channel, target: Number(goals[goalKey(weekday, channel, weekStart)]) || 0 }));
      if (payload.some(({ target }) => !Number.isInteger(target) || target < 0)) {
        setPlanNotice({ channel, weekStart, error: true, text: "Usá cantidades enteras y positivas o dejá el campo vacío." }); return;
      }
      setSavingPlan(true); setPlanNotice(null);
      try {
        const saved = await api("/prospecting/goals", { method: "PUT", body: JSON.stringify({ week_start: weekStart, goals: payload }) });
        if (!Array.isArray(saved)) throw new Error("El servidor no confirmó la semana ideal.");
        const confirmed = saved.filter((item) => item.channel === channel && item.week_start === weekStart);
        if (confirmed.length !== 7 || payload.some((item) => !confirmed.some((row) => row.weekday === item.weekday && row.target === item.target))) {
          throw new Error("El servidor no confirmó todos los objetivos del canal.");
        }
        const updates = Object.fromEntries(confirmed.map((item) => [goalKey(item.weekday, channel, weekStart), item.target]));
        setSavedGoals((current) => ({ ...current, ...updates }));
        setConfiguredGoals((current) => ({ ...current, ...Object.fromEntries(confirmed.map((item) => [goalKey(item.weekday, channel, weekStart), true])) }));
        setGoals((current) => ({ ...current, ...updates }));
        setEditingPlans((current) => ({ ...current, [`${weekStart}:${channel}`]: false }));
        setPlanNotice({ channel, weekStart, text: `Semana de ${fmtDate(weekStart)} de ${channels.find(([id]) => id === channel)?.[1]} guardada.` });
      } catch (err) {
        setPlanNotice({ channel, weekStart, error: true, text: err.message || "No se pudo guardar. Tus cambios siguen en pantalla." });
      } finally { setSavingPlan(false); }
    }
    const detailRows = detailDate ? channels.map(([channel, label]) => ({
      channel, label, ...savedRow(detailDate, channel),
      target: Number(savedGoals[goalKey(weekdayFor(detailDate), channel, dateKey(startOfWeek(fromDateKey(detailDate))))]) || 0,
    })) : [];
    const detailTotals = detailRows.reduce((sum, row) => ({ contacts: sum.contacts + row.contacts, target: sum.target + row.target, prices_sent: sum.prices_sent + row.prices_sent, sales: sum.sales + row.sales }), { contacts: 0, target: 0, prices_sent: 0, sales: 0 });
    const activeMetric = metrics.find((metric) => metric.key === selectedMetric);
    const metricRows = activeMetric ? detailRows.filter((row) => row[activeMetric.key] > 0) : [];
    const detailHasRecords = detailDate && (data.logs.some((item) => item.activity_date === detailDate) || data.outcomes.some((item) => item.activity_date === detailDate));
    const dayActions = view === "day" && <div className="prospecting-day-actions">
      <button key="save" type="submit" className="primary" disabled={dayLocked || saving || savingPlan}><Save size={16} />{saving ? "Guardando…" : "Guardar día"}</button>
      <button key="edit" type="button" className="secondary" disabled={!dayLocked || saving} onClick={() => { setEditingDate(selectedDate); setMessage(""); }}><Edit3 size={16} />Editar día</button>
      {daySaved && !dayLocked && <button type="button" className="secondary" disabled={saving} onClick={() => { setDraft({}); setEditingDate(null); setError(""); }}>Cancelar edición</button>}
    </div>;

    return <section className="page prospecting-page">
      <div className="page-intro"><div><h2>Prospección</h2><p>Registrá lo que hiciste y planificá tus objetivos para una semana con fechas.</p></div></div>
      {error && <p role="alert" className="prospecting-error">{error}</p>}
      {message && <p role="status" className="prospecting-success">{message}</p>}
      {loading ? <p role="status">Cargando prospección…</p> : <>
        <form className="prospecting-daily" onSubmit={saveDay}>
          <div className="prospecting-daily-head"><div><span className="eyebrow">{view === "day" ? "Registro real del día" : "Resultados reales guardados"}</span><h3>{view === "day" ? `Lo que registraste · ${fmtDate(selectedDate)}` : "Total acumulado por canal"}</h3><p>{view === "day" ? (dayLocked ? "Día guardado. Tocá Editar día para cambiar las cantidades." : "Ingresá el total del día. Al guardar se actualiza, sin duplicarlo.") : "Todos los días registrados. Para cargar o corregir cantidades, elegí Día seleccionado."}</p></div><label>Ver<select value={view} disabled={saving} onChange={(event) => setView(event.target.value)}><option value="day">Día seleccionado</option><option value="total">Total acumulado</option></select></label><label>Fecha<input type="date" required value={selectedDate} disabled={saving || savingPlan || view === "total"} onChange={(event) => selectDate(event.target.value)} /></label><button type="button" className="secondary small" disabled={saving || savingPlan} onClick={() => { setView("day"); selectDate(today); }}>Hoy</button>{dayActions}</div>
          <div className="prospecting-entry-table"><div className="prospecting-entry-row prospecting-entry-heading"><span>Canal</span><span>Contactados</span><span>Precios enviados</span><span>Ventas</span></div>
            {channels.map(([channel, label]) => {
              const row = rowFor(channel);
              return <div className="prospecting-entry-row" key={channel}><div><strong>{label}</strong><small>{view === "total" ? "Todos los días registrados" : "Contactos, precios enviados y ventas reales"}</small></div>{[["contacts", "Contactados"], ["prices_sent", "Precios enviados"], ["sales", "Ventas"]].map(([field, title]) => <label key={field}><span>{title}</span><input aria-label={`${label}: ${title}`} type="number" min="0" step="1" inputMode="numeric" value={row[field] || ""} readOnly={view === "total" || dayLocked} disabled={saving} onFocus={(event) => event.target.select()} onChange={(event) => { setDraft((current) => ({ ...current, [channel]: { ...row, [field]: event.target.value } })); setMessage(""); }} /></label>)}</div>;
            })}
          </div>
          <div className="prospecting-daily-footer"><div><strong>{dailyTotals.contacts}</strong> contactados <b>·</b> <strong>{dailyTotals.prices_sent}</strong> precios enviados <b>·</b> <strong>{dailyTotals.sales}</strong> ventas</div></div>
          <p className="prospecting-entry-note">{view === "day" ? "Solo completá los canales que usaste. Las ventas pueden venir de contactos de días anteriores." : "El acumulado incluye únicamente datos guardados, sin importar la fecha seleccionada."}</p>
        </form>

        <details className="prospecting-plan"><summary><div><span className="eyebrow">Planificación</span><strong>Mi semana ideal · {fmtDate(days[0])} — {fmtDate(days[6])}</strong><small>Objetivos para estas fechas. Cada semana se configura por separado.</small></div><SlidersHorizontal /></summary>
          <div className="prospecting-plan-week-picker"><IconButton label="Planificar semana anterior" disabled={savingPlan} onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></IconButton><strong>Semana del {fmtDate(days[0])} al {fmtDate(days[6])}</strong><IconButton label="Planificar semana siguiente" disabled={savingPlan} onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></IconButton><button type="button" className="secondary small" disabled={savingPlan} onClick={() => setWeek(startOfWeek(fromDateKey(today)))}>Esta semana</button></div>
          <form onSubmit={savePlan}>
          <div className="prospecting-plan-editor">
            <div className="prospecting-plan-toolbar">
            <label className="prospecting-plan-channel">Canal<select className={channelConfigured(planChannel) ? "is-configured" : ""} value={planChannel} disabled={savingPlan || saving} onChange={(event) => setPlanChannel(event.target.value)}>{channels.map(([channel, label]) => <option key={channel} value={channel} className={channelConfigured(channel) ? "is-configured" : ""}>{channelConfigured(channel) ? `✓ ${label} · Configurado` : label}</option>)}</select></label>
              <div className="prospecting-day-actions">
                <button type="submit" className="primary" disabled={planLocked || savingPlan || saving}><Save size={16} />{savingPlan ? "Guardando…" : "Guardar canal"}</button>
                <button type="button" className="secondary" disabled={!planLocked || savingPlan || saving} onClick={() => { setEditingPlans((current) => ({ ...current, [`${weekStart}:${planChannel}`]: true })); setPlanNotice(null); }}><Edit3 size={16} />Editar</button>
                {planSaved && !planLocked && <button type="button" className="secondary" disabled={savingPlan} onClick={() => {
                  setGoals((current) => ({ ...current, ...Object.fromEntries(weekdays.map((_, weekday) => [goalKey(weekday, planChannel, weekStart), savedGoals[goalKey(weekday, planChannel, weekStart)] || 0])) }));
                  setEditingPlans((current) => ({ ...current, [`${weekStart}:${planChannel}`]: false })); setPlanNotice(null);
                }}>Cancelar edición</button>}
              </div>
            </div>
            {planNotice?.channel === planChannel && planNotice.weekStart === weekStart && <p role={planNotice.error ? "alert" : "status"} className={planNotice.error ? "prospecting-error" : "prospecting-success"}>{planNotice.text}</p>}
            <p className="prospecting-entry-note">Elegí un canal y definí cuántos mensajes querés enviar cada día. Se guarda solo para las fechas de esta semana y el canal seleccionado.</p>
            <div className="prospecting-plan-days">{weekdays.map((day, weekday) => <label key={day}>{day}<small>{fmtDate(days[weekday])}</small><input aria-label={`${channels.find(([channel]) => channel === planChannel)?.[1]}, ${day} ${fmtDate(days[weekday])}`} type="number" min="0" step="1" inputMode="numeric" disabled={savingPlan || saving} readOnly={planLocked} value={goals[goalKey(weekday, planChannel, weekStart)] || ""} onChange={(event) => setGoals((current) => ({ ...current, [goalKey(weekday, planChannel, weekStart)]: event.target.value }))} /></label>)}</div>
            <p className="prospecting-entry-note">Este canal: <strong>{weekdays.reduce((sum, _, weekday) => sum + Number(goals[goalKey(weekday, planChannel, weekStart)] || 0), 0)} mensajes por semana</strong></p>
          </div>
          <div className="prospecting-plan-actions"><span>Objetivo guardado para estas fechas, entre todos los canales: <strong>{Object.entries(savedGoals).filter(([key]) => key.startsWith(`${weekStart}:`)).reduce((sum, [, value]) => sum + Number(value || 0), 0)} mensajes</strong></span></div>
          </form>
        </details>

        <div className="prospecting-week"><h3 className="prospecting-comparison-title">Registro real vs. objetivos de esta semana</h3><p className="prospecting-entry-note">Los contactos salen de tus registros guardados. Los objetivos salen de la planificación de estas fechas.</p><div className="prospecting-week-head"><IconButton label="Semana anterior" disabled={savingPlan} onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></IconButton><h3>{fmtDate(days[0])} — {fmtDate(days[6])}</h3><IconButton label="Semana siguiente" disabled={savingPlan} onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></IconButton><button className="secondary small" disabled={savingPlan} onClick={() => setWeek(startOfWeek(fromDateKey(today)))}>Esta semana</button></div><div className="prospecting-week-grid">{days.map((key, index) => {
          const actual = totalFor(key), planned = planFor(key);
          return <button key={key} disabled={saving} className={`${key === selectedDate ? "selected" : ""} ${key === today ? "today" : ""}`} aria-label={`Ver detalle del ${fmtDate(key)}: ${actual} contactos registrados, objetivo ${planned}`} aria-haspopup="dialog" onClick={() => setDetailDate(key)}><span>{weekdays[index]}</span><time dateTime={key}>{fmtDate(key)}</time><strong>{actual} <small>contactados</small></strong><span className="prospecting-card-target">Objetivo: {planned}</span><em className={actual >= planned ? "done" : "behind"}>{planned ? actual >= planned ? "Objetivo cumplido" : `${planned - actual} pendientes` : "Sin objetivo"}</em><span className="prospecting-card-hint"><Info size={12} />Ver detalle</span></button>;
        })}</div><p className="prospecting-entry-note">Contactados / objetivo de la semana: {days.reduce((sum, key) => sum + totalFor(key), 0)} / {days.reduce((sum, key) => sum + planFor(key), 0)}</p></div>

        <details className="prospecting-report"><summary>Ver resultados por día, semana, mes o todo el historial</summary><div className="prospecting-detail"><div className="prospecting-detail-head"><h3>{period === "all" ? "Total acumulado · Todos los registros" : period === "month" ? fmtMonth(month) : period === "week" ? `${fmtDate(days[0])} — ${fmtDate(days[6])}` : fmtDate(selectedDate)}</h3><label>Período<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Día seleccionado</option><option value="week">Semana visible</option><option value="month">Mes seleccionado</option><option value="all">Ver todo · Total acumulado</option></select></label></div><div className="prospecting-balances">{[["Contactados", totals.contacts], ["Precios enviados", totals.prices_sent], ["Ventas", totals.sales]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><div className="prospecting-report-scroll"><table><thead><tr><th>Canal</th><th>Contactados</th><th>Precios enviados</th><th>Ventas</th></tr></thead><tbody>{summary.map((row) => <tr key={row.channel}><th>{row.label}</th><td>{row.contacts}</td><td>{row.prices_sent}</td><td>{row.sales}</td></tr>)}</tbody></table></div></div></details>
        {detailDate && <dialog ref={dayDialog} className="prospecting-day-dialog" aria-labelledby="prospecting-day-title" onClose={() => { setDetailDate(null); setSelectedMetric(null); }} onClick={(event) => { if (event.target === event.currentTarget) dayDialog.current.close(); }}>
          <div className="prospecting-day-dialog-content">
            <div className="modal-head"><div><span className="eyebrow">Detalle de prospección</span><h2 id="prospecting-day-title">{weekdays[weekdayFor(detailDate)]} · {fmtDate(detailDate)}</h2></div><IconButton label="Cerrar detalle del día" onClick={() => dayDialog.current.close()}><X /></IconButton></div>
            <div className="prospecting-day-dialog-body">
              <div className="prospecting-day-explanation"><h3>¿Qué significa {detailTotals.contacts} / {detailTotals.target}?</h3><p><strong>{detailTotals.contacts}</strong> es la cantidad de contactos guardados en tu registro real para este día. <strong>{detailTotals.target}</strong> es tu objetivo, sumando los canales de tu semana ideal para esta fecha.</p>
                <p>{detailTotals.target > 0 ? detailTotals.contacts > detailTotals.target ? `Superaste el objetivo por ${detailTotals.contacts - detailTotals.target} contactos. Completaste el ${Math.round(detailTotals.contacts / detailTotals.target * 100)}% de lo planificado.` : detailTotals.contacts === detailTotals.target ? "Alcanzaste exactamente el objetivo del día: 100% cumplido." : `Te faltan ${detailTotals.target - detailTotals.contacts} contactos para llegar al objetivo. Llevás el ${Math.round(detailTotals.contacts / detailTotals.target * 100)}% de lo planificado.` : "No tenés un objetivo para este día. Podés definirlo por canal en Mi semana ideal."}</p>
              </div>
              {!detailHasRecords && <p className="prospecting-entry-note">Todavía no hay un registro guardado para esta fecha. El cero indica que no cargaste contactos; no confirma que no hayas trabajado ese día.</p>}
              <div className="prospecting-day-metrics">{metrics.map((metric) => <button type="button" key={metric.key} aria-haspopup="dialog" aria-label={`${metric.label}: ${detailTotals[metric.key]}. Ver desglose por canal`} onClick={() => setSelectedMetric(metric.key)}><small>{metric.label}</small><strong>{detailTotals[metric.key]}</strong><span><Info size={12} />Ver por canal</span></button>)}</div>
              <h3>De dónde sale cada número</h3>
              <div className="prospecting-report-scroll"><table className="prospecting-day-breakdown"><thead><tr><th>Canal</th><th>Contactados</th><th>Objetivo</th><th>Balance</th><th>Precios enviados</th><th>Ventas</th></tr></thead><tbody>{detailRows.map((row) => <tr key={row.channel}><th scope="row">{row.label}</th><td>{row.contacts}</td><td>{row.target}</td><td>{row.target ? row.contacts > row.target ? `+${row.contacts - row.target} sobre el objetivo` : row.contacts === row.target ? "Cumplido" : `${row.target - row.contacts} pendientes` : "Sin objetivo"}</td><td>{row.prices_sent}</td><td>{row.sales}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total del día</th><td>{detailTotals.contacts}</td><td>{detailTotals.target}</td><td>Todos los canales</td><td>{detailTotals.prices_sent}</td><td>{detailTotals.sales}</td></tr></tfoot></table></div>
              <p className="prospecting-entry-note">El objetivo mide contactos. Los precios enviados y las ventas se muestran aparte y no se suman a ese avance. Las ventas pueden venir de contactos de días anteriores.</p>
              <p className="prospecting-entry-note">Se muestran solo datos guardados. El objetivo corresponde a la semana de esta fecha. Los objetivos de otras semanas no se aplican acá.</p>
              {detailDate === selectedDate && dirty && <p className="prospecting-entry-note">Tenés cambios sin guardar en este día. Aparecerán acá cuando guardes el registro.</p>}
              <div className="prospecting-day-dialog-actions"><button type="button" className="secondary" onClick={() => dayDialog.current.close()}>Cerrar</button><button type="button" className="primary" onClick={() => { if (selectDate(detailDate)) { setView("day"); dayDialog.current.close(); } }}>{detailHasRecords ? "Ir al registro del día" : "Cargar este día"}</button></div>
            </div>
          </div>
        </dialog>}
        {detailDate && activeMetric && <dialog ref={metricDialog} className="prospecting-day-dialog prospecting-metric-dialog" aria-labelledby="prospecting-metric-title" onClose={() => setSelectedMetric(null)} onClick={(event) => { if (event.target === event.currentTarget) metricDialog.current.close(); }}>
          <div className="modal-head"><div><span className="eyebrow">{fmtDate(detailDate)} · Resumen por canal</span><h2 id="prospecting-metric-title">{activeMetric.label}</h2></div><IconButton label="Cerrar resumen por canal" onClick={() => metricDialog.current.close()}><X /></IconButton></div>
          <div className="prospecting-day-dialog-body">
            <div className="prospecting-metric-total"><strong>{detailTotals[activeMetric.key]}</strong><span>{activeMetric.unit} en total</span></div>
            <p className="prospecting-metric-source">{activeMetric.source}</p>
            {metricRows.length > 0 ? <><h3>Este número se compone de:</h3><ul className="prospecting-metric-channels">{metricRows.map((row) => <li key={row.channel}><span>{row.label}</span><strong>{row[activeMetric.key]}</strong></li>)}</ul><p className="prospecting-metric-equation">{metricRows.map((row) => row[activeMetric.key]).join(" + ")} = <strong>{detailTotals[activeMetric.key]}</strong></p><p className="prospecting-entry-note">Los demás canales tienen cero para este dato.</p></> : <p className="prospecting-metric-empty">{activeMetric.key === "target" ? "No hay contactos planificados para esta fecha en ningún canal." : `No registraste ${activeMetric.unit} para esta fecha en ningún canal.`}</p>}
            <div className="prospecting-day-dialog-actions"><button type="button" className="primary" onClick={() => metricDialog.current.close()}>Volver al detalle del día</button></div>
          </div>
        </dialog>}
      </>}
    </section>;
  }
  return { Prospecting };
}
