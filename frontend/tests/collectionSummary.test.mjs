import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCollections } from '../src/app/collectionSummary.js';

const payment = (id, amount, currency, status, due_date = '2026-10-12', paid_at = '2026-10-17') => ({ id: `payment-${id}`, payment_id: id, amount, currency, status, due_date, paid_at, action_type: 'collection_payment' });

test('counts only recorded payments, splits currencies and excludes duplicate receipts and projections', () => {
  const paid = payment(1, 12000, 'ARS', 'paid');
  const result = summarizeCollections([
    paid, { ...paid, id: 'duplicate-other-action-id' }, payment(2, 18000, 'ARS', 'pending'),
    payment(3, 10, 'USD', 'paid'), payment(4, 20, 'USD', 'overdue'),
    { id: 'projection', amount: 999, currency: 'USD', status: 'pending', due_date: '2026-10-20', action_type: 'collection_projection' },
    payment(5, 9999, 'ARS', 'pending', '2026-09-12'),
    { ...payment(6, 9999, 'ARS', 'paid'), action_type: 'custom' },
  ], '2026-10');
  assert.deepEqual(result.totals.ARS, { total: 30000, paid: 12000, pending: 18000 });
  assert.deepEqual(result.totals.USD, { total: 30, paid: 10, pending: 20 });
});

test('paid totals follow billing month despite being collected in another month', () => {
  const result = summarizeCollections([
    payment(1, 100, 'ARS', 'paid', '2026-10-05', '2026-09-30'),
    payment(2, 50, 'ARS', 'partial'),
    payment(3, 200, 'ARS', 'paid', '2026-09-05', '2026-10-01'),
    payment(4, 999, 'ARS', 'paid', '2026-10-05', null),
  ], '2026-10');
  assert.deepEqual(result.totals.ARS, { total: 1149, paid: 1099, pending: 50 });
  assert.equal(result.partialCount, 1);
});

test('each selected filter shows exactly the payments counted in its total', () => {
  const items = [payment(1, 100, 'ARS', 'paid'), payment(2, 200, 'ARS', 'pending')];
  assert.equal(summarizeCollections(items.filter((row) => row.status === 'paid'), '2026-10').totals.ARS.total, 100);
  assert.equal(summarizeCollections(items.filter((row) => row.status !== 'paid'), '2026-10').totals.ARS.total, 200);
});

test('empty months show zero totals for both currencies', () => {
  assert.deepEqual(summarizeCollections([], '2026-10').totals, {
    ARS: { total: 0, paid: 0, pending: 0 }, USD: { total: 0, paid: 0, pending: 0 },
  });
});


test('uses assigned calendar period for deposits and monthly records without due dates', () => {
  const result = summarizeCollections([
    { ...payment(1, 50, 'USD', 'paid', null, '2026-11-15'), calendar_date: '2026-10-01' },
    { ...payment(2, 20, 'USD', 'paid', null, '2026-10-17'), calendar_date: '2026-10-17', payment_type: 'deposit' },
  ], '2026-10');
  assert.deepEqual(result.totals.USD, { total: 70, paid: 70, pending: 0 });
});
