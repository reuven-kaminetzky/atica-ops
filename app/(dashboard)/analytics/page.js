import { getProducts } from '../actions';
import AnalyticsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const products = await getProducts();
  return <AnalyticsClient products={products} />;
}
