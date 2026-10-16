export function projectSaas({ currentCustomers, base, goal, adds, price, loss, rate, mode }) {
  let customers = currentCustomers, mrr = base, sales = 0, losses = 0;
  const snapshot = (month) => ({ month, customers, net_customers: customers - currentCustomers, losses, sales, mrr: Math.round(mrr) });
  let reached = mrr >= goal ? snapshot(0) : null;
  const projections = [];
  for (let month = 1; month <= 120; month++) {
    const leaving = Math.min(customers, mode === "rate" ? Math.round(customers * rate / 100) : Math.floor(loss));
    const average = customers ? mrr / customers : 0;
    mrr = Math.max(0, mrr - leaving * average + Math.floor(adds) * price);
    customers += Math.floor(adds) - leaving;
    losses += leaving;
    sales += Math.floor(adds);
    if (!reached && mrr >= goal) reached = snapshot(month);
    if ([3, 6, 12].includes(month)) projections.push(snapshot(month));
  }
  return { mode, reached, projections };
}
