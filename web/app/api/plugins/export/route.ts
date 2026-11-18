import { db, clientName } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';

/**
 * Accounting export: approved quotes, one line per item, as CSV for Tally, Zoho Books or a
 * spreadsheet. Managers and admins. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD on the quote date.
 */
const HEAD = ['Date', 'Quote No', 'Client', 'Contact', 'Email', 'Item Code', 'Item', 'Qty', 'Unit', 'Rate', 'Line Amount', 'Quote Subtotal', 'Status'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cell = (v: any) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

export const GET = withCtx(async (ctx, req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) throw new Error('Dates must look like 2026-11-30.');

  // only the form sections needed: custom_metadata can carry inline attachments
  let q = db.from('quotations')
    .select('id, qn_number, date, status, ci:custom_metadata->"Client Information", qd:custom_metadata->"Quote Details", clients(company_name, contact_person, email_id), quotation_items(item_code, item_name, quantity, uom, item_rate, item_br, display_order)')
    .eq('tenant_id', ctx.tenantId).eq('status', 'Approved').order('date', { ascending: true }).limit(5000);
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const lines = [HEAD.join(',')];
  for (const r of (data || []) as any[]) {
    const ci = r.ci || {}, qd = r.qd || {};
    const items = [...(r.quotation_items || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const lineAmt = (i: any) => num(i.item_br) || num(num(i.quantity) * num(i.item_rate));
    const subtotal = num(qd.subtotal) || items.reduce((s, i) => s + lineAmt(i), 0);
    const base = [r.date || '', r.qn_number || '', clientName({ clients: r.clients, custom_metadata: { 'Client Information': ci } }),
      ci.contact_person || r.clients?.contact_person || '', ci.email_id || r.clients?.email_id || ''];
    if (!items.length) { lines.push([...base, '', '', '', '', '', '', subtotal, r.status].map(cell).join(',')); continue; }
    for (const i of items) lines.push([...base, i.item_code || '', i.item_name || '', num(i.quantity), i.uom || '', num(i.item_rate), lineAmt(i), subtotal, r.status].map(cell).join(','));
  }

  const name = `bloomgard-approved-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}, { managerOnly: true });
