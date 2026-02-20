/**
 * Payments routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/payments' });

// Get all payments for an order
router.get('/order/:orderId', async (request) => {
  try {
    const orderId = request.params.orderId;
    const db = request.db;

    const results = await db.prepare(`
      SELECT p.*, u.first_name, u.last_name, u.role
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.order_id = ?
      ORDER BY p.payment_date DESC
    `).bind(orderId).all();

    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return jsonResponse({ message: 'Server error', error: error.message }, 500);
  }
});

// Get all payments for a client
router.get('/client/:clientId', async (request) => {
  try {
    const clientId = request.params.clientId;
    const db = request.db;

    const results = await db.prepare(`
      SELECT p.*, u.first_name, u.last_name, u.role, o.order_name, o.order_date
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      LEFT JOIN orders o ON p.order_id = o.id
      WHERE p.client_id = ?
      ORDER BY p.payment_date DESC
    `).bind(clientId).all();

    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return jsonResponse({ message: 'Server error', error: error.message }, 500);
  }
});

// Create new payment record
router.post('/', async (request) => {
  try {
    const body = await request.json();
    const {
      orderId, clientId, amount, paymentDate, paymentMethod,
      receivedBy, notes, shopName
    } = body;
    const db = request.db;

    if (!orderId || !clientId || !amount || !paymentDate || !receivedBy || !shopName) {
      return jsonResponse({ message: 'Missing required fields' }, 400);
    }

    const paymentId = generateId();

    await db.prepare(`
      INSERT INTO payments (
        id, order_id, client_id, amount, payment_date,
        payment_method, received_by, notes, shop_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      paymentId, orderId, clientId, Number(amount), paymentDate,
      paymentMethod || 'cash', receivedBy, notes || '', shopName
    ).run();

    // Update order payment
    await db.prepare(`
      UPDATE orders SET
        received_payment = received_payment + ?,
        remaining_payment = total_amount - received_payment
      WHERE id = ?
    `).bind(Number(amount), orderId).run();

    // Update client payment statistics
    await db.prepare(`
      UPDATE clients SET
        received_payments = received_payments + ?,
        pending_payments = total_payments_due - received_payments
      WHERE id = ?
    `).bind(Number(amount), clientId).run();

    return jsonResponse({ message: 'Payment recorded successfully', paymentId }, 201);
  } catch (error) {
    console.error('Error creating payment:', error);
    return jsonResponse({ message: 'Server error', error: error.message }, 500);
  }
});

// Delete payment record
router.delete('/:id', async (request) => {
  try {
    const paymentId = request.params.id;
    const db = request.db;

    const payment = await db.prepare('SELECT * FROM payments WHERE id = ?')
      .bind(paymentId).first();

    if (!payment) {
      return jsonResponse({ message: 'Payment not found' }, 404);
    }

    // Update order payment (subtract)
    await db.prepare(`
      UPDATE orders SET
        received_payment = CASE WHEN received_payment >= ? THEN received_payment - ? ELSE 0 END,
        remaining_payment = total_amount - received_payment
      WHERE id = ?
    `).bind(payment.amount, payment.amount, payment.order_id).run();

    // Update client payment statistics (subtract)
    await db.prepare(`
      UPDATE clients SET
        received_payments = CASE WHEN received_payments >= ? THEN received_payments - ? ELSE 0 END,
        pending_payments = total_payments_due - received_payments
      WHERE id = ?
    `).bind(payment.amount, payment.amount, payment.client_id).run();

    // Delete payment
    await db.prepare('DELETE FROM payments WHERE id = ?').bind(paymentId).run();

    return jsonResponse({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handlePayments(request) {
  return router.handle(request);
}
