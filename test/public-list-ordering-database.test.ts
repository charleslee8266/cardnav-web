/** 文件说明: 验证数据库公开列表排序与浏览器置顶规则一致。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { loadShopProductsData, loadGatewaySites } from '../src/store.js';
import { prioritizeShopProductRows } from '../src/shop-sponsored-pinning.js';
import { pinSiteRows } from '../src/site-list-pinning.js';

test('SQL首屏、完整列表与共享两轮分配一致，合作和赞赏共用二十行', {
  skip: !process.env.CARDNAV_TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.CARDNAV_TEST_DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE shop_sites (
      id text, slug text DEFAULT '', name text, family text, url text, score numeric, sponsor boolean,
      support_total_cents integer DEFAULT 0, support_points numeric, status text DEFAULT 'online', type text DEFAULT 'cardShop',
      last_product_refresh_success_at timestamptz, product_count integer DEFAULT 3, in_stock_product_count integer DEFAULT 3
    ) ON COMMIT DROP;
    CREATE TEMP TABLE shop_products (
      id text, site_id text, category_name text DEFAULT '', auto_category text DEFAULT 'other', name text,
      price text DEFAULT '1', price_number numeric DEFAULT 1, price_unit text DEFAULT 'USD', product_url text,
      stock integer DEFAULT 1, in_stock boolean DEFAULT true, active boolean DEFAULT true, score numeric, shop_recommendation integer DEFAULT 0, refreshed_at timestamptz
    ) ON COMMIT DROP;
    CREATE TEMP TABLE gateway_sites (
      site_id text, name text, url text, family text DEFAULT '', score numeric, weight integer DEFAULT 0,
      availability_percent numeric DEFAULT 0, avg_success_latency_ms numeric, created_at timestamptz,
      slug text, host text, summary text, invite_url text, sponsor boolean, support_total_cents integer DEFAULT 0,
      support_points numeric, model_providers text[], model_families text[], payment_methods text[], model_count integer DEFAULT 0,
      price_count integer DEFAULT 0, recent_model_providers text[], recent_model_families text[], latest_price_fetched_at timestamptz,
      status text DEFAULT 'online', type text DEFAULT 'gateway'
    ) ON COMMIT DROP;`);
    for (const [partners, supporters, partnerRows] of [[6,12,8], [3,12,6], [2,7,4], [6,0,12], [0,8,0], [0,6,0], [12,8,12], [1,0,2], [0,10,0], [0,11,0], [4,15,5], [4,16,4], [4,17,4]]) {
      await db.query('TRUNCATE shop_sites, shop_products, gateway_sites');
      for (let i = 0; i < partners+supporters; i++) {
        const id = `site-${i}`;
        await db.query(`INSERT INTO shop_sites (id,name,family,url,score,sponsor,support_points)
          VALUES ($1,$1,'', $2,$3,$4,$5)`, [id, `https://${id}.test`, 100-i, i<partners, i+1]);
        await db.query(`INSERT INTO gateway_sites (site_id,name,url,slug,score,sponsor,support_points)
          VALUES ($1,$1,$2,$1,$3,$4,$5)`, [id, `https://${id}.test`, 100-i, i<partners, i+1]);
        for (let j = 0; j < 3; j++) await db.query(`INSERT INTO shop_products (id,site_id,name,score)
          VALUES ($1,$2,$1,$3)`, [`${id}-${j}`, id, 1000-i*10-j]);
      }
      const full = await loadShopProductsData({queryClient: db});
      const partial = await loadShopProductsData({queryClient: db, productLimit: 7});
      assert.deepEqual(partial.products, full.products.slice(0,7));
      const rows = full.products.map(p => ({...p, productFavoriteKey:p.id, siteFavoriteKey:p.siteId, sponsor:p.siteSponsor, supportPoints:p.siteSupportPoints}));
      const pins = new Map<string,string>();
      const ordered = prioritizeShopProductRows(rows, {favoriteProductKeys:new Set(), favoriteSiteKeys:new Set()}, (row,kind) => pins.set(row.id,kind));
      assert.deepEqual(ordered.map(row => row.id), full.products.map(row => row.id));
      assert.equal([...pins.values()].filter(kind => kind === 'partner').length, partnerRows);
      assert.equal([...pins.values()].filter(Boolean).length, Math.min(20, partners + supporters + (partners + supporters <= 10 ? partners + supporters : partners)));
      const gateways = await loadGatewaySites({queryClient:db});
      const firstGateways = await loadGatewaySites({queryClient:db,limit:7});
      assert.deepEqual(firstGateways.sites,gateways.sites.slice(0,7));
      const sites = gateways.sites.map(site => ({...site, favorite:false}));
      assert.deepEqual(pinSiteRows(sites),sites);
    }

    // 完整列表的有货部分与仅看有货的首屏保持一致。
    await db.query('TRUNCATE shop_sites, shop_products');
    const merchants = [
      ['partner-high',0,true,2], ['partner',2,true,0],
      ['sold-out-support',3,false,2], ['support-high',4,false,2], ['support-low',0,false,2],
      ['tie-high',3,false,1], ['middle',0,false,1], ['tie-low',2,false,1],
    ];
    for (const [id,score,sponsor,points] of merchants) {
      await db.query(`INSERT INTO shop_sites(id,name,family,url,score,sponsor,support_points)
        VALUES($1,$1,'','https://example.test',$2,$3,$4)`,[id,score,sponsor,points]);
    }
    const products = [
      ['partner-high',18,false],['partner-high',3,true],['partner',18,true],
      ['sold-out-support',19,false],['support-high',17,true],['support-low',0,true],
      ['tie-high',19,true],['tie-high',19,false],['tie-high',6,true],
      ['middle',17,true],['tie-low',6,true],
    ];
    for (const [index,[site,score,inStock]] of products.entries()) {
      await db.query('INSERT INTO shop_products(id,site_id,name,score,in_stock) VALUES($1,$2,\'same\',$3,$4)',
        [String(99-index).padStart(2,'0'),site,score,inStock]);
    }
    const full = await loadShopProductsData({queryClient:db});
    const stockOnly = await loadShopProductsData({queryClient:db,productLimit:100,inStockOnly:true});
    const rows = full.products.filter(p=>p.inStock).map((p,index)=>({...p, originalIndex:index,
      productFavoriteKey:p.id,siteFavoriteKey:p.siteId,sponsor:p.siteSponsor,supportPoints:p.siteSupportPoints}));
    const actual = prioritizeShopProductRows(rows,{favoriteProductKeys:new Set(),favoriteSiteKeys:new Set()});
    assert.deepEqual(actual.map(p=>p.id),stockOnly.products.map(p=>p.id));
    assert.ok(actual.findIndex(p=>p.siteId==='tie-low') < actual.findIndex(p=>p.siteId==='tie-high' && p.score===6));

    const fullRows = full.products.map(p => ({...p, productFavoriteKey:p.id, siteFavoriteKey:p.siteId, sponsor:p.siteSponsor, supportPoints:p.siteSupportPoints}));
    assert.deepEqual(prioritizeShopProductRows(fullRows, {favoriteProductKeys:new Set(),favoriteSiteKeys:new Set()}).map(p=>p.id), full.products.map(p=>p.id));
    assert.deepEqual(full.products.slice(0, stockOnly.products.length).map(p=>p.id), stockOnly.products.map(p=>p.id));
    const partialAll = await loadShopProductsData({queryClient:db,productLimit:9});
    assert.deepEqual(partialAll.products, full.products.slice(0,9));

    // 库存优先分组，同库存同评分商品按 ID 排列。
    await db.query('TRUNCATE shop_products');
    await db.query(`INSERT INTO shop_products(id,site_id,name,score,in_stock,refreshed_at) VALUES
      ('c','tie-high','Beta',6,true,'2026-10-16'),
      ('a','tie-high','Zulu',6,false,'2020-01-01'),
      ('b','tie-high','Alpha',6,true,'2026-10-16')`);
    const tied = await loadShopProductsData({queryClient:db});
    assert.deepEqual(tied.products.map(p=>p.id),['b','c','a']);
    await db.query("UPDATE shop_sites SET slug = id || '.test'");
    const scoped = await loadShopProductsData({ queryClient: db, siteId: 'tie-high' });
    const scopedPartial = await loadShopProductsData({ queryClient: db, siteId: 'tie-high', productLimit: 1 });
    assert.equal(scoped.totalSiteCount, 1);
    assert.deepEqual(scoped.sites.map(site => site.id), ['tie-high']);
    assert.ok(scoped.products.every(product => product.siteId === 'tie-high' && product.siteSlug === 'tie-high.test'));
    assert.deepEqual(scopedPartial.products, scoped.products.slice(0, 1));
    const missing = await loadShopProductsData({ queryClient: db, siteId: 'missing' });
    assert.equal(missing.totalSiteCount, 0);
    assert.deepEqual(missing.products, []);

    // Category filtering must happen before both the page limit and partner allocation.
    await db.query('TRUNCATE shop_products');
    await db.query(`INSERT INTO shop_products(id,site_id,name,score,auto_category,in_stock) VALUES
      ('unrelated','partner','Claude',100,'claude-pro',true),
      ('partner-plus','partner','GPT Plus',10,'gpt-plus',true),
      ('partner-pro','partner','GPT Pro',9,'gpt-pro-100',true),
      ('regular-plus','tie-high','GPT Plus',90,'gpt-plus',true),
      ('sold-out','tie-high','GPT Plus',99,'gpt-plus',false)`);
    const gpt = await loadShopProductsData({queryClient:db,autoCategory:'gpt',productLimit:2,inStockOnly:true});
    assert.deepEqual(gpt.products.map(p=>p.id),['partner-plus','partner-pro']);
    const plus = await loadShopProductsData({queryClient:db,autoCategory:'gpt-plus',productLimit:2,inStockOnly:true});
    assert.deepEqual(plus.products.map(p=>p.id),['partner-plus','regular-plus']);
    const allPlus = await loadShopProductsData({queryClient:db,autoCategory:'gpt-plus'});
    assert.deepEqual(new Set(allPlus.products.map(p=>p.id)),new Set(['partner-plus','regular-plus','sold-out']));
  } finally {
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  }
});
