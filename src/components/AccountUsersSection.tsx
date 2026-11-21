import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  HelpCircle,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDateFR } from '../lib/formatters';
import { formatDbError, supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/erp';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/States';

const DELETE_USER_SQL_SNIPPET = `-- Exécuter une seule fois dans Supabase Dashboard -> SQL Editor
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.user_profiles;
CREATE POLICY "profiles_delete_admin" ON public.user_profiles
  FOR DELETE USING (public.is_admin_user() AND id <> auth.uid());

CREATE OR REPLACE FUNCTION public.delete_user_account_tx(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_target_email TEXT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Seul un administrateur actif peut supprimer un compte utilisateur.';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Impossible de supprimer le compte actuellement connecté.';
  END IF;

  SELECT email INTO v_target_email FROM public.user_profiles WHERE id = p_target_user_id;

  UPDATE public.supplier_purchases SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.supplier_payments SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.rentals SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.rental_returns SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.sales SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.services SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.payments SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.expenses SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.maintenance_records SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.stock_movements SET user_id = NULL WHERE user_id = p_target_user_id;

  DELETE FROM public.user_profiles WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object('deleted', TRUE, 'user_id', p_target_user_id, 'email', COALESCE(v_target_email, ''));
END;
$$;`;

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  manager: 'Responsable',
  operator: 'Opérateur',
};

