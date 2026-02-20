/**
 * Orders routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/orders' });

// Helper function to create salary entries from order
async function createSalaryEntriesFromOrder(db, order, workers, transporters) {
  try {
    console.log('Creating salary entries for order:', order.id);
    
    for (const worker of workers) {
      const salaryId = generateId();
      await db.prepare(`
        INSERT INTO salaries (
          id, employee_id, amount, salary_type, related_order_id,
          description, work_date, is_paid, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).bind(
        salaryId, worker.worker_id, worker.payment, 'order_work', order.id,
        `Order work: ${order.order_name}`, order.order_date || new Date().toISOString()
      ).run();
      
      await db.prepare(`
        UPDATE users SET total_earnings = total_earnings + ?, remaining_salary = remaining_salary + ?, updated_at = datetime('now') WHERE id = ?
      `).bind(worker.payment, worker.payment, worker.worker_id).run();
    }

    for (const transporter of transporters) {
      const salaryId = generateId();
      await db.prepare(`
        INSERT INTO salaries (
          id, employee_id, amount, salary_type, related_order_id,
          description, work_date, is_paid, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).bind(
        salaryId, transporter.transporter_id, transporter.payment, 'transport_work', order.id,
        `Transport work: ${order.order_name}`, order.order_date || new Date().toISOString()
      ).run();
      
      await db.prepare(`
        UPDATE users SET total_earnings = total_earnings + ?, remaining_salary = remaining_salary + ?, updated_at = datetime('now') WHERE id = ?
      `).bind(transporter.payment, transporter.payment, transporter.transporter_id).run();
    }
  } catch (error) {
    console.error('Error creating salary entries:', error);
  }
}

// Get all orders
router.get('/', async (request) => {
  try {
    const db = request.db;
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');

    let orders = [];
    
    if (shopName && userRole !== 'owner') {
      if (!userId || userId === 'undefined') {
        return jsonResponse({ data: [] });
      }
      
      let userObjectId = userId;
      const user = await db.prepare('SELECT id FROM users WHERE firebase_uid = ? OR id = ?').bind(userId, userId).first();
      if (user) userObjectId = user.id;
      else return jsonResponse({ data: [] });
      
      const ordersResult = await db.prepare(`
        SELECT DISTINCT o.* FROM orders o
        LEFT JOIN order_workers ow ON o.id = ow.order_id
        LEFT JOIN order_transporters ot ON o.id = ot.order_id
        WHERE o.shop_name = ? AND (ow.worker_id = ? OR ot.transporter_id = ?)
        ORDER BY o.created_at DESC
      `).bind(shopName, userObjectId, userObjectId).all();
      
      orders = ordersResult.results || [];
    } else if (shopName && userRole === 'owner') {
      const ordersResult = await db.prepare('SELECT * FROM orders WHERE shop_name = ? ORDER BY created_at DESC').bind(shopName).all();
      orders = ordersResult.results || [];
    }
    
    for (const order of orders) {
      const client = await db.prepare('SELECT id, name, email, phone FROM clients WHERE id = ?').bind(order.client_id).first();
      order.client = client;
      
      const products = await db.prepare('SELECT * FROM order_products WHERE order_id = ?').bind(order.id).all();
      order.products = products.results || [];
      
      const workers = await db.prepare(`
        SELECT ow.*, u.first_name, u.last_name, u.shop_name FROM order_workers ow
        JOIN users u ON ow.worker_id = u.id WHERE ow.order_id = ?
      `).bind(order.id).all();
      order.workers = (workers.results || []).map(w => ({
        worker: { _id: w.worker_id, firstName: w.first_name, lastName: w.last_name, shopName: w.shop_name },
        payment: w.payment
      }));
      
      const transporters = await db.prepare(`
        SELECT ot.*, u.first_name, u.last_name, u.shop_name FROM order_transporters ot
        JOIN users u ON ot.transporter_id = u.id WHERE ot.order_id = ?
      `).bind(order.id).all();
      order.transporters = (transporters.results || []).map(t => ({
        transporter: { _id: t.transporter_id, firstName: t.first_name, lastName: t.last_name, shopName: t.shop_name },
        payment: t.payment
      }));
    }
    
    return jsonResponse({ data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return jsonResponse({ data: [] });
  }
});

// Create new order
router.post('/', async (request) => {
  try {
    const body = await request.json();
    const db = request.db;
    const { clientId, orderName, venuePlace, products, workers, transporters, description, totalAmount, receivedPayment, orderDate, shopName, createdBy } = body;

    if (!clientId || !orderName || !venuePlace || !totalAmount || !shopName || !createdBy) {
      return jsonResponse({ message: 'Missing required fields' }, 400);
    }

    const orderId = generateId();
    
    await db.prepare(`
      INSERT INTO orders (id, client_id, order_name, venue_place, description, total_amount, received_payment, remaining_payment,
        order_date, created_by, shop_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).bind(orderId, clientId, orderName, venuePlace, description || '', totalAmount, receivedPayment || 0,
      totalAmount - (receivedPayment || 0), orderDate || new Date().toISOString(), createdBy, shopName).run();
    
    if (products && products.length > 0) {
      for (const product of products) {
        await db.prepare(`INSERT INTO order_products (id, order_id, name, quantity, price, size_info) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(generateId(), orderId, product.name, product.quantity, product.price, product.sizeInfo || '').run();
      }
    }
    
    if (workers && workers.length > 0) {
      for (const worker of workers) {
        await db.prepare(`INSERT INTO order_workers (id, order_id, worker_id, payment) VALUES (?, ?, ?, ?)`)
          .bind(generateId(), orderId, worker.worker, worker.payment).run();
      }
    }
    
    if (transporters && transporters.length > 0) {
      for (const transporter of transporters) {
        await db.prepare(`INSERT INTO order_transporters (id, order_id, transporter_id, payment) VALUES (?, ?, ?, ?)`)
          .bind(generateId(), orderId, transporter.transporter, transporter.payment).run();
      }
    }
    
    try {
      const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
      await createSalaryEntriesFromOrder(db, order, workers || [], transporters || []);
    } catch (salaryError) {
      console.warn('Failed to create salary entries:', salaryError);
    }
    
    try {
      await db.prepare(`UPDATE clients SET lifetime_orders = lifetime_orders + 1, total_payments_due = total_payments_due + ?,
        pending_payments = pending_payments + ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(totalAmount, totalAmount - (receivedPayment || 0), clientId).run();
    } catch (clientError) {
      console.warn('Failed to update client statistics:', clientError);
    }

    return jsonResponse({ message: 'Order created successfully', order: { id: orderId } }, 201);
  } catch (error) {
    console.error('Error creating order:', error);
    return jsonResponse({ message: 'Server error', error: error.message }, 500);
  }
});

// Update order status
router.put('/:id/status', async (request) => {
  try {
    const body = await request.json();
    const db = request.db;
    const { status } = body;

    await db.prepare(`UPDATE orders SET status = ?, completion_date = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completion_date END,
      updated_at = datetime('now') WHERE id = ?`).bind(status, status, request.params.id).run();
    
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(request.params.id).first();
    if (!order) return jsonResponse({ message: 'Order not found' }, 404);
    
    return jsonResponse({ message: 'Order status updated', order });
  } catch (error) {
    console.error('Error updating order:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Update payment
router.put('/:id/payment', async (request) => {
  try {
    const body = await request.json();
    const db = request.db;
    const { receivedPayment } = body;
    
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(request.params.id).first();
    if (!order) return jsonResponse({ message: 'Order not found' }, 404);
    
    await db.prepare(`UPDATE orders SET received_payment = ?, remaining_payment = total_amount - ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(receivedPayment, receivedPayment, request.params.id).run();
    
    return jsonResponse({ message: 'Payment updated' });
  } catch (error) {
    console.error('Error updating payment:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Delete order
router.delete('/:id', async (request) => {
  try {
    const db = request.db;
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(request.params.id).first();
    if (!order) return jsonResponse({ message: 'Order not found' }, 404);
    
    await db.prepare('DELETE FROM salaries WHERE related_order_id = ?').bind(request.params.id).run();
    
    const workers = await db.prepare('SELECT * FROM order_workers WHERE order_id = ?').bind(request.params.id).all();
    for (const worker of (workers.results || [])) {
      await db.prepare(`UPDATE users SET total_earnings = total_earnings - ?, remaining_salary = remaining_salary - ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(worker.payment, worker.payment, worker.worker_id).run();
    }
    
    const transporters = await db.prepare('SELECT * FROM order_transporters WHERE order_id = ?').bind(request.params.id).all();
    for (const transporter of (transporters.results || [])) {
      await db.prepare(`UPDATE users SET total_earnings = total_earnings - ?, remaining_salary = remaining_salary - ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(transporter.payment, transporter.payment, transporter.transporter_id).run();
    }
    
    await db.prepare(`UPDATE clients SET lifetime_orders = lifetime_orders - 1, total_payments_due = total_payments_due - ?,
      pending_payments = pending_payments - ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(order.total_amount, order.remaining_payment, order.client_id).run();
    
    await db.prepare('DELETE FROM order_products WHERE order_id = ?').bind(request.params.id).run();
    await db.prepare('DELETE FROM order_workers WHERE order_id = ?').bind(request.params.id).run();
    await db.prepare('DELETE FROM order_transporters WHERE order_id = ?').bind(request.params.id).run();
    await db.prepare('DELETE FROM orders WHERE id = ?').bind(request.params.id).run();
    
    return jsonResponse({ message: 'Order and related data deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleOrders(request) {
  return router.handle(request);
}
