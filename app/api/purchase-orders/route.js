import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';

export async function GET() {
  try {
    const sql = neon();
    const rows = await sql`
      SELECT po.*,
        COALESCE(pmt.total_amount, 0)::numeric as total_payments,
        COALESCE(pmt.paid_amount, 0)::numeric as paid_amount,
        COALESCE(pmt.overdue_count, 0)::int as overdue_payments
      FROM purchase_orders po
      LEFT JOIN LATERAL (
        SELECT SUM(amount) as total_amount,
          SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END) as paid_amount,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
        FROM po_payments WHERE po_id = po.id
      ) pmt ON TRUE
      ORDER BY po.created_at DESC
    `;
    return NextResponse.json({ count: rows.length, purchaseOrders: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const sql = neon();
    const body = await request.json();

    // Validate required fields
    if (!body.mpId && !body.vendor) {
      return NextResponse.json({ error: 'mpId or vendor required' }, { status: 400 });
    }

    // Generate ID
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const id = body.id || `PO-${month}${day}-${rand}`;

    const [created] = await sql`
      INSERT INTO purchase_orders (
        id, mp_id, mp_name, mp_code, category, vendor_id, vendor_name,
        fob, units, fob_total, landed_cost, moq, lead_days, duty, hts,
        stage, stage_index, etd, eta, container, vessel,
        styles, sizes, fits, payment_terms, notes, tags
      ) VALUES (
        ${id}, ${body.mpId || null}, ${body.mpName || null}, ${body.mpCode || null},
        ${body.category || null}, ${body.vendorId || null}, ${body.vendorName || body.vendor || null},
        ${body.fob || 0}, ${body.units || 0},
        ${(body.fob || 0) * (body.units || 0)},
        ${body.fob ? (body.fob * (1 + (body.duty || 0) / 100)).toFixed(2) : null},
        ${body.moq || 0}, ${body.lead || body.leadDays || 0}, ${body.duty || 0}, ${body.hts || null},
        ${'concept'}, ${1},
        ${body.etd || null}, ${body.eta || null}, ${body.container || null}, ${body.vessel || null},
        ${JSON.stringify(body.styles || [])}, ${body.sizes || null},
        ${JSON.stringify(body.fits || [])},
        ${body.paymentTerms || 'standard'}, ${body.notes || ''}, ${body.tags || []}
      ) RETURNING *
    `;

    // Auto-generate payment schedule
    if (created && body.fob && body.units) {
      const total = body.fob * body.units;
      const terms = body.paymentTerms || 'standard';
      const payments = [];

      if (terms === 'standard' || terms === 'split') {
        payments.push({ type: 'deposit', pct: 30, amount: total * 0.3, label: 'Deposit (30%)' });
        payments.push({ type: 'production', pct: 40, amount: total * 0.4, label: 'Production (40%)' });
        payments.push({ type: 'balance', pct: 30, amount: total * 0.3, label: 'Balance (30%)' });
      } else if (terms === 'full') {
        payments.push({ type: 'full', pct: 100, amount: total, label: 'Full payment' });
      } else {
        payments.push({ type: 'deposit', pct: 50, amount: total * 0.5, label: 'Deposit (50%)' });
        payments.push({ type: 'balance', pct: 50, amount: total * 0.5, label: 'Balance (50%)' });
      }

      for (const p of payments) {
        const payId = `${id}-${p.type}`;
        await sql`
          INSERT INTO po_payments (id, po_id, type, label, pct, amount, status)
          VALUES (${payId}, ${id}, ${p.type}, ${p.label}, ${p.pct}, ${p.amount}, 'planned')
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }

    // Audit
    await sql`
      INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
      VALUES ('po', ${id}, 'created', ${JSON.stringify(body)}, ${body.createdBy || null})
    `;

    return NextResponse.json({ created: true, purchaseOrder: created });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
