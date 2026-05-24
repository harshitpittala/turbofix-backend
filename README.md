# TurboFix Backend — API & CRM Dashboard

Production-ready Node.js + Express backend with a vanilla-JS CRM dashboard for TurboFix premium mobile repair.

---

## 📁 Project Structure

```
turbofix-backend/
├── src/
│   ├── app.js                    # Main Express app + server
│   ├── config/
│   │   ├── database.js           # MySQL connection pool
│   │   └── multer.js             # File upload config
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   ├── validate.js           # express-validator runner
│   │   └── rateLimiter.js        # Rate limiting configs
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── orderController.js
│   │   ├── technicianController.js
│   │   ├── customerController.js
│   │   ├── paymentController.js
│   │   └── dashboardController.js
│   └── routes/
│       ├── auth.js
│       ├── orders.js
│       ├── technicians.js
│       ├── customers.js
│       ├── payments.js
│       └── dashboard.js
├── crm/                          # Vanilla HTML/JS CRM dashboard
│   ├── login.html
│   ├── index.html                # Dashboard with analytics
│   ├── orders.html               # Order management
│   ├── technicians.html          # Technician management
│   ├── customers.html            # Customer management
│   ├── payments.html             # Payment tracking
│   ├── css/crm.css               # Dark theme CSS
│   └── js/
│       ├── config.js             # Shared constants
│       ├── utils.js              # Helpers (API, toast, formatting)
│       └── auth.js               # Session guard
├── uploads/                      # Uploaded images (gitignored)
├── schema.sql                    # Full MySQL schema + seed data
├── .env.example                  # Environment variable template
└── package.json
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials and JWT secret
```

### 3. Set up the database
```bash
# Create the database and run schema
mysql -u root -p < schema.sql
```

### 4. Start the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:5000`  
CRM dashboard → `http://localhost:5000/crm`

### Default login credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@turbofix.in | Admin@TurboFix2024 |
| Technician | vikram@turbofix.in | Tech@2024 |

> **⚠️ Change these passwords immediately after first login.**

---

## 📡 API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/admin/login` | — | Admin login |
| POST | `/api/auth/technician/login` | — | Technician login |
| GET | `/api/auth/me` | ✅ Staff | Get current user |
| POST | `/api/auth/change-password` | ✅ Staff | Change password |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/orders` | — | Create order (booking form) |
| GET | `/api/orders/track/:orderId` | — | Public order tracking |
| GET | `/api/orders` | ✅ Admin | List orders (paginated, filterable) |
| GET | `/api/orders/export` | ✅ Admin | Export CSV |
| GET | `/api/orders/:id` | ✅ Staff | Get order detail |
| PATCH | `/api/orders/:id/status` | ✅ Staff | Update status |
| PATCH | `/api/orders/:id` | ✅ Admin | Update cost/notes/tech |
| POST | `/api/orders/:id/images` | ✅ Admin | Upload images |
| DELETE | `/api/orders/:id/images/:imageId` | ✅ Admin | Delete image |

### Technicians
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/technicians` | ✅ Admin | List technicians |
| GET | `/api/technicians/:id` | ✅ Admin | Technician detail + orders |
| POST | `/api/technicians` | ✅ Admin | Add technician |
| PUT | `/api/technicians/:id` | ✅ Admin | Update technician |
| PATCH | `/api/technicians/:id/toggle` | ✅ Admin | Activate/deactivate |
| POST | `/api/technicians/:id/reset-password` | ✅ Super Admin | Reset password |

### Customers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/customers` | ✅ Admin | List customers |
| GET | `/api/customers/:id` | ✅ Admin | Customer detail + order history |
| PUT | `/api/customers/:id` | ✅ Admin | Update customer |
| GET | `/api/customers/lookup?phone=xxx` | ✅ Admin | Quick phone lookup |

### Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/payments` | ✅ Admin | List payments |
| GET | `/api/payments/summary` | ✅ Admin | Revenue summary |
| POST | `/api/payments` | ✅ Admin | Record payment |
| PATCH | `/api/payments/:id` | ✅ Admin | Update payment |

### Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | ✅ Admin | KPI stats |
| GET | `/api/dashboard/recent-orders` | ✅ Admin | Latest orders |
| GET | `/api/dashboard/revenue-chart?period=30d` | ✅ Admin | Daily revenue |
| GET | `/api/dashboard/technician-performance` | ✅ Admin | Tech stats |
| GET | `/api/dashboard/notifications` | ✅ Admin | Pending/ready alerts |

---

## 🌐 Booking Form Integration (Next.js Frontend)

Send a `multipart/form-data` POST to `/api/orders`:

```js
const form = new FormData();
form.append('customer_name',  'Ravi Kumar');
form.append('customer_phone', '+919876543210');
form.append('customer_email', 'ravi@example.com');
form.append('device_brand',   'Samsung');
form.append('device_model',   'Galaxy S24 Ultra');
form.append('services',       JSON.stringify(['screen', 'battery']));
form.append('issue_description', 'Screen cracked');
form.append('service_type',   'pickup');  // or 'walk-in'
form.append('pickup_address', '123, MG Road, Hyderabad');
form.append('scheduled_date', '2026-06-01');
form.append('scheduled_time', '10:00 AM');
// Optionally attach up to 5 images:
images.forEach(file => form.append('images', file));

await fetch('http://localhost:5000/api/orders', { method: 'POST', body: form });
// Response: { success: true, data: { order_id: 'TFX-123456', db_id: 1 } }
```

---

## 🔒 Security

- **JWT** tokens: 24h admin / 12h technician
- **bcrypt** with 12 salt rounds
- **Helmet** sets security HTTP headers
- **CORS** restricted to your frontend URL
- **Rate limiting**: 10 login attempts/15min, 20 bookings/hour, 100 API calls/15min
- **Input validation** on all write endpoints via express-validator
- **SQL injection** prevention via parameterized queries (mysql2)
- **File upload** restricted to jpg/png/webp, 10MB max, 5 files max

---

## ☁️ Deployment (Render + Supabase/PlanetScale)

### Database
1. Create a free MySQL database on **PlanetScale** or **Supabase**
2. Run `schema.sql` via their SQL console
3. Copy the connection string values into your environment variables

### Backend on Render
1. Push `turbofix-backend/` to a GitHub repo
2. Create a new **Web Service** on Render
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables from `.env.example`
6. Set `DB_SSL=true` for PlanetScale/Supabase

### Frontend CORS
Update `FRONTEND_URL` in your Render environment variables to your deployed Next.js URL (e.g., `https://turbofix.vercel.app`).

---

## 🛠️ Development Tips

```bash
# Install nodemon for auto-restart
npm install --save-dev nodemon

# Watch logs
npm run dev

# Test login
curl -X POST http://localhost:5000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@turbofix.in","password":"Admin@TurboFix2024"}'

# Track an order
curl http://localhost:5000/api/orders/track/TFX-123456

# Health check
curl http://localhost:5000/health
```

---

## 📝 Order Status Flow

```
pending → pickup_assigned → picked_up → under_diagnosis → repairing → ready → delivered
    └────────────────────────────────────────────────────────────────────────→ cancelled
```
