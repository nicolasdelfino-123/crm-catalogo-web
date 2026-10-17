// Use the billing date assigned by the calendar for both paid and pending records.
export function summarizeCollections(items, month) {
  const totals = { ARS: { total: 0, paid: 0, pending: 0 }, USD: { total: 0, paid: 0, pending: 0 } };
  const seen = new Set();
  let partialCount = 0;
  for (const item of items) {
    if (item.action_type !== "collection_payment" || !item.payment_id) continue;
    if (!["paid", "pending", "partial", "overdue"].includes(item.status)) continue;
    const relevantDate = item.calendar_date || item.due_date;
    if (!relevantDate?.startsWith(`${month}-`) || seen.has(item.payment_id)) continue;
    seen.add(item.payment_id);
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
