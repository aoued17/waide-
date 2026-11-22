import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  CompanySettings,
  Customer,
  PaymentRecord,
  Rental,
  RentalReturn,
  Sale,
  ServiceOrder,
} from '../types/erp';
import { formatDA, formatDateFR, formatDateTimeFR, formatQty } from './formatters';

const MARGIN = 12; // 12mm strict A4 margin (usableWidth = 186mm on A4 portrait)
const PAGE_FOOTER_Y = 285;
const SAFE_BOTTOM_Y = 272;

export function sanitizePdfText(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u00B7/g, '|')
    .replace(/\u2019|\u2018/g, "'")
    .replace(/\u201C|\u201D/g, '"');
}

function getPageDimensions(doc: jsPDF): { width: number; height: number; right: number; usableWidth: number } {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  return {
    width,
    height,
    right: width - MARGIN,
    usableWidth: width - MARGIN * 2,
  };
}

function ensureSpace(doc: jsPDF, currentY: number, neededHeight: number): number {
  const { height } = getPageDimensions(doc);
  if (currentY + neededHeight > height - 18) {
    doc.addPage();
    return 16;
  }
  return currentY;
}

function drawRightAlignedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxAllowedWidth: number,
  baseFontSize: number
): void {
  const clean = sanitizePdfText(text);
  let size = baseFontSize;
  doc.setFontSize(size);
  while (size > 6.5 && doc.getTextWidth(clean) > maxAllowedWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.text(clean, x, y, { align: 'right' });
  doc.setFontSize(baseFontSize);
}

function addHeader(
  doc: jsPDF,
  company: CompanySettings | null,
  docTitle: string,
  docRef: string,
  docDate: string
): number {
  const { width, right, usableWidth } = getPageDimensions(doc);
  const navy: [number, number, number] = [23, 43, 77];
  const orange: [number, number, number] = [255, 138, 36];

  doc.setFillColor(...navy);
  doc.rect(0, 0, width, 32, 'F');

  doc.setFillColor(...orange);
  doc.rect(0, 32, width, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizePdfText(company?.company_name || 'BatiGest'), MARGIN, 13, { maxWidth: 94 });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    sanitizePdfText(company?.subtitle || 'Gestion commerciale, location et services'),
    MARGIN,
    19,
    { maxWidth: 98 }
  );
  const contactLine = sanitizePdfText(
    [company?.phone, company?.email, company?.address].filter(Boolean).join(' | ')
  );
  if (contactLine) {
    doc.text(contactLine.slice(0, 86), MARGIN, 25, { maxWidth: 100 });
  }

  doc.setFont('helvetica', 'bold');
  drawRightAlignedText(doc, docTitle, right, 13, 80, 11.5);

  doc.setFont('helvetica', 'normal');
  drawRightAlignedText(doc, `Réf : ${docRef}`, right, 20, 80, 8.5);
  drawRightAlignedText(doc, `Date : ${docDate}`, right, 26, 80, 8.5);

  doc.setTextColor(32, 43, 60);

  const taxParts = [
    company?.rc ? `RC: ${company.rc}` : '',
    company?.nif ? `NIF: ${company.nif}` : '',
    company?.nis ? `NIS: ${company.nis}` : '',
    company?.art_imp ? `AI: ${company.art_imp}` : '',
  ].filter(Boolean);

  if (taxParts.length > 0) {
    doc.setFontSize(7.5);
    doc.setTextColor(113, 128, 150);
    doc.text(sanitizePdfText(taxParts.join('  |  ')), MARGIN, 39, { maxWidth: usableWidth });
    doc.setTextColor(32, 43, 60);
    return 46;
  }

  return 41;
}

function addFooter(doc: jsPDF, company: CompanySettings | null): void {
  const pageCount = doc.getNumberOfPages();
  const { right } = getPageDimensions(doc);
  const footerY = Math.min(PAGE_FOOTER_Y, doc.internal.pageSize.getHeight() - 10);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, footerY - 5, right, footerY - 5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(113, 128, 150);
    doc.text(
      sanitizePdfText(company?.invoice_footer || 'BatiGest - Document commercial officiel'),
      MARGIN,
      footerY,
      { maxWidth: right - MARGIN - 28 }
    );
    doc.text(`Page ${i} / ${pageCount}`, right, footerY, { align: 'right' });
  }
}

interface TotalsLine {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'navy' | 'success' | 'danger' | 'normal';
  dividerBefore?: boolean;
}

