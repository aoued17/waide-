import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, RefreshCw, RotateCcw, Save, Shield, Smartphone } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  clearLocalSupabaseConfig,
  formatDbError,
  supabase,
  supabaseConfigSource,
} from '../lib/supabase';
import { usePWA } from '../lib/pwa';
import schemaSql from '../../supabase/schema.sql?raw';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { AccountUsersSection } from '../components/AccountUsersSection';

export function SettingsPage() {
  const {
    companySettings,
    profile,
    categories,
    units,
    serviceTypes,
    expenseCategories,
    refreshAll,
    notify,
  } = useErp();

  const [companyName, setCompanyName] = useState(companySettings?.company_name ?? 'BatiGest');
  const [subtitle, setSubtitle] = useState(companySettings?.subtitle ?? 'Gestion commerciale, location et services');
  const [address, setAddress] = useState(companySettings?.address ?? '');
  const [phone, setPhone] = useState(companySettings?.phone ?? '');
  const [email, setEmail] = useState(companySettings?.email ?? '');
  const [rc, setRc] = useState(companySettings?.rc ?? '');
  const [nif, setNif] = useState(companySettings?.nif ?? '');
  const [nis, setNis] = useState(companySettings?.nis ?? '');
  const [artImp, setArtImp] = useState(companySettings?.art_imp ?? '');
  const [invoiceFooter, setInvoiceFooter] = useState(companySettings?.invoice_footer ?? '');
  const [lateFeeEnabled, setLateFeeEnabled] = useState(companySettings?.late_fee_enabled ?? false);
  const [lateFeeRate, setLateFeeRate] = useState(String(companySettings?.late_fee_rate_per_day ?? 0));
  const [paymentMethodsText, setPaymentMethodsText] = useState(
    (companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Carte bancaire', 'Chèque']).join(', ')
  );
  const [saving, setSaving] = useState(false);

  const [copiedSql, setCopiedSql] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const {
    isInstallable,
    isInstalled,
    isIOS,
    updateAvailable,
    checkingUpdate,
    installApp,
    checkForUpdates,
    applyUpdate,
  } = usePWA();

  useEffect(() => {
    if (!companySettings) return;
    setCompanyName(companySettings.company_name);
    setSubtitle(companySettings.subtitle);
    setAddress(companySettings.address || '');
    setPhone(companySettings.phone || '');
    setEmail(companySettings.email || '');
    setRc(companySettings.rc || '');
    setNif(companySettings.nif || '');
    setNis(companySettings.nis || '');
    setArtImp(companySettings.art_imp || '');
    setInvoiceFooter(companySettings.invoice_footer || '');
    setLateFeeEnabled(companySettings.late_fee_enabled);
    setLateFeeRate(String(companySettings.late_fee_rate_per_day || 0));
    setPaymentMethodsText((companySettings.payment_methods ?? []).join(', '));
  }, [companySettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    try {
      const methods = paymentMethodsText
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('company_settings')
        .update({
          company_name: companyName.trim() || 'BatiGest',
          subtitle: subtitle.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          rc: rc.trim(),
          nif: nif.trim(),
          nis: nis.trim(),
          art_imp: artImp.trim(),
          invoice_footer: invoiceFooter.trim(),
          late_fee_enabled: lateFeeEnabled,
          late_fee_rate_per_day: Math.max(0, Number(lateFeeRate) || 0),
          payment_methods: methods.length > 0 ? methods : ['Espèces'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      if (error) throw error;
      notify('success', 'Paramètres enregistrés.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleInstallPwa = async () => {
    if (isInstallable) {
      const outcome = await installApp();
      if (outcome === 'accepted') {
        notify('success', "Installation de BatiGest lancée sur l'appareil.");
      }
      return;
    }
    setShowInstallGuide((prev) => !prev);
  };

  const handleCheckPwaUpdates = async () => {
    const result = await checkForUpdates();
    if (result === 'update-available') {
      notify('info', 'Nouvelle version détectée. Mise à jour prête à être appliquée.');
    } else if (result === 'up-to-date') {
      notify('success', 'BatiGest est déjà à la dernière version.');
    } else if (result === 'unsupported') {
      notify('error', 'Les Service Workers ne sont pas pris en charge sur ce navigateur.');
    } else {
      notify('error', 'Impossible de vérifier les mises à jour pour le moment.');
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#172B4D]">Informations de l&apos;entreprise &amp; facturation</h2>
          <p className="font-arabic text-xs text-[#718096]">إعدادات الشركة والفواتير</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <BilingualLabel fr="Nom de l'entreprise" ar="اسم المؤسسة" required />
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <BilingualLabel fr="Activité / Sous-titre" ar="النشاط" />
            <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <BilingualLabel fr="Téléphone" ar="الهاتف" />
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <BilingualLabel fr="E-mail" ar="البريد الإلكتروني" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <BilingualLabel fr="Adresse complète" ar="العنوان" />
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <BilingualLabel fr="Registre du Commerce (RC)" ar="السجل التجاري" />
            <input type="text" value={rc} onChange={(e) => setRc(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm font-mono" />
          </div>
          <div>
            <BilingualLabel fr="NIF" ar="الرقم الجبائي" />
            <input type="text" value={nif} onChange={(e) => setNif(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm font-mono" />
          </div>
          <div>
            <BilingualLabel fr="NIS" ar="الرقم الإحصائي" />
            <input type="text" value={nis} onChange={(e) => setNis(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm font-mono" />
          </div>
          <div>
            <BilingualLabel fr="Article d'imposition (AI)" ar="رقم المادة" />
            <input type="text" value={artImp} onChange={(e) => setArtImp(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm font-mono" />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <BilingualLabel fr="Modes de paiement acceptés (séparés par virgule)" ar="طرق الدفع المعتمدة" />
            <input type="text" value={paymentMethodsText} onChange={(e) => setPaymentMethodsText(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <BilingualLabel fr="Pied de page des documents PDF" ar="تذييل الفواتير" />
            <input type="text" value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-[#202B3C] cursor-pointer">
              <input type="checkbox" checked={lateFeeEnabled} onChange={(e) => setLateFeeEnabled(e.target.checked)} className="rounded border-slate-300" />
              <span>Activer proposition de pénalité de retard</span>
            </label>
            {lateFeeEnabled && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#718096]">Tarif / jour (DZD) :</span>
                <input type="number" min="0" value={lateFeeRate} onChange={(e) => setLateFeeRate(e.target.value)} className="w-28 min-h-[38px] px-2.5 rounded-lg border border-slate-300 tabular-nums" />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || profile?.role === 'operator'}
            className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}</span>
          </button>
        </div>
      </form>

      {/* Résumé des taxonomies dynamiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Catégories matériel</div>
          <div className="text-lg font-bold text-[#172B4D] mt-1 tabular-nums">{categories.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Unités de mesure</div>
          <div className="text-lg font-bold text-[#172B4D] mt-1 tabular-nums">{units.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Types de services</div>
          <div className="text-lg font-bold text-[#172B4D] mt-1 tabular-nums">{serviceTypes.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Catégories dépenses</div>
          <div className="text-lg font-bold text-[#172B4D] mt-1 tabular-nums">{expenseCategories.length}</div>
        </div>
      </div>

      {/* Compte connecté & gestion des utilisateurs */}
      <AccountUsersSection />

      {/* Application mobile & PWA */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF8A24]/10 text-[#FF8A24] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">
                Application bureau &amp; mobile (PWA)
              </h3>
              <p className="font-arabic text-xs text-[#718096]">
                تثبيت التطبيق على الهاتف أو الحاسوب وتحديثه
              </p>
              <p className="text-xs text-[#718096] mt-1">
                {isInstalled
                  ? "BatiGest est installé et s'exécute en mode autonome."
                  : "Installez BatiGest sur votre téléphone, tablette ou PC pour un accès rapide en plein écran."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isInstalled ? (
              <button
                type="button"
                onClick={() => void handleInstallPwa()}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Installer l&apos;application</span>
              </button>
            ) : (
              <span className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[#16A085] text-xs font-semibold inline-flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Application installée</span>
              </span>
            )}

            {updateAvailable ? (
              <button
                type="button"
                onClick={applyUpdate}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#172B4D] hover:bg-[#1E365F] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Appliquer la mise à jour</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCheckPwaUpdates()}
                disabled={checkingUpdate}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                <span>{checkingUpdate ? 'Vérification...' : 'Vérifier les mises à jour'}</span>
              </button>
            )}
          </div>
        </div>

        {showInstallGuide && !isInstalled && (
          <div className="rounded-lg border border-slate-200 bg-[#F4F6FA] p-4 text-xs text-[#202B3C] space-y-1.5">
            {isIOS ? (
              <>
                <p className="font-semibold text-[#172B4D]">
                  Installation sur iPhone / iPad (Safari) :
                </p>
                <p>
                  1. Appuyez sur le bouton <strong>Partager</strong> en bas ou en haut de Safari.
                </p>
                <p>
                  2. Sélectionnez <strong>« Sur l&apos;écran d&apos;accueil »</strong> puis validez.
                </p>
                <p className="font-arabic text-[#718096]" dir="rtl">
                  اضغط على زر المشاركة في سفاري ثم اختر « إضافة إلى الشاشة الرئيسية ».
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-[#172B4D]">
                  Installation via le menu du navigateur :
                </p>
                <p>
                  Ouvrez le menu de votre navigateur (Chrome / Edge), puis cliquez sur{' '}
                  <strong>« Installer BatiGest »</strong> ou <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.
                </p>
                <p className="font-arabic text-[#718096]" dir="rtl">
                  افتح قائمة المتصفح ثم اختر « تثبيت التطبيق » أو « إضافة إلى الشاشة الرئيسية ».
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Maintenance base SQL */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-[#718096]">
          <Shield className="w-4 h-4 text-[#16A085] shrink-0" />
          <span>
            Base PostgreSQL connectée ({supabaseConfigSource === 'env' ? "variables d'environnement" : 'configuration locale navigateur'}) avec RLS et transactions atomiques.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {supabaseConfigSource === 'localStorage' && (
            <button
              type="button"
              onClick={() => {
                clearLocalSupabaseConfig();
                window.location.reload();
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-[#E74C3C] hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser config locale</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopySql}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1.5"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-[#16A085]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSql ? 'Schéma SQL copié' : 'Copier supabase/schema.sql'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
