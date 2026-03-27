import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const sql = neon();

    const [po] = await sql`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

    const [payments, history, shipments] = await Promise.all([
      sql`SELECT * FROM po_payments WHERE po_id = ${id} ORDER BY due_date ASC`,
      sql`SELECT * FROM po_stage_history WHERE po_id = ${id} ORDER BY changed_at DESC`,
      sql`SELECT * FROM shipments WHERE po_id = ${id} ORDER BY created_at DESC`,
    ]);

    return NextResponse.json({ ...po, payments, stageHistory: history, shipments });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const sql = neon();
    const body = await request.json();

    const [existing] = await sql`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!existing) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

    // Build update fields
    const allowed = ['vendor_name', 'fob', 'units', 'moq', 'lead_days', 'duty', 'hts',
      'etd', 'eta', 'container', 'vessel', 'notes', 'payment_terms'];

    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    // Recompute totals
    const fob = updates.fob ?? existing.fob ?? 0;
    const units = updates.units ?? existing.units ?? 0;
    const duty = updates.duty ?? existing.duty ?? 0;
    updates.fob_total = (fob * units).toFixed(2);
    updates.landed_cost = (fob * (1 + duty / 100)).toFixed(2);

    const [updated] = await sql`
      UPDATE purchase_orders SET
        vendor_name = COALESCE(${updates.vendor_name}, vendor_name),
        fob = COALESCE(${updates.fob}, fob),
        units = COALESCE(${updates.units}, units),
        fob_total = ${updates.fob_total},
        landed_cost = ${updates.landed_cost},
        moq = COALESCE(${updates.moq}, moq),
        lead_days = COALESCE(${updates.lead_days}, lead_days),
        duty = COALESCE(${updates.duty}, duty),
        hts = COALESCE(${updates.hts}, hts),
        etd = COALESCE(${updates.etd}, etd),
        eta = COALESCE(${updates.eta}, eta),
        container = COALESCE(${updates.container}, container),
        vessel = COALESCE(${updates.vessel}, vessel),
        notes = COALESCE(${updates.notes}, notes)
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ updated: true, purchaseOrder: updated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