function drawTotalsBlock(doc: jsPDF, startY: number, lines: TotalsLine[]): number {
  const { right } = getPageDimensions(doc);
  const boxWidth = 96;
  const boxX = right - boxWidth;
  const lineHeight = 6.4;
  const boxHeight = lines.length * lineHeight + 7;

  const y = ensureSpace(doc, startY, boxHeight + 4);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, 'FD');

  let rowY = y + 5.6;
  lines.forEach((line) => {
    if (line.dividerBefore) {
      doc.setDrawColor(203, 213, 225);
      doc.line(boxX + 3, rowY - 4.1, right - 3, rowY - 4.1);
    }

    const baseSize = line.bold ? 9.5 : 8.8;
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
    doc.setFontSize(baseSize);

    if (line.tone === 'success') {
      doc.setTextColor(22, 160, 133);
    } else if (line.tone === 'danger') {
      doc.setTextColor(231, 76, 60);
    } else if (line.tone === 'navy') {
      doc.setTextColor(23, 43, 77);
    } else {
      doc.setTextColor(51, 65, 85);
    }

    doc.text(sanitizePdfText(line.label), boxX + 4, rowY, { maxWidth: 46 });
    drawRightAlignedText(doc, line.value, right - 4, rowY, 42, baseSize);
    rowY += lineHeight;
  });

  doc.setTextColor(32, 43, 60);
  doc.setFont('helvetica', 'normal');
  return y + boxHeight;
}

