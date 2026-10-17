import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCollections } from '../src/app/collectionSummary.js';

test('separates currencies, paid and pending, excludes other months and actions', () => {
  const row = (id, amount, currency, status, due_date = '2026-10-12', action_type = 'collection_payment') => ({ id, amount, currency, status, due_date, action_type });
  const paid = row('paid', 12000, 'ARS', 'paid');
  const result = summarizeCollections([
    paid, paid,
    row('pending', 18000, 'ARS', 'pending'),
    row('usd-paid', 10, 'USD', 'paid'),
    row('usd-overdue', 20, 'USD', 'overdue'),
    row('projection', 15, 'USD', 'pending', '2026-10-20', 'collection_projection'),
    row('previous-month', 9999, 'ARS', 'paid', '2026-09-12'),
    row('action', 9999, 'ARS', 'pending', '2026-10-12', 'custom'),
  ], '2026-10');
  assert.deepEqual(result.totals.ARS, { total: 30000, paid: 12000, pending: 18000 });
  assert.deepEqual(result.totals.USD, { total: 45, paid: 10, pending: 35 });
});

test('month follows due date and partial payments remain identifiable', () => {
  const result = summarizeCollections([
    { id: 1, action_type: 'collection_payment', due_date: '2026-10-05', paid_at: '2026-09-30', amount: 100, currency: 'ARS', status: 'paid' },
    { id: 2, action_type: 'collection_payment', due_date: '2026-10-06', amount: 50, currency: 'ARS', status: 'partial' },
  ], '2026-10');
  assert.deepEqual(result.totals.ARS, { total: 150, paid: 100, pending: 50 });
  assert.equal(result.partialCount, 1);
});

test('empty months show zero totals for both currencies', () => {
  assert.deepEqual(summarizeCollections([], '2026-10').totals, {
    ARS: { total: 0, paid: 0, pending: 0 }, USD: { total: 0, paid: 0, pending: 0 },
  });
});
