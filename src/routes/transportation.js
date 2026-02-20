/**
 * Transportation routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/transportation' });

// Get all transportation records
router.get('/', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    let query = 'SELECT * FROM transportation WHERE 1=1';
    const params = [];

    if (shopName && userRole !== 'owner') {
      if (!userId || userId === 'undefined') {
        return jsonResponse({ data: [] });
      }
      query += ' AND shop_name = ? AND transporter_id = ?';
      params.push(shopName, userId);
    } else if (shopName && userRole === 'owner') {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    query += ' ORDER BY created_at DESC';

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching transportation records:', error);
    return jsonResponse({ data: [] });
  }
});

// Create new transportation record
router.post('/', async (request) => {
  try {
    const body = await request.json();
    const {
      relatedOrder, relatedProject, clientId, transporterId,
      pickupLocation, deliveryLocation, distance, transportFee,
      equipmentList, transportDate, instructions, shopName, createdBy
    } = body;
    const db = request.db;

    const transportId = generateId();

    await db.prepare(`
      INSERT INTO transportation (
        id, related_order_id, related_project_id, client_id, transporter_id,
        pickup_location, delivery_location, distance, transport_fee,
        equipment_list, transport_date, instructions, shop_name, created_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      transportId, relatedOrder || null, relatedProject || null, clientId || null,
      transporterId || null, pickupLocation, deliveryLocation, distance || 0,
      transportFee, equipmentList || '', transportDate || new Date().toISOString(),
      instructions || '', shopName, createdBy
    ).run();

    return jsonResponse({ message: 'Transportation record created successfully', transportId }, 201);
  } catch (error) {
    console.error('Error creating transportation record:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Update transportation status
router.put('/:id/status', async (request) => {
  try {
    const body = await request.json();
    const { status } = body;
    const transportId = request.params.id;
    const db = request.db;

    let query = 'UPDATE transportation SET status = ?';
    const params = [status];

    if (status === 'delivered') {
      query += ', completed_date = ?';
      params.push(new Date().toISOString());
    }

    query += ' WHERE id = ?';
    params.push(transportId);

    await db.prepare(query).bind(...params).run();
    return jsonResponse({ message: 'Transportation status updated' });
  } catch (error) {
    console.error('Error updating transportation status:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Assign transporter
router.put('/:id/assign', async (request) => {
  try {
    const body = await request.json();
    const { transporterId } = body;
    const transportId = request.params.id;
    const db = request.db;

    const transporter = await db.prepare(`
      SELECT * FROM users WHERE id = ? AND (role LIKE '%transporter%')
    `).bind(transporterId).first();

    if (!transporter) {
      return jsonResponse({ message: 'Transporter not found or invalid role' }, 400);
    }

    await db.prepare('UPDATE transportation SET transporter_id = ? WHERE id = ?')
      .bind(transporterId, transportId).run();

    return jsonResponse({ message: 'Transporter assigned successfully' });
  } catch (error) {
    console.error('Error assigning transporter:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleTransportation(request) {
  return router.handle(request);
}
