import { SupabaseClient } from '@supabase/supabase-js';
import { ALL_OPEN_STATUSES, UNFULFILLED_STATUSES } from './procurement-service';

export async function fetchAllPages<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetcher(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

export interface ProcurementDemandResult {
  productIdsToFetch: Set<string>;
  totalOpenDemandMap: Map<string, number>;
  needToBuyMap: Map<string, number>;
  bundleToComponents: Map<string, { componentId: string; qtyPerBundle: number }[]>;
  negativeStockIds: Set<string>;
}

export async function calculateProcurementDemand(
  supabase: SupabaseClient,
  initialProductIdsToFetch: Set<string>,
  purchased: any[]
): Promise<ProcurementDemandResult> {
  const productIdsToFetch = new Set(initialProductIdsToFetch);

  // 1. Candidate out-of-stock products
  const negativeStockProducts = await fetchAllPages<any>((from, to) =>
    supabase.from('products').select('id').lt('stock_level', 0).range(from, to)
  );
  const negativeStockIds = new Set((negativeStockProducts || []).map((p: any) => p.id));

  // 2. Products with explicitly open order issues (missing items)
  const openIssuesInitial = await fetchAllPages<any>((from, to) =>
    supabase.from('order_issues').select('product_id').eq('status', 'open').range(from, to)
  );
  const openIssueProductIds = new Set(
    (openIssuesInitial || [])
      .map((i: any) => i.product_id)
      .filter((id: any) => id != null)
  );

  // 3. Bundle products
  const bundleProducts = await fetchAllPages<any>((from, to) =>
    supabase.from('products').select('id, assembly_recipe').range(from, to)
  );

  const allBundleIds = new Set(
    bundleProducts
      .filter((bp: any) => (Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : []).length > 0)
      .map((bp: any) => bp.id)
  );
  allBundleIds.forEach((id) => negativeStockIds.delete(id));

  const candidateIds = new Set([
    ...Array.from(productIdsToFetch),
    ...Array.from(negativeStockIds),
    ...Array.from(openIssueProductIds),
  ]);

  const bundleToComponents = new Map<string, { componentId: string; qtyPerBundle: number }[]>();

  // If a bundle itself was somehow directly drafted or had an open issue, 
  // it will be in candidateIds. We must NEVER buy a bundle directly. 
  // We must expand it into its components and add those to candidateIds instead,
  // then remove the bundle from candidateIds.
  bundleProducts.forEach((bp: any) => {
    const recipe = Array.isArray(bp.assembly_recipe) ? bp.assembly_recipe : [];
    if (recipe.length === 0) return;

    const components = recipe.map((comp: any) => ({
      componentId: comp.productId || comp.component_id,
      qtyPerBundle: comp.quantity || 1,
    }));

    if (candidateIds.has(bp.id)) {
      components.forEach((c: any) => {
        if (c.componentId) candidateIds.add(c.componentId);
      });
      candidateIds.delete(bp.id);
      productIdsToFetch.delete(bp.id);
    }

    const relevant = components.filter((c: any) => c.componentId && candidateIds.has(c.componentId));
    if (relevant.length > 0) bundleToComponents.set(bp.id, relevant);
  });

  const bundleProductIds = new Set(bundleToComponents.keys());

  // 4. Live order demand (paginated and chunked to prevent 1000-row cutoff)
  const allProductIdsForDemand = new Set([...Array.from(candidateIds), ...Array.from(bundleProductIds)]);
  const allProductIdsList = Array.from(allProductIdsForDemand);
  const CHUNK_SIZE = 200;
  const demandRows: any[] = [];
  const openIssues: any[] = [];

  for (let i = 0; i < allProductIdsList.length; i += CHUNK_SIZE) {
    const chunk = allProductIdsList.slice(i, i + CHUNK_SIZE);
    const [chunkDemand, chunkIssues] = await Promise.all([
      fetchAllPages<any>((from, to) =>
        supabase
          .from('order_items')
          .select('product_id, quantity, is_packed, orders!inner(id, status, payment_method)')
          .in('product_id', chunk)
          .in('orders.status', ALL_OPEN_STATUSES)
          .range(from, to)
      ),
      fetchAllPages<any>((from, to) =>
        supabase
          .from('order_issues')
          .select('order_id, product_id')
          .eq('status', 'open')
          .in('product_id', chunk)
          .range(from, to)
      ),
    ]);
    demandRows.push(...chunkDemand);
    openIssues.push(...chunkIssues);
  }

  const openIssueKeys = new Set(openIssues?.map((i: any) => `${i.order_id}-${i.product_id}`));

  const totalOpenDemandMap = new Map<string, number>();
  const needToBuyMap = new Map<string, number>();
  const addDemand = (productId: string, quantity: number, isUnfulfilled: boolean) => {
    totalOpenDemandMap.set(productId, (totalOpenDemandMap.get(productId) || 0) + quantity);
    if (isUnfulfilled) {
      needToBuyMap.set(productId, (needToBuyMap.get(productId) || 0) + quantity);
    }
  };

  const isUnfulfilledFor = (row: any, targetProductId: string): boolean => {
    if (row.orders.payment_method === 'Lay-away') return false; // consume stock, but don't auto-buy
    if (row.orders.status === 'Picked (with issue)') {
      return (
        openIssueKeys.has(`${row.orders.id}-${targetProductId}`) ||
        openIssueKeys.has(`${row.orders.id}-${row.product_id}`)
      );
    }
    if (row.is_packed) return false;
    return UNFULFILLED_STATUSES.includes(row.orders.status);
  };

  demandRows?.forEach((row: any) => {
    if (candidateIds.has(row.product_id)) {
      addDemand(row.product_id, row.quantity, isUnfulfilledFor(row, row.product_id));
    }
    const components = bundleToComponents.get(row.product_id);
    components?.forEach((c) =>
      addDemand(c.componentId, row.quantity * c.qtyPerBundle, isUnfulfilledFor(row, c.componentId))
    );
  });

  const pendingReceiptMap = new Map<string, number>();
  purchased?.forEach((p: any) => {
    pendingReceiptMap.set(p.product_id, (pendingReceiptMap.get(p.product_id) || 0) + p.expected_qty);
  });

  for (const [id, qty] of Array.from(needToBuyMap.entries())) {
    const pendingQty = pendingReceiptMap.get(id) || 0;
    if (pendingQty > 0) {
      const remainingNeed = qty - pendingQty;
      if (remainingNeed > 0) {
        needToBuyMap.set(id, remainingNeed);
      } else {
        needToBuyMap.delete(id);
      }
    }
  }

  negativeStockIds.forEach((id) => {
    if ((needToBuyMap.get(id) || 0) > 0) {
      productIdsToFetch.add(id);
    }
  });

  openIssueProductIds.forEach((id) => {
    if ((needToBuyMap.get(id) || 0) > 0) {
      productIdsToFetch.add(id);
    }
  });

  return {
    productIdsToFetch,
    totalOpenDemandMap,
    needToBuyMap,
    bundleToComponents,
    negativeStockIds,
  };
}
