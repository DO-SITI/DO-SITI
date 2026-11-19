import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

dotenv.config();

type UserRole = 'admin' | 'user';
type MenuCategory = 'Donat' | 'Minuman';
type OrderStatus = 'Menunggu' | 'Diproses' | 'Siap' | 'Selesai' | 'Dibatalkan';
type DeliveryMethod = 'Ambil di Toko' | 'Antar ke Alamat';
type PaymentMethod = 'COD' | 'QRIS' | 'E-Wallet';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  passwordHash: string;
  createdAt: string;
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  createdAt: string;
}

interface MenuItemRecord {
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

interface OrderItemRecord {
  menuId: string;
  name: string;
  category: MenuCategory;
  price: number;
  quantity: number;
  subtotal: number;
  imageUrl: string;
  note?: string;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: OrderItemRecord[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  menus: MenuItemRecord[];
  orders: OrderRecord[];
  orderSeq: number;
}

interface AuthenticatedRequest extends Request {
  authUser?: PublicUser;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'dositi-db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BOOTSTRAP_FILE = path.resolve(__dirname, 'server', 'bootstrap.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'dositi-artisan-plum-rose-session-key';
const PORT = Number(process.env.PORT || 3000);

const VALID_STATUSES: OrderStatus[] = [
  'Menunggu',
  'Diproses',
  'Siap',
  'Selesai',
  'Dibatalkan',
];

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

function signToken(user: PublicUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): { sub: string; role: UserRole } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { sub?: string; role?: UserRole; exp?: number };
    if (!decoded.sub || !decoded.role || !decoded.exp) return null;
    if (decoded.exp < Date.now()) return null;
    return { sub: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: user.address,
    createdAt: user.createdAt,
  };
}

function ensureDatabase(): DatabaseSchema {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (Array.isArray(parsed.menus) && parsed.menus.length < 10 && fs.existsSync(BOOTSTRAP_FILE)) {
      const bootstrapRaw = JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf8')) as {
        menus?: Array<Partial<MenuItemRecord>>;
      };
      const existingIds = new Set(parsed.menus.map((m) => m.id));
      const now = new Date().toISOString();
      let added = false;
      for (const item of bootstrapRaw.menus || []) {
        if (item.id && !existingIds.has(item.id)) {
          parsed.menus.push({
            id: item.id,
            name: item.name || 'Menu Do-Siti',
            category: item.category === 'Minuman' ? 'Minuman' : 'Donat',
            price: Number(item.price || 20000),
            stock: Number(item.stock ?? 10),
            description: item.description || '',
            imageUrl: item.imageUrl || '',
            isAvailable: item.isAvailable ?? true,
            highlight: item.highlight,
            createdAt: now,
            updatedAt: now,
          });
          added = true;
        }
      }
      if (added) {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      }
    }
    return parsed;
  }

  const now = new Date().toISOString();
  const bootstrapRaw = fs.existsSync(BOOTSTRAP_FILE)
    ? JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf8'))
    : { menus: [], orders: [] };

