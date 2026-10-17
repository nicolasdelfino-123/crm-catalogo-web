const clientKey = (item) => item.client_id != null
  ? `id:${item.client_id}`
  : `name:${item.client_name || ""}:${item.business_name || ""}`;
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function paymentBreakdown(items, currency) {
  const rows = items.filter((item) => item.currency === currency).slice().sort((first, second) =>
    collator.compare(first.client_name || "", second.client_name || "")
    || collator.compare(clientKey(first), clientKey(second))
    || String(first.display_date || first.calendar_date || first.due_date || "").localeCompare(String(second.display_date || second.calendar_date || second.due_date || ""))
    || collator.compare(String(first.payment_id ?? first.id), String(second.payment_id ?? second.id)),
  );
  return {
    rows,
    paymentCount: rows.length,
    clientCount: new Set(rows.map(clientKey)).size,
    total: rows.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  };
}
