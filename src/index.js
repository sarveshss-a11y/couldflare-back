/**
 * Cloudflare Workers API for Business Manager
 * Main entry point with routing
 */

import { Router } from 'itty-router';
import { handleAuth } from './routes/auth';
import { handleOrders } from './routes/orders';
import { handleEditing } from './routes/editing';
import { handleClients } from './routes/clients';
import { handleProducts } from './routes/products';
import { handleSalary } from './routes/salary';
import { handleTransportation } from './routes/transportation';
import { handlePayments } from './routes/payments';
import { handleUsers } from './routes/users';
import { handleDashboard } from './routes/dashboard';

// Create router
const router = Router();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
router.options('*', () => new Response(null, { headers: corsHeaders }));

// Health check
router.get('/health', () => {
  return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount route handlers
router.all('/api/auth/*', handleAuth);
router.all('/api/orders/*', handleOrders);
router.all('/api/editing/*', handleEditing);
router.all('/api/clients/*', handleClients);
router.all('/api/products/*', handleProducts);
router.all('/api/salary/*', handleSalary);
router.all('/api/transportation/*', handleTransportation);
router.all('/api/payments/*', handlePayments);
router.all('/api/users/*', handleUsers);
router.all('/api/dashboard/*', handleDashboard);

// 404 handler
router.all('*', () => jsonResponse({ error: 'Not found' }, 404));

// Main fetch handler
export default {
  async fetch(request, env, ctx) {
    try {
      // Attach DB to request for routes to access
      request.db = env.DB;
      request.env = env;
      
      const response = await router.handle(request);
      
      // Add CORS headers to response
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      
      return newResponse;
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error', message: error.message }, 500);
    }
  },
};

// Helper function to create JSON responses
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Helper function to generate UUID
export function generateId() {
  return crypto.randomUUID();
}

// Helper function to hash passwords using SHA-256
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper function to verify passwords
export async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}
