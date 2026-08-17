/* ============================================================
   MAZE ROOM — billing

   Two documents, and which one you get is decided by the data, not by a
   toggle someone can get wrong:
     · GSTIN set in Settings -> TAX INVOICE, with HSN and a CGST/SGST or
       IGST split chosen from the buyer's state
     · GSTIN blank           -> BILL OF SUPPLY, no tax shown anywhere
   Printing GST without being registered is a real offence, so the tax lines
   simply do not exist until the GSTIN does.

   Prices here are tax-INCLUSIVE, so the taxable value is worked backwards
   out of the total. The customer pays exactly the marked price.
   ============================================================ */

const BILL = { invoices: [], loaded: false };

const money0 = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const S = k => {
  const v = DB.settings[k];
  return v === undefined || v === null ? '' : String(v);
};
const isRegistered = () => S('gstin').trim().length > 0;

/* Indian state codes matter only for deciding intra vs inter-state. */
function sameState(buyerState) {
  const home = S('business_state').trim().toLowerCase();
  const b = String(buyerState || '').trim().toLowerCase();
  if (!home || !b) return true;              // assume local when unknown
  return b === home;
}

/* total is inclusive of tax, so: taxable = total / (1 + rate) */
function splitTax(inclusiveTotal, rate, intra) {
  if (!rate) return { taxable: inclusiveTotal, cgst: 0, sgst: 0, igst: 0 };
  const taxable = inclusiveTotal / (1 + rate / 100);
  const tax = inclusiveTotal - taxable;
  return intra
    ? { taxable, cgst: tax / 2, sgst: tax / 2, igst: 0 }
    : { taxable, cgst: 0, sgst: 0, igst: tax };
}

