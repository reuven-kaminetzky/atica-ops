/**
 * lib/supabase.js — Supabase Client
 * 
 * Two clients:
 *   createClient()       — server-side (API routes, server components)
 *   createBrowserClient() — client-side (React components)
 * 
 * Env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY (server only — bypasses RLS)
 */

const { createClient: _createClient } = require('@supabase/supabase-js');

let _serverClient = null;
let _serviceClient = null;

/**
 * Server-side Supabase client (uses anon key, respects RLS)
 */
function createClient() {
  if (_serverClient) return _serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _serverClient = _createClient(url, key);
  return _serverClient;
}

/**
 * Server-side Supabase client with service role (bypasses RLS)
 * Use for admin operations, cron jobs, data migration
 */
function createServiceClient() {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _serviceClient = _createClient(url, key);
  return _serviceClient;
}

/**
 * Check if Supabase is configured and reachable
 */
async function isAvailable() {
  const client = createClient();
  if (!client) return false;
  try {
    const { error } = await client.from('app_settings').select('key').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

module.exports = { createClient, createServiceClient, isAvailable };
