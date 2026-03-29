import { getDataBreakdown } from '../actions';
import AnalyticsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  // Initial load: category breakdown. Client re-fetches when user changes groupBy.
  const initial = await getDataBreakdown({ groupBy: 'category', columns: ['stock', 'sales', 'velocity', 'days', 'incoming'] });
  return <AnalyticsClient initial={initial} />;
}
