import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Printer, X } from 'lucide-react';
import type {
  CompanySettings,
  PaymentRecord,
  Rental,
  RentalReturn,
  Sale,
  ServiceOrder,
} from '../types/erp';
import { formatDA, formatDateFR, formatDateTimeFR, formatQty } from '../lib/formatters';
import {
  generatePaymentReceiptPdf,
  generateRentalExitPdf,
  generateRentalQuotePdf,
  generateReturnReceiptPdf,
  generateSaleInvoicePdf,
  generateSaleQuotePdf,
  generateServiceOrderPdf,
} from '../lib/pdfGenerator';

export type PrintableDocPayload =
  | { kind: 'rental'; rental: Rental; defaultVariant?: 'bon_sortie' | 'devis' }
  | { kind: 'return'; ret: RentalReturn; rentalRef: string }
  | { kind: 'sale'; sale: Sale; defaultVariant?: 'facture' | 'devis' }
  | { kind: 'service'; service: ServiceOrder; defaultVariant?: 'facture' | 'devis' }
  | { kind: 'payment'; payment: PaymentRecord };

interface PrintableDocumentModalProps {
  docPayload: PrintableDocPayload | null;
  company: CompanySettings | null;
  onClose: () => void;
}

function getOrCreatePrintRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('batigest-print-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'batigest-print-root';
    document.body.appendChild(el);
  }
  return el;
}

export function PrintableDocumentModal({
  docPayload,
  company,
  onClose,
}: PrintableDocumentModalProps) {
  const [variant, setVariant] = useState<'primary' | 'devis'>('primary');
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPrintRoot(getOrCreatePrintRoot());
  }, []);

  useEffect(() => {
    if (!docPayload) return;
    if (
      (docPayload.kind === 'rental' ||
        docPayload.kind === 'sale' ||
        docPayload.kind === 'service') &&
      docPayload.defaultVariant === 'devis'
    ) {
      setVariant('devis');
    } else {
      setVariant('primary');
    }
  }, [docPayload]);

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('batigest-printing');
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  if (!docPayload) return null;

  const supportsDevis =
    docPayload.kind === 'rental' ||
    docPayload.kind === 'sale' ||
    docPayload.kind === 'service';

  const handlePrint = () => {
    document.body.classList.add('batigest-printing');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('batigest-printing');
    }, 1000);
  };

  const handleDownloadPdf = () => {
    if (docPayload.kind === 'rental') {
      if (variant === 'devis') {
        generateRentalQuotePdf(docPayload.rental, company);
      } else {
        generateRentalExitPdf(docPayload.rental, company);
      }
    } else if (docPayload.kind === 'return') {
      generateReturnReceiptPdf(docPayload.ret, docPayload.rentalRef, company);
    } else if (docPayload.kind === 'sale') {
      if (variant === 'devis') {
        generateSaleQuotePdf(docPayload.sale, company);
      } else {
        generateSaleInvoicePdf(docPayload.sale, company);
      }
    } else if (docPayload.kind === 'service') {
      generateServiceOrderPdf(docPayload.service, company, variant === 'devis');
    } else if (docPayload.kind === 'payment') {
      generatePaymentReceiptPdf(docPayload.payment, company);
    }
  };

  const sheetElement = (
    <DocumentSheet docPayload={docPayload} company={company} isQuote={variant === 'devis'} />
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#172B4D]/60 flex items-center justify-center p-3 sm:p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Barre d'actions */}
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-[#F4F6FA] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-[#172B4D]">Aperçu document A4</span>
              {supportsDevis && (
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setVariant('primary')}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      variant === 'primary'
                        ? 'bg-white text-[#172B4D] shadow-xs'
                        : 'text-[#718096] hover:text-[#172B4D]'
                    }`}
                  >
                    {docPayload.kind === 'rental'
                      ? 'Bon de sortie'
                      : docPayload.kind === 'sale'
                      ? 'Facture'
                      : 'Ordre / Facture'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariant('devis')}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      variant === 'devis'
                        ? 'bg-white text-[#172B4D] shadow-xs'
                        : 'text-[#718096] hover:text-[#172B4D]'
                    }`}
                  >
                    Devis
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#172B4D] hover:bg-[#1E365F] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer (A4)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Télécharger PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer l'aperçu"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-300 bg-white text-[#718096] hover:text-[#172B4D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Zone d'aperçu A4 */}
          <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6">
            <div className="bg-white shadow-md rounded-lg p-5 sm:p-8 mx-auto w-full max-w-[186mm] box-border overflow-hidden">
              {sheetElement}
            </div>
          </div>
        </div>
      </div>

      {printRoot && createPortal(sheetElement, printRoot)}
    </>
  );
}

