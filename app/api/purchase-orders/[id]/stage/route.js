import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';

const STAGES = [
  { id: 1, name: 'concept' },
  { id: 2, name: 'design' },
  { id: 3, name: 'sample' },
  { id: 4, name: 'approved', gate: 'pd' },
  { id: 5, name: 'costed', gate: 'finance' },
  { id: 6, name: 'ordered' },
  { id: 7, name: 'production' },
  { id: 8, name: 'qc', gate: 'pd' },
  { id: 9, name: 'shipped' },
  { id: 10, name: 'in_transit' },
  { id: 11, name: 'received' },
  { id: 12, name: 'distribution' },
];

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const sql = neon();
    const body = await request.json();

    const [po] = await sql`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

    const currentIdx = STAGES.findIndex(s => s.name === po.stage);
    if (currentIdx === -1) return NextResponse.json({ error: `Unknown current stage: ${po.stage}` }, { status: 400 });

    // Determine target stage
    let targetStage;
    if (body.stage) {
      targetStage = STAGES.find(s => s.name === body.stage);
    } else {
      targetStage = STAGES[currentIdx + 1];
    }

    if (!targetStage) return NextResponse.json({ error: 'Already at final stage' }, { status: 400 });

    // Gate check
    if (targetStage.gate) {
      if (!body.checkedBy) {
        const gateLabel = targetStage.gate === 'pd' ? 'PD' : 'Finance';
        return NextResponse.json({
          error: `${gateLabel} check-in required for "${targetStage.name}". Pass checkedBy in body.`,
          gate: targetStage.gate,
        }, { status: 400 });
      }
    }

    // Advance
    const [updated] = await sql`
      UPDATE purchase_orders 
      SET stage = ${targetStage.name}, stage_index = ${targetStage.id}
      WHERE id = ${id}
      RETURNING *
    `;

    // Side effects
    const effects = [];

    // Auto-create shipment at in_transit
    if (targetStage.name === 'in_transit' && po.container) {
      const shipId = `SH-${id.replace('PO-', '')}`;
      try {
        await sql`
          INSERT INTO shipments (id, po_id, container, vessel, origin, etd, eta, status)
          VALUES (${shipId}, ${id}, ${po.container}, ${po.vessel}, ${po.country || 'China'}, 
            ${po.etd}, ${po.eta}, 'in_transit')
          ON CONFLICT (id) DO NOTHING
        `;
        effects.push({ type: 'shipment:created', id: shipId });
      } catch (e) {
        effects.push({ type: 'shipment:failed', error: e.message });
      }
    }

    // Mark payments as upcoming when ordered
    if (targetStage.name === 'ordered') {
      await sql`
        UPDATE po_payments SET status = 'upcoming' 
        WHERE po_id = ${id} AND type = 'deposit' AND status = 'planned'
      `;
      effects.push({ type: 'payment:deposit_upcoming' });
    }

    // Audit
    await sql`
      INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
      VALUES ('po', ${id}, 'stage_advanced', 
        ${JSON.stringify({ from: po.stage, to: targetStage.name, gate: targetStage.gate || null })},
        ${body.checkedBy || null})
    `;

    return NextResponse.json({
      advanced: true,
      from: po.stage,
      to: targetStage.name,
      purchaseOrder: updated,
      effects,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
