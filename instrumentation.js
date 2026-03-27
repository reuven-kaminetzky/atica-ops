/**
 * instrumentation.js — Next.js Server Startup Hook
 * 
 * Runs once when the server starts. Wires domain event handlers
 * so that when a PO is created or a sale happens, all subscribers fire.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initialize } = require('./lib/event-handlers');
    initialize();
  }
}
