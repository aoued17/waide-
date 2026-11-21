import React, { useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  KeyRound,
  Link2,
  Save,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import schemaSql from '../../supabase/schema.sql?raw';
import { saveLocalSupabaseConfig } from '../lib/supabase';
import { BilingualLabel } from './ui/BilingualLabel';

export function SetupScreen() {
  const [supabaseUrlInput, setSupabaseUrlInput] = useState('');
  const [supabaseAnonInput, setSupabaseAnonInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const envSnippet = `VITE_SUPABASE_URL=https://votre-projet.supabase.co\nVITE_SUPABASE_ANON_KEY=votre_cle_anon_publique`;

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      saveLocalSupabaseConfig(supabaseUrlInput, supabaseAnonInput);
      window.location.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Paramètres invalides.');
      setSaving(false);
    }
  };

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleDownloadSql = () => {
    const blob = new Blob([schemaSql], { type: 'text/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batigest-supabase-schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyEnv = async () => {
    await navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#202B3C] flex flex-col">
      <header className="bg-[#172B4D] text-white border-b border-[#1E365F] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FF8A24] flex items-center justify-center font-bold text-white text-base">
              BG
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight whitespace-nowrap">BatiGest</h1>
              <p className="text-xs text-slate-300">Gestion commerciale, location et services</p>
            </div>
          </div>
          <span className="text-xs text-slate-300 font-mono">Configuration Supabase</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Formulaire de connexion directe (localStorage si variables env vides) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#F4F6FA] border border-slate-200 flex items-center justify-center text-[#172B4D] shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#172B4D]">
                Configurer la connexion Supabase
              </h2>
              <p className="font-arabic text-sm text-[#718096] mt-0.5">
                إعداد الاتصال بقاعدة البيانات Supabase
              </p>
              <p className="text-sm text-[#718096] mt-2 leading-relaxed">
                Les variables d&apos;environnement <code className="font-mono text-[#172B4D] bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> et{' '}
                <code className="font-mono text-[#172B4D] bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> ne sont pas détectées. Vous pouvez les saisir ci-dessous pour les enregistrer dans ce navigateur, ou les configurer dans les Secrets / variables d&apos;environnement.
              </p>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#E74C3C]">
              {formError}
            </div>
          )}

          <form onSubmit={handleSaveCredentials} className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-5">
            <div>
              <BilingualLabel fr="URL du projet Supabase (VITE_SUPABASE_URL)" ar="رابط مشروع Supabase" required />
              <div className="relative mt-1.5">
                <Link2 className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  placeholder="https://votre-projet.supabase.co"
                  required
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:border-[#172B4D]"
                />
              </div>
            </div>

            <div>
              <BilingualLabel fr="Clé publique Anon (VITE_SUPABASE_ANON_KEY)" ar="المفتاح العمومي Anon Key" required />
              <div className="relative mt-1.5">
                <KeyRound className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supabaseAnonInput}
                  onChange={(e) => setSupabaseAnonInput(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  required
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:border-[#172B4D]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-[#718096]">
                Enregistré localement dans ce navigateur (<code className="font-mono">localStorage</code>) uniquement si aucune variable d&apos;environnement n&apos;est définie.
              </span>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Connexion...' : 'Enregistrer et connecter'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Guide d'installation SQL & Env */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#172B4D]">
                <span className="w-6 h-6 rounded-md bg-[#172B4D] text-white text-xs flex items-center justify-center tabular-nums">
                  1
                </span>
                <span>Créer le projet Supabase</span>
              </div>
              <p className="text-xs text-[#718096] leading-relaxed">
                Récupérez l&apos;URL du projet et la clé publique <code className="font-mono">anon</code> dans <strong>Settings → API</strong>.
              </p>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FF8A24] hover:text-[#E87612] pt-1"
              >
                <span>Ouvrir Supabase Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#172B4D]">
                <span className="w-6 h-6 rounded-md bg-[#172B4D] text-white text-xs flex items-center justify-center tabular-nums">
                  2
                </span>
                <span>Exécuter le schéma SQL</span>
              </div>
              <p className="text-xs text-[#718096] leading-relaxed">
                Copiez et exécutez <code className="font-mono">supabase/schema.sql</code> dans le <strong>SQL Editor</strong> de Supabase (tables, RLS et transactions atomiques).
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172B4D] hover:bg-[#1E365F] text-white text-xs font-medium transition-colors"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'SQL copié' : 'Copier le SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSql}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger .sql</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#172B4D]">
                <span className="w-6 h-6 rounded-md bg-[#172B4D] text-white text-xs flex items-center justify-center tabular-nums">
                  3
                </span>
                <span>Variables d&apos;environnement</span>
              </div>
              <p className="text-xs text-[#718096] leading-relaxed">
                Pour un déploiement permanent (Secrets AI Studio ou Vercel), ajoutez ces deux variables et redémarrez le serveur.
              </p>
              <button
                type="button"
                onClick={handleCopyEnv}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium transition-colors"
              >
                {copiedEnv ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEnv ? 'Variables copiées' : 'Copier .env'}</span>
              </button>
            </div>
          </div>

          <div className="bg-[#172B4D] text-slate-100 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Terminal className="w-3.5 h-3.5" />
              <span>.env / AI Studio Secrets / Vercel Environment Variables</span>
            </div>
            <pre className="leading-relaxed">{envSnippet}</pre>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#718096] border-t border-slate-200 pt-4">
            <ShieldCheck className="w-4 h-4 text-[#16A085] shrink-0" />
            <span>
              Sécurité : toutes les tables utilisent Row Level Security (RLS) et les opérations critiques de stock utilisent des transactions PostgreSQL (<code className="font-mono">FOR UPDATE</code>). Le matériel démarre strictement vide.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
