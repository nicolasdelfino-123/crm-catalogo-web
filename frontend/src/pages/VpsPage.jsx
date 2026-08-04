import { useCallback, useEffect, useMemo, useState } from "react";
import { Server, Plus, Search, X, Trash2 } from "lucide-react";

export function createVpsPage(dependencies) {
  const { api, IconButton } = dependencies;

  function Vps() {
    const [data, setData] = useState({ items: [], counts: { vape: 0, shatha: 0 } });
    const [clients, setClients] = useState([]);
    const [query, setQuery] = useState("");
    const [form, setForm] = useState({ vps_name: "vape", selection: "", custom_name: "" });
    const [saving, setSaving] = useState(false);
    const load = useCallback(() => Promise.all([
      api("/vps"), api("/clients?per_page=100&sort_by=name"),
    ]).then(([vpsData, clientData]) => {
      setData(vpsData); setClients(clientData.items);
    }), []);
    useEffect(() => { load(); }, [load]);
    const assignedClientIds = useMemo(() => new Set(data.items.filter((item) => item.client_id).map((item) => item.client_id)), [data.items]);
    const searchResults = useMemo(() => {
      const normalized = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
      if (!normalized) return [];
      return data.items.filter((item) => `${item.name} ${item.business_name}`
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").includes(normalized));
    }, [data.items, query]);
    async function submit(event) {
      event.preventDefault(); setSaving(true);
      try {
        await api("/vps", {
          method: "POST",
          body: JSON.stringify({
            vps_name: form.vps_name,
            client_id: form.selection.startsWith("client:") ? Number(form.selection.slice(7)) : null,
            custom_name: form.selection === "custom" ? form.custom_name : "",
          }),
        });
        setForm({ ...form, selection: "", custom_name: "" });
        await load();
      } catch (error) { alert(error.message); }
      finally { setSaving(false); }
    }
    async function move(item, vpsName) {
      await api(`/vps/${item.id}`, { method: "PATCH", body: JSON.stringify({ vps_name: vpsName }) });
      await load();
    }
    async function remove(item) {
      if (!window.confirm(`¿Quitar "${item.name}" de ${item.vps_name === "vape" ? "VPS Vape" : "VPS Shatha"}?`)) return;
      await api(`/vps/${item.id}`, { method: "DELETE" }); await load();
    }
    const servers = [["vape", "VPS Vape"], ["shatha", "VPS Shatha"]];
    return (
      <section className="page vps-page">
        <div className="page-intro"><div><h2>Distribución de VPS</h2><p>Organizá clientes y aplicaciones según el servidor donde están alojados.</p></div></div>
        <form className="vps-form" onSubmit={submit}>
          <div><span className="eyebrow">Nueva asignación</span><h3>Agregar a un VPS</h3></div>
          <label>VPS<select value={form.vps_name} onChange={(event) => setForm({ ...form, vps_name: event.target.value })}><option value="vape">VPS Vape</option><option value="shatha">VPS Shatha</option></select></label>
          <label>Cliente o aplicación<select value={form.selection} onChange={(event) => setForm({ ...form, selection: event.target.value, custom_name: "" })} required><option value="">Elegí una opción</option>{clients.filter((client) => !assignedClientIds.has(client.id)).map((client) => <option value={`client:${client.id}`} key={client.id}>{client.name} · {client.business_name}</option>)}<option value="custom">Nombre personalizado…</option></select></label>
          {form.selection === "custom" && <label>Nombre personalizado<input value={form.custom_name} onChange={(event) => setForm({ ...form, custom_name: event.target.value })} placeholder="Nombre de la aplicación" required autoFocus /></label>}
          <button className="primary" disabled={saving}><Plus size={17} />{saving ? "Agregando…" : "Agregar"}</button>
        </form>
        <div className="vps-search">
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o aplicación..." />{query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><X size={16} /></button>}</label>
          {query.trim() && <div className="vps-search-results">{searchResults.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.business_name}</span></div><b>{item.vps_name === "vape" ? "VPS Vape" : "VPS Shatha"}</b></article>)}{!searchResults.length && <p>No se encontró ningún cliente o aplicación asignada.</p>}</div>}
        </div>
        <div className="vps-lists">
          {servers.map(([id, title]) => {
            const entries = data.items.filter((item) => item.vps_name === id);
            const otherId = id === "vape" ? "shatha" : "vape";
            return <section className="vps-card" key={id}><header><span><Server size={20} /></span><div><h3>{title}</h3><p>{entries.length} {entries.length === 1 ? "elemento alojado" : "elementos alojados"}</p></div><strong>{entries.length}</strong></header><div className="vps-items">{entries.map((item) => <article key={item.id}><div className="vps-item-name"><strong>{item.name}</strong><span>{item.business_name}</span></div><select aria-label={`Mover ${item.name}`} value={item.vps_name} onChange={(event) => move(item, event.target.value)}><option value={id}>{title}</option><option value={otherId}>{otherId === "vape" ? "VPS Vape" : "VPS Shatha"}</option></select><IconButton label={`Quitar ${item.name}`} onClick={() => remove(item)}><Trash2 /></IconButton></article>)}{!entries.length && <div className="vps-empty"><Server /><span>Este VPS todavía está vacío.</span></div>}</div></section>;
          })}
        </div>
      </section>
    );
  }

  return { Vps };
}
