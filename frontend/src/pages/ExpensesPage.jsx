import { useCallback, useEffect, useState } from "react";
import { Edit3, Save, Trash2 } from "lucide-react";

export function createExpensesPage(dependencies) {
  const { api, fmtDate, fmtMoney, IconButton, Empty } = dependencies;

  function Expenses() {
    const today = new Date().toISOString().slice(0, 10);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [scope, setScope] = useState("month");
    const [data, setData] = useState({ items: [], summary: { server_income_ars: 0, server_expenses_ars: 0, net_server_cost_ars: 0, extra_expenses_ars: 0, expenses_ars: 0, balance_ars: 0 } });
    const [form, setForm] = useState({ expense_date: today, category: "server", description: "Servidor", amount: "", notes: "" });
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const load = useCallback(() => api(`/expenses?scope=${scope}&month=${month}`).then(setData), [month, scope]);
    useEffect(() => { load(); }, [load]);
    async function submit(event) {
      event.preventDefault(); setSaving(true);
      try {
        await api(editing ? `/expenses/${editing.id}` : "/expenses", {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(form),
        });
        setEditing(null);
        setForm({ expense_date: scope === "month" ? `${month}-01` : today, category: "server", description: "Servidor", amount: "", notes: "" });
        await load();
      } catch (error) {
        alert(error.message);
      } finally { setSaving(false); }
    }
    function changeCategory(category) {
      setForm((current) => ({
        ...current,
        category,
        description: ["Servidor", "Aporte VPS"].includes(current.description) || !current.description
          ? category === "server" ? "Servidor" : category === "server_income" ? "Aporte VPS" : ""
          : current.description,
      }));
    }
    function edit(expense) {
      setEditing(expense);
      setForm({ expense_date: expense.expense_date, category: expense.category, description: expense.description, amount: expense.amount, notes: expense.notes || "" });
    }
    async function remove(expense) {
      if (!window.confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
      await api(`/expenses/${expense.id}`, { method: "DELETE" });
      await load();
    }
    const summary = data.summary;
    return (
      <section className="page expenses-page">
        <div className="page-intro">
          <div><h2>Gastos y balance</h2><p>Control de servidor, aportes y gastos extra, todo expresado en pesos.</p></div>
          <div className="expense-period-filter"><label>Período<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="month">Por mes</option><option value="all">Total acumulado</option></select></label>{scope === "month" && <label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}</div>
        </div>
        <div className="balance-grid">
          <article className="balance-card contribution"><small>Ganancia / aportes VPS</small><strong>{fmtMoney(summary.server_income_ars, "ARS")}</strong><span>Aportes cargados manualmente</span></article>
          <article className="balance-card spent"><small>Gasto bruto de servidor</small><strong>{fmtMoney(summary.server_expenses_ars, "ARS")}</strong><span>Antes de descontar aportes</span></article>
          <article className="balance-card server-net"><small>Costo real del servidor</small><strong>{fmtMoney(summary.net_server_cost_ars, "ARS")}</strong><span>Servidor menos aportes</span></article>
          <article className="balance-card spent"><small>Gastos extra</small><strong>{fmtMoney(summary.extra_expenses_ars, "ARS")}</strong><span>Otros gastos registrados</span></article>
          <article className={`balance-card final ${summary.balance_ars < 0 ? "negative" : ""}`}><small>Balance final</small><strong>{fmtMoney(summary.balance_ars, "ARS")}</strong><span>Aportes VPS menos todos los gastos</span></article>
        </div>
        <form className="expense-form" onSubmit={submit}>
          <div className="expense-form-title"><span className="eyebrow">{editing ? "Editar movimiento" : "Nuevo movimiento"}</span><h3>{editing ? form.description : "Registrar gasto o aporte"}</h3></div>
          <label>Fecha<input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} required /></label>
          <label>Tipo<select value={form.category} onChange={(event) => changeCategory(event.target.value)}><option value="server">Gasto de servidor</option><option value="server_income">Ganancia / aporte VPS</option><option value="extra">Gasto extra</option></select></label>
          <label>Concepto<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej.: dominio, publicidad…" required /></label>
          <label>Importe en pesos<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
          <label className="expense-notes">Nota opcional<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="expense-form-actions">
            {editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm({ expense_date: scope === "month" ? `${month}-01` : today, category: "server", description: "Servidor", amount: "", notes: "" }); }}>Cancelar</button>}
            <button className="primary" disabled={saving}><Save size={16} />{saving ? "Guardando…" : editing ? "Guardar" : "Registrar"}</button>
          </div>
        </form>
        <div className="table-wrap expenses-table"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Nota</th><th /></tr></thead><tbody>{data.items.map((expense) => <tr key={expense.id}><td><strong>{fmtDate(expense.expense_date)}</strong></td><td>{expense.category === "server" ? "Gasto de servidor" : expense.category === "server_income" ? "Ganancia / aporte VPS" : "Gasto extra"}</td><td><strong>{expense.description}</strong></td><td><strong className={expense.category === "server_income" ? "income-text" : ""}>{expense.category === "server_income" ? "+ " : ""}{fmtMoney(expense.amount, "ARS")}</strong></td><td>{expense.notes || "—"}</td><td><IconButton label="Editar movimiento" onClick={() => edit(expense)}><Edit3 /></IconButton><IconButton label="Eliminar movimiento" onClick={() => remove(expense)}><Trash2 /></IconButton></td></tr>)}</tbody></table></div>
        {!data.items.length && <Empty />}
      </section>
    );
  }

  return { Expenses };
}
