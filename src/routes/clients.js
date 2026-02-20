import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';
const router = Router({ base: '/api/clients' });

router.get('/', async (request) => {
  try {
    const db = request.db;
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    
    if (shopName && userRole !== 'owner') return jsonResponse({ data: [] });
    
    const result = shopName && userRole === 'owner' 
      ? await db.prepare('SELECT * FROM clients WHERE shop_name = ? ORDER BY created_at DESC').bind(shopName).all()
      : { results: [] };
    
    return jsonResponse({ data: result.results || [] });
  } catch (error) {
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

router.post('/', async (request) => {
  try {
    const body = await request.json();
    const db = request.db;
    const { name, email, phone, address, shopName, clientType, businessCategory, priorityLevel, notes } = body;
    const clientId = generateId();
    
    await db.prepare(`INSERT INTO clients (id, name, email, phone, address, shop_name, client_type, business_category, priority_level, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
      .bind(clientId, name, email || '', phone, address || '', shopName, clientType || 'individual', businessCategory || 'mixed', priorityLevel || 'normal', notes || '').run();
    
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(clientId).first();
    return jsonResponse({ message: 'Client created successfully', client }, 201);
  } catch (error) {
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

router.put('/:id', async (request) => {
  try {
    const body = await request.json();
    const db = request.db;
    const { name, email, phone, address } = body;
    
    await db.prepare(`UPDATE clients SET name = ?, email = ?, phone = ?, address = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(name, email, phone, address, request.params.id).run();
    
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(request.params.id).first();
    if (!client) return jsonResponse({ message: 'Client not found' }, 404);
    
    return jsonResponse({ message: 'Client updated successfully', client });
  } catch (error) {
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

router.delete('/:id', async (request) => {
  try {
    const db = request.db;
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(request.params.id).first();
    if (!client) return jsonResponse({ message: 'Client not found' }, 404);
    
    await db.prepare('DELETE FROM clients WHERE id = ?').bind(request.params.id).run();
    return jsonResponse({ message: 'Client deleted successfully' });
  } catch (error) {
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

router.get('/:id/work-history', async (request) => {
  try {
    const db = request.db;
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(request.params.id).first();
    if (!client) return jsonResponse({ message: 'Client not found' }, 404);
    
    const orders = await db.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY order_date DESC').bind(request.params.id).all();
    const projects = await db.prepare('SELECT * FROM editing_projects WHERE client_id = ? ORDER BY start_date DESC').bind(request.params.id).all();
    
    const workHistory = [
      ...(orders.results || []).map(o => ({ id: o.id, type: 'order', name: o.order_name, totalAmount: o.total_amount, receivedPayment: o.received_payment, remainingPayment: o.remaining_payment, status: o.status, date: o.order_date, isPaid: o.received_payment >= o.total_amount })),
      ...(projects.results || []).map(p => ({ id: p.id, type: 'project', name: p.project_name, totalAmount: p.total_amount, receivedPayment: p.received_payment, remainingPayment: p.remaining_payment, status: p.status, date: p.start_date, isPaid: p.received_payment >= p.total_amount }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return jsonResponse({ client: { _id: client.id, name: client.name, totalPaymentsDue: client.total_payments_due, receivedPayments: client.received_payments, pendingPayments: client.pending_payments }, workHistory });
  } catch (error) {
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleClients(request) {
  return router.handle(request);
}
