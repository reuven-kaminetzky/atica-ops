import { getDataBreakdown } from '../actions';
import DataExplorer from '../../../components/data-explorer';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const initial = await getDataBreakdown({
    groupBy: 'category',
    columns: ['stock', 'days', 'velocity', 'incoming'],
    filters: { outOfStock: false },
    sort: { column: 'days', direction: 'asc' },
  });
  return (
    <DataExplorer
      initial={initial}
      defaultGroupBy="category"
      title="Stock"
      defaultSort={{ column: 'days', direction: 'asc' }}
    />
  );
}
