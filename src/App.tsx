import { useCallback, useEffect, useState } from 'react';
import { CartDrawer } from './components/CartDrawer';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastBanner } from './components/ToastBanner';
import type { ToastMessage } from './components/ToastBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AdminMenuPage } from './pages/AdminMenuPage';
import { AdminOrdersPage } from './pages/AdminOrdersPage';
import { AuthPage } from './pages/AuthPage';
import { CatalogPage } from './pages/CatalogPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { SummaryDashboardPage } from './pages/SummaryDashboardPage';
import type { AppRoute, User } from './types';

function routeFromPathname(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/admin' || clean.startsWith('/admin/menu')) {
    return 'admin-menu';
  }
  if (clean.startsWith('/admin/pesanan')) {
    return 'admin-pesanan';
  }
  if (clean.startsWith('/admin/')) {
    return 'admin-menu';
  }
  switch (clean) {
    case '/':
    case '/katalog':
      return 'katalog';
    case '/masuk':
      return 'masuk';
    case '/daftar':
      return 'daftar';
    case '/ringkasan':
      return 'ringkasan';
    case '/riwayat':
      return 'riwayat';
    default:
      return 'katalog';
  }
}

function pathnameFromRoute(route: AppRoute): string {
  switch (route) {
    case 'katalog':
      return '/';
    case 'masuk':
      return '/masuk';
    case 'daftar':
      return '/daftar';
    case 'ringkasan':
      return '/ringkasan';
    case 'riwayat':
      return '/riwayat';
    case 'admin-menu':
      return '/admin/menu';
    case 'admin-pesanan':
      return '/admin/pesanan';
    default:
      return '/';
  }
}

function DoSitiShell() {
  const { logout } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() =>
    routeFromPathname(window.location.pathname),
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [adminQuickAddSignal, setAdminQuickAddSignal] = useState(0);

  const notify = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    const nextPath = pathnameFromRoute(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ route: nextRoute }, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(routeFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleAuthSuccess = (loggedUser: User, action: 'login' | 'register') => {
    notify(
      'success',
      action === 'register'
        ? `Selamat datang di Do-Siti, ${loggedUser.name}. Akun Anda berhasil dibuat dan sudah masuk.`
        : `Berhasil masuk sebagai ${loggedUser.name}.`,
    );
    navigate(
      action === 'register'
        ? 'katalog'
        : loggedUser.role === 'admin'
          ? 'ringkasan'
          : 'katalog',
    );
  };

  const handleLogout = async () => {
    await logout();
    notify('success', 'Anda telah keluar dari akun Do-Siti.');
    navigate('katalog');
  };

  const handleAdminQuickAdd = () => {
    navigate('admin-menu');
    setAdminQuickAddSignal((prev) => prev + 1);
  };

  const triggerDataRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#211B24] text-[#F8F1F4]">
      <Navbar
        currentRoute={route}
        onNavigate={navigate}
        onLogout={() => void handleLogout()}
        onAdminQuickAdd={handleAdminQuickAdd}
      />

      <main className="flex-1">
        {route === 'katalog' && (
          <CatalogPage
            onNavigate={navigate}
            onNotify={notify}
            catalogRefreshKey={refreshKey}
          />
        )}

        {(route === 'masuk' || route === 'daftar') && (
          <AuthPage
            mode={route}
            onSwitchMode={(nextMode) => navigate(nextMode)}
            onSuccess={handleAuthSuccess}
            onNavigate={navigate}
          />
        )}

        {route === 'ringkasan' && (
          <ProtectedRoute
            allowedRoles={['user', 'admin']}
            onNavigate={navigate}
          >
            <SummaryDashboardPage
              onNavigate={navigate}
              refreshKey={refreshKey}
            />
          </ProtectedRoute>
        )}

        {route === 'riwayat' && (
          <ProtectedRoute
            allowedRoles={['user', 'admin']}
            onNavigate={navigate}
          >
            <OrderHistoryPage
              onNavigate={navigate}
              refreshKey={refreshKey}
            />
          </ProtectedRoute>
        )}

        {route === 'admin-menu' && (
          <ProtectedRoute allowedRoles={['admin']} onNavigate={navigate}>
            <AdminMenuPage
              onNotify={notify}
              onDataChanged={triggerDataRefresh}
              quickAddSignal={adminQuickAddSignal}
              refreshKey={refreshKey}
            />
          </ProtectedRoute>
        )}

        {route === 'admin-pesanan' && (
          <ProtectedRoute allowedRoles={['admin']} onNavigate={navigate}>
            <AdminOrdersPage
              onNotify={notify}
              onDataChanged={triggerDataRefresh}
            />
          </ProtectedRoute>
        )}
      </main>

      <footer className="border-t border-[#F8F1F4]/10 py-8 mt-12">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#C9B8C2]">
          <div>
            <span className="font-display text-base font-semibold text-[#F8F1F4]">
              Do-Siti
            </span>{' '}
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            <span>Donat Brioche Artisanal & Minuman Craft</span>
          </div>
          <p>© {new Date().getFullYear()} Do-Siti Patisserie. Semua hak dilindungi.</p>
        </div>
      </footer>

      <CartDrawer
        onNavigate={navigate}
        onOrderCreated={() => triggerDataRefresh()}
        onStockSync={triggerDataRefresh}
        onNotify={notify}
      />

      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <DoSitiShell />
      </CartProvider>
    </AuthProvider>
  );
}
