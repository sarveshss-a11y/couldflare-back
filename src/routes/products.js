/**
 * Products routes for Cloudflare Workers
 */

import { Router } from 'itty-router';
import { jsonResponse, generateId } from '../index';

const router = Router({ base: '/api/products' });

// Get all active products
router.get('/products', async (request) => {
  try {
    const db = request.db;
    
    console.log('📦 Fetching all active products...');
    const products = await db.prepare(
      'SELECT * FROM products WHERE is_active = 1 ORDER BY name'
    ).all();
    
    console.log(`✅ Found ${products.results.length} active products`);
    return jsonResponse(products.results);
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    return jsonResponse({ message: 'Error fetching products', error: error.message }, 500);
  }
});

// Add new product
router.post('/products', async (request) => {
  try {
    const body = await request.json();
    const { name, type } = body;
    
    console.log('📦 Creating new product:', { name, type });
    
    if (!name) {
      return jsonResponse({ message: 'Product name is required' }, 400);
    }
    
    const db = request.db;
    
    // Check if product already exists
    const existingProduct = await db.prepare(
      'SELECT * FROM products WHERE name = ?'
    ).bind(name.trim()).first();
    
    if (existingProduct) {
      return jsonResponse({ message: 'Product already exists' }, 400);
    }
    
    const productId = generateId();
    await db.prepare(`
      INSERT INTO products (id, name, type, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).bind(productId, name.trim(), type || 'quantity').run();
    
    const product = await db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).bind(productId).first();
    
    console.log('✅ Product created successfully:', product);
    return jsonResponse(product, 201);
  } catch (error) {
    console.error('❌ Error creating product:', error);
    return jsonResponse({ message: 'Error creating product', error: error.message }, 500);
  }
});

// Update product
router.put('/products/:id', async (request) => {
  try {
    const body = await request.json();
    const { name, type, isActive } = body;
    const productId = request.params.id;
    
    console.log('📦 Updating product:', productId, { name, type, isActive });
    
    const db = request.db;
    
    await db.prepare(`
      UPDATE products 
      SET name = ?, type = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name, type, isActive ? 1 : 0, productId).run();
    
    const product = await db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).bind(productId).first();
    
    if (!product) {
      return jsonResponse({ message: 'Product not found' }, 404);
    }
    
    console.log('✅ Product updated successfully:', product);
    return jsonResponse(product);
  } catch (error) {
    console.error('❌ Error updating product:', error);
    return jsonResponse({ message: 'Error updating product', error: error.message }, 500);
  }
});

// Delete product (soft delete)
router.delete('/products/:id', async (request) => {
  try {
    const productId = request.params.id;
    console.log('📦 Deactivating product:', productId);
    
    const db = request.db;
    
    await db.prepare(`
      UPDATE products 
      SET is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(productId).run();
    
    const product = await db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).bind(productId).first();
    
    if (!product) {
      return jsonResponse({ message: 'Product not found' }, 404);
    }
    
    console.log('✅ Product deactivated successfully:', product);
    return jsonResponse({ message: 'Product deactivated successfully', product });
  } catch (error) {
    console.error('❌ Error deactivating product:', error);
    return jsonResponse({ message: 'Error deactivating product', error: error.message }, 500);
  }
});

// Initialize default products
router.post('/products/initialize', async (request) => {
  try {
    console.log('📦 Initializing default products...');
    
    const db = request.db;
    
    const defaultProducts = [
      { name: 'LED', type: 'size' },
      { name: 'Mixer', type: 'quantity' },
      { name: 'Plasma', type: 'quantity' },
      { name: 'Drone', type: 'quantity' },
      { name: 'Camera', type: 'quantity' },
      { name: 'LED Flooring', type: 'size' },
      { name: 'Wireless', type: 'quantity' },
      { name: 'Youtube Live', type: 'quantity' }
    ];
    
    const results = [];
    for (const productData of defaultProducts) {
      const existing = await db.prepare(
        'SELECT * FROM products WHERE name = ?'
      ).bind(productData.name).first();
      
      if (!existing) {
        const productId = generateId();
        await db.prepare(`
          INSERT INTO products (id, name, type, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
        `).bind(productId, productData.name, productData.type).run();
        
        const product = await db.prepare(
          'SELECT * FROM products WHERE id = ?'
        ).bind(productId).first();
        
        results.push(product);
        console.log(`✅ Created product: ${productData.name}`);
      } else {
        console.log(`⏭️ Product already exists: ${productData.name}`);
      }
    }
    
    console.log(`✅ Initialization complete. Created ${results.length} new products.`);
    return jsonResponse({ 
      message: 'Products initialized successfully', 
      created: results.length,
      products: results 
    });
  } catch (error) {
    console.error('❌ Error initializing products:', error);
    return jsonResponse({ message: 'Error initializing products', error: error.message }, 500);
  }
});

export function handleProducts(request) {
  return router.handle(request);
}
