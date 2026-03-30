'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { advanceTransfer } from '../../actions';

const ADVANCE_LABEL = {
  planned:    'Mark Picked →',
  picked:     'Mark Loaded →',
  loaded:     'Depart →',
  in_transit: 'Mark Delivered →',
  delivered:  'Confirm Receipt →',
};

export default function AdvanceTransfer({ id, currentStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const label = ADVANCE_LABEL[currentStatus];
  if (!label) return null;

  function advance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceTransfer(id, nextStatus(currentStatus), 'ops');
      if (result?.error) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      {error && <p className="text-danger text-sm mb-2">{error}</p>}
      <button onClick={advance} disabled={isPending}
        className="px-4 py-1.5 bg-brand text-white rounded-[--radius-sm] text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors">
        {isPending ? 'Updating…' : label}
      </button>
    </div>
  );
}

function nextStatus(current) {
  const flow = ['planned', 'picked', 'loaded', 'in_transit', 'delivered', 'confirmed'];
  return flow[flow.indexOf(current) + 1];
}
