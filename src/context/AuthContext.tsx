import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { authService } from '../services/authService';
import type {
  LoginInput,
  RegisterInput,
  RegisterResult,
} from '../services/authService';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const current = await authService.getCurrentUser();
      setUser((prev) => {
        if (
          prev &&
          current &&
          prev.id === current.id &&
          prev.role === current.role &&
          prev.name === current.name &&
          prev.email === current.email
        ) {
          return prev;
        }
        return current;
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();

    if (isSupabaseConfigured && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsLoading(false);
          return;
        }
        if (!session) return;

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void authService
            .getCurrentUser()
            .then((profile) => {
              if (!profile) return;
              setUser((prev) => {
                if (
                  prev &&
                  prev.id === profile.id &&
                  prev.role === profile.role &&
                  prev.name === profile.name &&
                  prev.email === profile.email
                ) {
                  return prev;
                }
                return profile;
              });
            })
            .finally(() => setIsLoading(false));
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
    return undefined;
  }, [refreshUser]);

  const login = useCallback(async (input: LoginInput) => {
    const loggedUser = await authService.login(input);
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await authService.register(input);
    if (result.user) {
      setUser(result.user);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