  const menus: MenuItemRecord[] = (bootstrapRaw.menus || []).map(
    (item: Partial<MenuItemRecord>, idx: number) => ({
      id: item.id || `menu-${idx + 1}`,
      name: item.name || 'Menu Do-Siti',
      category: item.category === 'Minuman' ? 'Minuman' : 'Donat',
      price: Number(item.price || 20000),
      stock: Number(item.stock ?? 10),
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      isAvailable: item.isAvailable ?? true,
      highlight: item.highlight,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const users: StoredUser[] = [];
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    users.push({
      id: 'usr-seed-admin',
      name: process.env.SEED_ADMIN_NAME || 'Admin Do-Siti',
      email: process.env.SEED_ADMIN_EMAIL.trim().toLowerCase(),
      role: 'admin',
      passwordHash: hashPassword(process.env.SEED_ADMIN_PASSWORD),
      createdAt: now,
    });
  }
  if (process.env.SEED_USER_EMAIL && process.env.SEED_USER_PASSWORD) {
    users.push({
      id: 'usr-seed-user',
      name: process.env.SEED_USER_NAME || 'Pelanggan Do-Siti',
      email: process.env.SEED_USER_EMAIL.trim().toLowerCase(),
      role: 'user',
      passwordHash: hashPassword(process.env.SEED_USER_PASSWORD),
      createdAt: now,
    });
  }

  const orders: OrderRecord[] = (bootstrapRaw.orders || []).map(
    (ord: Partial<OrderRecord>, idx: number) => ({
      id: ord.id || `ord-${idx + 1}`,
      orderNumber: ord.orderNumber || `DS-${1041 + idx}`,
      userId: ord.userId || 'usr-demo-user',
      customerName: ord.customerName || 'Nadia Putri',
      customerPhone: ord.customerPhone || '081234567890',
      customerAddress: ord.customerAddress || '',
      deliveryMethod:
        ord.deliveryMethod === 'Antar ke Alamat'
          ? 'Antar ke Alamat'
          : 'Ambil di Toko',
      paymentMethod:
        ord.paymentMethod === 'QRIS' || ord.paymentMethod === 'E-Wallet'
          ? ord.paymentMethod
          : 'COD',
      notes: ord.notes,
      items: ord.items || [],
      subtotal: Number(ord.subtotal || 0),
      deliveryFee: Number(ord.deliveryFee || 0),
      total: Number(ord.total || 0),
      status: VALID_STATUSES.includes(ord.status as OrderStatus)
        ? (ord.status as OrderStatus)
        : 'Menunggu',
      createdAt: new Date(Date.now() - (2 - idx) * 3600 * 1000).toISOString(),
      updatedAt: now,
    }),
  );

  const initialDb: DatabaseSchema = {
    users,
    menus,
    orders,
    orderSeq: 1043,
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
  return initialDb;
}

function readDb(): DatabaseSchema {
  return ensureDatabase();
}

function writeDb(db: DatabaseSchema): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const RESTOCK_DURATION_MS = 5 * 60 * 1000;
const RESTOCK_MIN_STOCK = 8;
const RESTOCK_MAX_STOCK = 25;

function generateDifferentRestockAmount(
  previousValues: Array<number | null | undefined>,
): number {
  const excluded = new Set(
    previousValues.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    ),
  );
  const candidates: number[] = [];
  for (let n = RESTOCK_MIN_STOCK; n <= RESTOCK_MAX_STOCK; n += 1) {
    if (!excluded.has(n)) candidates.push(n);
  }
  if (candidates.length === 0) return RESTOCK_MIN_STOCK;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function syncExpiredRestocksInDb(db: DatabaseSchema): boolean {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let changed = false;

  for (const menu of db.menus) {
    if (menu.stock === 0 && menu.isAvailable) {
      if (!menu.restockAvailableAt) {
        menu.restockAvailableAt = new Date(
          nowMs + RESTOCK_DURATION_MS,
        ).toISOString();
        changed = true;
      } else if (Date.parse(menu.restockAvailableAt) <= nowMs) {
        const nextStock = generateDifferentRestockAmount([
          menu.lastStock,
          menu.stock,
        ]);
        menu.stock = nextStock;
        menu.lastStock = nextStock;
        menu.restockAvailableAt = null;
        menu.isAvailable = true;
        menu.updatedAt = nowIso;
        changed = true;
      }
    } else if (menu.stock > 0 && menu.restockAvailableAt) {
      menu.restockAvailableAt = null;
      changed = true;
    }
  }

  if (changed) {
    writeDb(db);
  }
  return changed;
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      message: 'Sesi login diperlukan. Silakan masuk terlebih dahulu.',
    });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const parsed = verifyToken(token);
  if (!parsed) {
    res.status(401).json({
      message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk ulang.',
    });
    return;
  }

  const db = readDb();
  const found = db.users.find((u) => u.id === parsed.sub);
  if (!found) {
    res.status(401).json({ message: 'Akun pengguna tidak ditemukan.' });
    return;
  }

  req.authUser = toPublicUser(found);
  next();
}

function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    res.status(401).json({ message: 'Sesi login diperlukan.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({
      message:
        'Akses ditolak. Hanya Admin yang diizinkan mengelola data toko.',
    });
    return;
  }
  next();
}

