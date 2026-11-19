import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { AuthResponse, User, UserRole } from '../types';
import { ApiError, apiRequest, getAuthToken, setAuthToken } from './apiClient';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

export interface RegisterResult {
  user: User | null;
  requiresEmailVerification: boolean;
  message: string;
}

function mapProfileRow(
  row: Record<string, unknown>,
  fallbackUser?: SupabaseAuthUser,
): User {
  const email = String(row.email ?? fallbackUser?.email ?? '');
  const metaName =
    typeof fallbackUser?.user_metadata?.full_name === 'string'
      ? fallbackUser.user_metadata.full_name
      : typeof fallbackUser?.user_metadata?.name === 'string'
        ? fallbackUser.user_metadata.name
        : '';
  const name = String(
    row.full_name ?? row.name ?? (metaName || email.split('@')[0] || 'Pengguna'),
  );
  const rawRole = String(row.role ?? 'user').toLowerCase();
  const role: UserRole = rawRole === 'admin' ? 'admin' : 'user';

  return {
    id: String(row.id ?? fallbackUser?.id ?? ''),
    name,
    email,
    role,
    phone: typeof row.phone === 'string' && row.phone ? row.phone : undefined,
    address:
      typeof row.address === 'string' && row.address ? row.address : undefined,
    createdAt: String(
      row.created_at ?? fallbackUser?.created_at ?? new Date().toISOString(),
    ),
  };
}

function buildFallbackUser(
  authUser: SupabaseAuthUser,
  overrideName?: string,
  overridePhone?: string,
): User {
  const email = authUser.email || '';
  const metaName =
    typeof authUser.user_metadata?.full_name === 'string'
      ? authUser.user_metadata.full_name
      : typeof authUser.user_metadata?.name === 'string'
        ? authUser.user_metadata.name
        : '';
  return {
    id: authUser.id,
    name: overrideName || metaName || email.split('@')[0] || 'Pengguna',
    email,
    role: 'user',
    phone:
      overridePhone ||
      (typeof authUser.user_metadata?.phone === 'string'
        ? authUser.user_metadata.phone
        : undefined),
    createdAt: authUser.created_at || new Date().toISOString(),
  };
}

function isDuplicateUserError(message: string, code?: string): boolean {
  if (code === 'user_already_exists' || code === 'email_exists') {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    lower.includes('already exists')
  );
}

function translateSupabaseAuthError(message: string, code?: string): string {
  if (isDuplicateUserError(message, code)) {
    return 'Email ini sudah terdaftar. Silakan gunakan email lain atau masuk.';
  }
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email atau kata sandi tidak sesuai. Silakan periksa kembali.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email Anda belum diverifikasi. Silakan periksa kotak masuk email terlebih dahulu.';
  }
  if (lower.includes('password should be at least')) {
    return 'Kata sandi minimal 6 karakter.';
  }
  if (
    lower.includes('unable to validate email') ||
    lower.includes('invalid email')
  ) {
    return 'Format alamat email tidak valid.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Terlalu banyak percobaan. Silakan tunggu beberapa saat sebelum mencoba lagi.';
  }
  return message;
}