function drawSignaturesBlock(
  doc: jsPDF,
  startY: number,
  leftLabel: string,
  rightLabel: string
): void {
  const { right } = getPageDimensions(doc);
  const sigY = ensureSpace(doc, Math.min(SAFE_BOTTOM_Y - 24, startY + 12), 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(23, 43, 77);
  doc.text(sanitizePdfText(leftLabel), MARGIN, sigY);
  doc.text(sanitizePdfText(rightLabel), right, sigY, { align: 'right' });

  doc.setDrawColor(148, 163, 184);
  doc.line(MARGIN, sigY + 16, MARGIN + 66, sigY + 16);
  doc.line(right - 66, sigY + 16, right, sigY + 16);
  doc.setTextColor(32, 43, 60);
  doc.setFont('helvetica', 'normal');
}

function buildRentalPdf(
  rental: Rental,
  company: CompanySettings | null,
  mode: 'bon_sortie' | 'devis'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { right, usableWidth } = getPageDimensions(doc);
  const title = mode === 'devis' ? 'DEVIS DE LOCATION' : 'BON DE SORTIE DU MATÉRIEL';
  let y = addHeader(doc, company, title, rental.reference, formatDateTimeFR(rental.exit_at));

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(
    sanitizePdfText(`${rental.customer_name}${rental.customer_phone ? ` (${rental.customer_phone})` : ''}`),
    MARGIN + 18,
    y,
    { maxWidth: usableWidth - 18 }
  );

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(mode === 'devis' ? 'Début prévu :' : 'Sortie :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(formatDateTimeFR(rental.exit_at)), MARGIN + 24, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Retour prévu :', 112, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(formatDateTimeFR(rental.expected_return_at)), right, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('État au départ :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(rental.condition_at_exit || 'Bon état'), MARGIN + 30, y, {
    maxWidth: usableWidth - 30,
  });

  const items = rental.items ?? [];
  autoTable(doc, {
    startY: y + 6,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Réf.', 'Désignation', 'Qté', 'Tarif / Unité', 'Durée', 'Montant']],
    body: items.map((item) => [
      sanitizePdfText(item.equipment_ref + (item.serial_number ? `\nS/N: ${item.serial_number}` : '')),
      sanitizePdfText(item.equipment_designation),
      sanitizePdfText(`${formatQty(item.qty_rented)} ${item.unit_name}`),
      sanitizePdfText(`${formatDA(item.unit_price)} / ${item.pricing_type}`),
      item.pricing_type === 'personnalise' || item.pricing_type === 'selon_accord'
        ? 'Accord'
        : sanitizePdfText(formatQty(item.duration_value)),
      sanitizePdfText(formatDA(item.line_total)),
    ]),
    styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 56 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const remaining = Math.max(0, Number(rental.total_amount) - Number(rental.amount_paid));

  const totalsLines: TotalsLine[] = [
    { label: 'Sous-total :', value: formatDA(rental.subtotal_amount) },
    { label: 'Frais supplémentaires :', value: formatDA(rental.additional_fees) },
    { label: 'Remise :', value: `- ${formatDA(rental.discount)}` },
    {
      label: mode === 'devis' ? 'Total estimé :' : 'Total convenu :',
      value: formatDA(rental.total_amount),
      bold: true,
      tone: 'navy',
      dividerBefore: true,
    },
    ...(mode === 'bon_sortie'
      ? [
          {
            label: 'Montant encaissé :',
            value: formatDA(rental.amount_paid),
            tone: 'success' as const,
            dividerBefore: true,
          },
          {
            label: 'Reste à payer :',
            value: formatDA(remaining),
            bold: true,
            tone: (remaining > 0 ? 'danger' : 'success') as 'danger' | 'success',
          },
        ]
      : []),
  ];

  const totalsEndY = drawTotalsBlock(doc, tableEndY, totalsLines);
  drawSignaturesBlock(
    doc,
    totalsEndY,
    'Signature du responsable',
    mode === 'devis' ? 'Bon pour accord (client)' : 'Signature du client (lu et approuvé)'
  );

  addFooter(doc, company);
  const suffix = mode === 'devis' ? 'devis-location' : 'bon-sortie';
  doc.save(`${rental.reference}-${suffix}.pdf`);
}

export function generateRentalExitPdf(rental: Rental, company: CompanySettings | null): void {
  buildRentalPdf(rental, company, 'bon_sortie');
}

export function generateRentalQuotePdf(rental: Rental, company: CompanySettings | null): void {
  buildRentalPdf(rental, company, 'devis');
}

export function generateReturnReceiptPdf(
  ret: RentalReturn,
  rentalRef: string,
  company: CompanySettings | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { right, usableWidth } = getPageDimensions(doc);
  let y = addHeader(
    doc,
    company,
    'BON DE RETOUR DU MATÉRIEL',
    ret.reference,
    formatDateTimeFR(ret.returned_at)
  );

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(ret.customer_name), MARGIN + 16, y, { maxWidth: 94 });

  doc.setFont('helvetica', 'bold');
  drawRightAlignedText(doc, `Location d'origine : ${rentalRef}`, right, y, 76, 9.5);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(`Date de retour effectif : ${formatDateTimeFR(ret.returned_at)}`), MARGIN, y);

  const condMap: Record<string, string> = {
    bon_etat: 'Bon état',
    endommage: 'Endommagé',
    incomplet: 'Incomplet',
    necessite_maintenance: 'Nécessite maintenance',
  };

  autoTable(doc, {
    startY: y + 6,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Matériel', 'Qté retournée', 'Qté manquante', 'État constaté', 'Observations']],
    body: (ret.items ?? []).map((it) => [
      sanitizePdfText(it.equipment_designation),
      sanitizePdfText(formatQty(it.qty_returned_now)),
      sanitizePdfText(formatQty(it.qty_missing_now)),
      sanitizePdfText(condMap[it.condition] || it.condition),
      sanitizePdfText(it.damage_notes || '-'),
    ]),
    styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 24, halign: 'right' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 36 },
      4: { cellWidth: 46 },
    },
  });

  let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  if (ret.additional_charges > 0) {
    finalY = ensureSpace(doc, finalY, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      sanitizePdfText(`Frais supplémentaires appliqués : ${formatDA(ret.additional_charges)}`),
      MARGIN,
      finalY
    );
    finalY += 6;
  }
  if (ret.remarks) {
    finalY = ensureSpace(doc, finalY, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(sanitizePdfText(`Remarques : ${ret.remarks}`), MARGIN, finalY, {
      maxWidth: usableWidth,
    });
    finalY += 8;
  }

  drawSignaturesBlock(doc, finalY, 'Visa réception magasinier', 'Signature du client');

  addFooter(doc, company);
  doc.save(`${ret.reference}-bon-retour.pdf`);
}

