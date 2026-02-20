/**
 * Editing Projects routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/editing' });

// Get all editing projects
router.get('/', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    let query = 'SELECT * FROM editing_projects WHERE 1=1';
    const params = [];

    if (shopName && userRole !== 'owner') {
      if (!userId || userId === 'undefined') {
        return jsonResponse({ data: [] });
      }
      query += ' AND shop_name = ? AND editor_id = ?';
      params.push(shopName, userId);
    } else if (shopName && userRole === 'owner') {
      query += ' AND shop_name = ?';
      params.push(shopName);
    }

    query += ' ORDER BY created_at DESC';

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return jsonResponse({ data: [] });
  }
});

// Create new editing project
router.post('/', async (request) => {
  try {
    const body = await request.json();
    const {
      clientId, editorId, projectName, description, editingValue,
      pendriveIncluded, pendriveValue, totalAmount, commissionPercentage,
      startDate, endDate, receivedPayment, shopName, createdBy
    } = body;

    if (!clientId || !editorId || !projectName || !editingValue || !totalAmount || !commissionPercentage || !endDate || !shopName || !createdBy) {
      return jsonResponse({ message: 'Missing required fields' }, 400);
    }

    const db = request.db;
    const projectId = generateId();
    const commissionAmount = Math.round((Number(editingValue) * Number(commissionPercentage)) / 100);
    const remainingPayment = Number(totalAmount) - (Number(receivedPayment) || 0);

    await db.prepare(`
      INSERT INTO editing_projects (
        id, client_id, editor_id, project_name, description, editing_value,
        pendrive_included, pendrive_value, total_amount, received_payment,
        remaining_payment, commission_percentage, commission_amount,
        start_date, end_date, status, created_by, shop_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
    `).bind(
      projectId, clientId, editorId, projectName, description || '', Number(editingValue),
      pendriveIncluded ? 1 : 0, Number(pendriveValue) || 0, Number(totalAmount),
      Number(receivedPayment) || 0, remainingPayment, Number(commissionPercentage),
      commissionAmount, startDate || new Date().toISOString(), endDate, createdBy, shopName
    ).run();

    // Create salary entry
    const salaryId = generateId();
    await db.prepare(`
      INSERT INTO salaries (
        id, employee_id, amount, salary_type, related_project_id,
        description, work_date, is_paid
      ) VALUES (?, ?, ?, 'editing_work', ?, ?, ?, 0)
    `).bind(
      salaryId, editorId, commissionAmount, projectId,
      `Editing project: ${projectName}`, startDate || new Date().toISOString()
    ).run();

    // Update editor earnings
    await db.prepare(`
      UPDATE users SET
        total_earnings = total_earnings + ?,
        remaining_salary = remaining_salary + ?
      WHERE id = ?
    `).bind(commissionAmount, commissionAmount, editorId).run();

    // Update client statistics
    await db.prepare(`
      UPDATE clients SET
        lifetime_editing_projects = lifetime_editing_projects + 1,
        total_payments_due = total_payments_due + ?,
        pending_payments = pending_payments + ?
      WHERE id = ?
    `).bind(Number(totalAmount), remainingPayment, clientId).run();

    return jsonResponse({ message: 'Project created successfully', projectId }, 201);
  } catch (error) {
    console.error('Error creating project:', error);
    return jsonResponse({ message: 'Server error', error: error.message }, 500);
  }
});

// Update project status
router.put('/:id/status', async (request) => {
  try {
    const body = await request.json();
    const { status } = body;
    const projectId = request.params.id;
    const db = request.db;

    let query = 'UPDATE editing_projects SET status = ?';
    const params = [status];

    if (status === 'completed') {
      query += ', completion_date = ?';
      params.push(new Date().toISOString());
    }

    query += ' WHERE id = ?';
    params.push(projectId);

    await db.prepare(query).bind(...params).run();
    return jsonResponse({ message: 'Project status updated' });
  } catch (error) {
    console.error('Error updating project:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Update payment
router.put('/:id/payment', async (request) => {
  try {
    const body = await request.json();
    const { receivedPayment } = body;
    const projectId = request.params.id;
    const db = request.db;

    const project = await db.prepare('SELECT total_amount FROM editing_projects WHERE id = ?')
      .bind(projectId).first();

    if (!project) {
      return jsonResponse({ message: 'Project not found' }, 404);
    }

    const remainingPayment = project.total_amount - receivedPayment;

    await db.prepare(`
      UPDATE editing_projects SET
        received_payment = ?,
        remaining_payment = ?
      WHERE id = ?
    `).bind(receivedPayment, remainingPayment, projectId).run();

    return jsonResponse({ message: 'Payment updated' });
  } catch (error) {
    console.error('Error updating payment:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Delete project
router.delete('/:id', async (request) => {
  try {
    const projectId = request.params.id;
    const db = request.db;

    const project = await db.prepare(`
      SELECT editor_id, commission_amount, total_amount, received_payment, client_id
      FROM editing_projects WHERE id = ?
    `).bind(projectId).first();

    if (!project) {
      return jsonResponse({ message: 'Project not found' }, 404);
    }

    // Delete salary entries
    await db.prepare('DELETE FROM salaries WHERE related_project_id = ?').bind(projectId).run();

    // Update editor earnings
    if (project.editor_id && project.commission_amount) {
      await db.prepare(`
        UPDATE users SET
          total_earnings = total_earnings - ?,
          remaining_salary = remaining_salary - ?
        WHERE id = ?
      `).bind(project.commission_amount, project.commission_amount, project.editor_id).run();
    }

    // Update client statistics
    if (project.client_id) {
      const remainingPayment = project.total_amount - project.received_payment;
      await db.prepare(`
        UPDATE clients SET
          lifetime_editing_projects = lifetime_editing_projects - 1,
          total_payments_due = total_payments_due - ?,
          pending_payments = pending_payments - ?
        WHERE id = ?
      `).bind(project.total_amount, remainingPayment, project.client_id).run();
    }

    // Delete project
    await db.prepare('DELETE FROM editing_projects WHERE id = ?').bind(projectId).run();

    return jsonResponse({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleEditing(request) {
  return router.handle(request);
}
