import { useEffect, useRef, useState } from "react";
import { ListTodo, Plus, Pencil, Trash2, Save, X, GripVertical } from "lucide-react";
import "../pending-notes.css";

const COLORS = [["none", "Sin resaltar"], ["yellow", "Amarillo"], ["green", "Verde"], ["blue", "Azul"], ["pink", "Rosa"]];

function ColorPicker({ value, onChange, disabled }) {
  return <div className="note-colors" role="group" aria-label="Color de resaltado">
    {COLORS.map(([color, label]) => <button key={color} type="button" title={label}
      aria-label={label} aria-pressed={value === color} disabled={disabled}
      className={`note-swatch note-${color} ${value === color ? "selected" : ""}`}
      onClick={() => onChange(color)}>{color === "none" ? "−" : ""}</button>)}
  </div>;
}

export default function PendingNotesPage({ api }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
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
  };
  useEffect(() => {
    let active = true;
    api("/pending-notes").then(data => { if (active) setNotes(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
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
  const pending = notes.filter(note => !note.completed).length;
  const ordered = [...notes].sort((a, b) => Number(a.completed) - Number(b.completed) || a.position - b.position || a.id - b.id);

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
    if (source === target || target < 0 || next[source].completed !== next[target].completed) return items;
    next.splice(target, 0, next.splice(source, 1)[0]);
    return next.map((item, position) => ({ ...item, position }));
  }
  function startDrag(event, note) {
    if (busy || editing !== null || event.button !== 0) return;
    event.preventDefault();
    // La lista permanece en el DOM cuando React mueve la tarjeta. Capturar en
    // la manija pierde el puntero al desplazar su tarjeta hacia abajo.
    listRef.current.setPointerCapture(event.pointerId);
    drag.current = { original: ordered, current: ordered, note, y: event.clientY, x: event.clientX, frame: null };
    setDragging(note.id);
    const tick = () => {
      const state = drag.current;
      if (!state) return;
      const list = listRef.current;
      const bounds = list.getBoundingClientRect();
      if (state.y < bounds.top + 55) list.scrollTop -= Math.min(16, (bounds.top + 55 - state.y) / 3);
      else if (state.y > bounds.bottom - 55) list.scrollTop += Math.min(16, (state.y - bounds.bottom + 55) / 3);
      const row = document.elementFromPoint(state.x, Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, state.y)))?.closest("[data-note-id]");
      if (row) {
        const rect = row.getBoundingClientRect();
        const targetId = Number(row.dataset.noteId);
        const sourceIndex = state.current.findIndex(item => item.id === note.id);
        const targetIndex = state.current.findIndex(item => item.id === targetId);
        if ((targetIndex > sourceIndex && state.y > rect.top + rect.height / 2) ||
          (targetIndex < sourceIndex && state.y < rect.top + rect.height / 2)) {
          const next = moveNote(state.current, note.id, targetId);
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
    <div className="page-intro"><div><h2>Tu cuaderno de pendientes</h2>
      <p>Anotá lo que tenés que hacer. Resaltá lo importante y tachá lo que ya terminaste.</p></div>
      <span className="notes-count">{pending} pendientes · {notes.length - pending} completadas</span>
    </div>
    <div className="notes-notebook">
      <form className={`note-composer note-${color}`} onSubmit={event => {
        event.preventDefault();
        mutate("/pending-notes", "POST", { text, color }, saved => {
          setNotes(current => [...current, saved]); setText("");
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
        onPointerMove={event => { if (drag.current) { drag.current.y = event.clientY; drag.current.x = event.clientX; } }}
        onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)}
        onLostPointerCapture={() => finishDrag(true)}>
        {loading ? <p className="notes-empty">Cargando notas…</p> : notes.length === 0 ? <div className="notes-empty"><ListTodo size={32} /><p>Tu cuaderno está listo. Agregá tu primer pendiente arriba.</p></div> :
          ordered.map((note, index) => <div key={note.id}>
            {note.completed && (index === 0 || !ordered[index - 1].completed) && <h3 className="notes-completed-heading">Completadas</h3>}
            <article data-note-id={note.id} className={`pending-note note-${note.color} ${note.completed ? "is-completed" : ""} ${dragging === note.id ? "note-dragging" : ""}`}>
              <button type="button" className="note-drag-handle" disabled={busy || editing !== null}
                title="Arrastrar para ordenar · También podés usar las flechas ↑ y ↓" aria-label={`Mover nota: ${note.text}`}
                aria-describedby="notes-drag-help"
                onPointerDown={event => startDrag(event, note)}
                onKeyDown={event => {
                  if (event.key === "Escape") { finishDrag(true); return; }
                  if (!["ArrowUp", "ArrowDown"].includes(event.key) || busy || dragging !== null) return;
                  event.preventDefault();
                  const target = ordered[index + (event.key === "ArrowUp" ? -1 : 1)];
                  if (!target || target.completed !== note.completed) return;
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
      <p className="notes-footnote" id="notes-drag-help">Arrastrá desde los puntos para cambiar el orden, o usá las flechas ↑ y ↓ con la manija seleccionada. Las completadas siguen al final.</p>
      <span className="notes-live" role="status">{announcement}</span>
    </div>
  </section>;
}
