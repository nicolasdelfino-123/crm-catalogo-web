/**
 * Mantiene montadas las pestañas ya visitadas. Esto conserva filtros, formularios
 * y scroll al cambiar de sección sin cargar todas las páginas al iniciar.
 */
export default function TabPages({ activeTab, visitedTabs, pages }) {
  return Object.entries(pages).map(([tabId, page]) => {
    if (!visitedTabs.has(tabId) && activeTab !== tabId) return null;
    return (
      <div key={tabId} hidden={activeTab !== tabId}>
        {page}
      </div>
    );
  });
}