export function AccountUsersSection() {
  const { session, profile, signOut, notify } = useErp();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSqlHelp, setShowSqlHelp] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const currentUserId = session?.user?.id ?? profile?.id ?? '';
  const signedInEmail = session?.user?.email ?? profile?.email ?? 'Non renseigné';
  const canViewUsers = profile?.role === 'admin' || profile?.role === 'manager';
  const isAdmin = profile?.role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!supabase || !canViewUsers) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      if (session?.access_token) {
        try {
          const res = await fetch('/api/admin/users', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          if (res.ok) {
            const payload = (await res.json()) as { users?: UserProfile[] };
            if (Array.isArray(payload.users)) {
              setUsers(payload.users);
              return;
            }
          }
        } catch {
          // Repli automatique vers la table user_profiles si la route serveur n'est pas joignable
        }
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers((data as UserProfile[]) ?? []);
    } catch (err) {
      setUsersError(formatDbError(err));
    } finally {
      setLoadingUsers(false);
    }
  }, [canViewUsers, session?.access_token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    if (!supabase || !isAdmin) return;
    try {
      const { error } = await supabase.from('user_profiles').update({ role }).eq('id', userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      notify('success', 'Rôle utilisateur mis à jour.');
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const handleToggleUserActive = async (userId: string, isActive: boolean) => {
    if (!supabase || !isAdmin) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: isActive })
        .eq('id', userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: isActive } : u)));
      notify('success', isActive ? 'Compte activé.' : 'Compte désactivé (accès bloqué).');
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!supabase || !deleteTarget || !isAdmin) return;
    setDeleting(true);
    const target = deleteTarget;
    try {
      if (session?.access_token) {
        const res = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ targetUserId: target.id }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          message?: string;
        };

        if (res.ok && payload.ok) {
          setDeleteTarget(null);
          await loadUsers();
          notify('success', `Compte ${target.email} supprimé définitivement.`);
          return;
        }

        if (res.status !== 503 && res.status !== 404 && payload.code !== 'SERVICE_ROLE_MISSING') {
          throw new Error(payload.message || 'Impossible de supprimer ce compte.');
        }
      }

      // Repli si SUPABASE_SERVICE_ROLE_KEY n'est pas encore configurée côté serveur : tenter le RPC SQL
      const { error: rpcError } = await supabase.rpc('delete_user_account_tx', {
        p_target_user_id: target.id,
      });

      if (!rpcError) {
        setDeleteTarget(null);
        await loadUsers();
        notify('success', `Compte ${target.email} supprimé définitivement.`);
        return;
      }

      setShowSqlHelp(true);
      setDeleteTarget(null);
      notify(
        'error',
        'Clé serveur SUPABASE_SERVICE_ROLE_KEY manquante dans les Secrets serveur (ou RPC SQL non déployée). Consultez le guide ci-dessous.'
      );
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleCopySqlSnippet = async () => {
    await navigator.clipboard.writeText(DELETE_USER_SQL_SNIPPET);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Compte actuellement connecté */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#172B4D] text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[#172B4D]">
                  Compte actuellement connecté
                </h2>
                <span className="font-arabic text-xs text-[#718096]">الحساب المتصل حاليا</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#202B3C]">
                <Mail className="w-4 h-4 text-[#FF8A24] shrink-0" />
                <span className="font-semibold break-all">{signedInEmail}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#718096] pt-1">
                <span>
                  Nom : <strong className="text-[#172B4D]">{profile?.full_name || 'Utilisateur'}</strong>
                </span>
                <span>
                  Rôle :{' '}
                  <strong className="text-[#172B4D]">
                    {profile?.role ? ROLE_LABELS[profile.role] : 'Opérateur'}
                  </strong>
                </span>
                <span>
                  Statut :{' '}
                  <strong className={profile?.is_active !== false ? 'text-[#16A085]' : 'text-[#E74C3C]'}>
                    {profile?.is_active !== false ? 'Actif' : 'Désactivé'}
                  </strong>
                </span>
              </div>
              {currentUserId && (
                <div className="text-[11px] font-mono text-slate-400 break-all">
                  ID : {currentUserId}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#E74C3C] hover:bg-red-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>{signingOut ? 'Déconnexion...' : 'Se déconnecter'}</span>
          </button>
        </div>
      </div>

      {/* Gestion des comptes utilisateurs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#172B4D]" />
              <h3 className="text-sm font-semibold text-[#172B4D]">
                Gestion des comptes et utilisateurs (Supabase Auth &amp; RBAC)
              </h3>
            </div>
            <p className="font-arabic text-xs text-[#718096] mt-0.5">
              إدارة وحذف حسابات المستخدمين
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSqlHelp((prev) => !prev)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#FF8A24]" />
              <span>{showSqlHelp ? 'Masquer le guide Supabase' : 'Guide suppression Supabase'}</span>
            </button>

            {canViewUsers && (
              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={loadingUsers}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                <span>Actualiser</span>
              </button>
            )}
          </div>
        </div>

        {showSqlHelp && (
          <div className="rounded-xl border border-slate-200 bg-[#F4F6FA] p-4 space-y-3 text-xs text-[#202B3C]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-[#172B4D] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#16A085]" />
                <span>Suppression complète dans Supabase Auth (Comptes de test)</span>
              </div>
              <button
                type="button"
                onClick={() => void handleCopySqlSnippet()}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1.5"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-[#16A085]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Script SQL copié' : 'Copier le script SQL (RPC)'}</span>
              </button>
            </div>
            <ol className="list-decimal pl-5 space-y-1 text-[#718096]">
              <li>
                <strong className="text-[#172B4D]">Clé serveur sécurisée (recommandé) :</strong>{' '}
                ajoutez <code className="font-mono bg-white px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
                (et <code className="font-mono bg-white px-1 rounded">SUPABASE_URL</code>) dans les variables d&apos;environnement serveur / Secrets (jamais en <code className="font-mono bg-white px-1 rounded">VITE_</code>). La route{' '}
                <code className="font-mono bg-white px-1 rounded">/api/admin/delete-user</code> supprimera directement le compte côté serveur.
              </li>
              <li>
                <strong className="text-[#172B4D]">Option SQL RPC :</strong>{' '}
                vous pouvez également exécuter le script SQL ci-dessus dans{' '}
                <strong className="text-[#172B4D]">Supabase Dashboard → SQL Editor</strong> pour autoriser la suppression transactionnelle depuis PostgreSQL tout en préservant les clients, locations et factures.
              </li>
              <li>
                <strong className="text-[#172B4D]">Supabase Dashboard :</strong>{' '}
                vous pouvez aussi gérer les comptes dans <strong className="text-[#172B4D]">Authentication → Users</strong>.
              </li>
            </ol>
          </div>
        )}

        {!canViewUsers ? (
          <div className="rounded-lg border border-slate-200 bg-[#F4F6FA] p-4 text-xs text-[#718096]">
            Seuls les comptes <strong className="text-[#172B4D]">Administrateur</strong> ou{' '}
            <strong className="text-[#172B4D]">Responsable</strong> peuvent consulter et gérer la liste des autres utilisateurs.
          </div>
        ) : (
          <>
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, e-mail ou rôle..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            {usersError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#E74C3C]">
                {usersError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                    <th className="py-2.5 px-3">Utilisateur</th>
                    <th className="py-2.5 px-3">E-mail</th>
                    <th className="py-2.5 px-3">Créé le</th>
                    <th className="py-2.5 px-3">Rôle</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#718096]">
                        {loadingUsers ? 'Chargement des comptes...' : 'Aucun compte utilisateur trouvé.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUserId;
                      return (
                        <tr key={u.id} className={isSelf ? 'bg-[#F4F6FA]/60' : 'hover:bg-slate-50/70'}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#172B4D] flex flex-wrap items-center gap-1.5">
                              <span>{u.full_name}</span>
                              {isSelf && (
                                <span className="text-[10px] font-medium text-[#FF8A24]">
                                  (Session actuelle)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[#202B3C]">{u.email}</td>
                          <td className="py-2.5 px-3 text-[#718096] tabular-nums">
                            {u.created_at ? formatDateFR(u.created_at) : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={u.role}
                              disabled={!isAdmin || isSelf}
                              onChange={(e) => void handleUpdateUserRole(u.id, e.target.value as UserRole)}
                              className="min-h-[34px] px-2 rounded border border-slate-300 bg-white disabled:opacity-60"
                            >
                              <option value="admin">Administrateur</option>
                              <option value="manager">Responsable</option>
                              <option value="operator">Opérateur</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            {isAdmin && !isSelf ? (
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={u.is_active}
                                  onChange={(e) => void handleToggleUserActive(u.id, e.target.checked)}
                                />
                                <span>{u.is_active ? 'Actif' : 'Désactivé'}</span>
                              </label>
                            ) : (
                              <StatusText
                                tone={u.is_active ? 'success' : 'danger'}
                                icon={u.is_active ? 'check' : 'alert'}
                                label={u.is_active ? 'Actif' : 'Désactivé'}
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isSelf ? (
                              <span className="text-[11px] text-[#718096]">Session active</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!isAdmin}
                                title={
                                  isAdmin
                                    ? `Supprimer / Retirer ${u.email}`
                                    : 'Action réservée à un administrateur'
                                }
                                onClick={() => setDeleteTarget(u)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-red-200 text-[#E74C3C] hover:bg-red-50 disabled:opacity-45 disabled:hover:bg-transparent font-medium inline-flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Supprimer / Retirer</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal confirmation de suppression */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        title="Supprimer ce compte utilisateur ?"
        arTitle="حذف حساب المستخدم"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs text-[#202B3C]">
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-[#E74C3C]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Action irréversible</p>
                <p className="text-[#202B3C]">
                  Le compte <strong>{deleteTarget.full_name}</strong> ({deleteTarget.email}) sera supprimé et ne pourra plus se connecter à BatiGest.
                </p>
              </div>
            </div>

            <p className="text-[#718096] leading-relaxed">
              Tous les enregistrements commerciaux existants (clients, locations, ventes, paiements, dépenses) seront intégralement préservés.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-[#172B4D]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDeleteUser()}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#E74C3C] hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Suppression...' : 'Confirmer la suppression'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
