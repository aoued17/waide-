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
import { formatDateFR, formatDateTimeFR, formatDZD, formatQty } from './formatters';

function addHeader(
  doc: jsPDF,
  company: CompanySettings | null,
  docTitle: string,
  docRef: string,
  docDate: string
): number {
  const navy: [number, number, number] = [23, 43, 77];
  const orange: [number, number, number] = [255, 138, 36];

  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setFillColor(...orange);
  doc.rect(0, 32, 210, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company?.company_name || 'BatiGest', 14, 14);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(company?.subtitle || 'Gestion commerciale, location et services', 14, 20);
  const contactLine = [company?.phone, company?.email, company?.address].filter(Boolean).join(' | ');
  if (contactLine) {
    doc.text(contactLine.slice(0, 85), 14, 26);
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, 196, 14, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Réf : ${docRef}`, 196, 21, { align: 'right' });
  doc.text(`Date : ${docDate}`, 196, 27, { align: 'right' });

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
    doc.text(taxParts.join('  ·  '), 14, 40);
    doc.setTextColor(32, 43, 60);
    return 46;
  }

  return 42;
}

function addFooter(doc: jsPDF, company: CompanySettings | null): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(113, 128, 150);
    doc.text(company?.invoice_footer || 'BatiGest — Document commercial officiel', 14, 287);
    doc.text(`Page ${i} / ${pageCount}`, 196, 287, { align: 'right' });
  }
}

export function generateRentalExitPdf(rental: Rental, company: CompanySettings | null): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'BON DE SORTIE DU MATÉRIEL', rental.reference, formatDateTimeFR(rental.exit_at));

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${rental.customer_name}${rental.customer_phone ? `  (${rental.customer_phone})` : ''}`, 34, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Sortie :', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateTimeFR(rental.exit_at), 34, y);
  doc.setFont('helvetica', 'bold');
  doc.text('Retour prévu :', 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateTimeFR(rental.expected_return_at), 140, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('État au départ :', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(rental.condition_at_exit || 'Bon état', 46, y);

  const items = rental.items ?? [];
  autoTable(doc, {
    startY: y + 6,
    head: [['Réf.', 'Désignation', 'Qté', 'Tarif / Unité', 'Durée', 'Montant']],
    body: items.map((item) => [
      item.equipment_ref + (item.serial_number ? `\nS/N: ${item.serial_number}` : ''),
      item.equipment_designation,
      `${formatQty(item.qty_rented)} ${item.unit_name}`,
      `${formatDZD(item.unit_price)} / ${item.pricing_type}`,
      item.pricing_type === 'personnalise' || item.pricing_type === 'selon_accord' ? 'Accord' : `${formatQty(item.duration_value)}`,
      formatDZD(item.line_total),
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.text(`Sous-total : ${formatDZD(rental.subtotal_amount)}`, 196, finalY, { align: 'right' });
  doc.text(`Frais supplémentaires : ${formatDZD(rental.additional_fees)}`, 196, finalY + 5, { align: 'right' });
  doc.text(`Remise : - ${formatDZD(rental.discount)}`, 196, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Total convenu : ${formatDZD(rental.total_amount)}`, 196, finalY + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Payé / Avance : ${formatDZD(rental.amount_paid)}   |   Reste à payer : ${formatDZD(Math.max(0, rental.total_amount - rental.amount_paid))}`, 196, finalY + 22, { align: 'right' });

  const sigY = Math.min(252, finalY + 38);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature du responsable', 14, sigY);
  doc.text('Signature du client (lu et approuvé)', 196, sigY, { align: 'right' });
  doc.line(14, sigY + 16, 80, sigY + 16);
  doc.line(130, sigY + 16, 196, sigY + 16);

  addFooter(doc, company);
  doc.save(`${rental.reference}-bon-sortie.pdf`);
}

export function generateReturnReceiptPdf(ret: RentalReturn, rentalRef: string, company: CompanySettings | null): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'BON DE RETOUR DU MATÉRIEL', ret.reference, formatDateTimeFR(ret.returned_at));

  doc.setFontSize(10);
  doc.text(`Client : ${ret.customer_name}`, 14, y);
  doc.text(`Location d'origine : ${rentalRef}`, 196, y, { align: 'right' });
  y += 6;
  doc.text(`Date de retour effectif : ${formatDateTimeFR(ret.returned_at)}`, 14, y);

  const condMap: Record<string, string> = {
    bon_etat: 'Bon état',
    endommage: 'Endommagé',
    incomplet: 'Incomplet',
    necessite_maintenance: 'Nécessite maintenance',
  };

  autoTable(doc, {
    startY: y + 6,
    head: [['Matériel', 'Qté retournée', 'Qté manquante', 'État constaté', 'Observations']],
    body: (ret.items ?? []).map((it) => [
      it.equipment_designation,
      formatQty(it.qty_returned_now),
      formatQty(it.qty_missing_now),
      condMap[it.condition] || it.condition,
      it.damage_notes || '—',
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (ret.additional_charges > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Frais supplémentaires appliqués : ${formatDZD(ret.additional_charges)}`, 14, finalY);
  }
  if (ret.remarks) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Remarques : ${ret.remarks}`, 14, finalY + 7);
  }

  const sigY = Math.min(252, finalY + 24);
  doc.setFont('helvetica', 'bold');
  doc.text('Visa réception magasinier', 14, sigY);
  doc.text('Signature du client', 196, sigY, { align: 'right' });
  doc.line(14, sigY + 16, 80, sigY + 16);
  doc.line(130, sigY + 16, 196, sigY + 16);

  addFooter(doc, company);
  doc.save(`${ret.reference}-bon-retour.pdf`);
}

export function generateSaleInvoicePdf(sale: Sale, company: CompanySettings | null): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'FACTURE DE VENTE', sale.reference, formatDateFR(sale.sale_date));

  doc.setFontSize(10);
  doc.text(`Client : ${sale.customer_name}${sale.customer_phone ? ` (${sale.customer_phone})` : ''}`, 14, y);
  y += 6;
  doc.text(`Mode de paiement : ${sale.payment_method}`, 14, y);

  autoTable(doc, {
    startY: y + 6,
    head: [['Réf.', 'Désignation', 'Quantité', 'Prix unitaire', 'Total ligne']],
    body: (sale.items ?? []).map((it) => [
      it.equipment_ref,
      it.equipment_designation,
      `${formatQty(it.qty)} ${it.unit_name}`,
      formatDZD(it.unit_price),
      formatDZD(it.line_total),
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.text(`Sous-total : ${formatDZD(sale.subtotal_amount)}`, 196, finalY, { align: 'right' });
  doc.text(`Remise : - ${formatDZD(sale.discount)}`, 196, finalY + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Net à payer : ${formatDZD(sale.total_amount)}`, 196, finalY + 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Montant encaissé : ${formatDZD(sale.amount_paid)}   |   Reste dû : ${formatDZD(Math.max(0, sale.total_amount - sale.amount_paid))}`, 196, finalY + 17, { align: 'right' });

  addFooter(doc, company);
  doc.save(`${sale.reference}-facture.pdf`);
}

export function generateServiceOrderPdf(service: ServiceOrder, company: CompanySettings | null): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'ORDRE DE SERVICE / FACTURE', service.reference, formatDateFR(service.service_date));

  doc.setFontSize(10);
  doc.text(`Client : ${service.customer_name}`, 14, y);
  doc.text(`Type : ${service.service_type_name}`, 196, y, { align: 'right' });
  y += 7;
  doc.text(`Description : ${service.description}`, 14, y, { maxWidth: 180 });
  y += 14;

  autoTable(doc, {
    startY: y,
    head: [['Prestation', 'Début prévu', 'Fin prévue', 'Prix convenu', 'Payé', 'Reste']],
    body: [
      [
        service.service_type_name,
        formatDateFR(service.expected_start_date),
        formatDateFR(service.expected_end_date),
        formatDZD(service.agreed_price),
        formatDZD(service.amount_paid),
        formatDZD(Math.max(0, service.agreed_price - service.amount_paid)),
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  if (service.interventions && service.interventions.length > 0) {
    const intY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: intY,
      head: [['Date', 'Adresse chantier', 'Description', 'Équipe']],
      body: service.interventions.map((iv) => [
        formatDateFR(iv.intervention_date),
        iv.site_address,
        iv.description,
        iv.assigned_employees || '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 54, 95], textColor: 255 },
    });
  }

  addFooter(doc, company);
  doc.save(`${service.reference}-service.pdf`);
}

export function generatePaymentReceiptPdf(payment: PaymentRecord, company: CompanySettings | null): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'REÇU DE PAIEMENT', payment.reference, formatDateTimeFR(payment.payment_date));

  autoTable(doc, {
    startY: y + 2,
    head: [['Champ', 'Détail']],
    body: [
      ['Référence du reçu', payment.reference],
      ['Date d\'encaissement', formatDateTimeFR(payment.payment_date)],
      ['Client', payment.customer_name],
      ['Opération concernée', `${payment.operation_type.toUpperCase()} ${payment.operation_reference || ''}`],
      ['Mode de règlement', payment.payment_method],
      ['Montant encaissé', formatDZD(payment.amount)],
      ['Notes', payment.notes || '—'],
    ],
    styles: { fontSize: 9.5, cellPadding: 4 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Cachet et signature de la caisse', 196, finalY, { align: 'right' });
  doc.line(130, finalY + 18, 196, finalY + 18);

  addFooter(doc, company);
  doc.save(`${payment.reference}-recu-paiement.pdf`);
}

export function generateCustomerStatementPdf(
  customer: Customer,
  summary: { invoiced: number; paid: number; balance: number },
  rows: Array<{ date: string; type: string; ref: string; amount: number; paid: number }>,
  company: CompanySettings | null
): void {
  const doc = new jsPDF();
  let y = addHeader(doc, company, 'RELEVÉ DE COMPTE CLIENT', customer.name, formatDateFR(new Date()));

  doc.setFontSize(9.5);
  doc.text(`Client : ${customer.name}  ·  Tél : ${customer.phone || '—'}`, 14, y);
  y += 6;
  doc.text(`Total facturé : ${formatDZD(summary.invoiced)}   |   Total payé : ${formatDZD(summary.paid)}   |   Solde dû : ${formatDZD(summary.balance)}`, 14, y);

  autoTable(doc, {
    startY: y + 6,
    head: [['Date', 'Type', 'Référence', 'Montant facturé', 'Montant payé', 'Reste']],
    body: rows.map((r) => [
      formatDateFR(r.date),
      r.type,
      r.ref,
      formatDZD(r.amount),
      formatDZD(r.paid),
      formatDZD(Math.max(0, r.amount - r.paid)),
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

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
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  let y = addHeader(doc, company, title.toUpperCase(), periodLabel, formatDateFR(new Date()));

  if (summaryLines.length > 0) {
    doc.setFontSize(9);
    summaryLines.forEach((line) => {
      doc.text(line, 14, y);
      y += 5;
    });
  }

  autoTable(doc, {
    startY: y + 2,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [23, 43, 77], textColor: 255 },
  });

  addFooter(doc, company);
  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}
