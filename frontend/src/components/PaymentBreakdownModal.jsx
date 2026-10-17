import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { filterPaymentBreakdown, paymentBreakdown, splitOutstandingPayments } from "../app/paymentBreakdown";
import "../payment-breakdown.css";

const concepts = { monthly: "Mensualidad", deposit: "Seña", extra_work: "Trabajo extra", domain: "Dominio", discount: "Descuento", other: "Otro", monthly_forecast: "Mensualidad prevista" };
const statuses = { paid: "Pagado", pending: "Pendiente", partial: "Parcial", overdue: "Vencido" };
const money = (amount, currency) => `${currency} ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

export default function PaymentBreakdownModal({ title, period, currency, items, total, fmtDate, onClose, onOpenClient, forecast = false, api, month = "all", paymentType = "all" }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [concept, setConcept] = useState("all");
  const [outstandingDetail, setOutstandingDetail] = useState(null);
  const [pendingState, setPendingState] = useState({ loading: true, error: "", items: [] });
  useEffect(() => {
    if (forecast) return undefined;
    let active = true;
    api(`/payments/pending-details?month=${encodeURIComponent(month)}&payment_type=${encodeURIComponent(paymentType)}`)
      .then((rows) => { if (active) setPendingState({ loading: false, error: "", items: rows }); })
      .catch((error) => { if (active) setPendingState({ loading: false, error: error.message || "No se pudieron cargar los pagos faltantes.", items: [] }); });
    return () => { active = false; };
  }, [api, month, paymentType, forecast]);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const detail = paymentBreakdown(items, currency);
  const pending = paymentBreakdown(filterPaymentBreakdown(pendingState.items, concept, query), currency);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const outstandingGroups = splitOutstandingPayments(pending.rows, todayKey);
  const outstandingLabels = { pending: "Pagos pendientes", overdue: "Pagos vencidos" };
  const selectedOutstanding = outstandingDetail ? paymentBreakdown(outstandingGroups[outstandingDetail], currency) : null;
  const search = query.trim().toLocaleLowerCase("es");
  const visible = filterPaymentBreakdown(detail.rows, concept, query);
  const conceptKeys = forecast ? ["monthly_forecast"] : [...new Set(["monthly", "deposit", "extra_work", ...detail.rows.map((item) => item.payment_type || "other"), ...pendingState.items.map((item) => item.payment_type || "other")])];
  const filtered = paymentBreakdown(visible, currency);
  const differentTotal = Math.abs(Number(total) - detail.total) > 0.005;
  const source = forecast ? "mensualidades previstas" : "pagos";
  return <dialog ref={dialog} className="payment-breakdown-modal" aria-labelledby={titleId} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
    <div className="modal-head"><div><span className="eyebrow">{period} · {currency}</span><h2 id={titleId}>{title}</h2></div><button type="button" className="icon-btn" aria-label="Cerrar detalle de pagos" onClick={() => dialog.current.close()}><X /></button></div>
    <div className="payment-breakdown-body">
      <div className="payment-breakdown-stats"><div><small>Total de la tarjeta</small><strong>{money(total, currency)}</strong></div><div><small>{forecast ? "Mensualidades previstas" : "Cantidad de pagos"}</small><strong>{detail.paymentCount}</strong></div><div><small>Clientes distintos</small><strong>{detail.clientCount}</strong></div></div>
      <p className="payment-breakdown-note">Orden alfabético por cliente. Si un cliente tiene varios registros, aparece una fila por cada uno y se cuenta una sola vez entre los clientes.</p>
      {differentTotal && <p className="payment-breakdown-difference" role="status">La suma del detalle es {money(detail.total, currency)}. Diferencia con la tarjeta: {money(Number(total) - detail.total, currency)}.</p>}
      <label className="payment-breakdown-concept-filter">Concepto<select value={concept} onChange={(event) => setConcept(event.target.value)}><option value="all">Todos los conceptos</option>{conceptKeys.map((key) => <option key={key} value={key}>{concepts[key] || key}</option>)}</select></label>
      <div className="payment-breakdown-concepts" aria-label="Desglose del total por concepto">{conceptKeys.map((key) => {
        const group = paymentBreakdown(filterPaymentBreakdown(detail.rows, key), currency);
        return <button type="button" key={key} data-concept={key} className={concept === key ? "selected" : ""} aria-pressed={concept === key} onClick={() => setConcept(concept === key ? "all" : key)}><span>{concepts[key] || key}</span><strong>{money(group.total, currency)}</strong><small>{group.paymentCount} {source} · {group.clientCount} clientes</small></button>;
      })}{!forecast && ["pending", "overdue"].map((status) => {
        const group = paymentBreakdown(outstandingGroups[status], currency);
        return <button type="button" key={status} data-concept={status} className={outstandingDetail === status ? "selected" : ""} aria-pressed={outstandingDetail === status} disabled={pendingState.loading || Boolean(pendingState.error)} onClick={() => setOutstandingDetail(outstandingDetail === status ? null : status)}><span>{outstandingLabels[status]}</span><strong>{pendingState.loading ? "Cargando…" : pendingState.error ? "Sin datos disponibles" : money(group.total, currency)}</strong><small>{!pendingState.loading && !pendingState.error ? `${group.paymentCount} pagos · ${group.clientCount} clientes · Ver detalle` : "Pagos registrados del período"}</small></button>;
      })}</div>
      {!forecast && <p className="payment-breakdown-note">Las cajas de pendientes y vencidos respetan el concepto y la búsqueda. Se cuentan por separado y no se suman al total cobrado. Los parciales se muestran por su importe registrado.</p>}
      {selectedOutstanding && <section className="payment-breakdown-status-detail" aria-label={outstandingLabels[outstandingDetail]}>
        <header><h3>{outstandingLabels[outstandingDetail]} · {selectedOutstanding.paymentCount} pagos · {money(selectedOutstanding.total, currency)}</h3><button type="button" className="secondary small" onClick={() => setOutstandingDetail(null)}>Ocultar</button></header>
        <ul>{selectedOutstanding.rows.map((item) => <li key={item.id}><div><strong>{item.client_name}</strong><small>Pago #{item.id} · {concepts[item.payment_type] || item.payment_type} · Vencimiento: {fmtDate(item.display_date || item.due_date) || "Sin fecha"}</small></div><strong>{money(item.amount, currency)}</strong></li>)}</ul>
        {!selectedOutstanding.paymentCount && <p className="payment-breakdown-note">No hay pagos que coincidan con estos filtros.</p>}
      </section>}
      <label className="payment-breakdown-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o negocio" aria-label="Buscar en el detalle de pagos" /></label>
      <p className="payment-breakdown-note" aria-live="polite">Mostrando {filtered.paymentCount} {source} de {filtered.clientCount} clientes · Subtotal: {money(filtered.total, currency)}. El total general de arriba no cambia.</p>
      <div className="payment-breakdown-scroll"><table><thead><tr><th>Cliente / negocio</th><th>Pago y concepto</th><th>Mes correspondiente</th><th>Cobrado el</th><th>Estado</th><th>Importe</th></tr></thead><tbody>{visible.map((item) => <tr key={item.payment_id ?? item.id}><td>{onOpenClient && item.client_id != null ? <button type="button" className="payment-breakdown-client" onClick={() => { onClose(); onOpenClient(item.client_id); }}>{item.client_name}</button> : <strong>{item.client_name || "Sin nombre"}</strong>}<small>{item.business_name || ""}</small></td><td><strong className="payment-concept-label" data-concept={item.payment_type}>{concepts[item.payment_type] || item.payment_type || "Pago"}</strong><small>{forecast ? "Proyección" : `Pago #${item.payment_id ?? item.id}`}</small>{item.notes || item.description ? <small>{item.notes || item.description}</small> : null}</td><td>{fmtDate(item.display_date || item.calendar_date || item.due_date) || "Sin fecha"}</td><td>{item.paid_at ? fmtDate(item.paid_at.slice(0, 10)) : "—"}</td><td>{forecast ? "Previsto" : statuses[item.status] || item.status || "—"}</td><td>{money(item.amount, currency)}</td></tr>)}</tbody></table></div>
      {!visible.length && <p className="payment-breakdown-empty">{search || concept !== "all" ? "No hay pagos que coincidan con el concepto y la búsqueda." : `No hay ${source} en esta moneda para el período seleccionado.`}</p>}
      {!forecast && <section className="payment-breakdown-pending" aria-label="Pagos faltantes del período">
        <h3>Pagos faltantes · {period}{concept !== "all" ? ` · ${concepts[concept] || concept}` : ""}</h3>
        {pendingState.loading ? <p role="status">Cargando pagos faltantes…</p> : pendingState.error ? <p role="alert">{pendingState.error}</p> : <>
          <div className="payment-breakdown-pending-totals"><div><small>Pagos faltantes</small><strong>{pending.paymentCount}</strong></div><div><small>Clientes con pagos faltantes</small><strong>{pending.clientCount}</strong></div><div><small>Importe registrado pendiente</small><strong>{money(pending.total, currency)}</strong></div></div>
          <p className="payment-breakdown-note">Respeta el filtro de concepto y la búsqueda. Solo pagos guardados como pendientes, vencidos o parciales para este período y moneda, de clientes no cancelados ni archivados. No incluye proyecciones. Los parciales se suman por su importe registrado. Estos datos no cambian el total cobrado de arriba.</p>
          {pending.paymentCount > 0 && <details><summary>Ver los {pending.paymentCount} pagos faltantes en orden alfabético</summary><ul>{pending.rows.map((item) => <li key={item.id}><div><strong>{item.client_name}</strong><small>Pago #{item.id} · {concepts[item.payment_type] || item.payment_type} · {fmtDate(item.display_date || item.due_date) || "Sin fecha"} · {statuses[item.status]}</small></div><strong>{money(item.amount, currency)}</strong></li>)}</ul></details>}
        </>}
      </section>}
      <div className="payment-breakdown-footer"><span>{detail.paymentCount} {source} · {detail.clientCount} clientes · Suma del detalle: <strong>{money(detail.total, currency)}</strong></span><button type="button" className="secondary" onClick={() => dialog.current.close()}>Cerrar</button></div>
    </div>
  </dialog>;
}