function buildSalePdf(
  sale: Sale,
  company: CompanySettings | null,
  mode: 'facture' | 'devis'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { usableWidth } = getPageDimensions(doc);
  const title = mode === 'devis' ? 'DEVIS DE VENTE' : 'FACTURE DE VENTE';
  let y = addHeader(doc, company, title, sale.reference, formatDateFR(sale.sale_date));

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(
    sanitizePdfText(`${sale.customer_name}${sale.customer_phone ? ` (${sale.customer_phone})` : ''}`),
    MARGIN + 16,
    y,
    { maxWidth: usableWidth - 16 }
  );
  y += 6;
  doc.text(sanitizePdfText(`Mode de paiement : ${sale.payment_method}`), MARGIN, y);

  autoTable(doc, {
    startY: y + 6,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Réf.', 'Désignation', 'Quantité', 'Prix unitaire', 'Total ligne']],
    body: (sale.items ?? []).map((it) => [
      sanitizePdfText(it.equipment_ref),
      sanitizePdfText(it.equipment_designation),
      sanitizePdfText(`${formatQty(it.qty)} ${it.unit_name}`),
      sanitizePdfText(formatDA(it.unit_price)),
      sanitizePdfText(formatDA(it.line_total)),
    ]),
    styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 65 },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const remaining = Math.max(0, Number(sale.total_amount) - Number(sale.amount_paid));

  const totalsLines: TotalsLine[] = [
    { label: 'Sous-total :', value: formatDA(sale.subtotal_amount) },
    { label: 'Remise :', value: `- ${formatDA(sale.discount)}` },
    {
      label: mode === 'devis' ? 'Total estimé :' : 'Net à payer :',
      value: formatDA(sale.total_amount),
      bold: true,
      tone: 'navy',
      dividerBefore: true,
    },
    ...(mode === 'facture'
      ? [
          {
            label: 'Montant encaissé :',
            value: formatDA(sale.amount_paid),
            tone: 'success' as const,
            dividerBefore: true,
          },
          {
            label: 'Reste à payer :',
            value: formatDA(remaining),
            bold: true,
            tone: (remaining > 0 ? 'danger' : 'success') as 'danger' | 'success',
          },
        ]
      : []),
  ];

  const totalsEndY = drawTotalsBlock(doc, tableEndY, totalsLines);
  drawSignaturesBlock(
    doc,
    totalsEndY,
    'Cachet et signature vendeur',
    mode === 'devis' ? 'Bon pour accord (client)' : 'Signature du client'
  );

  addFooter(doc, company);
  doc.save(`${sale.reference}-${mode === 'devis' ? 'devis' : 'facture'}.pdf`);
}

export function generateSaleInvoicePdf(sale: Sale, company: CompanySettings | null): void {
  buildSalePdf(sale, company, 'facture');
}

export function generateSaleQuotePdf(sale: Sale, company: CompanySettings | null): void {
  buildSalePdf(sale, company, 'devis');
}

export function generateServiceOrderPdf(
  service: ServiceOrder,
  company: CompanySettings | null,
  asQuote: boolean = false
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { right, usableWidth } = getPageDimensions(doc);
  let y = addHeader(
    doc,
    company,
    asQuote ? 'DEVIS DE SERVICE TECHNIQUE' : 'ORDRE DE SERVICE / FACTURE',
    service.reference,
    formatDateFR(service.service_date)
  );

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizePdfText(service.customer_name), MARGIN + 16, y, { maxWidth: 92 });
  drawRightAlignedText(doc, `Type : ${service.service_type_name}`, right, y, 76, 9.5);

  y += 6;
  const descLines = doc.splitTextToSize(
    sanitizePdfText(`Description : ${service.description}`),
    usableWidth
  ) as string[];
  doc.text(descLines, MARGIN, y);
  y += Math.max(8, descLines.length * 4.5 + 3);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Prestation', 'Début prévu', 'Fin prévue', 'Prix convenu', 'Payé', 'Reste']],
    body: [
      [
        sanitizePdfText(service.service_type_name),
        sanitizePdfText(formatDateFR(service.expected_start_date)),
        sanitizePdfText(formatDateFR(service.expected_end_date)),
        sanitizePdfText(formatDA(service.agreed_price)),
        sanitizePdfText(formatDA(service.amount_paid)),
        sanitizePdfText(formatDA(Math.max(0, Number(service.agreed_price) - Number(service.amount_paid)))),
      ],
    ],
    styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 21 },
      2: { cellWidth: 21 },
      3: { cellWidth: 33, halign: 'right' },
      4: { cellWidth: 33, halign: 'right' },
      5: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
  });

  let afterTablesY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (service.interventions && service.interventions.length > 0) {
    autoTable(doc, {
      startY: afterTablesY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: usableWidth,
      head: [['Date', 'Adresse chantier', 'Description', 'Équipe']],
      body: service.interventions.map((iv) => [
        sanitizePdfText(formatDateFR(iv.intervention_date)),
        sanitizePdfText(iv.site_address),
        sanitizePdfText(iv.description),
        sanitizePdfText(iv.assigned_employees || '-'),
      ]),
      styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 54, 95], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 48 },
        2: { cellWidth: 74 },
        3: { cellWidth: 40 },
      },
    });
    afterTablesY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  const remaining = Math.max(0, Number(service.agreed_price) - Number(service.amount_paid));
  const totalsEndY = drawTotalsBlock(doc, afterTablesY, [
    {
      label: asQuote ? 'Montant estimé :' : 'Net à payer :',
      value: formatDA(service.agreed_price),
      bold: true,
      tone: 'navy',
    },
    {
      label: 'Montant encaissé :',
      value: formatDA(service.amount_paid),
      tone: 'success',
      dividerBefore: true,
    },
    {
      label: 'Reste à payer :',
      value: formatDA(remaining),
      bold: true,
      tone: remaining > 0 ? 'danger' : 'success',
    },
  ]);

  drawSignaturesBlock(
    doc,
    totalsEndY,
    'Cachet et signature entreprise',
    asQuote ? 'Bon pour accord (client)' : 'Signature du client'
  );

  addFooter(doc, company);
  doc.save(`${service.reference}-${asQuote ? 'devis' : 'service'}.pdf`);
}

