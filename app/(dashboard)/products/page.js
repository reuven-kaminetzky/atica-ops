import { getDataBreakdown } from '../actions';
import DataExplorer from '../../../components/data-explorer';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const initial = await getDataBreakdown({
    groupBy: 'category',
    thenBy: ['mp'],
    columns: ['stock', 'velocity', 'days', 'incoming'],
  });
  return (
    <DataExplorer
      initial={initial}
      defaultGroupBy="category"
      defaultThenBy={['mp']}
      title="Products"
    />
  );
}
