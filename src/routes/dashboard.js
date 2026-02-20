/**
 * Dashboard routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse } from '../index';

const router = Router({ base: '/api/dashboard' });

// Get dashboard alerts
router.get('/alerts', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    const alerts = [];
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    if (userRole === 'owner') {
      const ordersEndingToday = await db.prepare(`
        SELECT * FROM orders
        WHERE shop_name = ? AND order_date >= ? AND order_date <= ?
        AND status != 'completed'
      `).bind(shopName, startOfToday, endOfToday).all();

      const projectsEndingToday = await db.prepare(`
        SELECT * FROM editing_projects
        WHERE shop_name = ? AND end_date >= ? AND end_date <= ?
        AND status != 'completed'
      `).bind(shopName, startOfToday, endOfToday).all();

      if (ordersEndingToday.results.length > 0) {
        const orderDetails = ordersEndingToday.results.map(order => {
          const remainingAmount = (order.total_amount || 0) - (order.received_payment || 0);
          return `📦 ${order.order_name}\n👤 Client: ${order.client_id} | 📍 Venue: ${order.venue_place || 'N/A'}\n💰 Remaining: ₹${remainingAmount.toLocaleString()}\n📅 Due Today`;
        }).join('\n\n');

        alerts.push({
          type: 'urgent',
          title: `🚨 ${ordersEndingToday.results.length} Order${ordersEndingToday.results.length > 1 ? 's' : ''} Due Today`,
          message: orderDetails,
          icon: 'fas fa-exclamation-triangle',
          count: ordersEndingToday.results.length
        });
      }

      if (projectsEndingToday.results.length > 0) {
        const projectDetails = projectsEndingToday.results.map(project => {
          return `🎬 ${project.project_name}\n💰 Value: ₹${(project.total_amount || 0).toLocaleString()}\n📅 Deadline Today`;
        }).join('\n\n');

        alerts.push({
          type: 'urgent',
          title: `🚨 ${projectsEndingToday.results.length} Project${projectsEndingToday.results.length > 1 ? 's' : ''} Ending Today`,
          message: projectDetails,
          icon: 'fas fa-video',
          count: projectsEndingToday.results.length
        });
      }
    } else {
      if (userId) {
        const userOrders = await db.prepare(`
          SELECT DISTINCT o.* FROM orders o
          LEFT JOIN order_workers ow ON o.id = ow.order_id
          LEFT JOIN order_transporters ot ON o.id = ot.order_id
          WHERE (ow.worker_id = ? OR ot.transporter_id = ?)
          AND o.order_date >= ? AND o.order_date <= ?
          AND o.status != 'completed'
        `).bind(userId, userId, startOfToday, endOfToday).all();

        const userProjects = await db.prepare(`
          SELECT * FROM editing_projects
          WHERE editor_id = ? AND end_date >= ? AND end_date <= ?
          AND status != 'completed'
        `).bind(userId, startOfToday, endOfToday).all();

        if (userOrders.results.length > 0) {
          const orderDetails = userOrders.results.map(order => {
            return `📦 ORDER: ${order.order_name}\n📍 Venue: ${order.venue_place || 'Not specified'}\n📅 Due TODAY\n⚠️ Your work must be completed today!`;
          }).join('\n\n');

          alerts.push({
            type: 'urgent',
            title: `🚨 Your ${userOrders.results.length} Order${userOrders.results.length > 1 ? 's' : ''} Due Today`,
            message: orderDetails,
            icon: 'fas fa-box',
            count: userOrders.results.length
          });
        }

        if (userProjects.results.length > 0) {
          const projectDetails = userProjects.results.map(project => {
            return `🎬 PROJECT: ${project.project_name}\n💰 Your Commission: ₹${(project.commission_amount || 0).toLocaleString()}\n📅 Deadline TODAY\n⚠️ Project must be completed today!`;
          }).join('\n\n');

          alerts.push({
            type: 'urgent',
            title: `🚨 Your ${userProjects.results.length} Project${userProjects.results.length > 1 ? 's' : ''} Ending Today`,
            message: projectDetails,
            icon: 'fas fa-video',
            count: userProjects.results.length
          });
        }
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        type: 'info',
        title: 'All Good!',
        message: 'No urgent deadlines today. Keep up the great work!',
        icon: 'fas fa-check-circle',
        count: 0
      });
    }

    return jsonResponse({ data: alerts });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    return jsonResponse({
      data: [{
        type: 'urgent',
        title: 'System Error',
        message: 'Unable to load alerts. Please refresh the page.',
        icon: 'fas fa-exclamation-triangle',
        count: 0
      }]
    }, 500);
  }
});

// Get dashboard stats
router.get('/stats', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    const stats = {
      remainingOrders: 0,
      doneOrders: 0,
      totalPayment: 0,
      receivedPayment: 0,
      activeOrders: 0,
      completedOrders: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalEarnings: 0,
      paidSalary: 0,
      remainingSalary: 0,
      remainingClientPayments: 0,
      workerPayments: 0,
      userRole: userRole || 'unknown'
    };

    if (userRole === 'owner') {
      const orders = await db.prepare('SELECT * FROM orders WHERE shop_name = ?')
        .bind(shopName).all();

      const projects = await db.prepare('SELECT * FROM editing_projects WHERE shop_name = ?')
        .bind(shopName).all();

      const clients = await db.prepare('SELECT * FROM clients WHERE shop_name = ?')
        .bind(shopName).all();

      const salaries = await db.prepare(`
        SELECT s.* FROM salaries s
        JOIN users u ON s.employee_id = u.id
        WHERE u.shop_name = ?
      `).bind(shopName).all();

      stats.remainingOrders = orders.results.filter(o => o.status !== 'completed').length;
      stats.doneOrders = orders.results.filter(o => o.status === 'completed').length;
      stats.totalPayment = orders.results.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      stats.receivedPayment = orders.results.reduce((sum, o) => sum + (o.received_payment || 0), 0);
      stats.activeProjects = projects.results.filter(p => p.status !== 'completed').length;
      stats.completedProjects = projects.results.filter(p => p.status === 'completed').length;
      stats.remainingClientPayments = clients.results.reduce((sum, c) => sum + (c.pending_payments || 0), 0);
      stats.workerPayments = salaries.results.filter(s => s.is_paid === 0).reduce((sum, s) => sum + s.amount, 0);
    } else {
      if (userId) {
        const userOrders = await db.prepare(`
          SELECT DISTINCT o.* FROM orders o
          LEFT JOIN order_workers ow ON o.id = ow.order_id
          LEFT JOIN order_transporters ot ON o.id = ot.order_id
          WHERE ow.worker_id = ? OR ot.transporter_id = ?
        `).bind(userId, userId).all();

        const userProjects = await db.prepare('SELECT * FROM editing_projects WHERE editor_id = ?')
          .bind(userId).all();

        const userSalaries = await db.prepare('SELECT * FROM salaries WHERE employee_id = ?')
          .bind(userId).all();

        stats.activeOrders = userOrders.results.filter(o => o.status !== 'completed').length;
        stats.completedOrders = userOrders.results.filter(o => o.status === 'completed').length;
        stats.activeProjects = userProjects.results.filter(p => p.status !== 'completed').length;
        stats.completedProjects = userProjects.results.filter(p => p.status === 'completed').length;
        stats.totalEarnings = userSalaries.results.reduce((sum, s) => sum + s.amount, 0);
        stats.paidSalary = userSalaries.results.filter(s => s.is_paid === 1).reduce((sum, s) => sum + s.amount, 0);
        stats.remainingSalary = stats.totalEarnings - stats.paidSalary;
      }
    }

    return jsonResponse({ data: stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return jsonResponse({ data: stats }, 500);
  }
});

export function handleDashboard(request) {
  return router.handle(request);
}
