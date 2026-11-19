export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  createdAt: string;
}

export type MenuCategory = 'Donat' | 'Minuman';

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  stock: number;
  description: string;
  imageUrl: string;
  isAvailable: boolean;
  highlight?: string;
  restockAvailableAt?: string | null;
  lastStock?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuPayload {
  name: string;
  category: MenuCategory;
  price: number;
  stock: number;
  description: string;
  imageUrl: string;
  isAvailable: boolean;
  highlight?: string;
}

export interface CartItem {
  menu: MenuItem;
  quantity: number;
  note?: string;
}

export type OrderStatus =
  | 'Menunggu'
  | 'Diproses'
  | 'Siap'
  | 'Selesai'
  | 'Dibatalkan';

export const ORDER_STATUS_LIST: OrderStatus[] = [
  'Menunggu',
  'Diproses',
  'Siap',
  'Selesai',
  'Dibatalkan',
];

export type DeliveryMethod = 'Ambil di Toko' | 'Antar ke Alamat';

export type PaymentMethod = 'COD' | 'QRIS' | 'E-Wallet';

export const PAYMENT_METHOD_LIST: PaymentMethod[] = ['COD', 'QRIS', 'E-Wallet'];

export interface OrderItem {
  menuId: string;
  name: string;
  category: MenuCategory;
  price: number;
  quantity: number;
  subtotal: number;
  imageUrl: string;
  note?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: Array<{
    menuId: string;
    quantity: number;
    note?: string;
  }>;
}

export interface DashboardSummary {
  role: UserRole;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  totalRevenueOrSpent: number;
  totalMenus: number;
  availableMenus: number;
  donutCount: number;
  drinkCount: number;
  lowStockMenus: MenuItem[];
  recentOrders: Order[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type AppRoute =
  | 'katalog'
  | 'ringkasan'
  | 'riwayat'
  | 'admin-menu'
  | 'admin-pesanan'
  | 'masuk'
  | 'daftar'
  | 'akses-ditolak';
