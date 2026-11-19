import { useState } from 'react';
import { Menu, Plus, ShoppingBag, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { AppRoute } from '../types';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
  onAdminQuickAdd: () => void;
}

interface NavItem {
  label: string;
  route?: AppRoute;
  action?: () => void;
  isActive?: boolean;
}

export function Navbar({
  currentRoute,
  onNavigate,
  onLogout,
  onAdminQuickAdd,
}: NavbarProps) {
  const { user } = useAuth();
  const { totalItems, openDrawer } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  const navItems: NavItem[] = !user
    ? [
        {
          label: 'Katalog',
          route: 'katalog',
          isActive: currentRoute === 'katalog',
        },
        {
          label: 'Masuk',
          route: 'masuk',
          isActive: currentRoute === 'masuk',
        },
        {
          label: 'Daftar',
          route: 'daftar',
          isActive: currentRoute === 'daftar',
        },
      ]
    : isAdmin
      ? [
          {
            label: 'Ringkasan',
            route: 'ringkasan',
            isActive: currentRoute === 'ringkasan',
          },
          {
            label: 'Kelola Menu',
            route: 'admin-menu',
            isActive: currentRoute === 'admin-menu',
          },
          {
            label: 'Kelola Pesanan',
            route: 'admin-pesanan',
            isActive: currentRoute === 'admin-pesanan',
          },
          {
            label: 'Katalog',
            route: 'katalog',
            isActive: currentRoute === 'katalog',
          },
          {
            label: 'Keluar',
            action: onLogout,
          },
        ]
      : [
          {
            label: 'Katalog',
            route: 'katalog',
            isActive: currentRoute === 'katalog',
          },
          {
            label: 'Ringkasan',
            route: 'ringkasan',
            isActive: currentRoute === 'ringkasan',
          },
          {
            label: 'Riwayat',
            route: 'riwayat',
            isActive: currentRoute === 'riwayat',
          },
          {
            label: 'Keluar',
            action: onLogout,
          },
        ];

  const handleNavClick = (item: NavItem) => {
    setMobileOpen(false);
    if (item.action) {
      item.action();
    } else if (item.route) {
      onNavigate(item.route);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#211B24]/95 backdrop-blur-md border-b border-[#F8F1F4]/10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            onNavigate(isAdmin ? 'ringkasan' : 'katalog');
          }}
          className="font-display text-2xl font-semibold tracking-tight text-[#F8F1F4] hover:text-[#E7A1B7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Do-Siti
        </button>

        {/* Zone 2: Clean single-line text nav links (Desktop) */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavClick(item)}
              className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                item.isActive
                  ? 'text-[#F8F1F4] border-[#E7A1B7]'
                  : 'text-[#C9B8C2] border-transparent hover:text-[#F8F1F4] hover:border-[#E7A1B7]/40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action + mobile menu button */}
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onAdminQuickAdd();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Menu Baru</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                openDrawer();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span className="tabular-nums">Keranjang ({totalItems})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-[#F8F1F4] hover:bg-[#2B232F] transition-colors cursor-pointer"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      {mobileOpen && (
        <nav
          aria-label="Navigasi seluler"
          className="md:hidden border-t border-[#F8F1F4]/10 bg-[#27202B] px-4 py-3 space-y-1"
        >
          {user && (
            <div className="px-3 py-2 text-xs text-[#C9B8C2] border-b border-[#F8F1F4]/10 mb-2">
              {user.name} · {user.role === 'admin' ? 'Admin' : 'Pelanggan'}
            </div>
          )}
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavClick(item)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                item.isActive
                  ? 'bg-[#342A39] text-[#F8F1F4]'
                  : 'text-[#C9B8C2] hover:bg-[#342A39]/60 hover:text-[#F8F1F4]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
