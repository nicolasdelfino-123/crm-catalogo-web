import { useCallback, useEffect, useRef, useState } from "react";

const STATES = [["all", "Todos los estados"], ["active", "Activos (incluye en riesgo)"], ["no_signup", "Sin alta"], ["active_no_signup", "Activos + sin alta"], ["cancelled", "Cancelados"], ["paused", "Pausados"], ["at_risk", "En riesgo"], ["lead", "Prospectos"]];
const stateLabel = (status) => ({ active: "Activo", at_risk: "En riesgo", no_signup: "Sin alta", cancelled: "Cancelado", paused: "Pausado", lead: "Prospecto" }[status] || status);
const num = (v) => v == null ? "Sin datos suficientes" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v);
const pct = (v) => v == null ? "—" : `${num(v)}%`;
const money = (v, u) => v == null ? "Sin datos suficientes" : `${u} ${num(v)}`;
// Component helpers belong to this page factory.
// eslint-disable-next-line react-refresh/only-export-components
function Table({ headers, rows }) {
  return <div className="saas-table"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table>{!rows.length && <p>Sin datos suficientes.</p>}</div>;
}
// eslint-disable-next-line react-refresh/only-export-components
function Chart({ title, rows, value, unit = "" }) {
  const available = rows.filter((r) => value(r) != null);
  const values = available.map(value), max = Math.max(1, ...values.map(Math.abs));
  return <article className="saas-panel"><h3>{title}</h3><div className="saas-bars">{!available.length && <p>Sin datos suficientes.</p>}{available.map((r, i) => <div key={r.month} className="saas-bar-row"><small>{r.month}</small><span style={{ width: `${Math.abs(values[i]) / max * 55}%`, background: values[i] < 0 ? "var(--red)" : undefined }} /><small>{num(values[i])} {unit}</small></div>)}</div></article>;
}
export function createSaasPage({ api, useEscapeClose }) {
  function SaasAnalysis() {
    const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("all");
    const requestVersion = useRef(0);
    const [from, setFrom] = useState(""), [to, setTo] = useState(""), [unit, setUnit] = useState("ARS");
    const [expanded, setExpanded] = useState(false), [notice, setNotice] = useState("");
    const [goal, setGoal] = useState(1500000), [price, setPrice] = useState(30000), [adds, setAdds] = useState(10), [loss, setLoss] = useState(2), [rate, setRate] = useState(0), [fx, setFx] = useState(0);
    const dialog = useRef(null), opener = useRef(null);
    const close = useCallback(() => { setExpanded(false); opener.current?.focus(); }, []);
    useEscapeClose(close, expanded);
    useEffect(() => {
      if (!expanded) return;
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.current?.focus();
      return () => { document.body.style.overflow = previous; };
    }, [expanded]);
    const load = useCallback(async () => {
      const version = ++requestVersion.current;
      setLoading(true); setError(""); setNotice("");
      try {
        const result = await api(`/saas-analysis${status === "all" ? "" : `?status=${encodeURIComponent(status)}`}`);
        if (version === requestVersion.current) setData(result);
      } catch (e) { if (version === requestVersion.current) setError(e.message); }
      finally { if (version === requestVersion.current) setLoading(false); }
    }, [status]);
    useEffect(() => { let mounted = true; queueMicrotask(() => { if (mounted) load(); }); return () => { mounted = false; }; }, [load]);
    if (loading) return <section className="page"><p role="status">Cargando análisis de SaaS…</p></section>;
    if (error) return <section className="page"><p role="alert">{error}</p><button onClick={load}>Reintentar</button></section>;
    if (!data) return null;
    const rows = data.monthly.filter((r) => (!from || r.month >= from) && (!to || r.month <= to));
    const last = rows.at(-1), current = data.current;
    const base = current.mrr.ARS + (fx > 0 ? current.mrr.USD * fx : 0);
    const arpa = current.subscriptions ? base / current.subscriptions : price;
    function scenario(mode) {
      let mrr = base, customers = current.subscriptions, months = base >= goal ? 0 : null, sales = 0;
      const projection = {};
      for (let n = 1; n <= 120; n++) {
        const leaving = Math.min(customers, mode === "rate" ? customers * rate / 100 : loss);
        const average = customers ? mrr / customers : arpa;
        mrr = Math.max(0, mrr - leaving * average + adds * price);
        customers = Math.max(0, customers - leaving + adds); sales += adds;
        if (months == null && mrr >= goal) months = n;
        if ([3, 6, 12].includes(n)) projection[n] = Math.round(mrr);
        if (n === months) projection.sales_to_goal = sales;
      }
      return { mode, months, ...projection };
    }
    const scenarios = [scenario("fixed"), scenario("rate")];
    const { cancellations: _private, at_risk: _riskPrivate, ...aggregate } = data;
    const report = `INFORME SaaS — Catálogo Web\nUnidades monetarias originales por moneda. Estado actual seleccionado: ${STATES.find(([id]) => id === status)?.[1]}. Archivados excluidos. Corte: ${data.as_of}. Período: ${from || "inicio"} a ${to || data.as_of.slice(0, 7)}.\nPagos cobrados asignados por vencimiento; señas o sin vencimiento por fecha de pago, igual que Resumen.\nMRR histórico: sin datos suficientes. Historia de clientes: misma fuente que Resumen.\n${JSON.stringify({ ...aggregate, at_risk: _riskPrivate.map(({ name: _name, ...c }) => c), cancellations: _private.map(({ name: _name, ...c }) => c), cancellations_monthly: data.cancellations_monthly.filter((r) => (!from || r.month >= from) && (!to || r.month <= to)), monthly: rows, cohorts: data.cohorts.filter((c) => (!from || c.month >= from) && (!to || c.month <= to)), simulator: { goal_ARS: goal, price_ARS: price, monthly_adds: adds, monthly_losses: loss, alternative_churn_percent: rate, estimated_USD_ARS: fx || null, current_estimated_ARS: base, scenarios, warning: "Escenarios matemáticos, no predicciones. Sin cotización se excluye USD del total ARS; otras monedas no se convierten." } }, null, 2)}`;
    async function copy() {
      try { await navigator.clipboard.writeText(report); setNotice("Informe copiado, listo para pegar en ChatGPT."); } catch { setNotice("No se pudo copiar. Abrí el informe y seleccioná el texto para copiarlo manualmente."); }
    }
    const metric = (label, value, note) => <article className="saas-card" key={label}><small>{label}</small><strong>{value}</strong>{note && <small>{note}</small>}</article>;
    return <section className="page saas-page">
      <div className="page-intro"><div><h2>Análisis de SaaS</h2><p>Radiografía comercial y financiera · Corte {data.as_of} · Sólo lectura</p></div><div className="saas-actions"><button onClick={load}>Actualizar</button><button ref={opener} onClick={() => setExpanded(true)}>Ver informe en grande</button><button onClick={copy}>Copiar informe para análisis con IA</button></div></div>
      <p role="status">{notice}</p>
      <div className="saas-controls"><label>Estado actual<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Desde<input type="month" value={from} max={to || data.as_of.slice(0, 7)} onChange={(e) => setFrom(e.target.value)} /></label><label>Hasta<input type="month" value={to} min={from} max={data.as_of.slice(0, 7)} onChange={(e) => setTo(e.target.value)} /></label><label>Moneda<select value={unit} onChange={(e) => setUnit(e.target.value)}>{data.currencies.map((u) => <option key={u}>{u}</option>)}</select></label><button onClick={() => { setFrom(""); setTo(""); }}>Todo el historial</button></div>
      <p>Grupo seleccionado: <strong>{STATES.find(([id]) => id === status)?.[1]}</strong>. Se excluyen archivados. Los cobros e históricos corresponden únicamente a este grupo, elegido por su estado actual; no reconstruyen cambios de estado pasados.</p>
      <h3>Estados y tarifas registradas del grupo seleccionado</h3>
      <div className="saas-grid">{metric("Clientes seleccionados", num(data.selected_count))}{data.currencies.map((u) => metric(`Clientes en ${u}`, num(data.selected_counts[u]), `Tarifas registradas: ${money(data.selected_tariffs[u], u)} · no equivale a cobros ni a MRR`))}</div>
      <Table headers={["Estado real", "Clientes", ...data.currencies.map((u) => `Clientes ${u}`), ...data.currencies.map((u) => `Tarifas registradas ${u}`)]} rows={data.status_breakdown.map((s) => [stateLabel(s.status), s.count, ...data.currencies.map((u) => s.counts[u]), ...data.currencies.map((u) => money(s.recorded_tariffs[u], u))])} />
      <h3>Situación actual del grupo · independiente del filtro de meses</h3><div className="saas-grid">{metric("Activos + sin alta del grupo", num(current.active), "Criterio de Resumen aplicado sólo al grupo elegido")}{metric("Suscripciones activas para MRR", num(current.subscriptions))}{data.currencies.map((u) => metric(`MRR actual ${u}`, money(current.mrr[u], u), `${current.counts[u]} clientes · ARPA ${money(current.arpa[u], u)}`))}{metric("Cobrado histórico del grupo", money(data.collected_total[unit], unit))}</div>
      <h3>{last ? `${last.month}${last.partial ? " · En curso" : ""}` : "Sin meses en el período"} · movimientos y cobros registrados</h3>
      {last && <div className="saas-grid">{metric("Altas / bajas / neto", `${last.signups} / ${last.cancellations} / ${last.net}`)}{metric("MRR al cierre", money(last.mrr_end[unit], unit))}{metric("MRR cierre anterior / inicial", money(last.mrr_start[unit], unit))}{metric("Variación MRR / crecimiento neto", money(last.mrr_net[unit], unit), pct(last.mrr_change_percent[unit]))}{metric("MRR nuevo", money(last.mrr_new[unit], unit))}{metric("MRR perdido", money(last.mrr_lost[unit], unit))}{metric("Pagos cobrados del mes", money(last.collected[unit], unit), "Por vencimiento, igual que Resumen. Señas o sin vencimiento: fecha de pago.")}{metric("ARPA al cierre", money(last.arpa[unit], unit))}{metric("Churn clientes", pct(last.churn))}{metric("Churn ingresos", pct(last.revenue_churn[unit]))}{metric("Cambios de precio / NRR", "Sin datos suficientes")}</div>}
      <div className="saas-chart-grid"><Chart title={`MRR histórico (${unit})`} rows={rows} value={(r) => r.mrr_end[unit]} /><Chart title={`Cobros registrados (${unit})`} rows={rows} value={(r) => r.collected[unit]} /><Chart title="Clientes al cierre" rows={rows} value={(r) => r.active_end} /><Chart title="Altas" rows={rows} value={(r) => r.signups} /><Chart title="Bajas" rows={rows} value={(r) => r.cancellations} /><Chart title="Crecimiento neto" rows={rows} value={(r) => r.net} /></div>
      <h3>Cobros históricos reales del grupo por concepto · {unit}</h3><Table headers={["Concepto", "Cobrado registrado"]} rows={Object.entries(data.collected_by_type).map(([kind, amounts]) => [kind, money(amounts[unit], unit)])} />
      <h3>Historia mensual · {unit}</h3><Table headers={["Mes", "Inicio", "Altas", "Bajas", "Bajas nuevas", "Cierre", "MRR inicial ≈", "MRR nuevo ≈", "MRR perdido ≈", "MRR final ≈", "Cobrado real", "ARPA ≈", "Churn clientes ≈", "Churn ingresos ≈"]} rows={rows.map((r) => [r.month + (r.partial ? " · En curso" : ""), r.active_start, r.signups, r.cancellations, r.new_cancellations, r.active_end, ...[r.mrr_start, r.mrr_new, r.mrr_lost, r.mrr_end, r.collected, r.arpa].map((v) => money(v[unit], unit)), pct(r.churn), pct(r.revenue_churn[unit])])} />
      <h3>¿Cuándo se van mis clientes?</h3><p>Histórico del grupo seleccionado. Permanencia por aniversarios de alta, no por días divididos por 30.</p><div className="saas-grid">{metric("Bajas registradas", data.cancellation_count)}{metric("MRR perdido acumulado", money(data.cancellation_mrr[unit], unit), "Sin historial de tarifas al cancelar")}{metric("Permanencia media / mediana", `${num(data.duration_mean_days)} / ${num(data.duration_median_days)} días`, "Sólo cancelados con fechas válidas")}{metric("Motivos de baja", "Sin datos suficientes")}</div>
      <Table headers={["Antigüedad al cancelar", "Cantidad", "% de bajas con fechas válidas"]} rows={Object.entries(data.duration_distribution).map(([n, v]) => [n === "6" ? "Mes 6 o posterior" : `Mes ${n}`, v, pct(data.cancellations.length ? v / data.cancellations.length * 100 : null)])} />
      <details><summary>Ver clientes cancelados con fechas utilizables ({data.cancellations.length})</summary><Table headers={["Negocio", "Alta", "Baja", "Tarifa actual (no acredita pérdida histórica)"]} rows={data.cancellations.map((c) => [c.name, c.signup, c.cancelled, money(c.amount, c.currency)])} /></details>
      <div className="saas-grid">{[1, 2, 3].map((n) => metric(`Bajas antes de completar ${n} mes(es)`, data.early_cancellations[n], `${pct(data.cancellations.length ? data.early_cancellations[n] / data.cancellations.length * 100 : null)} de bajas con fechas válidas`))}{metric("Bajas con 3 meses cumplidos o más", data.consolidated_cancellations)}</div>
      <h3>Mensualidades pagadas antes de cancelar</h3><p>Cuenta registros de pagos mensuales con fecha de pago hasta la baja; no equivale a meses de permanencia ni garantiza períodos únicos.</p><Table headers={["Registros pagados", "Clientes cancelados"]} rows={Object.entries(data.paid_monthly_distribution).map(([n, count]) => [n === "5" ? "5 o más" : n, count])} />
      <h3>Bajas por mes calendario y antigüedad</h3><Table headers={["Mes", "Activos al inicio", "Altas", "Menos de 1 mes", "1 a 2 meses", "2 a 3 meses", "3 meses o más", "Bajas", "Neto", "Churn", "Tarifas ARS ≈", "Tarifas USD ≈"]} rows={data.cancellations_monthly.filter((r) => (!from || r.month >= from) && (!to || r.month <= to)).map((r) => [r.month, r.active_start, r.signups, ...r.age_counts, r.cancellations, r.net, pct(r.churn), money(r.reference_lost_mrr.ARS, "ARS"), money(r.reference_lost_mrr.USD, "USD")])} /><p>Tarifas ≈: referencia actual estimada, no MRR histórico exacto ni dinero que salió de caja. Las bajas sin fechas suficientes no se distribuyen por antigüedad.</p>
      {data.cancellations_monthly.filter((r) => r.client_ids.length && (!from || r.month >= from) && (!to || r.month <= to)).map((r) => <details key={r.month}><summary>Ver bajas de {r.month} ({r.client_ids.length})</summary><Table headers={["Cliente", "Alta", "Baja", "Días", "Meses completos", "Mes de vida", "Mensualidades pagadas", "Tarifa actual"]} rows={data.cancellations.filter((c) => r.client_ids.includes(c.id)).map((c) => [c.name, c.signup, c.cancelled, c.days, c.completed_months, c.life_month, c.paid_monthly_records, money(c.amount, c.currency)])} /></details>)}
      <h3>Tasa de abandono por etapa</h3><p>Clientes que completaron el intervalo o cancelaron dentro; se excluyen los recientes aún sin seguimiento suficiente.</p><Table headers={["Mes de vida", "Clientes observados", "Bajas", "Tasa de abandono"]} rows={data.hazards.map((r) => [r.life_month, r.eligible, r.cancellations, pct(r.rate)])} />
      <h3>Retención a 30, 60 y 90 días</h3><Table headers={["Días desde alta", "Retenidos / elegibles", "Retención"]} rows={data.day_retention.map((r) => [r.days, `${r.retained} / ${r.eligible}`, pct(r.rate)])} />
      <h3>Clientes en riesgo · estado real del CRM</h3><Table headers={["Cliente", "Estado", "Antigüedad en días", "Tarifa", "Último pago", "Próximo vencimiento", "Días desde vencimiento"]} rows={data.at_risk.map((c) => [c.name, "En riesgo", num(c.days), money(c.amount, c.currency), c.last_paid_at || "Sin fecha registrada", c.next_due || "Sin fecha registrada", num(c.overdue_days)])} /><p>El atraso indica días desde el próximo vencimiento registrado. No se inventa una probabilidad de baja. Los nombres se omiten del informe para IA.</p>
      <h3>Retención por mes de alta efectiva</h3><p>Mes 0: fecha de alta. Mes 1: primer aniversario mensual; mes 2: segundo, etc. Cada celda muestra retenidos / elegibles. Los meses futuros quedan vacíos; las cohortes recientes tienen observación parcial. No hay historial fiable de reactivaciones.</p>
      <div className="saas-table"><table><thead><tr><th>Cohorte</th><th>Clientes</th>{Array.from({ length: Math.max(1, ...data.cohorts.map((c) => c.retention.length)) }, (_, n) => <th key={n}>Mes {n}</th>)}</tr></thead><tbody>{data.cohorts.map((c) => <tr key={c.month}><td>{c.month}</td><td>{c.size}</td>{c.retention.map((r) => <td key={r.month} style={{ background: r.rate == null ? undefined : `rgba(31,150,100,${0.06 + r.rate / 400})` }}>{r.rate == null ? "No transcurrido" : `${pct(r.rate)} · ${r.retained}/${r.eligible}`}</td>)}</tr>)}</tbody></table>{!data.cohorts.length && <p>Sin datos suficientes: no hay altas efectivas utilizables.</p>}</div>
      <h3>Distribución de tarifas actuales · grupo seleccionado</h3><Table headers={["Moneda", "Tarifa", "Clientes"]} rows={data.tariffs.map((t) => [t.currency, money(t.amount, t.currency), t.count])} />
      <h3>Metas de crecimiento · escenarios en ARS</h3><p>Escenarios matemáticos, no predicciones. Las bajas descuentan el ingreso promedio de la base proyectada; las altas ingresan a la tarifa nueva.</p>
      <div className="saas-controls"><label>Meta rápida<select value={[1500000, 2000000, 3000000].includes(goal) ? goal : "custom"} onChange={(e) => e.target.value !== "custom" && setGoal(Number(e.target.value))}><option value="1500000">ARS 1.500.000</option><option value="2000000">ARS 2.000.000</option><option value="3000000">ARS 3.000.000</option><option value="custom">Personalizada</option></select></label>{[["Objetivo ARS", goal, setGoal], ["Precio cliente nuevo ARS", price, setPrice], ["Altas mensuales", adds, setAdds], ["Bajas mensuales fijas", loss, setLoss], ["Bajas alternativas %", rate, setRate], ["USD/ARS estimativo", fx, setFx]].map(([label, value, setter]) => <label key={label}>{label}<input type="number" min={0} max={label.includes("%") ? 100 : undefined} value={value} onChange={(e) => setter(Math.max(0, Math.min(label.includes("%") ? 100 : 1e12, Number(e.target.value) || 0)))} /></label>)}</div>
      <p>MRR base estimado: {money(base, "ARS")}. {fx > 0 ? "USD convertido sólo para este escenario." : "Sin cotización: USD excluido del escenario."} Otras monedas no se convierten. Clientes netos adicionales a tarifa nueva: {price > 0 ? num(Math.ceil(Math.max(0, goal - base) / price)) : "Sin precio válido"}.</p>
      <Table headers={["Escenario", "Meses hasta meta", "Ventas brutas hasta meta", "MRR 3 meses", "MRR 6 meses", "MRR 12 meses"]} rows={scenarios.map((s) => [s.mode === "fixed" ? "Bajas fijas" : "Tasa de bajas", s.months ?? "No alcanzada en 120 meses", s.months === 0 ? 0 : s.sales_to_goal ?? "—", ...[3, 6, 12].map((n) => money(s[n], "ARS"))])} />
      <article className="saas-panel"><h3>Calidad de datos</h3><ul>{data.quality.map((q) => <li key={q}>{q}</li>)}</ul></article>
      {expanded && <div className="saas-report-layer" onClick={close}><div ref={dialog} className="saas-report-modal" role="dialog" aria-modal="true" aria-labelledby="saas-report-title" tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Tab") { const nodes = [...dialog.current.querySelectorAll("button, textarea")]; const first = nodes[0], lastNode = nodes.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); lastNode.focus(); } else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); first.focus(); } } }}><div className="saas-actions"><h2 id="saas-report-title">Informe para ChatGPT</h2><button onClick={copy}>Copiar informe</button><button onClick={close}>Cerrar</button></div><p role="status">{notice}</p><p>Sin nombres ni datos personales. Incluye agregados, historial filtrado, cohortes, escenarios y limitaciones.</p><textarea aria-label="Informe completo para copiar" readOnly value={report} /></div></div>}
    </section>;
  }
  return { SaasAnalysis };
}
