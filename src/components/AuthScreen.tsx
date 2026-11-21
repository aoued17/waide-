import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, Mail, User, UserPlus } from 'lucide-react';
import { formatDbError, supabase } from '../lib/supabase';
import { BilingualLabel } from './ui/BilingualLabel';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Veuillez saisir votre adresse e-mail et votre mot de passe.');
      return;
    }
    if (mode === 'register' && !fullName.trim()) {
      setError('Veuillez saisir votre nom complet.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;
      } else {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });
        if (signUpErr) throw signUpErr;
        if (!data.session) {
          setInfo(
            'Compte créé. Vérifiez votre boîte e-mail pour confirmer votre inscription avant de vous connecter.'
          );
          setMode('login');
        }
      }
    } catch (err) {
      setError(formatDbError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col justify-center py-10 px-4">
      <div className="max-w-md w-full mx-auto bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-[#172B4D] px-6 py-6 text-white border-b-2 border-[#FF8A24]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF8A24] flex items-center justify-center font-bold text-white text-lg">
              BG
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">BatiGest</h1>
              <p className="text-xs text-slate-300">Gestion commerciale, location et services</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-1 p-1 bg-[#F4F6FA] rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 min-h-[40px] rounded-md text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-[#718096] hover:text-[#172B4D]'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 min-h-[40px] rounded-md text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-[#718096] hover:text-[#172B4D]'
              }`}
            >
              Créer un compte
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#E74C3C]">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-[#16A085]">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <BilingualLabel fr="Nom complet" ar="الاسم الكامل" required />
                <div className="relative mt-1.5">
                  <User className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Ahmed Bensabeur"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#172B4D]"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <BilingualLabel fr="Adresse e-mail" ar="البريد الإلكتروني" required />
              <div className="relative mt-1.5">
                <Mail className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.dz"
                  autoComplete="email"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#172B4D]"
                  required
                />
              </div>
            </div>

            <div>
              <BilingualLabel fr="Mot de passe" ar="كلمة المرور" required />
              <div className="relative mt-1.5">
                <Lock className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full min-h-[44px] pl-9 pr-11 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#172B4D]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-[#718096] hover:text-[#172B4D] hover:bg-slate-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>
                {loading
                  ? 'Traitement...'
                  : mode === 'login'
                  ? 'Se connecter'
                  : 'Créer le compte'}
              </span>
            </button>

            {mode === 'register' && (
              <p className="text-[11px] text-[#718096] leading-relaxed">
                Le premier utilisateur enregistré sur cette base reçoit automatiquement le rôle Administrateur. Les comptes suivants reçoivent le rôle Opérateur.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
