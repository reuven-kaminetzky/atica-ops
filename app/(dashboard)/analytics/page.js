import { getDataBreakdown } from '../actions';
import DataExplorer from '../../../components/data-explorer';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const initial = await getDataBreakdown({
    groupBy: 'category',
    columns: ['stock', 'incoming', 'sales', 'velocity', 'days', 'x_rate'],
  });
  return (
    <DataExplorer
      initial={initial}
      defaultGroupBy="category"
      title="Analytics"
      showAllDimensions
    />
  );
}
