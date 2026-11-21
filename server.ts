import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServerSupabaseConfig(): { url: string; serviceRoleKey: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey };
}

function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

async function authenticateCaller(
  req: Request,
  supabaseAdmin: SupabaseClient,
  allowedRoles: Array<'admin' | 'manager'>
): Promise<
  | { ok: true; userId: string; role: 'admin' | 'manager' }
  | { ok: false; status: number; code: string; message: string }
> {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Session authentifiée requise.',
    };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_TOKEN',
      message: 'Jeton de session invalide ou expiré.',
    };
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profErr || !profile || !profile.is_active) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Compte inactif ou profil introuvable.',
    };
  }

  if (!allowedRoles.includes(profile.role as 'admin' | 'manager')) {
    return {
      ok: false,
      status: 403,
      code: 'ADMIN_REQUIRED',
      message: 'Action réservée aux administrateurs.',
    };
  }

  return {
    ok: true,
    userId: authData.user.id,
    role: profile.role as 'admin' | 'manager',
  };
}

async function detachUserAuditReferences(
  supabaseAdmin: SupabaseClient,
  targetUserId: string
): Promise<void> {
  const createdByTables = [
    'supplier_purchases',
    'supplier_payments',
    'rentals',
    'rental_returns',
    'sales',
    'services',
    'payments',
    'expenses',
    'maintenance_records',
  ];

  await Promise.all([
    ...createdByTables.map((table) =>
      supabaseAdmin.from(table).update({ created_by: null }).eq('created_by', targetUserId)
    ),
    supabaseAdmin.from('stock_movements').update({ user_id: null }).eq('user_id', targetUserId),
  ]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const cfg = getServerSupabaseConfig();
    res.json({
      ok: true,
      adminConfigured: Boolean(cfg),
    });
  });

  app.get('/api/admin/users', async (req: Request, res: Response) => {
    const cfg = getServerSupabaseConfig();
    if (!cfg) {
      res.status(503).json({
        code: 'SERVICE_ROLE_MISSING',
        message: 'La clé serveur SUPABASE_SERVICE_ROLE_KEY n’est pas configurée.',
      });
      return;
    }

    const supabaseAdmin = createAdminClient(cfg.url, cfg.serviceRoleKey);
    const authResult = await authenticateCaller(req, supabaseAdmin, ['admin', 'manager']);
    if (!authResult.ok) {
      res.status(authResult.status).json({ code: authResult.code, message: authResult.message });
      return;
    }

    try {
      const [authListRes, profilesRes] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        supabaseAdmin.from('user_profiles').select('*').order('created_at', { ascending: true }),
      ]);

      if (authListRes.error) {
        res.status(500).json({ code: 'LIST_USERS_FAILED', message: authListRes.error.message });
        return;
      }

      const profileById = new Map<
        string,
        {
          id: string;
          email: string;
          full_name: string;
          role: 'admin' | 'manager' | 'operator';
          is_active: boolean;
          created_at: string;
        }
      >();

      for (const p of profilesRes.data ?? []) {
        profileById.set(p.id, p);
      }

      const merged = (authListRes.data?.users ?? []).map((u) => {
        const prof = profileById.get(u.id);
        const metaName =
          typeof u.user_metadata?.full_name === 'string' ? u.user_metadata.full_name : '';
        return {
          id: u.id,
          email: prof?.email || u.email || '',
          full_name: prof?.full_name || metaName || (u.email ? u.email.split('@')[0] : 'Utilisateur'),
          role: prof?.role || 'operator',
          is_active: prof ? prof.is_active : true,
          created_at: prof?.created_at || u.created_at || '',
        };
      });

      res.json({ users: merged });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur inattendue.';
      res.status(500).json({ code: 'SERVER_ERROR', message });
    }
  });

  app.post('/api/admin/delete-user', async (req: Request, res: Response) => {
    const cfg = getServerSupabaseConfig();
    if (!cfg) {
      res.status(503).json({
        code: 'SERVICE_ROLE_MISSING',
        message:
          'Clé serveur SUPABASE_SERVICE_ROLE_KEY absente. Ajoutez-la dans les variables d’environnement du serveur (jamais en VITE_).',
      });
      return;
    }

    const supabaseAdmin = createAdminClient(cfg.url, cfg.serviceRoleKey);
    const authResult = await authenticateCaller(req, supabaseAdmin, ['admin']);
    if (!authResult.ok) {
      res.status(authResult.status).json({ code: authResult.code, message: authResult.message });
      return;
    }

    const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    if (!UUID_REGEX.test(targetUserId)) {
      res.status(400).json({
        code: 'INVALID_USER_ID',
        message: 'Identifiant utilisateur invalide.',
      });
      return;
    }

    if (targetUserId === authResult.userId) {
      res.status(400).json({
        code: 'CANNOT_DELETE_SELF',
        message: 'Vous ne pouvez pas supprimer le compte actuellement connecté.',
      });
      return;
    }

    try {
      await detachUserAuditReferences(supabaseAdmin, targetUserId);
      await supabaseAdmin.from('user_profiles').delete().eq('id', targetUserId);

      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteErr) {
        res.status(400).json({
          code: 'DELETE_USER_FAILED',
          message: deleteErr.message,
        });
        return;
      }

      res.json({ ok: true, deletedUserId: targetUserId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression du compte.';
      res.status(500).json({ code: 'SERVER_ERROR', message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`BatiGest server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BatiGest server:', err);
  process.exit(1);
});
