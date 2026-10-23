import { test, expect, APIRequestContext } from '@playwright/test';
import { admin, resolveActor, Actor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';

/** Master Data API: keys, values, parent-to-child links, Excel-style bulk import, cascade delete. */
test.describe.serial('Master Data API', () => {
  let actor: Actor;
  let tag: string;
  const key = (s: string) => `e2e_${tag}_${s}`;
  const api = (request: APIRequestContext, action: string, payload: any) =>
    request.post(`${ENV.baseUrl}/api/master-data`, { headers: protectionHeaders(), data: { action, payload } });
  const tree = async (request: APIRequestContext) => {
    const r = await request.get(`${ENV.baseUrl}/api/master-data?tenantId=${actor.tenantId}&tabType=manual`, { headers: protectionHeaders() });
    expect(r.status()).toBe(200);
    return (await r.json()).tree as any[];
  };
  const find = (nodes: any[], name: string): any => {
    for (const n of nodes) { if (n.key_name === name) return n; const c = find(n.children || [], name); if (c) return c; }
    return null;
  };
  let a: any, b: any;

  test.beforeAll(async () => { actor = await resolveActor(); tag = runTag(); });

  test.afterAll(async () => {
    // children first, then parents
    const { data: ents } = await admin().from('master_data_entries').select('id, parent_id').eq('tenant_id', actor.tenantId).like('key_name', `e2e_${tag}_%`);
    const ids = (ents || []).map((e) => e.id);
    if (ids.length) {
      await admin().from('master_data_values').delete().in('entry_id', ids);
      await admin().from('master_data_entries').delete().in('id', ids.filter((i) => (ents || []).find((e) => e.id === i && e.parent_id)));
      await admin().from('master_data_entries').delete().in('id', ids);
    }
  });

  test('GET needs a tenant id', async ({ request }) => {
    const r = await request.get(`${ENV.baseUrl}/api/master-data`, { headers: protectionHeaders() });
    expect(r.status()).toBe(400);
  });

  test('unknown action and empty body are rejected', async ({ request }) => {
    expect((await api(request, 'doesNotExist', { x: 1 })).status()).toBe(400);
    const empty = await request.post(`${ENV.baseUrl}/api/master-data`, { headers: protectionHeaders(), data: {} });
    expect(empty.status()).toBe(400);
  });

  test('create a key and a child key', async ({ request }) => {
    const ra = await api(request, 'createMasterKey', { tenant_id: actor.tenantId, tab_type: 'manual', key_name: key('a'), parent_id: null });
    expect(ra.status()).toBe(200);
    a = (await ra.json()).data;
    const rb = await api(request, 'createMasterKey', { tenant_id: actor.tenantId, tab_type: 'manual', key_name: key('b'), parent_id: a.id });
    b = (await rb.json()).data;
    expect(b.parent_id).toBe(a.id);
    const t = await tree(request);
    expect(find(t, key('a')).children.map((c: any) => c.key_name)).toContain(key('b'));
  });

  test('values link parent value to child value', async ({ request }) => {
    const va = (await (await api(request, 'addValueOption', { entry_id: a.id, value_text: 'Alpha' })).json()).data;
    const vb = (await (await api(request, 'addValueOption', { entry_id: b.id, value_text: 'Beta', parent_value_id: va.id })).json()).data;
    expect(vb.parent_value_id).toBe(va.id);
    const t = await tree(request);
    const bNode = find(t, key('b'));
    expect(bNode.values.find((v: any) => v.value_text === 'Beta').parent_value_id).toBe(va.id);
  });

  test('edit value, rename key, set AI description, toggle auto-extract', async ({ request }) => {
    let t = await tree(request);
    const alpha = find(t, key('a')).values[0];
    expect((await api(request, 'editValueOption', { id: alpha.id, value_text: 'Alpha2' })).status()).toBe(200);
    expect((await api(request, 'editMasterKeyName', { id: a.id, key_name: key('a') })).status()).toBe(200);
    expect((await api(request, 'updateAIDescription', { id: a.id, ai_description: 'E2E note for the AI' })).status()).toBe(200);
    expect((await api(request, 'toggleAutoExtractable', { id: a.id, is_auto_extractable: true })).status()).toBe(200);
    t = await tree(request);
    const n = find(t, key('a'));
    expect(n.values[0].value_text).toBe('Alpha2');
    expect(n.ai_description).toBe('E2E note for the AI');
    expect(n.is_auto_extractable).toBe(true);
  });

  test('bulk import builds the parent-to-child chain and is idempotent', async ({ request }) => {
    const payload = {
      tenant_id: actor.tenantId, tab_type: 'manual',
      columns: [{ key_name: key('a') }, { key_name: key('b') }, { key_name: key('c') }],
      rows: [['A1', 'B1', 'C1'], ['A1', 'B2', 'C2'], ['A2', 'B3', ''], ['', 'orphan', 'orphan']],
    };
    const r1 = await api(request, 'bulkImport', payload);
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    expect(j1.entries).toBe(3);
    const snapshot = async () => {
      const { data: ents } = await admin().from('master_data_entries').select('id, key_name').eq('tenant_id', actor.tenantId).like('key_name', `e2e_${tag}_%`);
      const { data: vals } = await admin().from('master_data_values').select('id, value_text, parent_value_id, entry_id').in('entry_id', (ents || []).map((e) => e.id));
      return { ents: ents || [], vals: vals || [] };
    };
    const s1 = await snapshot();
    const byKey = (k: string) => s1.ents.find((e) => e.key_name === key(k))!.id;
    const A1 = s1.vals.find((v) => v.value_text === 'A1' && v.entry_id === byKey('a'))!;
    const kids = s1.vals.filter((v) => v.parent_value_id === A1.id).map((v) => v.value_text).sort();
    expect(kids).toEqual(['B1', 'B2']);                                      // both children linked to A1
    const B1 = s1.vals.find((v) => v.value_text === 'B1')!;
    expect(s1.vals.find((v) => v.value_text === 'C1')!.parent_value_id).toBe(B1.id);
    expect(s1.vals.some((v) => v.value_text === 'B3')).toBe(true);           // A2 -> B3 kept
    expect(s1.vals.some((v) => v.value_text === 'orphan')).toBe(false);      // a blank parent cell drops the row

    const r2 = await api(request, 'bulkImport', payload);                    // same data again
    expect(r2.status()).toBe(200);
    const s2 = await snapshot();
    expect(s2.vals.length).toBe(s1.vals.length);                             // no duplicates
  });

  test('bulk import rejects a request with no columns', async ({ request }) => {
    const r = await api(request, 'bulkImport', { tenant_id: actor.tenantId, tab_type: 'manual', columns: [], rows: [['x']] });
    expect(r.status()).toBe(400);
  });

  test('bulk add ignores blanks and duplicate values', async ({ request }) => {
    const r = await api(request, 'bulkAddValues', { entry_id: a.id, values: ['X', 'X', '  ', 'Y'] });
    expect(r.status()).toBe(200);
    const { data } = await admin().from('master_data_values').select('value_text').eq('entry_id', a.id).in('value_text', ['X', 'Y']);
    expect((data || []).map((d) => d.value_text).sort()).toEqual(['X', 'Y']);
  });

  test('deleting a value removes the child values linked to it', async ({ request }) => {
    const { data: a1 } = await admin().from('master_data_values').select('id').eq('entry_id', a.id).eq('value_text', 'A1').single();
    expect((await api(request, 'deleteValueOption', { id: a1!.id })).status()).toBe(200);
    const { data: kids } = await admin().from('master_data_values').select('id').eq('parent_value_id', a1!.id);
    expect(kids).toEqual([]);
  });

  test('deleting a key removes its nested keys and values', async ({ request }) => {
    expect((await api(request, 'deleteMasterKey', { id: a.id })).status()).toBe(200);
    const t = await tree(request);
    expect(find(t, key('a'))).toBeNull();
    expect(find(t, key('b'))).toBeNull();
  });
});
