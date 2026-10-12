import PDFDocument from 'pdfkit';

export function calculateInvoiceTotals({ lineItems = [], subtotal, tax, taxRate = 0, discount = 0, amountPaid = 0 }) {
  let computedSubtotal = Number(subtotal);
  let computedTax = Number(tax);
  if (Array.isArray(lineItems) && lineItems.length) {
    computedSubtotal = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const itemDiscount = Number(item.discount || 0);
      const line = Math.max(0, qty * rate - itemDiscount);
      return sum + line;
    }, 0);
    const itemTax = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const itemDiscount = Number(item.discount || 0);
      const line = Math.max(0, qty * rate - itemDiscount);
      return sum + (line * Number(item.taxRate || 0)) / 100;
    }, 0);
    if (!Number.isFinite(computedTax) || tax == null) computedTax = itemTax;
  }
  if (!Number.isFinite(computedSubtotal)) computedSubtotal = 0;
  if (!Number.isFinite(computedTax) || tax == null) {
    computedTax = (computedSubtotal * Number(taxRate || 0)) / 100;
  }
  const disc = Math.max(0, Number(discount || 0));
  const totalAmount = Math.max(0, computedSubtotal + computedTax - disc);
  const paid = Math.max(0, Number(amountPaid || 0));
  const balanceDue = Math.max(0, totalAmount - paid);
  const normalizedItems = (lineItems || []).map((item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const itemDiscount = Number(item.discount || 0);
    const amount = Math.max(0, quantity * rate - itemDiscount);
    return {
      description: String(item.description || '').trim(),
      quantity,
      rate,
      discount: itemDiscount,
      taxRate: Number(item.taxRate || 0),
      amount
    };
  });
  return {
    lineItems: normalizedItems,
    subtotal: computedSubtotal,
    tax: computedTax,
    taxRate: Number(taxRate || 0),
    discount: disc,
    totalAmount,
    amountPaid: paid,
    balanceDue
  };
}

export function buildInvoicePdfBuffer({ invoice, client, project }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('INVOICE', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#444');
    doc.text(`Invoice #: ${invoice.invoiceNumber}`);
    doc.text(`Date: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '—'}`);
    if (invoice.dueDate) doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`);
    doc.text(`Status: ${invoice.status}`);
    doc.moveDown();
    doc.fillColor('#111').fontSize(12).text('Bill To', { underline: true });
    doc.fontSize(10).fillColor('#333');
    doc.text(client?.clientName || client?.companyName || 'Client');
    if (client?.companyEmail) doc.text(client.companyEmail);
    if (client?.billingAddress || client?.address) doc.text(client.billingAddress || client.address);
    if (client?.gstVatNumber) doc.text(`GST/VAT: ${client.gstVatNumber}`);
    doc.moveDown();
    if (project) {
      doc.fillColor('#111').fontSize(12).text('Project', { underline: true });
      doc.fontSize(10).fillColor('#333').text(`${project.projectName || ''} (${project.projectId || ''})`);
      doc.moveDown();
    }

    const startY = doc.y;
    doc.fillColor('#111').fontSize(10);
    doc.text('Description', 48, startY, { width: 220 });
    doc.text('Qty', 280, startY, { width: 40 });
    doc.text('Rate', 330, startY, { width: 70 });
    doc.text('Amount', 420, startY, { width: 80, align: 'right' });
    doc.moveTo(48, startY + 14).lineTo(547, startY + 14).stroke('#ccc');
    let y = startY + 22;
    const items = invoice.lineItems?.length
      ? invoice.lineItems
      : [{ description: invoice.description || 'Services', quantity: 1, rate: invoice.subtotal, amount: invoice.subtotal }];
    for (const item of items) {
      doc.fillColor('#333').text(item.description || '—', 48, y, { width: 220 });
      doc.text(String(item.quantity ?? 1), 280, y, { width: 40 });
      doc.text(String(item.rate ?? 0), 330, y, { width: 70 });
      doc.text(String(item.amount ?? 0), 420, y, { width: 80, align: 'right' });
      y += 18;
      if (y > 700) { doc.addPage(); y = 48; }
    }
    doc.y = y + 10;
    doc.moveDown();
    const currency = invoice.currency || 'INR';
    doc.fillColor('#111').fontSize(10);
    doc.text(`Subtotal: ${currency} ${Number(invoice.subtotal || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Tax: ${currency} ${Number(invoice.tax || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Discount: ${currency} ${Number(invoice.discount || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.fontSize(12).text(`Total: ${currency} ${Number(invoice.totalAmount || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.fontSize(10).text(`Paid: ${currency} ${Number(invoice.amountPaid || 0).toLocaleString('en-IN')}`, { align: 'right' });
    doc.text(`Balance due: ${currency} ${Number(invoice.balanceDue ?? Math.max(0, invoice.totalAmount - invoice.amountPaid)).toLocaleString('en-IN')}`, { align: 'right' });
    if (invoice.notes) {
      doc.moveDown();
      doc.fillColor('#555').text(`Notes: ${invoice.notes}`);
    }
    doc.end();
  });
}