export function generatePaymentReceiptPdf(
  payment: PaymentRecord,
  company: CompanySettings | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { usableWidth } = getPageDimensions(doc);
  const y = addHeader(
    doc,
    company,
    'REÇU DE PAIEMENT',
    payment.reference,
    formatDateTimeFR(payment.payment_date)
  );

  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Champ', 'Détail']],
    body: [
      ['Référence du reçu', sanitizePdfText(payment.reference)],
      ["Date d'encaissement", sanitizePdfText(formatDateTimeFR(payment.payment_date))],
      ['Client', sanitizePdfText(payment.customer_name)],
      [
        'Opération concernée',
        sanitizePdfText(`${payment.operation_type.toUpperCase()} ${payment.operation_reference || ''}`.trim()),
      ],
      ['Mode de règlement', sanitizePdfText(payment.payment_method)],
      ['Montant encaissé', sanitizePdfText(formatDA(payment.amount))],
      ['Notes', sanitizePdfText(payment.notes || '-')],
    ],
    styles: { fontSize: 9.2, cellPadding: 3.8, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold' },
      1: { cellWidth: 128 },
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  drawSignaturesBlock(doc, tableEndY, 'Signature du client', 'Cachet et signature de la caisse');

  addFooter(doc, company);
  doc.save(`${payment.reference}-recu-paiement.pdf`);
}

export function generateCustomerStatementPdf(
  customer: Customer,
  summary: { invoiced: number; paid: number; balance: number },
  rows: Array<{ date: string; type: string; ref: string; amount: number; paid: number }>,
  company: CompanySettings | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { usableWidth } = getPageDimensions(doc);
  const y = addHeader(
    doc,
    company,
    'RELEVÉ DE COMPTE CLIENT',
    customer.name,
    formatDateFR(new Date())
  );

  doc.setFontSize(9.5);
  doc.text(
    sanitizePdfText(`Client : ${customer.name}  |  Tél : ${customer.phone || '-'}`),
    MARGIN,
    y,
    { maxWidth: usableWidth }
  );

  autoTable(doc, {
    startY: y + 6,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [['Date', 'Type', 'Référence', 'Montant facturé', 'Montant payé', 'Reste']],
    body: rows.map((r) => [
      sanitizePdfText(formatDateFR(r.date)),
      sanitizePdfText(r.type),
      sanitizePdfText(r.ref),
      sanitizePdfText(formatDA(r.amount)),
      sanitizePdfText(formatDA(r.paid)),
      sanitizePdfText(formatDA(Math.max(0, r.amount - r.paid))),
    ]),
    styles: { fontSize: 8.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 22 },
      2: { cellWidth: 38 },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
      5: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  drawTotalsBlock(doc, tableEndY, [
    { label: 'Total facturé :', value: formatDA(summary.invoiced), bold: true, tone: 'navy' },
    { label: 'Total payé :', value: formatDA(summary.paid), tone: 'success', dividerBefore: true },
    {
      label: 'Solde dû :',
      value: formatDA(summary.balance),
      bold: true,
      tone: summary.balance > 0 ? 'danger' : 'success',
    },
  ]);

  addFooter(doc, company);
  doc.save(`releve-${customer.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

export function generateReportPdf(
  title: string,
  periodLabel: string,
  headers: string[],
  rows: Array<Array<string>>,
  summaryLines: string[],
  company: CompanySettings | null
): void {
  const doc = new jsPDF({
    orientation: headers.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const { usableWidth } = getPageDimensions(doc);
  let y = addHeader(doc, company, title.toUpperCase(), periodLabel, formatDateFR(new Date()));

  if (summaryLines.length > 0) {
    doc.setFontSize(9);
    summaryLines.forEach((line) => {
      doc.text(sanitizePdfText(line), MARGIN, y, { maxWidth: usableWidth });
      y += 5;
    });
  }

  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: usableWidth,
    head: [headers.map((h) => sanitizePdfText(h))],
    body: rows.map((row) => row.map((cell) => sanitizePdfText(cell))),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 43, 77], textColor: 255, fontStyle: 'bold' },
  });

  addFooter(doc, company);
  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}