async function ensureAndFetchProfile(
  authUser: SupabaseAuthUser,
  options?: { fullName?: string; phone?: string; allowUpsert?: boolean },
): Promise<User> {
  if (!supabase) {
    return buildFallbackUser(authUser, options?.fullName, options?.phone);
  }

  // 1. Try reading profile (brief retry for after-insert trigger)
  const maxAttempts = options?.allowUpsert ? 3 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (data) {
      return mapProfileRow(data as Record<string, unknown>, authUser);
    }

    if (error) {
      // Do not falsely treat profile permission/schema issue as duplicate email
      console.warn('Profil belum dapat dibaca:', error.message);
      break;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  // 2. If trigger didn't create profile yet, attempt upsert with role = 'user'
  if (options?.allowUpsert) {
    const email = authUser.email || '';
    const fullName =
      options.fullName ||
      (typeof authUser.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name
        : email.split('@')[0] || 'Pengguna');

    const { data: upserted, error: upsertErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: authUser.id,
          full_name: fullName,
          email,
          role: 'user',
          phone: options.phone || null,
        },
        { onConflict: 'id' },
      )
      .select('*')
      .maybeSingle();

    if (upserted) {
      return mapProfileRow(upserted as Record<string, unknown>, authUser);
    }

    if (upsertErr && upsertErr.code === '42703') {
      // Fallback if table uses `name` column instead of `full_name`
      const { data: altUpserted } = await supabase
        .from('profiles')
        .upsert(
          {
            id: authUser.id,
            name: fullName,
            email,
            role: 'user',
          },
          { onConflict: 'id' },
        )
        .select('*')
        .maybeSingle();

      if (altUpserted) {
        return mapProfileRow(altUpserted as Record<string, unknown>, authUser);
      }
    }
  }

  return buildFallbackUser(authUser, options?.fullName, options?.phone);
}

export const authService = {
  async login(input: LoginInput): Promise<User> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });

      if (error) {
        throw new ApiError(
          translateSupabaseAuthError(error.message, error.code),
          error.status || 401,
        );
      }

      if (!data.user) {
        throw new ApiError('Gagal memuat data akun pengguna.', 401);
      }

      return ensureAndFetchProfile(data.user);
    }

    const data = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthToken(data.token);
    return data.user;
  },

  async register(input: RegisterInput): Promise<RegisterResult> {
    const cleanName = input.name.trim();
    const cleanEmail = input.email.trim();
    const cleanPhone = input.phone?.trim() || undefined;

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: input.password,
        options: {
          data: {
            full_name: cleanName,
            phone: cleanPhone || null,
          },
        },
      });

      if (error) {
        throw new ApiError(
          translateSupabaseAuthError(error.message, error.code),
          isDuplicateUserError(error.message, error.code)
            ? 409
            : error.status || 400,
        );
      }

      // Supabase signals an already-registered email via empty identities when confirm-email is enabled
      if (
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        throw new ApiError(
          'Email ini sudah terdaftar. Silakan gunakan email lain atau masuk.',
          409,
        );
      }

      let activeUser = data.user;
      let activeSession = data.session;

      // If signUp succeeded without an immediate session, attempt auto signInWithPassword
      if (!activeSession) {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: input.password,
          });

        if (signInData?.session && signInData?.user) {
          activeSession = signInData.session;
          activeUser = signInData.user;
        } else if (
          signInError &&
          signInError.message.toLowerCase().includes('email not confirmed')
        ) {
          return {
            user: null,
            requiresEmailVerification: true,
            message:
              'Pendaftaran berhasil! Silakan periksa email Anda untuk tautan verifikasi sebelum masuk.',
          };
        }
      }

      if (!activeSession || !activeUser) {
        return {
          user: null,
          requiresEmailVerification: true,
          message:
            'Pendaftaran berhasil! Silakan periksa email Anda atau masuk dengan akun yang baru dibuat.',
        };
      }

      const profile = await ensureAndFetchProfile(activeUser, {
        fullName: cleanName,
        phone: cleanPhone,
        allowUpsert: true,
      });

      return {
        user: profile,
        requiresEmailVerification: false,
        message: `Pendaftaran berhasil! Selamat datang di Do-Siti, ${profile.name}.`,
      };
    }

    const data = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAuthToken(data.token);
    return {
      user: data.user,
      requiresEmailVerification: false,
      message: `Pendaftaran berhasil! Selamat datang di Do-Siti, ${data.user.name}.`,
    };
  },

  async getCurrentUser(): Promise<User | null> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) {
        return null;
      }
      return ensureAndFetchProfile(data.session.user);
    }

    const token = getAuthToken();
    if (!token) return null;
    try {
      const data = await apiRequest<{ user: User }>('/api/auth/me');
      return data.user;
    } catch {
      setAuthToken(null);
      return null;
    }
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new ApiError(error.message, 500);
      }
      return;
    }

    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
};
