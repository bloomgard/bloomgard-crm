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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Master Data POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
