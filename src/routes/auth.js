/**
 * Authentication routes for Cloudflare Workers
 * Converted from Express.js to Workers format
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId, hashPassword, verifyPassword } from '../index';

const router = Router({ base: '/api/auth' });

// Register
router.post('/register', async (request) => {
  try {
    const body = await request.json();
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      shopName, 
      role, 
      phone,
      isCreatingShop,
      oldWorkerEditorId 
    } = body;

    const db = request.db;

    // Check if user already exists
    const existingUser = await db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (existingUser) {
      return jsonResponse({ message: 'User already exists' }, 400);
    }

    // Create user ID
    const userId = generateId();

    // Prepare user data
    let hashedPassword = null;
    if (password) {
      hashedPassword = await hashPassword(password);
    }

    // Insert user
    await db.prepare(`
      INSERT INTO users (
        id, first_name, last_name, email, password, shop_name, role, phone,
        is_from_worker, original_worker_id, is_from_editor, original_editor_id,
        profile_complete, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      userId,
      firstName,
      lastName,
      email,
      hashedPassword,
      shopName,
      role,
      phone || '',
      role === 'editor' && oldWorkerEditorId ? 1 : 0,
      role === 'editor' && oldWorkerEditorId ? oldWorkerEditorId : null,
      role === 'worker' && oldWorkerEditorId ? 1 : 0,
      role === 'worker' && oldWorkerEditorId ? oldWorkerEditorId : null,
      1
    ).run();

    return jsonResponse({ 
      message: 'User registered successfully',
      user: {
        _id: userId,
        firstName,
        lastName,
        email,
        role,
        shopName,
        phone: phone || ''
      }
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return jsonResponse({ message: 'Server error during registration' }, 500);
  }
});

// Login
router.post('/login', async (request) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    const db = request.db;

    // Find user
    const user = await db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      return jsonResponse({ message: 'Invalid credentials' }, 400);
    }

    // Check if user has a password (non-Google users)
    if (!user.password) {
      return jsonResponse({ message: 'Please use Google login for this account' }, 400);
    }

    // Check password
    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return jsonResponse({ message: 'Invalid credentials' }, 400);
    }

    // Update last login
    await db.prepare(
      'UPDATE users SET last_login = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(user.id).run();

    return jsonResponse({
      message: 'Login successful',
      user: {
        _id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        shopName: user.shop_name,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ message: 'Server error during login' }, 500);
  }
});

// Get shops
router.get('/shops', async (request) => {
  try {
    const db = request.db;

    // Get shops from Shop table
    const shops = await db.prepare(
      'SELECT name FROM shops WHERE is_active = 1 ORDER BY name'
    ).all();

    // If no shops exist, create default ones
    if (shops.results.length === 0) {
      const defaultShops = [
        { name: 'Creative Studios', businessType: 'video_editing' },
        { name: 'Event Productions', businessType: 'mixed' },
        { name: 'Digital Media House', businessType: 'video_editing' },
        { name: 'Wedding Films Co.', businessType: 'video_editing' },
        { name: 'LED Vision Pro', businessType: 'led_walls' },
        { name: 'Drone Masters', businessType: 'drones' }
      ];

      for (const shop of defaultShops) {
        await db.prepare(`
          INSERT INTO shops (id, name, business_type, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).bind(generateId(), shop.name, shop.businessType).run();
      }

      // Fetch again
      const newShops = await db.prepare(
        'SELECT name FROM shops WHERE is_active = 1 ORDER BY name'
      ).all();
      return jsonResponse(newShops.results);
    }

    // Also get unique shop names from users
    const userShops = await db.prepare(
      'SELECT DISTINCT shop_name as name FROM users WHERE shop_name IS NOT NULL AND shop_name != ""'
    ).all();

    // Combine and deduplicate
    const allShops = new Set();
    shops.results.forEach(shop => allShops.add(shop.name));
    userShops.results.forEach(shop => allShops.add(shop.name));

    const shopList = Array.from(allShops).map(name => ({ name }));
    return jsonResponse(shopList);
  } catch (error) {
    console.error('Error fetching shops:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Create new shop
router.post('/shops', async (request) => {
  try {
    const body = await request.json();
    const { name, description, businessType, ownerEmail, ownerName } = body;

    if (!name || !name.trim()) {
      return jsonResponse({ message: 'Shop name is required' }, 400);
    }

    if (!ownerEmail || !ownerName) {
      return jsonResponse({ message: 'Owner email and name are required' }, 400);
    }

    const db = request.db;

    // Check if shop already exists
    const existingShop = await db.prepare(
      'SELECT * FROM shops WHERE LOWER(name) = LOWER(?)'
    ).bind(name.trim()).first();

    if (existingShop) {
      return jsonResponse({ 
        message: 'Shop name already exists. Please choose a different name.',
        shopExists: true
      }, 409);
    }

    // Check if shop name exists in users collection
    const existingUserShop = await db.prepare(
      'SELECT * FROM users WHERE LOWER(shop_name) = LOWER(?) AND role = ?'
    ).bind(name.trim(), 'owner').first();

    if (existingUserShop) {
      return jsonResponse({ 
        message: 'This shop already has an owner. Please choose a different shop name.',
        shopExists: true,
        existingOwner: existingUserShop.email
      }, 409);
    }

    // Create new shop
    const shopId = generateId();
    await db.prepare(`
      INSERT INTO shops (id, name, description, business_type, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      shopId,
      name.trim(),
      description || '',
      businessType || 'mixed',
      ownerEmail
    ).run();

    return jsonResponse({
      message: 'Shop created successfully',
      shop: {
        _id: shopId,
        name: name.trim(),
        description: description || '',
        businessType: businessType || 'mixed'
      }
    }, 201);
  } catch (error) {
    console.error('Error creating shop:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get workers and editors for a shop
router.get('/workers-editors/:shopName', async (request) => {
  try {
    const shopName = decodeURIComponent(request.params.shopName);
    const db = request.db;

    const users = await db.prepare(`
      SELECT id, first_name, last_name, role 
      FROM users 
      WHERE shop_name = ? AND role IN ('worker', 'editor', 'worker_editor')
    `).bind(shopName).all();

    const formattedUsers = users.results.map(u => ({
      _id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role
    }));

    return jsonResponse(formattedUsers);
  } catch (error) {
    console.error('Error fetching workers/editors:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

// Get user by email
router.get('/user/:email', async (request) => {
  try {
    const email = decodeURIComponent(request.params.email);
    const db = request.db;

    const user = await db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (user) {
      return jsonResponse({
        user: {
          _id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role,
          shopName: user.shop_name
        }
      });
    } else {
      return jsonResponse({ message: 'User not found' }, 404);
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    return jsonResponse({ message: 'Server error' }, 500);
  }
});

export function handleAuth(request) {
  return router.handle(request);
}
