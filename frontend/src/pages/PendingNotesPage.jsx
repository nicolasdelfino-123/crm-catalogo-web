import { useEffect, useRef, useState } from "react";
import { ListTodo, Plus, Pencil, Trash2, Save, X, GripVertical, Search } from "lucide-react";
import "../pending-notes.css";

const COLORS = [["none", "Sin resaltar"], ["yellow", "Amarillo"], ["green", "Verde"], ["blue", "Azul"], ["pink", "Rosa"]];
const PRIORITY_ORDER = { urgent: 0, medium: 1, low: 2 };
const normalizeSearch = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

function ColorPicker({ value, onChange, disabled }) {
  return <div className="note-colors" role="group" aria-label="Color de resaltado">
    {COLORS.map(([color, label]) => <button key={color} type="button" title={label}
      aria-label={label} aria-pressed={value === color} disabled={disabled}
      className={`note-swatch note-${color} ${value === color ? "selected" : ""}`}
      onClick={() => onChange(color)}>{color === "none" ? "−" : ""}</button>)}
  </div>;
}

function ClientPicker({ note, clients, disabled, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = clients.filter(client => normalizeSearch(`${client.name} ${client.business_name || ""}`).includes(normalizeSearch(query.trim())));
  return <div className="note-client-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input aria-label={`Buscar cliente para: ${note.text}`} aria-expanded={open} aria-controls={`note-clients-${note.id}`} role="combobox" autoComplete="off" placeholder="Buscar cliente…" value={query} disabled={disabled}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} />
    {open && <div className="note-client-options" id={`note-clients-${note.id}`} role="listbox">
      {note.client_id && <button type="button" role="option" aria-selected="false" onClick={() => { onChange(null); setQuery(""); setOpen(false); }}>Quitar cliente</button>}
      {matches.map(client => <button type="button" role="option" aria-selected={client.id === note.client_id} key={client.id} onClick={() => { onChange(client.id); setQuery(""); setOpen(false); }}>{client.name}{client.business_name && client.business_name !== client.name ? ` · ${client.business_name}` : ""}</button>)}
      {!matches.length && <span>Sin resultados</span>}
    </div>}
  </div>;
}

export default function PendingNotesPage({ api, DetailModal, ClientForm, badge, stageMonthNumber }) {
  const [notes, setNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const clientsById = new Map(clients.map(client => [client.id, client]));
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientForm, setClientForm] = useState(null);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [color, setColor] = useState("none");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [dragging, setDragging] = useState(null);
  const drag = useRef(null);
  const listRef = useRef(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.frame); }, []);

  const load = () => {
    setLoading(true);
    setError("");
    api("/pending-notes").then(setNotes).catch(e => setError(e.message)).finally(() => setLoading(false));
    api("/pending-notes/clients").then(setClients).catch(e => setError(e.message));
  };
  useEffect(() => {
    let active = true;
    api("/pending-notes").then(data => { if (active) setNotes(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    api("/pending-notes/clients").then(data => { if (active) setClients(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [api]);

  async function mutate(path, method, body, onSuccess) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      onSuccess(result);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const update = (note, changes, after) => mutate(`/pending-notes/${note.id}`, "PATCH", changes, saved => {
    setNotes(current => current.map(item => item.id === saved.id ? saved : item));
    after?.();
  });
  const ordered = [...notes].sort((a, b) => Number(a.completed) - Number(b.completed) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.position - b.position || a.id - b.id);
  const pending = notes.filter(note => !note.completed).length;
  const query = normalizeSearch(search.trim());
  const months = [...new Set(notes.map(note => stageMonthNumber(clientsById.get(note.client_id)?.service_stage)).filter(Boolean))];
  if (monthFilter && !months.includes(Number(monthFilter))) months.push(Number(monthFilter));
  months.sort((a, b) => a - b);
  const visibleNotes = ordered.filter(note => normalizeSearch(`${note.text} ${note.client_name || ""}`).includes(query) && (!monthFilter || stageMonthNumber(clientsById.get(note.client_id)?.service_stage) === Number(monthFilter)));

  function changeSearch(value) {
    setSearch(value);
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  async function saveOrder(next, original, note) {
    setBusy(true);
    setError("");
    try {
      const saved = await api("/pending-notes/order", { method: "PUT", body: JSON.stringify({
        completed: note.completed, ids: next.filter(item => item.completed === note.completed).map(item => item.id),
      }) });
      setNotes(saved);
      setAnnouncement("Posición guardada.");
    } catch (e) { setNotes(original); setError(e.message); }
    finally { setBusy(false); }
  }
  function moveNote(items, sourceId, targetId) {
    const next = [...items];
    const source = next.findIndex(item => item.id === sourceId);
    const target = next.findIndex(item => item.id === targetId);
    if (source < 0 || target < 0 || source === target || next[source].completed !== next[target].completed || next[source].priority !== next[target].priority) return items;
    next.splice(target, 0, next.splice(source, 1)[0]);
    return next.map((item, position) => ({ ...item, position }));
  }
  function startDrag(event, note) {
    if (busy || editing !== null || event.button !== 0) return;
    event.preventDefault();
    // La lista permanece en el DOM cuando React mueve la tarjeta. Capturar en
    // la manija pierde el puntero al desplazar su tarjeta hacia abajo.
    listRef.current.setPointerCapture(event.pointerId);
    drag.current = { original: ordered, current: ordered, note, y: event.clientY, frame: null };
    setDragging(note.id);
    const tick = () => {
      const state = drag.current;
      if (!state) return;
      const list = listRef.current;
      const bounds = list.getBoundingClientRect();
      if (state.y < bounds.top + 55) list.scrollTop -= Math.min(16, (bounds.top + 55 - state.y) / 3);
      else if (state.y > bounds.bottom - 55) list.scrollTop += Math.min(16, (state.y - bounds.bottom + 55) / 3);
      const rows = [...list.querySelectorAll("[data-note-id]")];
      const sourceRow = rows.find(row => Number(row.dataset.noteId) === note.id);
      if (sourceRow) {
        const sourceCenter = sourceRow.getBoundingClientRect().top + sourceRow.getBoundingClientRect().height / 2;
        const candidates = rows.filter(row => {
          const item = state.current.find(candidate => candidate.id === Number(row.dataset.noteId));
          return item && item.id !== note.id && item.completed === note.completed && item.priority === note.priority;
        });
        const crossed = candidates.filter(row => {
          const rect = row.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          return state.y > sourceCenter ? center > sourceCenter && state.y >= center : center < sourceCenter && state.y <= center;
        });
        const target = state.y > sourceCenter ? crossed[crossed.length - 1] : crossed[0];
        if (target) {
          const next = moveNote(state.current, note.id, Number(target.dataset.noteId));
          if (next !== state.current) { state.current = next; setNotes(next); }
        }
      }
      state.frame = requestAnimationFrame(tick);
    };
    drag.current.frame = requestAnimationFrame(tick);
  }
  function finishDrag(cancelled = false) {
    const state = drag.current;
    if (!state) return;
    cancelAnimationFrame(state.frame);
    drag.current = null;
    setDragging(null);
    if (cancelled) setNotes(state.original);
    else if (state.current !== state.original) saveOrder(state.current, state.original, state.note);
  }

  return <section className="page pending-notes-page">
    <div className="notes-notebook">
      <div className="notes-search-toolbar">
        <label className="notes-search-field" htmlFor="pending-notes-search">
          <Search size={18} aria-hidden="true" />
          <input id="pending-notes-search" type="search" placeholder="Buscar en las tarjetas…"
            aria-label="Buscar en pendientes y completadas" value={search}
            disabled={dragging !== null} onChange={event => changeSearch(event.target.value)} />
          {search && <button type="button" className="icon-btn" title="Limpiar búsqueda" aria-label="Limpiar búsqueda"
            disabled={dragging !== null} onClick={() => changeSearch("")}><X size={16} /></button>}
        </label>
        <span className="notes-search-count" role="status">{pending} pendientes · {notes.length - pending} completadas{query || monthFilter ? ` · ${visibleNotes.length} encontradas` : ""}</span>
        <select className="notes-month-filter" aria-label="Filtrar por mes del cliente" value={monthFilter} disabled={dragging !== null} onChange={event => { setMonthFilter(event.target.value); if (listRef.current) listRef.current.scrollTop = 0; }}>
          <option value="">Todos los meses</option>
          {months.map(month => <option key={month} value={month}>Mes {month}</option>)}
        </select>
        <button type="button" className="secondary notes-composer-button" aria-expanded={composerOpen} aria-controls="pending-note-composer" onClick={() => setComposerOpen(open => !open)}>{composerOpen ? <X size={17} /> : <Plus size={17} />}{composerOpen ? "Ocultar formulario" : "Nueva nota"}</button>
      </div>
      <form id="pending-note-composer" hidden={!composerOpen} className={`note-composer note-${color}`} onSubmit={event => {
        event.preventDefault();
        mutate("/pending-notes", "POST", { text, color }, saved => {
          setNotes(current => [...current, saved]); setText(""); setComposerOpen(false);
        });
      }}>
        <label htmlFor="new-pending-note">Nueva nota</label>
        <textarea id="new-pending-note" value={text} maxLength={10000} required rows={3}
          placeholder="¿Qué tenés pendiente?" onChange={event => setText(event.target.value)} />
        <div className="note-composer-actions"><ColorPicker value={color} onChange={setColor} disabled={busy} />
          <button className="primary" disabled={busy || loading || !text.trim()}><Plus size={17} />Agregar nota</button></div>
      </form>
      {error && <div className="notes-error" role="alert">{error} <button type="button" className="secondary" onClick={load} disabled={busy || loading}>Volver a cargar</button></div>}
      <div className="notes-list" ref={listRef} role="region" aria-label="Lista de pendientes" tabIndex={0} aria-busy={loading || busy}
        onPointerMove={event => { if (drag.current) drag.current.y = event.clientY; }}
        onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)}
        onLostPointerCapture={() => finishDrag(true)}>
        {loading ? <p className="notes-empty">Cargando notas…</p> : notes.length === 0 ? <div className="notes-empty"><ListTodo size={32} /><p>Tu cuaderno está listo. Usá «Nueva nota» para agregar tu primer pendiente.</p></div> :
          visibleNotes.length === 0 ? <p className="notes-empty">No hay notas que coincidan con los filtros seleccionados.</p> :
          visibleNotes.map((note, index) => <div key={note.id}>
            {note.completed && (index === 0 || !visibleNotes[index - 1].completed) && <h3 className="notes-completed-heading">Completadas</h3>}
            <article data-note-id={note.id} className={`pending-note note-${note.color} ${note.completed ? "is-completed" : ""} ${dragging === note.id ? "note-dragging" : ""}`}>
              <button type="button" className="note-drag-handle" disabled={busy || editing !== null}
                title="Arrastrar para ordenar · También podés usar las flechas ↑ y ↓" aria-label={`Mover nota: ${note.text}`}
                aria-describedby="notes-drag-help"
                onPointerDown={event => startDrag(event, note)}
                onKeyDown={event => {
                  if (event.key === "Escape") { finishDrag(true); return; }
                  if (!["ArrowUp", "ArrowDown"].includes(event.key) || busy || dragging !== null) return;
                  event.preventDefault();
                  const target = visibleNotes[index + (event.key === "ArrowUp" ? -1 : 1)];
                  if (!target || target.completed !== note.completed || target.priority !== note.priority) return;
                  const next = moveNote(ordered, note.id, target.id);
                  setNotes(next); saveOrder(next, ordered, note);
                }}><GripVertical size={20} /></button>
              <input type="checkbox" checked={note.completed} disabled={busy} aria-label={`${note.completed ? "Volver a pendiente" : "Completar"}: ${note.text}`}
                onChange={() => update(note, { completed: !note.completed })} />
              <div className="note-content">
                {editing === note.id ? <form onSubmit={event => { event.preventDefault(); update(note, { text: draft }, () => setEditing(null)); }}>
                  <label className="note-edit-label" htmlFor={`edit-note-${note.id}`}>Editar nota</label>
                  <textarea id={`edit-note-${note.id}`} autoFocus rows={3} value={draft} maxLength={10000} required onChange={event => setDraft(event.target.value)} />
                  <div className="note-edit-actions"><button className="primary" disabled={busy || !draft.trim()}><Save size={15} />Guardar</button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}><X size={15} />Cancelar</button></div>
                </form> : <p className="note-text">{note.text}</p>}
                <div className="note-client">
                  <ClientPicker note={note} clients={clients} disabled={busy} onChange={client_id => update(note, { client_id })} />
                  {note.client_id && <button type="button" className="note-client-link" title={`Abrir ficha de ${note.client_name}`} onClick={() => setSelectedClient(note.client_id)}>{note.client_name}</button>}
                  {clientsById.get(note.client_id)?.service_stage && badge(clientsById.get(note.client_id).service_stage)}
                </div>
                <select className={`note-priority priority-${note.priority}`} aria-label={`Prioridad de: ${note.text}`} value={note.priority} disabled={busy} onChange={event => update(note, { priority: event.target.value })}>
                  <option value="urgent">Urgente</option><option value="medium">Media</option><option value="low">Baja</option>
                </select>
                <div className="note-row-tools"><ColorPicker value={note.color} disabled={busy} onChange={value => update(note, { color: value })} />
                  <div className="note-edit-actions"><button type="button" className="icon-btn" title="Editar nota" aria-label="Editar nota" disabled={busy} onClick={() => { setEditing(note.id); setDraft(note.text); }}><Pencil size={16} /></button>
                    <button type="button" className="icon-btn" title="Eliminar nota" aria-label="Eliminar nota" disabled={busy} onClick={() => setDeleting(note.id)}><Trash2 size={16} /></button></div>
                </div>
                {deleting === note.id && <div className="note-delete-confirm">¿Eliminar esta nota?
                  <button type="button" className="secondary" disabled={busy} onClick={() => mutate(`/pending-notes/${note.id}`, "DELETE", null, () => {
                    setNotes(current => current.filter(item => item.id !== note.id)); setDeleting(null);
                  })}>Eliminar</button><button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button>
                </div>}
              </div>
            </article>
          </div>)}
      </div>
      <span className="notes-live" id="notes-drag-help">Arrastrá o usá las flechas para ordenar dentro de la misma prioridad. Las completadas siguen al final.</span>
      <span className="notes-live" role="status">{announcement}</span>
    </div>
    {selectedClient && !clientForm && <DetailModal clientId={selectedClient} onClose={() => setSelectedClient(null)} onRefresh={load} onEdit={client => setClientForm(client)} />}
    {clientForm && <ClientForm client={clientForm} onClose={() => setClientForm(null)} onSaved={() => { setClientForm(null); load(); }} />}
  </section>;
}