function DocumentHeader({
  company,
  title,
  reference,
  dateLabel,
}: {
  company: CompanySettings | null;
  title: string;
  reference: string;
  dateLabel: string;
}) {
  const contactLine = [company?.phone, company?.email, company?.address].filter(Boolean).join(' | ');
  const taxParts = [
    company?.rc ? `RC: ${company.rc}` : '',
    company?.nif ? `NIF: ${company.nif}` : '',
    company?.nis ? `NIS: ${company.nis}` : '',
    company?.art_imp ? `AI: ${company.art_imp}` : '',
  ].filter(Boolean);

  return (
    <header className="mb-4">
      <div className="bg-[#172B4D] text-white rounded-t-lg px-4 py-3.5 border-b-[3px] border-[#FF8A24] flex flex-wrap justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold tracking-tight">
            {company?.company_name || 'BatiGest'}
          </div>
          <div className="text-[11px] text-slate-200 mt-0.5">
            {company?.subtitle || 'Gestion commerciale, location et services'}
          </div>
          {contactLine && (
            <div className="text-[10px] text-slate-300 mt-1 break-words">{contactLine}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tracking-wide uppercase">{title}</div>
          <div className="text-[11px] text-slate-200 mt-0.5 font-mono">Réf : {reference}</div>
          <div className="text-[11px] text-slate-200">Date : {dateLabel}</div>
        </div>
      </div>
      {taxParts.length > 0 && (
        <div className="text-[10px] text-[#718096] px-1 pt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {taxParts.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </div>
      )}
    </header>
  );
}

function DocumentFooter({ company }: { company: CompanySettings | null }) {
  return (
    <footer className="mt-6 pt-2.5 border-t border-slate-200 text-[10px] text-[#718096] flex flex-wrap justify-between gap-2">
      <span>{company?.invoice_footer || 'BatiGest — Document commercial officiel'}</span>
      <span>Document édité par BatiGest</span>
    </footer>
  );
}

function DocumentSheet({
  docPayload,
  company,
  isQuote,
}: {
  docPayload: PrintableDocPayload;
  company: CompanySettings | null;
  isQuote: boolean;
}) {
  if (docPayload.kind === 'rental') {
    const r = docPayload.rental;
    const remaining = Math.max(0, Number(r.total_amount) - Number(r.amount_paid));
    return (
      <div className="doc-print-container text-xs">
        <DocumentHeader
          company={company}
          title={isQuote ? 'DEVIS DE LOCATION' : 'BON DE SORTIE DU MATÉRIEL'}
          reference={r.reference}
          dateLabel={formatDateTimeFR(r.exit_at)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 mb-4 text-[11px]">
          <div>
            <span className="text-[#718096]">Client :</span>{' '}
            <strong className="text-[#172B4D]">
              {r.customer_name}
              {r.customer_phone ? ` (${r.customer_phone})` : ''}
            </strong>
          </div>
          <div>
            <span className="text-[#718096]">État au départ :</span>{' '}
            <strong>{r.condition_at_exit || 'Bon état'}</strong>
          </div>
          <div>
            <span className="text-[#718096]">{isQuote ? 'Début prévu :' : 'Sortie :'}</span>{' '}
            <strong className="tabular-nums">{formatDateTimeFR(r.exit_at)}</strong>
          </div>
          <div>
            <span className="text-[#718096]">Retour prévu :</span>{' '}
            <strong className="tabular-nums">{formatDateTimeFR(r.expected_return_at)}</strong>
          </div>
        </div>

        <table className="doc-table text-[11px] border border-slate-200">
          <thead>
            <tr className="bg-[#172B4D] text-white">
              <th className="py-2 px-2 text-left w-[14%]">Réf.</th>
              <th className="py-2 px-2 text-left w-[32%]">Désignation</th>
              <th className="py-2 px-2 text-right w-[13%]">Qté</th>
              <th className="py-2 px-2 text-right w-[17%]">Tarif / Unité</th>
              <th className="py-2 px-2 text-center w-[8%]">Durée</th>
              <th className="py-2 px-2 text-right w-[16%]">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(r.items ?? []).map((it) => (
              <tr key={it.id}>
                <td className="py-2 px-2 font-mono text-[10px]">
                  {it.equipment_ref}
                  {it.serial_number ? <div className="text-[#718096]">S/N: {it.serial_number}</div> : null}
                </td>
                <td className="py-2 px-2 font-medium text-[#172B4D]">{it.equipment_designation}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatQty(it.qty_rented)} {it.unit_name}
                </td>
                <td className="py-2 px-2 text-right">
                  <span className="doc-amount">{formatDA(it.unit_price)}</span>
                  <span className="text-[#718096]"> / {it.pricing_type}</span>
                </td>
                <td className="py-2 px-2 text-center">
                  {it.pricing_type === 'personnalise' || it.pricing_type === 'selon_accord'
                    ? 'Accord'
                    : formatQty(it.duration_value)}
                </td>
                <td className="py-2 px-2 text-right font-semibold text-[#172B4D]">
                  <span className="doc-amount">{formatDA(it.line_total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-totals-wrapper">
          <div className="doc-totals-block">
            <div className="doc-total-row">
              <span className="text-[#718096]">Sous-total :</span>
              <span className="doc-amount font-medium">{formatDA(r.subtotal_amount)}</span>
            </div>
            <div className="doc-total-row">
              <span className="text-[#718096]">Frais supplémentaires :</span>
              <span className="doc-amount font-medium">{formatDA(r.additional_fees)}</span>
            </div>
            <div className="doc-total-row">
              <span className="text-[#718096]">Remise :</span>
              <span className="doc-amount font-medium">- {formatDA(r.discount)}</span>
            </div>
            <div className="doc-total-row border-t border-slate-300 mt-1.5 pt-1.5 text-xs font-bold text-[#172B4D]">
              <span>{isQuote ? 'Total estimé :' : 'Net à payer :'}</span>
              <span className="doc-amount">{formatDA(r.total_amount)}</span>
            </div>
            {!isQuote && (
              <div className="doc-payment-split">
                <div className="doc-payment-item">
                  <span className="text-[#718096]">Montant encaissé :</span>
                  <strong className="doc-amount text-[#16A085]">{formatDA(r.amount_paid)}</strong>
                </div>
                <div className="doc-payment-item">
                  <span className="text-[#718096]">Reste à payer :</span>
                  <strong className={`doc-amount ${remaining > 0 ? 'text-[#E74C3C]' : 'text-[#16A085]'}`}>
                    {formatDA(remaining)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="doc-signatures text-[11px] font-semibold text-[#172B4D]">
          <div>
            <div>Signature du responsable</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
          <div className="text-right flex flex-col items-end">
            <div>{isQuote ? 'Bon pour accord (client)' : 'Signature du client (lu et approuvé)'}</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
        </div>

        <DocumentFooter company={company} />
      </div>
    );
  }

  if (docPayload.kind === 'return') {
    const ret = docPayload.ret;
    const condMap: Record<string, string> = {
      bon_etat: 'Bon état',
      endommage: 'Endommagé',
      incomplet: 'Incomplet',
      necessite_maintenance: 'Nécessite maintenance',
    };
    return (
      <div className="doc-print-container text-xs">
        <DocumentHeader
          company={company}
          title="BON DE RETOUR DU MATÉRIEL"
          reference={ret.reference}
          dateLabel={formatDateTimeFR(ret.returned_at)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 mb-4 text-[11px]">
          <div>
            <span className="text-[#718096]">Client :</span> <strong>{ret.customer_name}</strong>
          </div>
          <div>
            <span className="text-[#718096]">Location d&apos;origine :</span>{' '}
            <strong className="font-mono">{docPayload.rentalRef}</strong>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[#718096]">Date de retour effectif :</span>{' '}
            <strong className="tabular-nums">{formatDateTimeFR(ret.returned_at)}</strong>
          </div>
        </div>

        <table className="doc-table text-[11px] border border-slate-200">
          <thead>
            <tr className="bg-[#172B4D] text-white">
              <th className="py-2 px-2 text-left w-[30%]">Matériel</th>
              <th className="py-2 px-2 text-right w-[13%]">Qté ret.</th>
              <th className="py-2 px-2 text-right w-[13%]">Qté manq.</th>
              <th className="py-2 px-2 text-left w-[19%]">État constaté</th>
              <th className="py-2 px-2 text-left w-[25%]">Observations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(ret.items ?? []).map((it) => (
              <tr key={it.id}>
                <td className="py-2 px-2 font-medium text-[#172B4D]">{it.equipment_designation}</td>
                <td className="py-2 px-2 text-right tabular-nums">{formatQty(it.qty_returned_now)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{formatQty(it.qty_missing_now)}</td>
                <td className="py-2 px-2">{condMap[it.condition] || it.condition}</td>
                <td className="py-2 px-2 text-[#718096]">{it.damage_notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(ret.additional_charges > 0 || ret.remarks) && (
          <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-[#F8FAFC] text-[11px] space-y-1">
            {ret.additional_charges > 0 && (
              <div>
                <span className="text-[#718096]">Frais supplémentaires appliqués :</span>{' '}
                <strong className="doc-amount text-[#E74C3C]">{formatDA(ret.additional_charges)}</strong>
              </div>
            )}
            {ret.remarks && (
              <div>
                <span className="text-[#718096]">Remarques :</span> <span>{ret.remarks}</span>
              </div>
            )}
          </div>
        )}

        <div className="doc-signatures text-[11px] font-semibold text-[#172B4D]">
          <div>
            <div>Visa réception magasinier</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
          <div className="text-right flex flex-col items-end">
            <div>Signature du client</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
        </div>

        <DocumentFooter company={company} />
      </div>
    );
  }

  if (docPayload.kind === 'sale') {
    const s = docPayload.sale;
    const remaining = Math.max(0, Number(s.total_amount) - Number(s.amount_paid));
    return (
      <div className="doc-print-container text-xs">
        <DocumentHeader
          company={company}
          title={isQuote ? 'DEVIS DE VENTE' : 'FACTURE DE VENTE'}
          reference={s.reference}
          dateLabel={formatDateFR(s.sale_date)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 mb-4 text-[11px]">
          <div>
            <span className="text-[#718096]">Client :</span>{' '}
            <strong className="text-[#172B4D]">
              {s.customer_name}
              {s.customer_phone ? ` (${s.customer_phone})` : ''}
            </strong>
          </div>
          <div>
            <span className="text-[#718096]">Mode de paiement :</span> <strong>{s.payment_method}</strong>
          </div>
        </div>

        <table className="doc-table text-[11px] border border-slate-200">
          <thead>
            <tr className="bg-[#172B4D] text-white">
              <th className="py-2 px-2 text-left w-[15%]">Réf.</th>
              <th className="py-2 px-2 text-left w-[37%]">Désignation</th>
              <th className="py-2 px-2 text-right w-[14%]">Quantité</th>
              <th className="py-2 px-2 text-right w-[17%]">Prix unitaire</th>
              <th className="py-2 px-2 text-right w-[17%]">Total ligne</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(s.items ?? []).map((it) => (
              <tr key={it.id}>
                <td className="py-2 px-2 font-mono text-[10px]">{it.equipment_ref}</td>
                <td className="py-2 px-2 font-medium text-[#172B4D]">{it.equipment_designation}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatQty(it.qty)} {it.unit_name}
                </td>
                <td className="py-2 px-2 text-right">
                  <span className="doc-amount">{formatDA(it.unit_price)}</span>
                </td>
                <td className="py-2 px-2 text-right font-semibold text-[#172B4D]">
                  <span className="doc-amount">{formatDA(it.line_total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-totals-wrapper">
          <div className="doc-totals-block">
            <div className="doc-total-row">
              <span className="text-[#718096]">Sous-total :</span>
              <span className="doc-amount font-medium">{formatDA(s.subtotal_amount)}</span>
            </div>
            <div className="doc-total-row">
              <span className="text-[#718096]">Remise :</span>
              <span className="doc-amount font-medium">- {formatDA(s.discount)}</span>
            </div>
            <div className="doc-total-row border-t border-slate-300 mt-1.5 pt-1.5 text-xs font-bold text-[#172B4D]">
              <span>{isQuote ? 'Total estimé :' : 'Net à payer :'}</span>
              <span className="doc-amount">{formatDA(s.total_amount)}</span>
            </div>
            {!isQuote && (
              <div className="doc-payment-split">
                <div className="doc-payment-item">
                  <span className="text-[#718096]">Montant encaissé :</span>
                  <strong className="doc-amount text-[#16A085]">{formatDA(s.amount_paid)}</strong>
                </div>
                <div className="doc-payment-item">
                  <span className="text-[#718096]">Reste à payer :</span>
                  <strong className={`doc-amount ${remaining > 0 ? 'text-[#E74C3C]' : 'text-[#16A085]'}`}>
                    {formatDA(remaining)}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="doc-signatures text-[11px] font-semibold text-[#172B4D]">
          <div>
            <div>Cachet et signature vendeur</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
          <div className="text-right flex flex-col items-end">
            <div>{isQuote ? 'Bon pour accord (client)' : 'Signature du client'}</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
        </div>

        <DocumentFooter company={company} />
      </div>
    );
  }

  if (docPayload.kind === 'service') {
    const srv = docPayload.service;
    const remaining = Math.max(0, Number(srv.agreed_price) - Number(srv.amount_paid));
    return (
      <div className="doc-print-container text-xs">
        <DocumentHeader
          company={company}
          title={isQuote ? 'DEVIS DE SERVICE TECHNIQUE' : 'ORDRE DE SERVICE / FACTURE'}
          reference={srv.reference}
          dateLabel={formatDateFR(srv.service_date)}
        />

        <div className="bg-[#F8FAFC] border border-slate-200 rounded-lg p-3 mb-4 text-[11px] space-y-1.5">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <span className="text-[#718096]">Client :</span> <strong>{srv.customer_name}</strong>
            </div>
            <div>
              <span className="text-[#718096]">Type :</span> <strong>{srv.service_type_name}</strong>
            </div>
          </div>
          <div>
            <span className="text-[#718096]">Description :</span> <span>{srv.description}</span>
          </div>
        </div>

        <table className="doc-table text-[11px] border border-slate-200">
          <thead>
            <tr className="bg-[#172B4D] text-white">
              <th className="py-2 px-2 text-left w-[26%]">Prestation</th>
              <th className="py-2 px-2 text-left w-[14%]">Début prévu</th>
              <th className="py-2 px-2 text-left w-[14%]">Fin prévue</th>
              <th className="py-2 px-2 text-right w-[16%]">Prix convenu</th>
              <th className="py-2 px-2 text-right w-[15%]">Payé</th>
              <th className="py-2 px-2 text-right w-[15%]">Reste</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 px-2 font-medium text-[#172B4D]">{srv.service_type_name}</td>
              <td className="py-2 px-2 tabular-nums">{formatDateFR(srv.expected_start_date)}</td>
              <td className="py-2 px-2 tabular-nums">{formatDateFR(srv.expected_end_date)}</td>
              <td className="py-2 px-2 text-right">
                <span className="doc-amount font-semibold">{formatDA(srv.agreed_price)}</span>
              </td>
              <td className="py-2 px-2 text-right">
                <span className="doc-amount text-[#16A085]">{formatDA(srv.amount_paid)}</span>
              </td>
              <td className="py-2 px-2 text-right">
                <span className="doc-amount font-semibold text-[#E74C3C]">{formatDA(remaining)}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {srv.interventions && srv.interventions.length > 0 && (
          <table className="doc-table text-[11px] border border-slate-200 mt-4">
            <thead>
              <tr className="bg-[#1E365F] text-white">
                <th className="py-2 px-2 text-left w-[15%]">Date</th>
                <th className="py-2 px-2 text-left w-[25%]">Adresse chantier</th>
                <th className="py-2 px-2 text-left w-[38%]">Description</th>
                <th className="py-2 px-2 text-left w-[22%]">Équipe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {srv.interventions.map((iv) => (
                <tr key={iv.id}>
                  <td className="py-2 px-2 tabular-nums">{formatDateFR(iv.intervention_date)}</td>
                  <td className="py-2 px-2">{iv.site_address}</td>
                  <td className="py-2 px-2">{iv.description}</td>
                  <td className="py-2 px-2 text-[#718096]">{iv.assigned_employees || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="doc-totals-wrapper">
          <div className="doc-totals-block">
            <div className="doc-total-row text-xs font-bold text-[#172B4D]">
              <span>{isQuote ? 'Montant estimé :' : 'Net à payer :'}</span>
              <span className="doc-amount">{formatDA(srv.agreed_price)}</span>
            </div>
            <div className="doc-payment-split">
              <div className="doc-payment-item">
                <span className="text-[#718096]">Montant encaissé :</span>
                <strong className="doc-amount text-[#16A085]">{formatDA(srv.amount_paid)}</strong>
              </div>
              <div className="doc-payment-item">
                <span className="text-[#718096]">Reste à payer :</span>
                <strong className={`doc-amount ${remaining > 0 ? 'text-[#E74C3C]' : 'text-[#16A085]'}`}>
                  {formatDA(remaining)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="doc-signatures text-[11px] font-semibold text-[#172B4D]">
          <div>
            <div>Cachet et signature entreprise</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
          <div className="text-right flex flex-col items-end">
            <div>{isQuote ? 'Bon pour accord (client)' : 'Signature du client'}</div>
            <div className="mt-12 border-b border-slate-400 w-44" />
          </div>
        </div>

        <DocumentFooter company={company} />
      </div>
    );
  }

  // Reçu de paiement
  const p = docPayload.payment;
  return (
    <div className="doc-print-container text-xs">
      <DocumentHeader
        company={company}
        title="REÇU DE PAIEMENT"
        reference={p.reference}
        dateLabel={formatDateTimeFR(p.payment_date)}
      />

      <table className="doc-table text-[11px] border border-slate-200">
        <thead>
          <tr className="bg-[#172B4D] text-white">
            <th className="py-2.5 px-3 text-left w-[34%]">Champ</th>
            <th className="py-2.5 px-3 text-left w-[66%]">Détail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Référence du reçu</td>
            <td className="py-2.5 px-3 font-mono">{p.reference}</td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Date d&apos;encaissement</td>
            <td className="py-2.5 px-3 tabular-nums">{formatDateTimeFR(p.payment_date)}</td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Client</td>
            <td className="py-2.5 px-3 font-medium">{p.customer_name}</td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Opération concernée</td>
            <td className="py-2.5 px-3 uppercase">
              {p.operation_type} {p.operation_reference || ''}
            </td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Mode de règlement</td>
            <td className="py-2.5 px-3">{p.payment_method}</td>
          </tr>
          <tr className="bg-[#F8FAFC]">
            <td className="py-2.5 px-3 font-bold text-[#172B4D]">Montant encaissé</td>
            <td className="py-2.5 px-3 font-bold text-sm text-[#16A085]">
              <span className="doc-amount">{formatDA(p.amount)}</span>
            </td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-semibold text-[#172B4D]">Notes</td>
            <td className="py-2.5 px-3 text-[#718096]">{p.notes || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="doc-signatures text-[11px] font-semibold text-[#172B4D]">
        <div>
          <div>Signature du client</div>
          <div className="mt-12 border-b border-slate-400 w-44" />
        </div>
        <div className="text-right flex flex-col items-end">
          <div>Cachet et signature de la caisse</div>
          <div className="mt-12 border-b border-slate-400 w-44" />
        </div>
      </div>

      <DocumentFooter company={company} />
    </div>
  );
}
