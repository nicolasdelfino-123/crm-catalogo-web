// Match the calendar's billing month, keeping original currencies separate.
export function summarizeCollections(items, month) {
  const totals = { ARS: { total: 0, paid: 0, pending: 0 }, USD: { total: 0, paid: 0, pending: 0 } };
  const seen = new Set();
  let partialCount = 0;
  for (const item of items) {
    if (!["collection_payment", "collection_projection"].includes(item.action_type) || !item.due_date?.startsWith(`${month}-`)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const currency = item.currency || "ARS";
    totals[currency] ||= { total: 0, paid: 0, pending: 0 };
    totals[currency].total += amount;
    if (item.status === "paid") totals[currency].paid += amount;
    else totals[currency].pending += amount;
    if (item.status === "partial") partialCount += 1;
  }
  return { totals, partialCount };
}
