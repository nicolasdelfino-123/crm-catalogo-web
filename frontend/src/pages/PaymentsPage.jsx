import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, ArrowUpDown, Edit3, Check, RotateCcw, Trash2 } from "lucide-react";

export function createPaymentsPage(dependencies) {
  const { api, LABEL, fmtDate, fmtMoney, badge, useEscapeClose, IconButton, ClientForm, DetailModal, PaymentEditor } = dependencies;

  function Payments() {
    const [items, setItems] = useState([]);
    const [forecast, setForecast] = useState({ items: [], totals: {} });
    const [editing, setEditing] = useState(null);
    const [summaryDetail, setSummaryDetail] = useState(null);
    const [summaryClientQuery, setSummaryClientQuery] = useState("");
    const [forecastStatusFilter, setForecastStatusFilter] = useState("active");
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientForm, setClientForm] = useState(null);
    const [clientQuery, setClientQuery] = useState("");
    const [clientNameOrder, setClientNameOrder] = useState("asc");
    const [dueDateOrder, setDueDateOrder] = useState(null);
    const [statusOrder, setStatusOrder] = useState(null);
    useEscapeClose(() => {
      if (editing) setEditing(null);
      else setSummaryDetail(null);
    }, Boolean(editing || summaryDetail));
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
        .filter((payment) => payment.status === "paid" && payment.payment_type === "extra_work")
        .reduce((result, payment) => ({
          ...result,
          [payment.currency]: (result[payment.currency] || 0) + payment.amount,
        }), {}),
      [items],
    );
    const depositPaidTotals = useMemo(
      () => items
        .filter((payment) => payment.status === "paid" && payment.payment_type === "deposit")
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
    const summaryVisibleItems = useMemo(() => {
      if (!summaryDetail || summaryDetail.kind !== "forecast") {
        return summaryDetail?.items || [];
      }
      const statusItems = summaryDetail.items.filter((client) =>
        forecastStatusFilter === "active_no_signup"
          ? ["active", "at_risk", "no_signup"].includes(client.status)
          : ["active", "at_risk"].includes(client.status),
      );
      if (!summaryClientQuery.trim()) return statusItems;
      const query = summaryClientQuery.trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es");
      return statusItems.filter((client) =>
        `${client.name} ${client.business_name || ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("es")
          .includes(query),
      );
    }, [summaryDetail, summaryClientQuery, forecastStatusFilter]);
    const summaryForecastTotal = useMemo(() => {
      if (!summaryDetail || summaryDetail.kind !== "forecast") return 0;
      return summaryDetail.items
        .filter((client) =>
          forecastStatusFilter === "active_no_signup"
            ? ["active", "at_risk", "no_signup"].includes(client.status)
            : ["active", "at_risk"].includes(client.status),
        )
        .reduce((total, client) => total + Number(client.amount || 0), 0);
    }, [summaryDetail, forecastStatusFilter]);
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
      setSummaryClientQuery("");
      setSummaryDetail({ title, items: items.filter(predicate), kind: "payments" });
    }
    function showForecast(currency) {
      setSummaryClientQuery("");
      setForecastStatusFilter("active");
      setSummaryDetail({
        title: `Mensualidad a cobrar por mes · ${currency}`,
        items: forecast.items.filter((client) => client.currency === currency),
        kind: "forecast",
        currency,
        total: forecast.totals[currency] || 0,
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
            <button type="button" className="payment-summary-trigger" key={`deposit-paid-${currency}`} onClick={() => showSummary(`Señas pagadas · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid" && payment.payment_type === "deposit")}>
              <small>Pagos Señas · {currency}</small>
              <strong>{fmtMoney(depositPaidTotals[currency] || 0, currency)}</strong>
            </button>
          ))}
          {paymentCurrencies.map((currency) => (
            <button type="button" className="payment-summary-trigger" key={`extra-work-paid-${currency}`} onClick={() => showSummary(`Trabajos extra pagados · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid" && payment.payment_type === "extra_work")}>
              <small>Pagos Trabajos extra · {currency}</small>
              <strong>{fmtMoney(extraWorkPaidTotals[currency] || 0, currency)}</strong>
            </button>
          ))}
          {paymentCurrencies.map((currency) => (
            <button type="button" className="payment-summary-trigger" key={`total-paid-${currency}`} onClick={() => showSummary(`Todos los pagos completados · ${currency}`, (payment) => payment.currency === currency && payment.status === "paid")}>
              <small>Pagos Totales · {currency}</small>
              <strong>{fmtMoney(
                paidTotals[currency] || 0,
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
                <tr
                  key={p.id}
                  className="clickable-payment-row"
                  tabIndex={0}
                  role="button"
                  onClick={() => openClientPayments(p.client_id)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      openClientPayments(p.client_id);
                    }
                  }}
                >
                  <td>
                    <strong>{p.client_name}</strong>
                  </td>
                  <td>
                    <strong>{fmtMoney(p.amount, p.currency)}</strong>
                  </td>
                  <td>{LABEL[p.payment_type] || p.payment_type}</td>
                  <td>{fmtDate(p.due_date)}</td>
                  <td>{badge(p.status)}</td>
                  <td className="payment-actions" onClick={(event) => event.stopPropagation()}>
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
              <div className="modal-head"><div><span className="eyebrow">Desglose del total</span><h2>{summaryDetail.title}{summaryDetail.kind === "forecast" && ` · Total ${fmtMoney(summaryForecastTotal, summaryDetail.currency)}`}</h2></div><IconButton label="Cerrar" onClick={() => setSummaryDetail(null)}><X /></IconButton></div>
              {summaryDetail.kind === "forecast" && (
                <div className="toolbar">
                  <label className="dashboard-status-filter">
                    Estado
                    <select
                      value={forecastStatusFilter}
                      onChange={(event) => setForecastStatusFilter(event.target.value)}
                    >
                      <option value="active">Activos</option>
                      <option value="active_no_signup">Activos y sin alta</option>
                    </select>
                  </label>
                  <label className="search">
                    <Search />
                    <input
                      value={summaryClientQuery}
                      onChange={(event) => setSummaryClientQuery(event.target.value)}
                      placeholder="Buscar por cliente o negocio"
                      autoFocus
                    />
                  </label>
                  {summaryClientQuery && (
                    <button type="button" className="text-btn" onClick={() => setSummaryClientQuery("")}>
                      <X size={15} />
                      Limpiar
                    </button>
                  )}
                </div>
              )}
              <div className="summary-payment-count">
                {summaryVisibleItems.length}{" "}
                {summaryDetail.kind === "forecast"
                  ? summaryVisibleItems.length === 1 ? "cliente incluido" : "clientes incluidos"
                  : summaryVisibleItems.length === 1 ? "pago incluido" : "pagos incluidos"}
                {summaryDetail.kind === "forecast" && summaryClientQuery && ` de ${summaryDetail.items.length}`}
              </div>
              {summaryDetail.items.length && summaryDetail.kind === "payments" ? (
                <div className="table-wrap summary-payments-table"><table><thead><tr><th>Cliente</th><th>Importe</th><th>Concepto</th><th>Vencimiento</th><th>Fecha de pago</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{summaryDetail.items.map((payment) => <tr key={payment.id} className="clickable-payment-row" tabIndex={0} role="button" onClick={() => openClientPayments(payment.client_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClientPayments(payment.client_id); } }}><td><button type="button" className="client-link" onClick={(event) => { event.stopPropagation(); openClientPayments(payment.client_id); }}>{payment.client_name}</button></td><td><strong>{fmtMoney(payment.amount, payment.currency)}</strong></td><td>{LABEL[payment.payment_type] || payment.payment_type}</td><td>{fmtDate(payment.due_date)}</td><td>{payment.paid_at ? fmtDate(payment.paid_at) : "Todavía no pagado"}</td><td>{badge(payment.status)}</td><td>{payment.status !== "paid" ? <button className="text-btn complete" onClick={(event) => { event.stopPropagation(); setPaymentStatus(payment.id, "paid"); }}><Check size={16} />Marcar pagado</button> : <span>Pagado</span>}</td></tr>)}</tbody></table></div>
              ) : summaryVisibleItems.length ? (
                <div className="table-wrap summary-payments-table forecast-detail-table"><table><thead><tr><th>Cliente</th><th>Negocio</th><th>Estado</th><th>Mensualidad</th></tr></thead><tbody>{summaryVisibleItems.map((client) => <tr key={client.id} className="clickable-payment-row" tabIndex={0} role="button" onClick={() => openClientPayments(client.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClientPayments(client.id); } }}><td><button type="button" className="client-link" onClick={(event) => { event.stopPropagation(); openClientPayments(client.id); }}>{client.name}</button></td><td>{client.business_name}</td><td>{badge(client.status)}</td><td><strong>{client.amount > 0 ? fmtMoney(client.amount, client.currency) : "Sin monto configurado"}</strong></td></tr>)}</tbody></table></div>
              ) : <div className="summary-payment-empty">{summaryClientQuery ? "No se encontraron clientes." : "Este total no contiene registros."}</div>}
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

  return { Payments };
}
