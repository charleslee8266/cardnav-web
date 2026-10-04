import { getPool } from '../store.js';

/** Consume the published order; classification and priority belong to data collection. */
export async function loadModelFamilyCatalog(): Promise<{ name: string; displayOrder: number }[]> {
  const result = await getPool().query<{ name: string; displayOrder: number }>(`
    SELECT name, display_order AS "displayOrder" FROM model_family_catalog
    ORDER BY display_order, name
  `);
  return result.rows;
}

export async function loadGatewayFamilyFilterOptions(): Promise<string[]> {
  const result = await getPool().query<{ name: string }>(`
    SELECT DISTINCT catalog.name, catalog.display_order FROM model_family_catalog AS catalog
    JOIN gateway_sites AS sites ON catalog.name = ANY(sites.recent_model_families)
    WHERE sites.status = 'online' AND sites.type = 'gateway'
    ORDER BY catalog.display_order, catalog.name
  `);
  return result.rows.map(row => row.name);
}

export async function loadGatewayPaymentFilterOptions(): Promise<string[]> {
  const result = await getPool().query<{ name: string }>(`
    SELECT DISTINCT jsonb_array_elements_text(payment_methods) AS name
    FROM gateway_sites WHERE status = 'online' AND type = 'gateway' ORDER BY name
  `);
  return result.rows.map(row => row.name);
}

export async function loadLeaderboardProviderOptions(): Promise<string[]> {
  const result = await getPool().query<{ name: string }>(`
    SELECT DISTINCT model_organization AS name FROM model_leaderboards
    WHERE model_organization IS NOT NULL AND model_organization <> '' ORDER BY name
  `);
  return result.rows.map(row => row.name);
}

export async function loadGatewayProviderFilterOptions(): Promise<string[]> {
  const result = await getPool().query<{ name: string }>(`
    SELECT DISTINCT model_provider AS name FROM gateway_model_summaries
    WHERE model_provider <> '' ORDER BY name
  `);
  return result.rows.map(row => row.name);
}
