/**
 * Starter quote templates. Offered in Settings → Quote Template as a choice: picking one puts it in the
 * editor, where it still has to be saved. Nothing here ever overwrites a workspace's template on its own.
 *
 * Placeholders are the quote form's field keys: {{client_name}}, {{qn_number}}, {{date}}, {{subtotal}},
 * {{company_logo}}, and {{#each quotation_items}} … {{/each}} for the line items.
 */
export type QuoteTemplate = { id: string; name: string; blurb: string; accent: string; html: string };

const shell = (accent: string, body: string, font: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: ${font}; color: #1f2937; line-height: 1.5; margin: 0; padding: 40px; font-size: 12px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  table.items { width: 100%; border-collapse: collapse; margin: 24px 0; }
  table.items th { background: ${accent}; color: #fff; text-align: left; padding: 10px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
  table.items td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
  table.items td.num, table.items th.num { text-align: right; }
  .totals { width: 280px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 7px 0; }
  .totals .grand { border-top: 2px solid ${accent}; font-weight: 700; font-size: 15px; color: ${accent}; }
  .muted { color: #6b7280; }
  .foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; }
</style>
</head>
<body><div class="sheet">${body}</div></body>
</html>`;

const ITEMS_ROWS = `{{#each quotation_items}}
        <tr>
          <td>{{item_code}}</td>
          <td>{{item_name}}</td>
          <td class="num">{{quantity}}</td>
          <td>{{uom}}</td>
          <td class="num">{{item_rate}}</td>
          <td class="num">{{item_br}}</td>
        </tr>
      {{/each}}`;

const ITEMS_TABLE = `<table class="items">
      <thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
      ${ITEMS_ROWS}
      </tbody>
    </table>`;

export const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Logo, address block and a clean item table. Safe for any industry.',
    accent: '#1f2937',
    html: shell('#1f2937', `<table style="width:100%;margin-bottom:28px"><tr>
      <td><img src="{{company_logo}}" alt="" style="max-height:52px" /></td>
      <td style="text-align:right">
        <div style="font-size:22px;font-weight:700;letter-spacing:.04em">QUOTATION</div>
        <div class="muted">{{qn_number}} &middot; {{date}}</div>
      </td>
    </tr></table>
    <table style="width:100%;margin-bottom:8px"><tr>
      <td style="vertical-align:top">
        <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.08em">Prepared for</div>
        <div style="font-weight:700;font-size:14px;margin-top:4px">{{client_name}}</div>
        <div class="muted">{{contact_person}}<br />{{billing_address}}</div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.08em">Contact</div>
        <div class="muted" style="margin-top:4px">{{email_id}}<br />{{phone_number}}</div>
      </td>
    </tr></table>
    ${ITEMS_TABLE}
    <div class="totals">
      <div><span class="muted">Subtotal</span><span>{{subtotal}}</span></div>
      <div class="grand"><span>Total</span><span>{{subtotal}}</span></div>
    </div>
    <div class="foot"><b>Payment terms:</b> {{payment_terms}}<br /><b>Delivery:</b> {{delivery_terms}}</div>`,
      "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Typographic and quiet. No rules, no fills, lots of white space.',
    accent: '#111827',
    html: shell('#111827', `<div style="margin-bottom:40px">
      <img src="{{company_logo}}" alt="" style="max-height:40px" />
      <div style="margin-top:28px;font-size:30px;font-weight:300;letter-spacing:-.02em">Quotation</div>
      <div class="muted" style="margin-top:4px">{{qn_number}} &middot; {{date}}</div>
    </div>
    <div style="margin-bottom:28px">
      <div style="font-weight:600">{{client_name}}</div>
      <div class="muted">{{contact_person}} &middot; {{email_id}}</div>
    </div>
    <table class="items" style="margin-top:0">
      <thead><tr style="background:none"><th style="background:none;color:#9ca3af;border-bottom:1px solid #e5e7eb">Description</th><th class="num" style="background:none;color:#9ca3af;border-bottom:1px solid #e5e7eb">Qty</th><th class="num" style="background:none;color:#9ca3af;border-bottom:1px solid #e5e7eb">Rate</th><th class="num" style="background:none;color:#9ca3af;border-bottom:1px solid #e5e7eb">Amount</th></tr></thead>
      <tbody>
      {{#each quotation_items}}
        <tr>
          <td>{{item_name}}<div class="muted" style="font-size:10px">{{item_code}}</div></td>
          <td class="num">{{quantity}} {{uom}}</td>
          <td class="num">{{item_rate}}</td>
          <td class="num">{{item_br}}</td>
        </tr>
      {{/each}}
      </tbody>
    </table>
    <div class="totals"><div class="grand"><span>Total</span><span>{{subtotal}}</span></div></div>
    <div class="foot">{{payment_terms}} &middot; {{delivery_terms}}</div>`,
      "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"),
  },
  {
    id: 'gst',
    name: 'GST (India)',
    blurb: 'Tax invoice layout with HSN, GST column and amount in words.',
    accent: '#0e6b57',
    html: shell('#0e6b57', `<table style="width:100%;margin-bottom:22px"><tr>
      <td><img src="{{company_logo}}" alt="" style="max-height:50px" /></td>
      <td style="text-align:right">
        <div style="font-size:19px;font-weight:700;color:#0e6b57">QUOTATION</div>
        <div class="muted">No. {{qn_number}}<br />Date {{date}}</div>
      </td>
    </tr></table>
    <table style="width:100%;border:1px solid #e5e7eb;margin-bottom:4px"><tr>
      <td style="padding:12px;border-right:1px solid #e5e7eb;vertical-align:top">
        <div class="muted" style="font-size:10px;text-transform:uppercase">Bill to</div>
        <div style="font-weight:700;margin-top:4px">{{client_name}}</div>
        <div class="muted">{{billing_address}}<br />GSTIN: {{gstin}}</div>
      </td>
      <td style="padding:12px;vertical-align:top">
        <div class="muted" style="font-size:10px;text-transform:uppercase">Contact</div>
        <div style="margin-top:4px">{{contact_person}}</div>
        <div class="muted">{{email_id}}<br />{{phone_number}}</div>
      </td>
    </tr></table>
    <table class="items">
      <thead><tr><th>HSN</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">GST %</th><th class="num">Amount</th></tr></thead>
      <tbody>
      {{#each quotation_items}}
        <tr>
          <td>{{item_code}}</td>
          <td>{{item_name}}</td>
          <td class="num">{{quantity}}</td>
          <td>{{uom}}</td>
          <td class="num">{{item_rate}}</td>
          <td class="num">{{#if gst}}{{gst}}%{{else}}&mdash;{{/if}}</td>
          <td class="num">{{item_br}}</td>
        </tr>
      {{/each}}
      </tbody>
    </table>
    <div class="totals">
      <div><span class="muted">Taxable value</span><span>{{subtotal}}</span></div>
      <div class="grand"><span>Grand total</span><span>{{subtotal}}</span></div>
    </div>
    <div class="foot">
      <b>Payment terms:</b> {{payment_terms}}<br />
      <b>Delivery:</b> {{delivery_terms}}<br />
      This is a quotation, not a tax invoice. Prices are valid for 15 days unless stated otherwise.
    </div>`,
      "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"),
  },
  {
    id: 'editorial',
    name: 'Editorial',
    blurb: 'Serif headings in the Bloomgard register, with a vermilion rule.',
    accent: '#ea5420',
    html: shell('#ea5420', `<div style="border-top:3px solid #ea5420;padding-top:20px;margin-bottom:34px">
      <table style="width:100%"><tr>
        <td><img src="{{company_logo}}" alt="" style="max-height:46px" /></td>
        <td style="text-align:right" class="muted">{{qn_number}} &middot; {{date}}</td>
      </tr></table>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.05;margin-top:20px">Quotation</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#ea5420;font-style:italic">for {{client_name}}</div>
    </div>
    <div class="muted" style="margin-bottom:22px">{{contact_person}} &middot; {{email_id}} &middot; {{phone_number}}</div>
    ${ITEMS_TABLE}
    <div class="totals">
      <div><span class="muted">Subtotal</span><span>{{subtotal}}</span></div>
      <div class="grand"><span>Total</span><span>{{subtotal}}</span></div>
    </div>
    <div class="foot"><b>Payment:</b> {{payment_terms}} &nbsp;&middot;&nbsp; <b>Delivery:</b> {{delivery_terms}}</div>`,
      "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"),
  },
];
