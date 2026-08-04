import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, CalendarDays, WalletCards, ReceiptText, Plus, Search, Download, X, ChevronLeft, ChevronRight, AlertTriangle, Check, Clock3, ArrowUpDown, TrendingUp, Timer, List } from "lucide-react";

export function createDashboardPage(dependencies) {
  const { api, downloadApiFile, LABEL, fmtDate, fmtMonth, monthKey, nextMonthKey, fmtMoney, dateKey, fromDateKey, addDays, startOfWeek, clientBillingDateInMonth, badge, useEscapeClose, IconButton, Loading, Empty, ClientForm, DetailModal, AgendaNewAction, AgendaActionEditor } = dependencies;

  function Dashboard({ goClients }) {
    const currentMonth = monthKey();
    const nextMonth = nextMonthKey();
    const [data, setData] = useState(null);
    const [showNewAction, setShowNewAction] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [incomeMonth, setIncomeMonth] = useState(currentMonth);
    const [incomeType, setIncomeType] = useState("all");
    const [incomeTotals, setIncomeTotals] = useState({ ARS: 0, USD: 0 });
    const [incomeItems, setIncomeItems] = useState([]);
    const [expandedIncomeCurrency, setExpandedIncomeCurrency] = useState(null);
    const [incomeClientSearch, setIncomeClientSearch] = useState("");
    const [selectedIncomeClient, setSelectedIncomeClient] = useState(null);
    const [incomeClientForm, setIncomeClientForm] = useState(null);
    const [incomeMonths, setIncomeMonths] = useState([]);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [showTrafficLights, setShowTrafficLights] = useState(false);
    const [selectedTrafficClient, setSelectedTrafficClient] = useState(null);
    const [trafficClientForm, setTrafficClientForm] = useState(null);
    const loadDashboard = useCallback(() => api("/dashboard/summary").then(setData), []);
    useEffect(() => {
      loadDashboard();
      window.addEventListener("crm-dashboard-refresh", loadDashboard);
      return () => window.removeEventListener("crm-dashboard-refresh", loadDashboard);
    }, [loadDashboard]);
    useEffect(() => {
      let active = true;
      api(`/dashboard/income?month=${incomeMonth}&payment_type=${incomeType}`)
        .then((result) => {
          if (active) {
            setIncomeTotals(result.totals);
            setIncomeItems(result.items || []);
            setIncomeMonths(result.available_months || []);
            setExpandedIncomeCurrency(null);
            setIncomeClientSearch("");
          }
        })
        .finally(() => {
          if (active) setIncomeLoading(false);
        });
      return () => { active = false; };
    }, [incomeMonth, incomeType]);
    if (!data) return <Loading />;
    const incomeCurrencyItems = expandedIncomeCurrency
      ? incomeItems.filter((item) => item.currency === expandedIncomeCurrency)
      : [];
    const filteredIncomeItems = incomeCurrencyItems.filter((item) =>
      item.client_name.toLocaleLowerCase("es").includes(incomeClientSearch.trim().toLocaleLowerCase("es"))
    );
    const currentYear = currentMonth.slice(0, 4);
    const selectableIncomeMonths = [...new Set([
      ...Array.from(
        { length: 12 },
        (_, index) => `${currentYear}-${String(index + 1).padStart(2, "0")}`,
      ),
      ...incomeMonths,
    ])].sort((first, second) => second.localeCompare(first));
    const cards = [
      ["active_clients", "Clientes activos", data.active_clients, Users, "green"],
      ["active_client_days", "Días activos de clientes", `${data.active_client_days_average} días prom.`, Timer, "violet"],
      ["at_risk_clients", "Necesitan atención", data.at_risk_clients, AlertTriangle, "amber"],
      ["pending_actions", "Acciones pendientes", data.pending_actions, Clock3, "blue"],
      ["overdue_actions", "Acciones vencidas", data.overdue_actions, AlertTriangle, "red"],
      ["urgent_actions", "Acciones urgentes", data.urgent_actions, AlertTriangle, "red"],
      ["pending_payments", "Pagos pendientes", data.pending_payments, WalletCards, "amber"],
      ["renewals_week", "Renuevan esta semana", data.renewals_week, CalendarDays, "violet"],
      ["new_clients_month", "Altas del mes", data.new_clients_month, TrendingUp, "green"],
      ["sold_clients_month", "Ventas del mes", data.sold_clients_month, ReceiptText, "amber"],
    ];
    return (
      <section className="page">
        <div className="page-intro">
          <div>
            <h2>Lo importante, a primera vista</h2>
            <p>Estado comercial y tareas que requieren movimiento.</p>
          </div>
          <div className="intro-actions">
            <button className="primary" onClick={() => setShowNewAction(true)}>
              <Plus size={18} />
              Agregar acción
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => downloadApiFile("/exports/business-master.xlsx", "maestro-negocio-crm.xlsx")
                .catch((error) => window.alert(error.message))}
            >
              <Download size={17} />
              Exportar Excel maestro
            </button>
            <button className="primary" onClick={() => goClients()}>
              <Users size={18} />
              Ver clientes
            </button>
          </div>
        </div>
        <div className="metrics-grid">
          <button type="button" className="metric metric-button traffic-summary-card" onClick={() => setShowTrafficLights(true)} aria-label="Abrir resumen de semáforos">
            <span className="traffic-summary-icon"><List size={20} /></span>
            <div><small>Semáforo</small><strong className="traffic-summary-counts">
              <span><i className="traffic-dot red" />{data.traffic_lights?.red || 0}</span>
              <span><i className="traffic-dot yellow" />{data.traffic_lights?.yellow || 0}</span>
              <span><i className="traffic-dot green" />{data.traffic_lights?.green || 0}</span>
            </strong></div>
          </button>
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
          <div className="dashboard-income-copy">
            <span className="eyebrow">
              {incomeType === "monthly_forecast"
                ? `A cobrar en ${fmtMonth(incomeMonth)}`
                : incomeMonth === "all"
                  ? "Cobrado en todos los meses"
                  : `Cobrado en ${fmtMonth(incomeMonth)}`}
            </span>
            <h3>Ingresos separados por moneda</h3>
            <p>
              {incomeType === "monthly_forecast"
                ? "Mensualidades previstas de clientes activos, en riesgo y sin alta."
                : incomeType === "monthly"
                  ? "Mensualidades y señas cobradas durante el mes seleccionado."
                  : incomeType === "extra_work"
                    ? "Solo trabajos extra cobrados."
                    : "Todos los pagos cobrados, incluidas mensualidades, señas y extras."}
            </p>
          </div>
          <div className="dashboard-income-controls">
            <label>
              Mes
              <select
                value={incomeMonth}
                onChange={(event) => {
                  setIncomeLoading(true);
                  const selectedMonth = event.target.value;
                  setIncomeMonth(selectedMonth);
                  setIncomeType((currentType) =>
                    selectedMonth === nextMonth
                      ? "monthly_forecast"
                      : currentType === "monthly_forecast" ? "all" : currentType
                  );
                }}
              >
                <option value="all">Todos los meses</option>
                <option value={nextMonth}>
                  {fmtMonth(nextMonth)} · a cobrar
                </option>
                {selectableIncomeMonths.filter((month) => month !== nextMonth).map((month) => (
                  <option value={month} key={month}>{fmtMonth(month)}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo de ingreso
              <select
                value={incomeType}
                onChange={(event) => {
                  setIncomeLoading(true);
                  const selectedType = event.target.value;
                  setIncomeType(selectedType);
                  if (selectedType === "monthly_forecast") setIncomeMonth(nextMonth);
                }}
              >
                <option value="all">Total: mensualidades + extras</option>
                <option value="monthly">Mensualidades + señas cobradas</option>
                <option value="extra_work">Solo trabajos extra</option>
                <option value="monthly_forecast">Mensualidades del mes siguiente</option>
              </select>
            </label>
          </div>
          <div className={`money-list ${incomeLoading ? "loading-totals" : ""}`}>
            {["ARS", "USD"].map((currency) => (
              <button
                type="button"
                className={expandedIncomeCurrency === currency ? "income-total-card active" : "income-total-card"}
                key={currency}
                onClick={() => {
                  setExpandedIncomeCurrency((current) => current === currency ? null : currency);
                  setIncomeClientSearch("");
                }}
                aria-expanded={expandedIncomeCurrency === currency}
              >
                <small>{currency === "ARS" ? "Pesos" : "Dólares"}</small>
                <strong>{fmtMoney(incomeTotals[currency] || 0, currency)}</strong>
                <span>{expandedIncomeCurrency === currency ? "Ocultar detalle" : "Ver detalle"}</span>
              </button>
            ))}
          </div>
          {expandedIncomeCurrency && (
            <div className="income-breakdown">
              <div className="income-breakdown-head">
                <strong>Detalle en {expandedIncomeCurrency === "ARS" ? "pesos" : "dólares"}</strong>
                <span>
                  {incomeClientSearch
                    ? `${filteredIncomeItems.length} de ${incomeCurrencyItems.length}`
                    : incomeCurrencyItems.length} movimientos
                </span>
              </div>
              <label className="income-breakdown-search">
                <Search size={16} />
                <input
                  type="search"
                  aria-label="Buscar cliente"
                  value={incomeClientSearch}
                  onChange={(event) => setIncomeClientSearch(event.target.value)}
                  placeholder="Buscar por nombre de cliente…"
                  autoFocus
                />
              </label>
              {filteredIncomeItems.map((item) => (
                <button
                  type="button"
                  className="income-breakdown-row"
                  key={item.id}
                  onClick={() => setSelectedIncomeClient(item.client_id)}
                  aria-label={`Abrir ficha de ${item.client_name}`}
                >
                  <div>
                    <strong>{item.notes || LABEL[item.payment_type] || "Ingreso"}</strong>
                    <span>{item.client_name}{item.business_name ? ` · ${item.business_name}` : ""}</span>
                  </div>
                  <time>{fmtDate(item.display_date || item.due_date)}</time>
                  <strong>{fmtMoney(item.amount, item.currency)}</strong>
                </button>
              ))}
              {!filteredIncomeItems.length && (
                <p className="income-breakdown-empty">
                  {incomeCurrencyItems.length
                    ? "No se encontraron clientes con ese nombre."
                    : "No hay ingresos para detallar en esta moneda."}
                </p>
              )}
            </div>
          )}
        </div>
        {selectedMetric && (
          <DashboardMetricModal
            title={selectedMetric.label}
            metricKey={selectedMetric.key}
            items={data.details?.[selectedMetric.key] || []}
            onRefresh={loadDashboard}
            onClose={() => setSelectedMetric(null)}
          />
        )}
        {showTrafficLights && <TrafficLightModal items={data.details?.traffic_lights || []} onClose={() => setShowTrafficLights(false)} onClient={(clientId) => { setShowTrafficLights(false); setSelectedTrafficClient(clientId); }} onRefresh={loadDashboard} />}
        {selectedTrafficClient && <DetailModal clientId={selectedTrafficClient} onClose={() => setSelectedTrafficClient(null)} onRefresh={loadDashboard} onEdit={(client) => { setSelectedTrafficClient(null); setTrafficClientForm(client); }} />}
        {trafficClientForm && <ClientForm client={trafficClientForm} onClose={() => setTrafficClientForm(null)} onSaved={() => { setTrafficClientForm(null); loadDashboard(); }} />}
        {selectedIncomeClient && (
          <DetailModal
            clientId={selectedIncomeClient}
            onClose={() => setSelectedIncomeClient(null)}
            onRefresh={() => { }}
            onEdit={(client) => {
              setSelectedIncomeClient(null);
              setIncomeClientForm(client);
            }}
            initialTab="payments"
          />
        )}
        {incomeClientForm && (
          <ClientForm
            client={incomeClientForm}
            onClose={() => setIncomeClientForm(null)}
            onSaved={() => setIncomeClientForm(null)}
          />
        )}
        {showNewAction && (
          <AgendaNewAction
            undated={false}
            onClose={() => setShowNewAction(false)}
            onSaved={() => {
              setShowNewAction(false);
              loadDashboard();
            }}
          />
        )}
      </section>
    );
  }

  function TrafficLightModal({ items, onClose, onClient, onRefresh }) {
    const [query, setQuery] = useState("");
    const [order, setOrder] = useState("green_first");
    const [colorFilter, setColorFilter] = useState("all");
    const [clients, setClients] = useState(items);
    const [updating, setUpdating] = useState(new Set());
    useEscapeClose(onClose);
    const colorRank = order === "green_first" ? { green: 1, yellow: 2, red: 3 } : { red: 1, yellow: 2, green: 3 };
    const visibleClients = clients.filter((client) => {
      const matchesQuery = `${client.name} ${client.business_name || ""}`
        .toLocaleLowerCase("es")
        .includes(query.trim().toLocaleLowerCase("es"));
      const matchesColor = colorFilter === "all" || (client.traffic_light || "red") === colorFilter;
      return matchesQuery && matchesColor;
    }).sort((first, second) => {
      const difference = colorRank[first.traffic_light || "red"] - colorRank[second.traffic_light || "red"];
      return difference || first.name.localeCompare(second.name, "es");
    });
    async function cycleTrafficLight(event, client) {
      event.stopPropagation();
      if (updating.has(client.id)) return;
      const colors = ["red", "yellow", "green"];
      const current = client.traffic_light || "red";
      const next = colors[(colors.indexOf(current) + 1) % colors.length];
      setUpdating((ids) => new Set(ids).add(client.id));
      setClients((all) => all.map((item) => item.id === client.id ? { ...item, traffic_light: next } : item));
      try {
        await api(`/clients/${client.id}`, { method: "PATCH", body: JSON.stringify({ traffic_light: next }) });
        await onRefresh();
      } catch (error) {
        setClients((all) => all.map((item) => item.id === client.id ? { ...item, traffic_light: current } : item));
        window.alert(error.message);
      } finally {
        setUpdating((ids) => { const nextIds = new Set(ids); nextIds.delete(client.id); return nextIds; });
      }
    }
    return <div className="modal-layer"><section className="dashboard-metric-modal traffic-modal" role="dialog" aria-modal="true" aria-labelledby="traffic-modal-title">
      <div className="modal-head"><div><span className="eyebrow">Resumen por color</span><h2 id="traffic-modal-title">Semáforo de clientes</h2></div><IconButton label="Cerrar" onClick={onClose}><X /></IconButton></div>
      <div className="traffic-modal-toolbar">
        <label className="search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o negocio…" autoFocus /></label>
        <label className="filter"><ArrowUpDown size={17} /><select value={order} onChange={(event) => setOrder(event.target.value)}><option value="green_first">Verde → amarillo → rojo</option><option value="red_first">Rojo → amarillo → verde</option></select></label>
      </div>
      <div className="traffic-color-filter-row">
        <label className="dashboard-status-filter">
          Color
          <select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
            <option value="all">Todos los colores</option>
            <option value="green">Solo verdes</option>
            <option value="yellow">Solo amarillos</option>
            <option value="red">Solo rojos</option>
          </select>
        </label>
        <span className="traffic-client-count">
          {visibleClients.length} {visibleClients.length === 1 ? "cliente" : "clientes"} en página
        </span>
      </div>
      <div className="traffic-client-list">{visibleClients.map((client) => <article key={client.id} tabIndex={0} role="button" onClick={() => onClient(client.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClient(client.id); } }}>
        <button type="button" className={`traffic-light ${client.traffic_light || "red"}`} aria-label={`Cambiar semáforo de ${client.name}`} title="Cambiar color" disabled={updating.has(client.id)} onClick={(event) => cycleTrafficLight(event, client)} />
        <div><strong>{client.name}</strong><span>{client.business_name}</span></div><ChevronRight size={18} />
      </article>)}{!visibleClients.length && <div className="empty"><Search size={28} /><h3>No se encontraron clientes</h3><p>Probá con otra palabra.</p></div>}</div>
    </section></div>;
  }

  function DashboardMetricModal({ title, metricKey, items, onRefresh, onClose }) {
    const actionMetric = ["pending_actions", "overdue_actions", "urgent_actions"].includes(metricKey);
    const collectionFilterMetric = metricKey === "pending_actions" || metricKey === "overdue_actions";
    const paymentMetric = metricKey === "pending_payments";
    const monthlyClientMetric = metricKey === "new_clients_month" || metricKey === "sold_clients_month";
    const [metricView, setMetricView] = useState("list");
    const [dateOrder, setDateOrder] = useState(metricKey === "active_clients" ? "desc" : "asc");
    const [activeStatusFilter, setActiveStatusFilter] = useState("active_no_signup");
    const [clientQuickSearch, setClientQuickSearch] = useState("");
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
    const [pendingTypeFilter, setPendingTypeFilter] = useState("all");
    const [renewalWeekStart, setRenewalWeekStart] = useState(() => dateKey(startOfWeek(new Date())));
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [calendarMonth, setCalendarMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
    const [selectedActionClient, setSelectedActionClient] = useState(null);
    const [selectedActionId, setSelectedActionId] = useState(null);
    const [selectedStandaloneAction, setSelectedStandaloneAction] = useState(null);
    const [actionClientForm, setActionClientForm] = useState(null);
    const [monthlyItems, setMonthlyItems] = useState(items);
    const [renewalItems, setRenewalItems] = useState(null);
    const [loadingMonth, setLoadingMonth] = useState(false);
    const [payingCollection, setPayingCollection] = useState(null);
    useEscapeClose(onClose);
    async function changeMonth(event) {
      const month = event.target.value;
      setSelectedMonth(month);
      if (metricKey === "new_clients_month" || metricKey === "sold_clients_month") {
        setCalendarMonth(month);
        setSelectedCalendarDate(null);
      }
      if (!month) return;
      setLoadingMonth(true);
      try {
        const endpoint = metricKey === "sold_clients_month"
          ? "/dashboard/sold-clients"
          : "/dashboard/new-clients";
        setMonthlyItems(await api(`${endpoint}?month=${month}`));
      } finally {
        setLoadingMonth(false);
      }
    }
    const sourceItems = monthlyClientMetric
      ? monthlyItems
      : metricKey === "renewals_week"
        ? renewalItems || items
        : items;
    const supportsCalendar = [
      "pending_actions",
      "overdue_actions",
      "urgent_actions",
      "pending_payments",
      "active_clients",
      "renewals_week",
      "new_clients_month",
      "sold_clients_month",
    ].includes(metricKey);
    const statusFilteredItems = metricKey === "active_clients"
      ? sourceItems.filter((item) => {
        if (activeStatusFilter === "active") {
          return ["active", "at_risk"].includes(item.status);
        }
        if (activeStatusFilter === "no_signup") {
          return item.status === "no_signup";
        }
        if (activeStatusFilter === "at_risk") {
          return item.status === "at_risk";
        }
        if (activeStatusFilter === "cancelled") {
          return item.status === "cancelled";
        }
        return ["active", "at_risk", "no_signup"].includes(item.status);
      })
      : sourceItems;
    const filteredSourceItems = collectionFilterMetric
      ? statusFilteredItems.filter((item) => {
        const isCollection = ["collection_payment", "collection_projection"].includes(item.action_type)
          || Boolean(item.payment_id);
        if (pendingTypeFilter === "collections") return isCollection;
        if (pendingTypeFilter === "actions") return !isCollection;
        return true;
      })
      : statusFilteredItems;
    const paymentFilteredItems = metricKey === "active_clients" && paymentStatusFilter !== "all"
      ? filteredSourceItems.filter((item) => {
        const referenceMonth = metricView === "calendar" ? calendarMonth : monthKey();
        const dueDate = clientBillingDateInMonth(item, referenceMonth);
        if (!dueDate) return false;
        const payment = item.monthly_payments?.find(
          (candidate) => candidate.due_date?.slice(0, 7) === referenceMonth
            && candidate.status === "paid",
        );
        return paymentStatusFilter === "paid" ? Boolean(payment) : !payment;
      })
      : filteredSourceItems;
    const searchedSourceItems = metricKey === "active_clients"
      && metricView === "list"
      && clientQuickSearch.trim()
      ? paymentFilteredItems.filter((item) => {
        const query = clientQuickSearch.trim().toLocaleLowerCase("es");
        return [item.name, item.business_name, item.website_url]
          .some((value) => value?.toLocaleLowerCase("es").includes(query));
      })
      : paymentFilteredItems;
    const displayedItems = useMemo(() => {
      const hasDate = actionMetric || paymentMetric || [
        "active_clients",
        "active_client_days",
        "renewals_week",
        "new_clients_month",
        "sold_clients_month",
      ].includes(metricKey);
      const itemDate = (item) => {
        if (actionMetric || paymentMetric) return item.due_date;
        if (metricKey === "active_clients") {
          return item.status === "no_signup" ? item.sale_date : item.signup_date;
        }
        if (metricKey === "active_client_days" || metricKey === "new_clients_month") return item.signup_date;
        if (metricKey === "renewals_week") return item.next_renewal_date;
        if (metricKey === "sold_clients_month") return item.sale_date;
        return null;
      };
      if (!hasDate) return searchedSourceItems;
      return [...searchedSourceItems].sort((first, second) => {
        const firstDate = itemDate(first);
        const secondDate = itemDate(second);
        if (!firstDate && !secondDate) return first.id - second.id;
        if (!firstDate) return 1;
        if (!secondDate) return -1;
        const comparison = firstDate.localeCompare(secondDate);
        return (dateOrder === "asc" ? comparison : -comparison) || first.id - second.id;
      });
    }, [searchedSourceItems, metricKey, dateOrder, actionMetric, paymentMetric]);
    const calendarDateField = metricKey === "active_clients"
      ? "next_renewal_date"
      : metricKey === "renewals_week"
        ? "next_renewal_date"
      : metricKey === "new_clients_month"
        ? "signup_date"
        : metricKey === "sold_clients_month"
          ? "sale_date"
        : "due_date";
    const calendarVisibleItems = metricView === "calendar"
      ? displayedItems.filter((item) => {
        const itemDate = metricKey === "active_clients"
          ? clientBillingDateInMonth(item, calendarMonth)
          : item[calendarDateField];
        return itemDate?.slice(0, 7) === calendarMonth;
      })
      : displayedItems;
    const calendarDays = useMemo(() => {
      const [year, month] = calendarMonth.split("-").map(Number);
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
      const gridStart = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
      const counts = calendarVisibleItems.reduce((result, item) => {
        const itemDate = metricKey === "active_clients"
          ? clientBillingDateInMonth(item, calendarMonth)
          : item[calendarDateField];
        if (itemDate) result[itemDate] = (result[itemDate] || 0) + 1;
        return result;
      }, {});
      const riskCounts = sourceItems.reduce((result, item) => {
        const itemDate = metricKey === "active_clients"
          ? clientBillingDateInMonth(item, calendarMonth)
          : item[calendarDateField];
        if (item.status === "at_risk" && itemDate) {
          result[itemDate] = (result[itemDate] || 0) + 1;
        }
        return result;
      }, {});
      return Array.from({ length: 42 }, (_, index) => {
        const current = new Date(gridStart);
        current.setUTCDate(gridStart.getUTCDate() + index);
        const iso = current.toISOString().slice(0, 10);
        return {
          iso,
          day: current.getUTCDate(),
          currentMonth: current.getUTCMonth() === month - 1,
          count: counts[iso] || 0,
          riskCount: riskCounts[iso] || 0,
        };
      });
    }, [calendarMonth, calendarVisibleItems, sourceItems, calendarDateField, metricKey]);
    const calendarTitle = new Intl.DateTimeFormat("es-AR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${calendarMonth}-01T12:00:00Z`));
    const calendarItemLabel = paymentMetric
      ? ["pago", "pagos", "Pagos"]
      : metricKey === "active_clients"
        ? ["cobro", "cobros", "Cobros"]
        : metricKey === "renewals_week"
          ? ["renovación", "renovaciones", "Renovaciones"]
          : metricKey === "new_clients_month"
            ? ["alta", "altas", "Altas"]
            : metricKey === "sold_clients_month"
              ? ["venta", "ventas", "Ventas"]
              : ["acción", "acciones", "Acciones"];
    const selectedDayItems = selectedCalendarDate
      ? calendarVisibleItems.filter((item) => (
        metricKey === "active_clients"
          ? clientBillingDateInMonth(item, calendarMonth)
          : item[calendarDateField]
      ) === selectedCalendarDate)
      : [];
    const todayIso = new Date().toLocaleDateString("en-CA");
    const activeClientMonthlyTotals = useMemo(() => {
      const currentMonth = todayIso.slice(0, 7);
      const totals = {
        expected: { ARS: 0, USD: 0 },
        paid: { ARS: 0, USD: 0 },
      };
      sourceItems
        .filter((item) => ["active", "at_risk"].includes(item.status) && item.signup_date)
        .forEach((item) => {
          const currency = item.currency || "ARS";
          if (!(currency in totals.expected)) return;
          // El total esperado debe coincidir con el pronóstico de Pagos:
          // usa la mensualidad vigente del cliente, no una cuota histórica.
          totals.expected[currency] += Number(item.payment_amount || 0);
          const monthlyPayments = item.monthly_payments?.filter(
            (candidate) => candidate.due_date?.slice(0, 7) === currentMonth,
          ) || [];
          monthlyPayments
            .filter((candidate) => candidate.status === "paid")
            .forEach((candidate) => {
              const paymentCurrency = candidate.currency || currency;
              if (paymentCurrency in totals.paid) {
                totals.paid[paymentCurrency] += Number(candidate.amount || 0);
              }
            });
        });
      return totals;
    }, [sourceItems, todayIso]);
    async function moveDashboardCalendar(offset) {
      const [year, month] = calendarMonth.split("-").map(Number);
      const next = new Date(Date.UTC(year, month - 1 + offset, 1));
      const nextMonth = next.toISOString().slice(0, 7);
      setCalendarMonth(nextMonth);
      setSelectedCalendarDate(null);
      if (metricKey === "new_clients_month" || metricKey === "sold_clients_month") {
        setSelectedMonth(nextMonth);
        setLoadingMonth(true);
        try {
          const endpoint = metricKey === "sold_clients_month"
            ? "/dashboard/sold-clients"
            : "/dashboard/new-clients";
          setMonthlyItems(await api(`${endpoint}?month=${nextMonth}`));
        } finally {
          setLoadingMonth(false);
        }
      }
    }
    async function moveRenewalWeek(offset) {
      const nextStart = dateKey(addDays(fromDateKey(renewalWeekStart), offset * 7));
      setRenewalWeekStart(nextStart);
      setCalendarMonth(nextStart.slice(0, 7));
      setSelectedCalendarDate(null);
      setLoadingMonth(true);
      try {
        setRenewalItems(await api(`/dashboard/renewals?start=${nextStart}`));
      } finally {
        setLoadingMonth(false);
      }
    }
    async function refreshMetric() {
      await onRefresh();
      if (metricKey === "renewals_week") {
        setRenewalItems(await api(`/dashboard/renewals?start=${renewalWeekStart}`));
      }
    }
    async function markMonthlyCollectionPaid(event, item, dueDate) {
      event.stopPropagation();
      const operationKey = `${item.id}-${dueDate}`;
      setPayingCollection(operationKey);
      try {
        await api(`/clients/${item.id}/monthly-payments/${dueDate}/pay`, { method: "POST" });
        await refreshMetric();
      } catch (error) {
        window.alert(error.message);
      } finally {
        setPayingCollection(null);
      }
    }
    function renderMetricItem(item) {
      const clickableClientMetric = actionMetric
        ? Boolean(item.client_id || (item.standalone && !item.projected))
        : paymentMetric
          ? Boolean(item.client_id)
        : Boolean(item.id);
      const targetClientId = actionMetric || paymentMetric ? item.client_id : item.id;
      const collectionMonth = metricView === "calendar" ? calendarMonth : monthKey();
      const collectionDueDate = metricKey === "active_clients"
        && ["active", "at_risk"].includes(item.status)
        ? clientBillingDateInMonth(item, collectionMonth)
        : null;
      const monthlyPayment = collectionDueDate
        ? item.monthly_payments?.find((payment) => payment.due_date === collectionDueDate)
        : null;
      const collectionPaid = monthlyPayment?.status === "paid";
      const collectionCanBePaid = collectionDueDate
        && collectionDueDate.slice(0, 7) <= todayIso.slice(0, 7)
        && !collectionPaid;
      const openMetricItem = () => {
        if (actionMetric && item.standalone && !item.projected) {
          setSelectedStandaloneAction(item);
        } else {
          setSelectedActionId(actionMetric && !item.projected ? item.id : null);
          setSelectedActionClient(targetClientId);
        }
      };
      return (
        <article
          key={item.id}
          className={clickableClientMetric ? "dashboard-action-card" : undefined}
          role={clickableClientMetric ? "button" : undefined}
          tabIndex={clickableClientMetric ? 0 : undefined}
          onClick={clickableClientMetric ? openMetricItem : undefined}
          onKeyDown={clickableClientMetric ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openMetricItem();
            }
          } : undefined}
          aria-label={clickableClientMetric ? `Abrir ficha de ${actionMetric || paymentMetric ? item.client_name : item.name}` : undefined}
        >
          <div>
            <strong>{actionMetric || paymentMetric ? item.title : item.name}</strong>
            <span>
              {actionMetric || paymentMetric
                ? `${item.client_name} · ${item.business_name}`
                : item.business_name}
            </span>
          </div>
          <div className="dashboard-metric-meta">
            {actionMetric || paymentMetric ? (
              <>
                <small>Fecha</small>
                <strong>{fmtDate(item.due_date)}</strong>
                {paymentMetric && <strong>{fmtMoney(item.amount, item.currency)}</strong>}
                {badge(item.status)}
              </>
            ) : metricKey === "renewals_week" ? (
              <><small>Renovación</small><strong>{fmtDate(item.next_renewal_date)}</strong></>
            ) : metricKey === "new_clients_month" ? (
              <><small>Fecha de alta</small><strong>{fmtDate(item.signup_date)}</strong></>
            ) : metricKey === "sold_clients_month" ? (
              <><small>Fecha de venta</small><strong>{fmtDate(item.sale_date)}</strong>{badge(item.status)}</>
            ) : metricKey === "active_clients" ? (
              <>
                <small>
                  {metricView === "calendar"
                    ? "Cobro"
                    : item.status === "no_signup" ? "Fecha de venta" : "Fecha de alta"}
                </small>
                <strong>
                  {fmtDate(
                    metricView === "calendar"
                      ? clientBillingDateInMonth(item, calendarMonth)
                      : item.status === "no_signup" ? item.sale_date : item.signup_date,
                  )}
                </strong>
                {metricView === "list" && collectionDueDate && (
                  <><small>Vencimiento mensual</small><strong>{fmtDate(collectionDueDate)}</strong></>
                )}
                {badge(item.status)}{badge(item.service_stage)}
                {collectionPaid && <span className="badge paid">Pagado</span>}
                {collectionCanBePaid && (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={payingCollection === `${item.id}-${collectionDueDate}`}
                    onClick={(event) => markMonthlyCollectionPaid(event, item, collectionDueDate)}
                  >
                    <Check size={14} />
                    {payingCollection === `${item.id}-${collectionDueDate}` ? "Guardando…" : "Marcar pagado"}
                  </button>
                )}
              </>
            ) : metricKey === "active_client_days" ? (
              <>
                <small>Desde {fmtDate(item.signup_date)}</small>
                <strong>{item.days_active} {item.days_active === 1 ? "día activo" : "días activos"}</strong>
                <span className="badge">{item.active_month}.º mes</span>
              </>
            ) : (
              <><small>Etapa</small>{badge(item.service_stage)}{badge(item.status)}</>
            )}
          </div>
        </article>
      );
    }
    const monthlyTotals = (
      <div className="dashboard-monthly-totals">
        <div className="dashboard-monthly-total paid-total">
          <small>Mensualidades cobradas este mes</small>
          <strong>{fmtMoney(activeClientMonthlyTotals.paid.ARS, "ARS")}</strong>
          <span>{fmtMoney(activeClientMonthlyTotals.paid.USD, "USD")}</span>
        </div>
        <div className="dashboard-monthly-total pending-total">
          <small>Mensualidades a cobrar · total mes</small>
          <strong>{fmtMoney(activeClientMonthlyTotals.expected.ARS, "ARS")}</strong>
          <span>{fmtMoney(activeClientMonthlyTotals.expected.USD, "USD")}</span>
        </div>
      </div>
    );
    const viewSwitch = (
      <div className="dashboard-view-switch" aria-label={`Cambiar vista de ${title.toLowerCase()}`}>
        <button type="button" className={metricView === "list" ? "active" : ""} onClick={() => setMetricView("list")} aria-pressed={metricView === "list"}>
          <List size={16} />Lista
        </button>
        <button type="button" className={metricView === "calendar" ? "active" : ""} onClick={() => setMetricView("calendar")} aria-pressed={metricView === "calendar"}>
          <CalendarDays size={16} />Calendario
        </button>
      </div>
    );
    return (
      <>
        <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <section
            className={`dashboard-metric-modal ${metricKey === "active_clients" ? "active-clients-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
          <div className="modal-head">
            <div>
              <span className="eyebrow">Detalle del resumen</span>
              <h2>{title} ({displayedItems.length})</h2>
            </div>
            <IconButton label="Cerrar" onClick={onClose}><X /></IconButton>
          </div>
          {metricKey === "active_clients" && (
            <div className="dashboard-header-monthly-totals">
              <div className="dashboard-header-view-controls">
                {viewSwitch}
                <label className="dashboard-payment-filter">
                  <span>Pagos</span>
                  <select
                    value={paymentStatusFilter}
                    onChange={(event) => {
                      setPaymentStatusFilter(event.target.value);
                      setSelectedCalendarDate(null);
                    }}
                  >
                    <option value="all">Todos</option>
                    <option value="paid">Pagados</option>
                    <option value="pending">Pendientes de pago</option>
                  </select>
                </label>
              </div>
              {monthlyTotals}
            </div>
          )}
          <div className="dashboard-metric-list">
            {metricKey === "active_client_days" && (
              <div className="dashboard-export-row">
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => downloadApiFile("/exports/active-client-days.xlsx", "dias-activos-clientes.xlsx")
                    .catch((error) => window.alert(error.message))}
                >
                  <Download size={15} />
                  Exportar Excel
                </button>
              </div>
            )}
            {supportsCalendar && metricKey !== "active_clients" && (
              <div className="dashboard-view-switch" aria-label={`Cambiar vista de ${title.toLowerCase()}`}>
                <button
                  type="button"
                  className={metricView === "list" ? "active" : ""}
                  onClick={() => setMetricView("list")}
                  aria-pressed={metricView === "list"}
                >
                  <List size={16} />
                  Lista
                </button>
                <button
                  type="button"
                  className={metricView === "calendar" ? "active" : ""}
                  onClick={() => setMetricView("calendar")}
                  aria-pressed={metricView === "calendar"}
                >
                  <CalendarDays size={16} />
                  Calendario
                </button>
              </div>
            )}
            {metricKey === "active_clients" && metricView === "list" && (
              <div className="dashboard-client-list-toolbar">
                <label className="search dashboard-client-search">
                    <Search size={17} />
                    <input
                      type="search"
                      value={clientQuickSearch}
                      onChange={(event) => setClientQuickSearch(event.target.value)}
                      placeholder="Buscar por cliente, negocio o página web…"
                      aria-label="Buscar cliente o página web"
                      autoFocus
                    />
                    {clientQuickSearch && (
                      <button type="button" className="icon-btn" onClick={() => setClientQuickSearch("")} aria-label="Limpiar búsqueda">
                        <X size={15} />
                      </button>
                    )}
                </label>
              </div>
            )}
            {collectionFilterMetric && (
              <div className="dashboard-pending-type-filter">
                <label className="dashboard-status-filter">
                  Mostrar
                  <select
                    value={pendingTypeFilter}
                    onChange={(event) => {
                      setPendingTypeFilter(event.target.value);
                      setSelectedCalendarDate(null);
                    }}
                  >
                    <option value="all">{metricKey === "overdue_actions" ? "Todas" : "Cobros y acciones"}</option>
                    <option value="collections">Solo cobros</option>
                    <option value="actions">Solo acciones</option>
                  </select>
                </label>
              </div>
            )}
            {metricKey === "renewals_week" && (
              <div className="dashboard-week-navigation">
                <button className="icon-btn" onClick={() => moveRenewalWeek(-1)} aria-label="Semana anterior">
                  <ChevronLeft />
                </button>
                <div>
                  <small>Semana seleccionada</small>
                  <strong>
                    {fmtDate(renewalWeekStart)} — {fmtDate(dateKey(addDays(fromDateKey(renewalWeekStart), 6)))}
                  </strong>
                </div>
                <button className="icon-btn" onClick={() => moveRenewalWeek(1)} aria-label="Semana siguiente">
                  <ChevronRight />
                </button>
              </div>
            )}
            {monthlyClientMetric && (
              <div className="dashboard-month-filter">
                <label>
                  {metricKey === "sold_clients_month" ? "Ver ventas del mes" : "Ver altas del mes"}
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={changeMonth}
                  />
                </label>
              </div>
            )}
            {metricView === "list" && supportsCalendar && (
              <div className="dashboard-metric-toolbar">
                {metricKey === "active_clients" && (
                  <>
                    <span className="dashboard-client-count">
                      {displayedItems.length} {displayedItems.length === 1 ? "cliente" : "clientes"} en página
                    </span>
                    <label className="dashboard-status-filter">
                      Estado
                      <select
                        value={activeStatusFilter}
                        onChange={(event) => setActiveStatusFilter(event.target.value)}
                      >
                        <option value="active_no_signup">Activos y sin alta</option>
                        <option value="active">Activos</option>
                        <option value="no_signup">Solo sin alta</option>
                        <option value="at_risk">Solo en riesgo</option>
                        <option value="cancelled">Cancelados</option>
                      </select>
                    </label>
                  </>
                )}
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => setDateOrder((order) => order === "asc" ? "desc" : "asc")}
                >
                  <ArrowUpDown size={14} />
                  {metricKey === "active_clients"
                    ? dateOrder === "desc" ? "Altas más recientes primero" : "Altas más antiguas primero"
                    : metricKey === "renewals_week"
                      ? dateOrder === "asc" ? "Renovaciones más próximas" : "Renovaciones más lejanas"
                    : metricKey === "new_clients_month"
                      ? dateOrder === "asc" ? "Más próximas primero" : "Más lejanas primero"
                      : metricKey === "sold_clients_month"
                        ? dateOrder === "asc" ? "Más próximas primero" : "Más lejanas primero"
                    : dateOrder === "asc" ? "Más próximas primero" : "Más lejanas primero"}
                </button>
              </div>
            )}
            {!loadingMonth && metricView === "list" && displayedItems.map(renderMetricItem)}
            {!loadingMonth && supportsCalendar && metricView === "calendar" && (
              <div className="dashboard-actions-calendar">
                <div className="calendar-head">
                  <button className="icon-btn" onClick={() => moveDashboardCalendar(-1)} aria-label="Mes anterior"><ChevronLeft /></button>
                  <h3>{calendarTitle}</h3>
                  <button className="icon-btn" onClick={() => moveDashboardCalendar(1)} aria-label="Mes siguiente"><ChevronRight /></button>
                </div>
                <div className="calendar-grid calendar-weekdays">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="calendar-grid calendar-days">
                  {calendarDays.map((day) => (
                    <button
                      type="button"
                      key={day.iso}
                      className={`${day.currentMonth ? "" : "outside"} ${day.iso === todayIso ? "today" : ""} ${selectedCalendarDate === day.iso ? "selected" : ""}`}
                      onClick={() => setSelectedCalendarDate(day.iso)}
                      aria-label={`${day.iso}: ${day.count} ${calendarItemLabel[1]}`}
                    >
                      <time>{day.day}</time>
                      {metricKey === "active_clients" && day.riskCount > 0 && (
                        <span
                          className="calendar-risk-markers"
                          aria-label={`${day.riskCount} ${day.riskCount === 1 ? "cliente en riesgo" : "clientes en riesgo"}`}
                          title={`${day.riskCount} ${day.riskCount === 1 ? "cliente en riesgo" : "clientes en riesgo"}`}
                        >
                          {"*".repeat(day.riskCount)}
                        </span>
                      )}
                      {day.count > 0 && (
                        <strong>
                          {day.count} {day.count === 1 ? calendarItemLabel[0] : calendarItemLabel[1]}
                        </strong>
                      )}
                    </button>
                  ))}
                </div>
                {selectedCalendarDate && (
                  <div className="dashboard-calendar-selection">
                    <h3>{calendarItemLabel[2]} del {fmtDate(selectedCalendarDate)}</h3>
                    <div className="dashboard-calendar-items">
                      {selectedDayItems.map(renderMetricItem)}
                      {!selectedDayItems.length && <p>Sin {calendarItemLabel[1]} para este día.</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {loadingMonth && <Loading />}
            {!loadingMonth && metricView === "list" && !displayedItems.length && <Empty />}
          </div>
          </section>
        </div>
        {selectedActionClient && (
          <DetailModal
            clientId={selectedActionClient}
            onClose={() => {
              setSelectedActionClient(null);
              setSelectedActionId(null);
            }}
            onRefresh={refreshMetric}
            onEdit={(client) => {
              setSelectedActionClient(null);
              setActionClientForm(client);
            }}
            initialTab={
              paymentMetric
                ? "payments"
                : actionMetric
                  ? "actions"
                : metricKey === "active_clients" || metricKey === "renewals_week"
                  ? "payments"
                  : "summary"
            }
            initialActionId={selectedActionId}
          />
        )}
        {actionClientForm && (
          <ClientForm
            client={actionClientForm}
            onClose={() => setActionClientForm(null)}
            onSaved={() => setActionClientForm(null)}
          />
        )}
        {selectedStandaloneAction && (
          <AgendaActionEditor
            action={selectedStandaloneAction}
            onClose={() => setSelectedStandaloneAction(null)}
            onSaved={() => {
              setSelectedStandaloneAction(null);
              refreshMetric();
            }}
          />
        )}
      </>
    );
  }

  return { Dashboard };
}
