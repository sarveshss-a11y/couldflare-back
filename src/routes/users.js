/**
 * Users routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse } from '../index';

const router = Router({ base: '/api/users' });

// Get all users
router.get('/', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    let query = 'SELECT id, first_name, last_name, email, role, shop_name, phone, total_earnings, paid_salary, remaining_salary, accuracy_rating, created_at FROM users WHERE 1=1';
    const params = [];

    if (shopName && userRole !== 'owner') {
      if (!userId || userId === 'undefined') {
        return jsonResponse({ data: [] });
      }
      query += ' AND shop_name = ? AND id != ?';
      params.push(shopName, userId);
    } else if (shopName && userRole === 'owner') {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    query += ' ORDER BY created_at DESC';

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching users:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get workers
router.get('/workers', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const db = request.db;

    let query = `SELECT id, first_name, last_name, role, shop_name FROM users
                 WHERE (role = 'worker' OR role = 'worker_editor' OR role = 'transporter_worker')`;
    const params = [];

    if (shopName) {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching workers:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get editors
router.get('/editors', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const db = request.db;

    let query = `SELECT id, first_name, last_name, role, shop_name FROM users
                 WHERE (role = 'editor' OR role = 'worker_editor')`;
    const params = [];

    if (shopName) {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching editors:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get transporters
router.get('/transporters', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const db = request.db;

    let query = `SELECT id, first_name, last_name, role, shop_name FROM users
                 WHERE (role = 'transporter' OR role = 'transporter_worker')`;
    const params = [];

    if (shopName) {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching transporters:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get worker statistics
router.get('/:id/statistics', async (request) => {
  try {
    const url = new URL(request.url);
    const userId = request.params.id;
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const db = request.db;

    const user = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId).first();

    if (!user) {
      return jsonResponse({ message: 'User not found' }, 404);
    }

    if (shopName && userRole !== 'owner' && user.shop_name !== shopName) {
      return jsonResponse({ message: 'Access denied' }, 403);
    }

    const salaries = await db.prepare('SELECT * FROM salaries WHERE employee_id = ?')
      .bind(userId).all();

    const totalEarnings = salaries.results.reduce((sum, s) => sum + s.amount, 0);
    const paidSalary = salaries.results.filter(s => s.is_paid === 1).reduce((sum, s) => sum + s.amount, 0);
    const remainingSalary = totalEarnings - paidSalary;

    const orders = await db.prepare(`
      SELECT DISTINCT o.* FROM orders o
      LEFT JOIN order_workers ow ON o.id = ow.order_id
      LEFT JOIN order_transporters ot ON o.id = ot.order_id
      WHERE ow.worker_id = ? OR ot.transporter_id = ?
    `).bind(userId, userId).all();

    const totalOrders = orders.results.length;
    const completedOrders = orders.results.filter(o => o.status === 'completed').length;

    const projects = await db.prepare('SELECT * FROM editing_projects WHERE editor_id = ?')
      .bind(userId).all();

    const totalProjects = projects.results.length;
    const completedProjects = projects.results.filter(p => p.status === 'completed').length;

    const totalWork = totalOrders + totalProjects;
    const completedWork = completedOrders + completedProjects;

    return jsonResponse({
      data: {
        user: {
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role
        },
        orders: {
          total: totalOrders,
          completed: completedOrders,
          remaining: totalOrders - completedOrders
        },
        projects: {
          total: totalProjects,
          completed: completedProjects,
          remaining: totalProjects - completedProjects
        },
        work: {
          total: totalWork,
          completed: completedWork,
          remaining: totalWork - completedWork
        },
        payments: {
          totalEarnings,
          paidSalary,
          remainingSalary
        }
      }
    });
  } catch (error) {
    console.error('Error fetching worker statistics:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Update user performance
router.put('/:id/performance', async (request) => {
  try {
    const body = await request.json();
    const { accuracyRating } = body;
    const userId = request.params.id;
    const db = request.db;

    await db.prepare('UPDATE users SET accuracy_rating = ? WHERE id = ?')
      .bind(accuracyRating, userId).run();

    return jsonResponse({ message: 'Performance updated' });
  } catch (error) {
    console.error('Error updating performance:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleUsers(request) {
  return router.handle(request);
}