function billFromOrder(o) {
  const reg = isRegistered();
  const rate = reg ? Number(S('gst_rate') || 0) : 0;
  const buyer = o.customer || {};
  const intra = sameState(buyer.state);
  const goods = (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  /* shipping is part of the taxable supply; discount reduces it */
  const inclusive = Math.max(0, goods + (o.shipping || 0) - (o.discount || 0));

  /* Rounding each component independently gave 2678 + 161 + 161 = 3000 against
     a ₹2,999 total — a rupee out, which is exactly what an accountant queries.
     So round the tax halves first, then derive the taxable value as the
     remainder. The printed lines then always add up to the amount paid. */
  const totalRounded = Math.round(inclusive);
  let cgst = 0, sgst = 0, igst = 0;
  if (rate) {
    const taxTotal = Math.round(totalRounded - totalRounded / (1 + rate / 100));
    if (intra) { cgst = Math.round(taxTotal / 2); sgst = taxTotal - cgst; }
    else       { igst = taxTotal; }
  }
  const t = { taxable: totalRounded - cgst - sgst - igst, cgst, sgst, igst };

  const items = (o.items || []).map(i => {
    const line = (i.price || 0) * (i.qty || 1);
    const lt = splitTax(line, rate, intra);
    return { name: i.name || i.id, hsn: reg ? S('hsn_code') : '',
             qty: i.qty || 1, rate: i.price || 0, line,
             taxable: Math.round(lt.taxable) };
  });

  return {
    order_id: o.id,
    seller: { name: S('legal_name') || 'Toss Sports', gstin: S('gstin'),
              address: S('business_address'), state: S('business_state') },
    buyer: { name: buyer.name || '', phone: buyer.phone || '',
             address: [buyer.address, buyer.city, buyer.state, buyer.pin].filter(Boolean).join(', '),
             state: buyer.state || '' },
    place_of_supply: buyer.state || S('business_state'),
    items,
    is_tax_invoice: reg,
    gst_rate: rate,
    taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
    shipping: o.shipping || 0, discount: o.discount || 0,
    round_off: totalRounded - inclusive,
    total: totalRounded,
    payment: o.method || '', channel: o.channel || 'web',
    staff_id: o.staff_id || null
  };
}

async function issueInvoice(o) {
  const existing = BILL.invoices.find(x => x.order_id === o.id && !x.cancelled);
  if (existing) { toast('Already billed as ' + existing.number); return existing; }
  const body = billFromOrder(o);
  try {
    const no = await supaRpc('next_invoice_no');
    const fy = await supaRpc('current_fy');
    body.number = typeof no === 'string' ? no : (no && no[0]) || String(no);
    body.fy = typeof fy === 'string' ? fy : (fy && fy[0]) || String(fy);
    const r = await supa('invoices', { method: 'POST',
      headers: { Prefer: 'return=representation' }, body });
    const inv = (r && r[0]) || body;
    BILL.invoices.unshift(inv);
    toast('Issued ' + inv.number);
    return inv;
  } catch (e) { toast(writeError(e), true); return null; }
}

/* ---------- the printed document ---------- */
function invoiceHTML(inv) {
  const reg = inv.is_tax_invoice;
  const intra = (inv.cgst || 0) > 0;
  const row = i => `
    <tr>
      <td>${esc(i.name)}${i.hsn ? `<span class="hsn">HSN ${esc(i.hsn)}</span>` : ''}</td>
      <td class="n">${i.qty}</td>
      <td class="n">${money0(i.rate)}</td>
      ${reg ? `<td class="n">${money0(i.taxable)}</td>` : ''}
      <td class="n">${money0(i.line)}</td>
    </tr>`;

  return `
  <div class="inv" id="invSheet">
    <div class="inv-head">
      <div>
        <b class="inv-brand">${esc(inv.seller.name || 'Toss Sports')}</b>
        ${inv.seller.address ? `<span>${esc(inv.seller.address)}</span>` : ''}
        ${inv.seller.gstin ? `<span>GSTIN: <b>${esc(inv.seller.gstin)}</b></span>` : ''}
        <span>${esc(S('whatsapp') ? '+' + S('whatsapp') : '')}</span>
      </div>
      <div class="inv-type">
        <b>${reg ? 'TAX INVOICE' : 'BILL OF SUPPLY'}</b>
        <span>${esc(inv.number)}</span>
        <span>${new Date(inv.issued_at || Date.now()).toLocaleDateString('en-IN',
          { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        ${inv.cancelled ? '<span class="inv-void">CANCELLED</span>' : ''}
      </div>
    </div>

    <div class="inv-parties">
      <div><span>Billed to</span>
        <b>${esc(inv.buyer.name || 'Walk-in customer')}</b>
        ${inv.buyer.phone ? `<i>${esc(inv.buyer.phone)}</i>` : ''}
        ${inv.buyer.address ? `<i>${esc(inv.buyer.address)}</i>` : ''}
      </div>
      ${reg ? `<div><span>Place of supply</span><b>${esc(inv.place_of_supply || '—')}</b></div>` : ''}
    </div>

    <table class="inv-tbl">
      <thead><tr>
        <th>Item</th><th class="n">Qty</th><th class="n">Rate</th>
        ${reg ? '<th class="n">Taxable</th>' : ''}<th class="n">Amount</th>
      </tr></thead>
      <tbody>${(inv.items || []).map(row).join('')}</tbody>
    </table>

    <div class="inv-tot">
      ${reg ? `
        <div><span>Taxable value</span><b>${money0(inv.taxable)}</b></div>
        ${intra
          ? `<div><span>CGST @ ${inv.gst_rate / 2}%</span><b>${money0(inv.cgst)}</b></div>
             <div><span>SGST @ ${inv.gst_rate / 2}%</span><b>${money0(inv.sgst)}</b></div>`
          : `<div><span>IGST @ ${inv.gst_rate}%</span><b>${money0(inv.igst)}</b></div>`}
      ` : ''}
      ${inv.shipping ? `<div><span>Shipping</span><b>${money0(inv.shipping)}</b></div>` : ''}
      ${inv.discount ? `<div><span>Discount</span><b>− ${money0(inv.discount)}</b></div>` : ''}
      ${Math.abs(inv.round_off || 0) > 0.004
        ? `<div><span>Rounding</span><b>${inv.round_off > 0 ? '+' : '−'} ${money0(Math.abs(inv.round_off))}</b></div>` : ''}
      <div class="inv-grand"><span>Total</span><b>${money0(inv.total)}</b></div>
      ${reg ? `<p class="inv-note">Prices are inclusive of GST. Tax shown is contained in the amount above.</p>`
            : `<p class="inv-note">Not registered for GST. No tax has been charged on this bill.</p>`}
    </div>

    <p class="inv-foot">${esc(inv.payment ? 'Paid by ' + inv.payment + ' · ' : '')}Handcrafted in our own unit.
      Thank you for your order.</p>
  </div>`;
}

function printInvoice(inv) {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { toast('Allow pop-ups to print', true); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(inv.number)}</title>
    <link rel="stylesheet" href="${location.origin}/css/maze.css">
    </head><body class="printing">${invoiceHTML(inv)}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* ---------- the Billing screen ---------- */
function viewBilling() {
  const reg = isRegistered();
  const unbilled = DB.orders.filter(o =>
    o.status !== 'cancelled' && !BILL.invoices.some(i => i.order_id === o.id && !i.cancelled));

  return `
    <div class="head"><h2>Billing</h2>
      <div class="sp">${exportBar('gst')}
        <button class="btn primary" id="posBtn">+ Counter sale</button></div>
    </div>

    ${!reg ? `<div class="banner">
      <b>No GSTIN set, so bills are issued as a Bill of Supply with no tax.</b>
      That is the correct document if you are not registered. If you are,
      add your GSTIN, registered name and address in <b>Settings</b> and every
      new bill becomes a proper Tax Invoice with the CGST/SGST split.
      Bills already issued are not changed — a document is a record of its moment.
    </div>` : `<div class="banner" style="background:rgba(40,199,111,.1);border-color:rgba(40,199,111,.3);color:#9ff0c0">
      Issuing <b>Tax Invoices</b> · GSTIN ${esc(S('gstin'))} · GST ${esc(S('gst_rate'))}% · HSN ${esc(S('hsn_code'))}
    </div>`}

    ${unbilled.length ? `
      <div class="panel">
        <h3>Waiting to be billed</h3>
        <p class="muted" style="margin-bottom:12px">${unbilled.length} order${unbilled.length === 1 ? '' : 's'} with no bill yet.</p>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th class="num">Total</th><th>When</th><th></th></tr></thead>
          <tbody>${unbilled.map(o => `<tr>
            <td class="pid">${esc(o.id)}</td>
            <td>${esc((o.customer || {}).name || '—')}</td>
            <td class="num">${money0(o.total)}</td>
            <td class="muted">${when(o.created_at)}</td>
            <td style="text-align:right">
              <button class="btn primary sm" data-bill="${esc(o.id)}">Issue bill</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

    <div class="panel">
      <h3>Bills issued</h3>
      ${BILL.invoices.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Number</th><th>Customer</th><th>Type</th>
          <th class="num">Total</th><th>Date</th><th></th></tr></thead>
        <tbody>${BILL.invoices.map(i => `<tr${i.cancelled ? ' style="opacity:.45"' : ''}>
          <td class="pid">${esc(i.number)}</td>
          <td>${esc((i.buyer || {}).name || 'Walk-in')}</td>
          <td><span class="pill ${i.is_tax_invoice ? 'on' : 'low'}">${i.is_tax_invoice ? 'Tax invoice' : 'Bill'}</span></td>
          <td class="num">${money0(i.total)}</td>
          <td class="muted">${when(i.issued_at)}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost sm" data-view="${esc(i.number)}">View</button>
            <button class="btn ghost sm" data-print="${esc(i.number)}">Print</button>
            ${i.cancelled ? '' : `<button class="btn danger sm" data-void="${esc(i.number)}">Cancel</button>`}
          </td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">No bills yet. Issue one from an order above, or take a counter sale.</div>`}
    </div>`;
}

function wireBilling() {
  const find = n => BILL.invoices.find(i => i.number === n);

  /* The report an accountant asks for: every bill with its taxable value
     and tax split, and a month-by-month summary to file against. Cancelled
     bills stay in the list — a voided invoice number must remain visible
     and accounted for, never quietly removed. */
  wireExport('gst', 'GST / sales bill report', () => {
    const inv = BILL.invoices.slice().sort((a, b) =>
      (a.issued_at || '').localeCompare(b.issued_at || ''));
    const live = inv.filter(i => !i.cancelled);
    const row = i => ({
      number: i.number, issued_at: i.issued_at,
      buyer: (i.buyer || {}).name || 'Walk-in',
      gstin: (i.buyer || {}).gstin || '',
      type: i.is_tax_invoice ? 'Tax invoice' : 'Bill of supply',
      taxable: i.taxable || 0, cgst: i.cgst || 0, sgst: i.sgst || 0, igst: i.igst || 0,
      total: i.total || 0, status: i.cancelled ? 'CANCELLED' : 'Valid'
    });

    const byMonth = {};
    live.forEach(i => {
      const k = (i.issued_at || '').slice(0, 7) || 'unknown';
      const m = byMonth[k] || (byMonth[k] = { k, bills: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
      m.bills++; m.taxable += i.taxable || 0; m.cgst += i.cgst || 0;
      m.sgst += i.sgst || 0; m.igst += i.igst || 0; m.total += i.total || 0;
    });

    const sum = k => live.reduce((s, i) => s + (i[k] || 0), 0);
    return [
      { name: 'Bills',
        summary: [
          { k: 'Bills issued', v: live.length },
          { k: 'Taxable value', v: money0(sum('taxable')) },
          { k: 'CGST', v: money0(sum('cgst')) }, { k: 'SGST', v: money0(sum('sgst')) },
          { k: 'IGST', v: money0(sum('igst')) }, { k: 'Total billed', v: money0(sum('total')) }
        ],
        columns: [
          { header: 'Bill number', key: 'number' },
          { header: 'Date', key: 'issued_at', type: 'date' },
          { header: 'Customer', key: 'buyer' }, { header: 'Customer GSTIN', key: 'gstin' },
          { header: 'Type', key: 'type' },
          { header: 'Taxable', key: 'taxable', type: 'money' },
          { header: 'CGST', key: 'cgst', type: 'money' },
          { header: 'SGST', key: 'sgst', type: 'money' },
          { header: 'IGST', key: 'igst', type: 'money' },
          { header: 'Total', key: 'total', type: 'money' },
          { header: 'Status', key: 'status' }
        ],
        rows: inv.map(row) },
      { name: 'By month',
        columns: [
          { header: 'Month', key: 'k' }, { header: 'Bills', key: 'bills', type: 'number' },
          { header: 'Taxable', key: 'taxable', type: 'money' },
          { header: 'CGST', key: 'cgst', type: 'money' },
          { header: 'SGST', key: 'sgst', type: 'money' },
          { header: 'IGST', key: 'igst', type: 'money' },
          { header: 'Total', key: 'total', type: 'money' }
        ],
        rows: Object.values(byMonth).sort((a, b) => a.k.localeCompare(b.k)) }
    ];
  }, isRegistered()
      ? 'GSTIN ' + S('gstin') + ' · GST ' + S('gst_rate') + '% · HSN ' + S('hsn_code') +
        '. Cancelled bills are listed and excluded from the totals.'
      : 'Not GST registered — bills are issued as Bills of Supply with no tax charged.');

  $$('[data-bill]').forEach(b => b.onclick = async () => {
    const o = DB.orders.find(x => x.id === b.dataset.bill);
    if (!o) return;
    b.disabled = true;
    const inv = await issueInvoice(o);
    b.disabled = false;
    if (inv) { render(); showInvoice(inv); }
  });

  $$('[data-view]').forEach(b => b.onclick = () => showInvoice(find(b.dataset.view)));
  $$('[data-print]').forEach(b => b.onclick = () => printInvoice(find(b.dataset.print)));

  $$('[data-void]').forEach(b => b.onclick = async () => {
    const inv = find(b.dataset.void);
    if (!confirm(`Cancel ${inv.number}?\n\nThe bill stays in the record and keeps its number — cancelling never deletes it, because a gap in the sequence is what auditors look for.`)) return;
    try {
      await saveRow('invoices', { id: inv.id, cancelled: true });
      inv.cancelled = true; toast('Bill cancelled'); render();
    } catch (e) { toast(writeError(e), true); }
  });

  const pos = $('#posBtn');
  if (pos) pos.onclick = counterSale;
}

function showInvoice(inv) {
  if (!inv) return;
  openModal(inv.number, `<div class="inv-wrap">${invoiceHTML(inv)}</div>
    <div class="inv-actions">
      <a class="btn ghost" target="_blank" rel="noopener"
         href="https://wa.me/${esc((inv.buyer || {}).phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(invoiceWaText(inv))}">
        Send on WhatsApp</a>
      <button class="btn primary" id="invPrint">Print</button>
    </div>`, async () => true);
  setTimeout(() => { const b = $('#invPrint'); if (b) b.onclick = () => printInvoice(inv); }, 30);
}

/* ---------- counter sale ---------- */
function counterSale() {
  const opts = DB.products.filter(p => p.active)
    .map(p => `<option value="${esc(p.id)}" data-price="${p.price || 0}">${esc(p.name)}${p.price ? ' — ' + money0(p.price) : ''}</option>`).join('');

  openModal('Counter sale', `
    <div class="f">
      <div class="grid2">
        <div class="row"><label>Customer name</label><input id="ps_name" placeholder="Walk-in"></div>
        <div class="row"><label>Phone</label><input id="ps_phone" inputmode="numeric"></div>
        <div class="row"><label>State</label><input id="ps_state" value="${esc(S('business_state'))}">
          <div class="hint">Decides CGST/SGST versus IGST on the bill.</div></div>
        <div class="row"><label>Payment</label><select id="ps_pay">
          <option value="cash">Cash</option><option value="upi">UPI</option>
          <option value="card">Card</option></select></div>
      </div>
      <div class="row"><label>Bat</label><select id="ps_item">${opts}</select></div>
      <div class="grid2">
        <div class="row"><label>Quantity</label><input id="ps_qty" type="number" min="1" value="1"></div>
        <div class="row"><label>Price charged (₹)</label><input id="ps_price" type="number" min="0">
          <div class="hint">Inclusive of tax — this is what the customer hands over.</div></div>
        <div class="row"><label>Discount (₹)</label><input id="ps_disc" type="number" min="0" value="0"></div>
      </div>
      <div class="pos-total" id="ps_total"></div>
    </div>`, async () => {
    const p = DB.products.find(x => x.id === $('#ps_item').value);
    const qty = Number($('#ps_qty').value || 1);
    const price = Number($('#ps_price').value || 0);
    const disc = Number($('#ps_disc').value || 0);
    if (!price) { toast('Enter the price charged', true); return false; }

    const total = Math.max(0, price * qty - disc);
    const order = {
      id: 'POS-' + Date.now().toString(36).toUpperCase(),
      customer: { name: $('#ps_name').value.trim() || 'Walk-in customer',
                  phone: $('#ps_phone').value.trim(), state: $('#ps_state').value.trim() },
      items: [{ id: p.id, name: p.name, price, qty }],
      subtotal: price * qty, shipping: 0, discount: disc, total,
      method: $('#ps_pay').value, channel: 'walkin',
      staff_id: (ME && ME.id) || null, paid: true, status: 'shipped'
    };
    try {
      await supa('orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: order });
      DB.orders.unshift(Object.assign({ created_at: new Date().toISOString() }, order));
      const inv = await issueInvoice(order);
      render();
      if (inv) showInvoice(inv);
    } catch (e) { toast(writeError(e), true); return false; }
  });

  /* live total so whoever is on the till sees what to charge */
  const sync = () => {
    const p = DB.products.find(x => x.id === $('#ps_item').value);
    const price = Number($('#ps_price').value || 0);
    const qty = Number($('#ps_qty').value || 1);
    const disc = Number($('#ps_disc').value || 0);
    const total = Math.max(0, price * qty - disc);
    const rate = isRegistered() ? Number(S('gst_rate') || 0) : 0;
    const t = splitTax(total, rate, sameState($('#ps_state').value));
    $('#ps_total').innerHTML = `<b>${money0(total)}</b>` +
      (rate ? `<span>incl. ${money0(total - t.taxable)} GST at ${rate}%</span>`
            : `<span>no GST — not registered</span>`);
  };
  const sel = $('#ps_item');
  sel.onchange = () => { const p = DB.products.find(x => x.id === sel.value);
    $('#ps_price').value = (p && p.price) || ''; sync(); };
  ['ps_price', 'ps_qty', 'ps_disc', 'ps_state'].forEach(id => { const e = $('#' + id); if (e) e.oninput = sync; });
  sel.onchange();
}

function invoiceWaText(inv) {
  const L = [];
  L.push(`*${inv.is_tax_invoice ? 'Tax Invoice' : 'Bill'} ${inv.number}*`);
  L.push(`${inv.seller.name}`);
  L.push('');
  (inv.items || []).forEach(i => L.push(`${i.qty} × ${i.name} — ${money0(i.line)}`));
  L.push('');
  if (inv.discount) L.push(`Discount: −${money0(inv.discount)}`);
  if (inv.shipping) L.push(`Shipping: ${money0(inv.shipping)}`);
  L.push(`*Total: ${money0(inv.total)}*`);
  if (inv.is_tax_invoice) L.push(`(incl. GST ${inv.gst_rate}%)`);
  L.push('');
  L.push('Thank you 🏏');
  return L.join('\n');
}
