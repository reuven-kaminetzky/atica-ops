import { getDataBreakdown } from '../actions';
import DataExplorer from '../../../components/data-explorer';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const initial = await getDataBreakdown({
    groupBy: 'vendor',
    columns: ['stock', 'incoming', 'sales', 'velocity'],
    sort: { column: 'stock', direction: 'desc' },
  });
  return (
    <DataExplorer
      initial={initial}
      defaultGroupBy="vendor"
      title="Vendors"
    />
  );
}
