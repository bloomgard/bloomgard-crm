import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const tabType = searchParams.get('tabType') || 'manual';

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
  }

  try {
    const { data: entries, error: entriesError } = await supabase
      .from('master_data_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('tab_type', tabType);

    if (entriesError) throw entriesError;

    const { data: values, error: valuesError } = await supabase
      .from('master_data_values')
      .select('*')
      // Note: We ideally filter values by entry_ids, but since tenant_id is on entries,
      // we can fetch all values and join in memory for simplicity, or use Supabase relations.
      // But for safety if dataset is huge, we should fetch values related to the fetched entries.
      .in('entry_id', entries?.map(e => e.id) || []);

    if (valuesError) throw valuesError;

    // Build the hierarchical tree
    const treeMap = new Map();
    entries?.forEach(entry => {
      treeMap.set(entry.id, { ...entry, values: [], children: [] });
    });

    values?.forEach(val => {
      if (treeMap.has(val.entry_id)) {
        treeMap.get(val.entry_id).values.push(val);
      }
    });

    const rootEntries: any[] = [];
    treeMap.forEach(entry => {
      if (entry.parent_id && treeMap.has(entry.parent_id)) {
        treeMap.get(entry.parent_id).children.push(entry);
      } else {
        rootEntries.push(entry);
      }
    });

    return NextResponse.json({ success: true, tree: rootEntries }, { status: 200 });
  } catch (err: any) {
    console.error('fetchMasterTree Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, payload } = body;

    if (!action || !payload) {
      return NextResponse.json({ error: 'Action and payload required' }, { status: 400 });
    }

    if (action === 'createMasterKey') {
      const { data, error } = await supabase.from('master_data_entries').insert(payload).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'addValueOption') {
      const { data, error } = await supabase.from('master_data_values').insert(payload).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'editValueOption') {
      const { data, error } = await supabase
        .from('master_data_values')
        .update({ value_text: payload.value_text })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'editMasterKeyName') {
      const { data, error } = await supabase
        .from('master_data_entries')
        .update({ key_name: payload.key_name })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'updateAIDescription') {
      const { data, error } = await supabase
        .from('master_data_entries')
        .update({ ai_description: payload.ai_description })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'toggleAutoExtractable') {
      const { data, error } = await supabase
        .from('master_data_entries')
        .update({ is_auto_extractable: payload.is_auto_extractable })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (action === 'deleteValueOption') {
      const { error } = await supabase.from('master_data_values').delete().eq('id', payload.id);
      if (error) throw error;
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (action === 'bulkAddValues') {
      // payload: { entry_id, values: string[], parent_value_id?: string | null }
      const rows = (payload.values || [])
        .map((v: string) => String(v || '').trim())
        .filter(Boolean)
        .map((value_text: string) => ({
          entry_id: payload.entry_id,
          value_text,
          parent_value_id: payload.parent_value_id ?? null,
        }));
      if (rows.length === 0) return NextResponse.json({ success: true, inserted: 0 }, { status: 200 });
      const { data, error } = await supabase
        .from('master_data_values')
        .upsert(rows, { onConflict: 'entry_id,value_text,parent_value_id', ignoreDuplicates: true })
        .select();
      if (error) throw error;
      return NextResponse.json({ success: true, inserted: data?.length || 0 }, { status: 200 });
    }

    if (action === 'bulkImport') {
      // payload: { tenant_id, tab_type, columns: [{key_name}], rows: string[][] }
      const { tenant_id, tab_type = 'manual', columns = [], rows = [] } = payload;
      if (!tenant_id || columns.length === 0) {
        return NextResponse.json({ error: 'tenant_id and columns required' }, { status: 400 });
      }

      // 1. Resolve (find-or-create) an entry per column, chaining parent_id left -> right.
      const entryIds: string[] = [];
      let parentId: string | null = null;
      for (const col of columns) {
        const keyName = String(col.key_name || '').trim();
        if (!keyName) throw new Error('Every mapped column needs a key_name');

        let query = supabase
          .from('master_data_entries')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('tab_type', tab_type)
          .eq('key_name', keyName);
        query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
        const { data: existing } = await query.maybeSingle();

        let entryId = existing?.id;
        if (!entryId) {
          const { data: created, error: cErr } = await supabase
            .from('master_data_entries')
            .insert({ tenant_id, tab_type, key_name: keyName, parent_id: parentId })
            .select('id')
            .single();
          if (cErr) throw cErr;
          entryId = created.id;
        }
        entryIds.push(entryId);
        parentId = entryId;
      }

      // 2. Walk each row left -> right, upserting values linked by parent_value_id.
      const valueCache = new Map<string, string>(); // `${entryId}|${parentValueId}|${text}` -> valueId
      let valuesCreated = 0;
      let rowsProcessed = 0;

      for (const row of rows) {
        let parentValueId: string | null = null;
        let broke = false;
        for (let i = 0; i < entryIds.length; i++) {
          const text = String(row[i] ?? '').trim();
          if (!text) { broke = true; break; } // can't link deeper cols without this parent
          const cacheKey = `${entryIds[i]}|${parentValueId ?? ''}|${text.toLowerCase()}`;
          let valueId: string | undefined = valueCache.get(cacheKey);
          if (!valueId) {
            const upRes: any = await supabase
              .from('master_data_values')
              .upsert(
                { entry_id: entryIds[i], value_text: text, parent_value_id: parentValueId },
                { onConflict: 'entry_id,value_text,parent_value_id' }
              )
              .select('id')
              .single();
            if (upRes.error) throw upRes.error;
            valueId = upRes.data.id as string;
            valueCache.set(cacheKey, valueId);
            valuesCreated++;
          }
          parentValueId = valueId ?? null;
        }
        if (!broke || parentValueId) rowsProcessed++;
      }

      return NextResponse.json(
        { success: true, entries: entryIds.length, valuesTouched: valuesCreated, rowsProcessed },
        { status: 200 }
      );
    }

    if (action === 'deleteMasterKey') {
      const { data, error } = await supabase.from('master_data_entries').delete().eq('id', payload.id);
      if (error) throw error;
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Master Data POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