async function startServer() {
  ensureDatabase();

  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Do-Siti API' });
  });

  // Auth Routes
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({
        message: 'Email dan kata sandi wajib diisi.',
      });
      return;
    }

    const db = readDb();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail,
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({
        message: 'Email atau kata sandi tidak sesuai. Silakan periksa kembali.',
      });
      return;
    }

    const publicUser = toPublicUser(user);
    const token = signToken(publicUser);
    res.json({ token, user: publicUser });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, phone, address } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
      address?: string;
    };

    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (cleanName.length < 2) {
      res.status(400).json({
        message: 'Nama lengkap minimal terdiri dari 2 karakter.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({
        message: 'Format email tidak valid.',
      });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({
        message: 'Kata sandi minimal 6 karakter.',
      });
      return;
    }

    const db = readDb();
    const existing = db.users.find(
      (u) => u.email.toLowerCase() === cleanEmail,
    );
    if (existing) {
      res.status(409).json({
        message: 'Email ini sudah terdaftar. Silakan gunakan email lain atau masuk.',
      });
      return;
    }

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      email: cleanEmail,
      role: 'user',
      phone: (phone || '').trim() || undefined,
      address: (address || '').trim() || undefined,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    writeDb(db);

    const publicUser = toPublicUser(newUser);
    const token = signToken(publicUser);
    res.status(201).json({ token, user: publicUser });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true });
  });

  // Menu Routes
  app.post('/api/menus/sync-restock', (_req, res) => {
    const db = readDb();
    syncExpiredRestocksInDb(db);
    res.json({ menus: db.menus });
  });

  app.get('/api/menus', (req, res) => {
    const db = readDb();
    syncExpiredRestocksInDb(db);
    const search = String(req.query.search || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();

    let items = [...db.menus];
    if (category === 'Donat' || category === 'Minuman') {
      items = items.filter((m) => m.category === category);
    }
    if (search) {
      items = items.filter(
        (m) =>
          m.name.toLowerCase().includes(search) ||
          m.description.toLowerCase().includes(search) ||
          m.category.toLowerCase().includes(search),
      );
    }

    res.json({ menus: items });
  });

  app.post(
    '/api/upload',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res) => {
      const { filename, mimeType, dataBase64 } = req.body as {
        filename?: string;
        mimeType?: string;
        dataBase64?: string;
      };

      const allowedMime: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
      };

      if (!mimeType || !allowedMime[mimeType]) {
        res.status(400).json({
          message: 'Format gambar harus JPG, PNG, atau WebP.',
        });
        return;
      }

      if (!dataBase64) {
        res.status(400).json({ message: 'Data gambar tidak ditemukan.' });
        return;
      }

      const rawBase64 = dataBase64.includes(',')
        ? dataBase64.split(',')[1]
        : dataBase64;
      const buffer = Buffer.from(rawBase64, 'base64');

      if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) {
        res.status(400).json({
          message: 'Ukuran gambar maksimal 3 MB.',
        });
        return;
      }

      const safeBase = (filename || 'menu')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 32);
      const outName = `${safeBase}_${Date.now()}${allowedMime[mimeType]}`;
      const outPath = path.join(UPLOAD_DIR, outName);

      fs.writeFileSync(outPath, buffer);
      res.status(201).json({ url: `/uploads/${outName}` });
    },
  );

  app.post(
    '/api/menus',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res) => {
      const body = req.body as Partial<MenuItemRecord>;
      const name = (body.name || '').trim();
      const description = (body.description || '').trim();
      const price = Number(body.price);
      const stock = Number(body.stock);
      const category = body.category;
      const imageUrl = (body.imageUrl || '').trim();

      if (name.length < 3) {
        res.status(400).json({ message: 'Nama menu minimal 3 karakter.' });
        return;
      }
      if (category !== 'Donat' && category !== 'Minuman') {
        res.status(400).json({ message: 'Kategori harus Donat atau Minuman.' });
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        res.status(400).json({ message: 'Harga menu harus lebih dari Rp 0.' });
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) {
        res.status(400).json({ message: 'Stok menu minimal 0.' });
        return;
      }
      if (description.length < 10) {
        res.status(400).json({
          message: 'Deskripsi menu minimal 10 karakter agar informatif.',
        });
        return;
      }
      if (!imageUrl) {
        res.status(400).json({
          message: 'Gambar menu wajib diunggah terlebih dahulu.',
        });
        return;
      }

      const db = readDb();
      const now = new Date().toISOString();
      const isAvail = body.isAvailable !== false;
      const newMenu: MenuItemRecord = {
        id: `menu-${crypto.randomUUID().slice(0, 8)}`,
        name,
        category,
        price,
        stock,
        description,
        imageUrl,
        isAvailable: isAvail,
        highlight: (body.highlight || '').trim() || undefined,
        restockAvailableAt:
          stock === 0 && isAvail
            ? new Date(Date.now() + RESTOCK_DURATION_MS).toISOString()
            : null,
        lastStock: stock > 0 ? stock : null,
        createdAt: now,
        updatedAt: now,
      };

      db.menus.unshift(newMenu);
      writeDb(db);
      res.status(201).json({ menu: newMenu });
    },
  );

  app.put(
    '/api/menus/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res) => {
      const { id } = req.params;
      const body = req.body as Partial<MenuItemRecord>;
      const db = readDb();
      const idx = db.menus.findIndex((m) => m.id === id);
      if (idx === -1) {
        res.status(404).json({ message: 'Menu tidak ditemukan.' });
        return;
      }

      const name = (body.name || '').trim();
      const description = (body.description || '').trim();
      const price = Number(body.price);
      const stock = Number(body.stock);
      const category = body.category;
      const imageUrl = (body.imageUrl || '').trim();

      if (name.length < 3) {
        res.status(400).json({ message: 'Nama menu minimal 3 karakter.' });
        return;
      }
      if (category !== 'Donat' && category !== 'Minuman') {
        res.status(400).json({ message: 'Kategori harus Donat atau Minuman.' });
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        res.status(400).json({ message: 'Harga menu harus lebih dari Rp 0.' });
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) {
        res.status(400).json({ message: 'Stok menu minimal 0.' });
        return;
      }
      if (description.length < 10) {
        res.status(400).json({
          message: 'Deskripsi menu minimal 10 karakter.',
        });
        return;
      }
      if (!imageUrl) {
        res.status(400).json({ message: 'Gambar menu wajib tersedia.' });
        return;
      }

      const prevMenu = db.menus[idx];
      const isAvail = body.isAvailable !== false;
      const updated: MenuItemRecord = {
        ...prevMenu,
        name,
        category,
        price,
        stock,
        description,
        imageUrl,
        isAvailable: isAvail,
        highlight: (body.highlight || '').trim() || undefined,
        restockAvailableAt:
          stock === 0 && isAvail
            ? prevMenu.restockAvailableAt ||
              new Date(Date.now() + RESTOCK_DURATION_MS).toISOString()
            : null,
        lastStock:
          stock > 0
            ? stock
            : (prevMenu.lastStock ?? (prevMenu.stock > 0 ? prevMenu.stock : null)),
        updatedAt: new Date().toISOString(),
      };

      db.menus[idx] = updated;
      writeDb(db);
      res.json({ menu: updated });
    },
  );

  app.delete(
    '/api/menus/:id',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res) => {
      const { id } = req.params;
      const db = readDb();
      const exists = db.menus.some((m) => m.id === id);
      if (!exists) {
        res.status(404).json({ message: 'Menu tidak ditemukan.' });
        return;
      }
      db.menus = db.menus.filter((m) => m.id !== id);
      writeDb(db);
      res.json({ success: true });
    },
  );

  // Order Routes
  app.get('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = readDb();
    const user = req.authUser!;
    const statusFilter = String(req.query.status || '').trim();

    let orders =
      user.role === 'admin'
        ? [...db.orders]
        : db.orders.filter((o) => o.userId === user.id);

    if (
      statusFilter &&
      VALID_STATUSES.includes(statusFilter as OrderStatus)
    ) {
      orders = orders.filter((o) => o.status === statusFilter);
    }

    orders.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    res.json({ orders });
  });

  app.post('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const body = req.body as {
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      deliveryMethod?: DeliveryMethod;
      paymentMethod?: PaymentMethod;
      notes?: string;
      items?: Array<{ menuId: string; quantity: number; note?: string }>;
    };

    const customerName = (body.customerName || '').trim();
    const customerPhone = (body.customerPhone || '').trim();
    const customerAddress = (body.customerAddress || '').trim();
    const deliveryMethod: DeliveryMethod =
      body.deliveryMethod === 'Antar ke Alamat'
        ? 'Antar ke Alamat'
        : 'Ambil di Toko';
    const paymentMethod: PaymentMethod =
      body.paymentMethod === 'QRIS' || body.paymentMethod === 'E-Wallet'
        ? body.paymentMethod
        : 'COD';

    if (customerName.length < 2) {
      res.status(400).json({ message: 'Nama pemesan wajib diisi.' });
      return;
    }

    if (!/^[0-9+\s-]{9,16}$/.test(customerPhone)) {
      res.status(400).json({
        message: 'Nomor WhatsApp/HP tidak valid (9-15 digit angka).',
      });
      return;
    }

    if (deliveryMethod === 'Antar ke Alamat' && customerAddress.length < 8) {
      res.status(400).json({
        message: 'Alamat pengantaran wajib diisi lengkap minimal 8 karakter.',
      });
      return;
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({
        message: 'Keranjang pesanan masih kosong.',
      });
      return;
    }

    const db = readDb();
    syncExpiredRestocksInDb(db);
    const requestedTotals = new Map<string, number>();
    for (const reqItem of body.items) {
      const qty = Number(reqItem.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        res.status(400).json({
          message: 'Jumlah pesanan setiap item minimal 1 porsi.',
        });
        return;
      }
      requestedTotals.set(
        reqItem.menuId,
        (requestedTotals.get(reqItem.menuId) ?? 0) + qty,
      );
    }

    for (const [menuId, totalQty] of requestedTotals.entries()) {
      const menu = db.menus.find((m) => m.id === menuId);
      if (!menu) {
        res.status(400).json({
          message: 'Salah satu menu di keranjang sudah tidak tersedia.',
        });
        return;
      }
      if (!menu.isAvailable) {
        res.status(400).json({
          message: `Menu "${menu.name}" sedang tidak tersedia saat ini.`,
        });
        return;
      }
      if (menu.stock <= 0) {
        res.status(400).json({
          message: `Menu "${menu.name}" sedang habis dan dalam masa jeda restock 5 menit.`,
        });
        return;
      }
      if (menu.stock < totalQty) {
        res.status(400).json({
          message: `Stok "${menu.name}" tersisa ${menu.stock} porsi.`,
        });
        return;
      }
    }

    const orderItems: OrderItemRecord[] = [];
    let subtotal = 0;

    for (const reqItem of body.items) {
      const menu = db.menus.find((m) => m.id === reqItem.menuId)!;
      const qty = Number(reqItem.quantity);
      const lineSubtotal = menu.price * qty;
      subtotal += lineSubtotal;
      orderItems.push({
        menuId: menu.id,
        name: menu.name,
        category: menu.category,
        price: menu.price,
        quantity: qty,
        subtotal: lineSubtotal,
        imageUrl: menu.imageUrl,
        note: (reqItem.note || '').trim() || undefined,
      });
    }

    // Decrement stock safely and trigger 5-minute restock cooldown if stock hits 0
    for (const [menuId, totalQty] of requestedTotals.entries()) {
      const menu = db.menus.find((m) => m.id === menuId);
      if (menu) {
        const prevNonZero = menu.lastStock ?? (menu.stock > 0 ? menu.stock : null);
        const nextStock = Math.max(0, menu.stock - totalQty);
        menu.stock = nextStock;
        menu.lastStock = nextStock === 0 ? prevNonZero : nextStock;
        menu.restockAvailableAt =
          nextStock === 0
            ? new Date(Date.now() + RESTOCK_DURATION_MS).toISOString()
            : null;
        menu.updatedAt = new Date().toISOString();
      }
    }

    const deliveryFee = deliveryMethod === 'Antar ke Alamat' ? 10000 : 0;
    const total = subtotal + deliveryFee;
    const now = new Date().toISOString();
    const orderNumber = `DS-${db.orderSeq}`;
    db.orderSeq += 1;

    const newOrder: OrderRecord = {
      id: `ord-${crypto.randomUUID().slice(0, 8)}`,
      orderNumber,
      userId: user.id,
      customerName,
      customerPhone,
      customerAddress,
      deliveryMethod,
      paymentMethod,
      notes: (body.notes || '').trim() || undefined,
      items: orderItems,
      subtotal,
      deliveryFee,
      total,
      status: 'Menunggu',
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(newOrder);
    writeDb(db);
    res.status(201).json({ order: newOrder });
  });

  app.patch(
    '/api/orders/:id/status',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res) => {
      const { id } = req.params;
      const { status } = req.body as { status?: OrderStatus };

      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ message: 'Status pesanan tidak valid.' });
        return;
      }

      const db = readDb();
      const idx = db.orders.findIndex((o) => o.id === id);
      if (idx === -1) {
        res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
        return;
      }

      db.orders[idx] = {
        ...db.orders[idx],
        status,
        updatedAt: new Date().toISOString(),
      };
      writeDb(db);
      res.json({ order: db.orders[idx] });
    },
  );

  // Dashboard Summary Route
  app.get(
    '/api/dashboard/summary',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const db = readDb();
      syncExpiredRestocksInDb(db);
      const user = req.authUser!;
      const scopedOrders =
        user.role === 'admin'
          ? db.orders
          : db.orders.filter((o) => o.userId === user.id);

      const sortedOrders = [...scopedOrders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const activeOrders = scopedOrders.filter(
        (o) =>
          o.status === 'Menunggu' ||
          o.status === 'Diproses' ||
          o.status === 'Siap',
      ).length;

      const completedOrders = scopedOrders.filter(
        (o) => o.status === 'Selesai',
      ).length;

      const totalRevenueOrSpent = scopedOrders
        .filter((o) => o.status !== 'Dibatalkan')
        .reduce((acc, o) => acc + o.total, 0);

      const availableMenus = db.menus.filter(
        (m) => m.isAvailable && m.stock > 0,
      ).length;
      const donutCount = db.menus.filter((m) => m.category === 'Donat').length;
      const drinkCount = db.menus.filter(
        (m) => m.category === 'Minuman',
      ).length;
      const lowStockMenus = db.menus
        .filter((m) => m.stock <= 5)
        .sort((a, b) => a.stock - b.stock);

      res.json({
        summary: {
          role: user.role,
          totalOrders: scopedOrders.length,
          activeOrders,
          completedOrders,
          totalRevenueOrSpent,
          totalMenus: db.menus.length,
          availableMenus,
          donutCount,
          drinkCount,
          lowStockMenus: user.role === 'admin' ? lowStockMenus : [],
          recentOrders: sortedOrders.slice(0, 5),
        },
      });
    },
  );

  // Vite or static production build
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
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Do-Siti server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Do-Siti server:', err);
  process.exit(1);
});
