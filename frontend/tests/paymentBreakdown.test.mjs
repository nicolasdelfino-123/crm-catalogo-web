import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentBreakdown } from '../src/app/paymentBreakdown.js';
import { collectionRowsForMonth, summarizeCollections } from '../src/app/collectionSummary.js';

test('sorts Spanish names alphabetically without changing source order and counts distinct clients', () => {
  const rows = [
    { id: 4, client_id: 2, client_name: 'Beatriz', currency: 'ARS', amount: 20 },
    { id: 3, client_id: 1, client_name: 'Álvaro', currency: 'ARS', amount: 10, due_date: '2026-10-20' },
    { id: 2, client_id: 1, client_name: 'Álvaro', currency: 'ARS', amount: 5, due_date: '2026-10-10' },
    { id: 1, client_id: 3, client_name: 'Ana', currency: 'USD', amount: 99 },
  ];
  const before = JSON.stringify(rows);
  const result = paymentBreakdown(rows, 'ARS');
  assert.deepEqual(result.rows.map((row) => row.id), [2, 3, 4]);
  assert.equal(result.paymentCount, 3);
  assert.equal(result.clientCount, 2);
  assert.equal(result.total, 35);
  assert.equal(JSON.stringify(rows), before);
});

test('clients with identical names remain distinct by ID', () => {
  const result = paymentBreakdown([
    { id: 1, client_id: 10, client_name: 'Ana', currency: 'ARS', amount: 100 },
    { id: 2, client_id: 11, client_name: 'Ana', currency: 'ARS', amount: 200 },
    { id: 3, client_id: 10, client_name: 'Ana', currency: 'ARS', amount: 300 },
  ], 'ARS');
  assert.equal(result.clientCount, 2);
  assert.equal(result.paymentCount, 3);
  assert.equal(result.total, 600);
});

test('Agenda modal rows sum to the same currency total as the clicked card', () => {
  const paid = { id: 'action-1', payment_id: 1, client_id: 1, client_name: 'Zoe', action_type: 'collection_payment', currency: 'ARS', amount: 100, status: 'paid', calendar_date: '2026-10-10', due_date: '2026-10-10' };
  const rows = [
    paid, { ...paid, id: 'duplicated-action-1' },
    { ...paid, id: 'action-2', payment_id: 2, client_name: 'Ana', client_id: 2, amount: 50 },
    { ...paid, id: 'projection', payment_id: null, action_type: 'collection_projection', amount: 999 },
    { ...paid, id: 'other-month', payment_id: 3, calendar_date: '2026-09-10', due_date: '2026-09-10', amount: 999 },
  ];
  const total = summarizeCollections(rows, '2026-10').totals.ARS.total;
  const detail = paymentBreakdown(collectionRowsForMonth(rows, '2026-10'), 'ARS');
  assert.equal(detail.total, total);
  assert.equal(detail.total, 150);
  assert.equal(detail.paymentCount, 2);
  assert.equal(detail.clientCount, 2);
  assert.deepEqual(detail.rows.map((row) => row.client_name), ['Ana', 'Zoe']);
});

test('empty detail has zero clients, payments and sum', () => {
  assert.deepEqual(paymentBreakdown([], 'USD'), { rows: [], clientCount: 0, paymentCount: 0, total: 0 });
});
