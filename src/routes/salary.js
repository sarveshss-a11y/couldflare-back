/**
 * Salary routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/salary' });

// Get all salaries
router.get('/', async (request) => {
  try {
    const url = new URL(request.url);
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const userId = url.searchParams.get('userId');
    const db = request.db;

    let query = `
      SELECT s.*, u.first_name, u.last_name, u.role, u.shop_name
      FROM salaries s
      LEFT JOIN users u ON s.employee_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (shopName && userRole !== 'owner') {
      if (!userId || userId === 'undefined') {
        return jsonResponse({ data: [] });
      }
      query += ' AND s.employee_id = ?';
      params.push(userId);
    } else if (shopName) {
      query += ' AND u.shop_name = ?';
      params.push(shopName);
    }

    query += ' ORDER BY s.created_at DESC';

    const results = await db.prepare(query).bind(...params).all();
    return jsonResponse({ data: results.results });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    return jsonResponse({ data: [] });
  }
});

// Get employee's salary
router.get('/my-salary', async (request) => {
  try {
    const url = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId');
    const shopName = url.searchParams.get('shopName');
    const userRole = url.searchParams.get('userRole');
    const db = request.db;

    if (!employeeId || employeeId === 'undefined') {
      return jsonResponse({
        data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] }
      });
    }

    const employee = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(employeeId).first();

    if (!employee) {
      return jsonResponse({
        data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] }
      });
    }

    if (shopName && userRole !== 'owner' && employee.shop_name !== shopName) {
      return jsonResponse({ message: 'Access denied' }, 403);
    }

    const salaries = await db.prepare('SELECT * FROM salaries WHERE employee_id = ?')
      .bind(employeeId).all();

    const totalEarnings = salaries.results.reduce((sum, s) => sum + s.amount, 0);
    const paidSalary = salaries.results.filter(s => s.is_paid === 1).reduce((sum, s) => sum + s.amount, 0);
    const remainingSalary = totalEarnings - paidSalary;

    return jsonResponse({
      data: { totalEarnings, paidSalary, remainingSalary, salaries: salaries.results }
    });
  } catch (error) {
    console.error('Error fetching employee salary:', error);
    return jsonResponse({
      data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] }
    });
  }
});

// Create salary entry
router.post('/', async (request) => {
  try {
    const body = await request.json();
    const { employeeId, amount, salaryType, relatedOrder, relatedProject, description } = body;
    const db = request.db;

    const salaryId = generateId();

    await db.prepare(`
      INSERT INTO salaries (
        id, employee_id, amount, salary_type, related_order_id,
        related_project_id, description, is_paid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(salaryId, employeeId, amount, salaryType, relatedOrder || null, relatedProject || null, description || '').run();

    await db.prepare(`
      UPDATE users SET
        total_earnings = total_earnings + ?,
        remaining_salary = remaining_salary + ?
      WHERE id = ?
    `).bind(amount, amount, employeeId).run();

    return jsonResponse({ message: 'Salary entry created', salaryId }, 201);
  } catch (error) {
    console.error('Error creating salary entry:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Pay salary
router.post('/pay', async (request) => {
  try {
    const body = await request.json();
    const { employeeId, amount, shopName } = body;
    const db = request.db;

    if (!employeeId || !amount) {
      return jsonResponse({ message: 'Employee ID and amount are required' }, 400);
    }

    const employee = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(employeeId).first();

    if (!employee) {
      return jsonResponse({ message: 'Employee not found' }, 404);
    }

    if (shopName && employee.shop_name !== shopName) {
      return jsonResponse({ message: 'Access denied' }, 403);
    }

    const unpaidSalaries = await db.prepare(`
      SELECT * FROM salaries
      WHERE employee_id = ? AND is_paid = 0
      ORDER BY created_at ASC
    `).bind(employeeId).all();

    let remainingAmount = amount;
    let totalPaidAmount = 0;
    let paidCount = 0;

    for (const salary of unpaidSalaries.results) {
      if (remainingAmount <= 0) break;

      if (salary.amount <= remainingAmount) {
        await db.prepare(`
          UPDATE salaries SET is_paid = 1, paid_date = ? WHERE id = ?
        `).bind(new Date().toISOString(), salary.id).run();

        remainingAmount -= salary.amount;
        totalPaidAmount += salary.amount;
        paidCount++;
      } else {
        const paidPortionId = generateId();
        await db.prepare(`
          INSERT INTO salaries (
            id, employee_id, amount, salary_type, related_order_id,
            related_project_id, description, is_paid, paid_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).bind(
          paidPortionId, employeeId, remainingAmount, salary.salary_type,
          salary.related_order_id, salary.related_project_id,
          `Partial payment: ${salary.description}`, new Date().toISOString()
        ).run();

        await db.prepare(`
          UPDATE salaries SET amount = amount - ? WHERE id = ?
        `).bind(remainingAmount, salary.id).run();

        totalPaidAmount += remainingAmount;
        paidCount++;
        remainingAmount = 0;
      }
    }

    await db.prepare(`
      UPDATE users SET
        paid_salary = paid_salary + ?,
        remaining_salary = remaining_salary - ?
      WHERE id = ?
    `).bind(totalPaidAmount, totalPaidAmount, employeeId).run();

    return jsonResponse({
      message: 'Payment processed successfully',
      paidAmount: totalPaidAmount,
      paidSalaries: paidCount
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Pay salary (legacy)
router.put('/:id/pay', async (request) => {
  try {
    const salaryId = request.params.id;
    const db = request.db;

    const salary = await db.prepare('SELECT * FROM salaries WHERE id = ?')
      .bind(salaryId).first();

    if (!salary) {
      return jsonResponse({ message: 'Salary entry not found' }, 404);
    }

    if (salary.is_paid === 1) {
      return jsonResponse({ message: 'Salary already paid' }, 400);
    }

    await db.prepare(`
      UPDATE salaries SET is_paid = 1, paid_date = ? WHERE id = ?
    `).bind(new Date().toISOString(), salaryId).run();

    await db.prepare(`
      UPDATE users SET
        paid_salary = paid_salary + ?,
        remaining_salary = remaining_salary - ?
      WHERE id = ?
    `).bind(salary.amount, salary.amount, salary.employee_id).run();

    return jsonResponse({ message: 'Salary paid successfully' });
  } catch (error) {
    console.error('Error paying salary:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleSalary(request) {
  return router.handle(request);
}
