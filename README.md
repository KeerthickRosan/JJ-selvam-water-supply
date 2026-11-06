# JJ Selvam Water Supply Management System

A full-stack web application for managing water deliveries, drivers, customers, payments, outstanding balances and reports.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Python Django 5 + Django REST Framework |
| Database | MySQL 8 (utf8mb4) |
| Auth | Username/password login → API token (DRF TokenAuthentication), login rate-limited |
| Exports | Excel (openpyxl) and PDF (reportlab), generated on the server |

```
jj-selvam-water/
├── backend/            Django project (config/) + app (core/)
│   ├── core/models.py      database tables
│   ├── core/services.py    balance and payment-allocation engine
│   ├── core/views.py       customers, drivers, deliveries, payments APIs
│   ├── core/reports.py     dashboard, reports, auth, settings, backup/restore
│   ├── core/exports.py     Excel/PDF generation
│   └── core/tests.py       automated tests for calculations and APIs
└── frontend/           React app (src/pages, src/components)
```

---

## 1. Installation (development / single computer)

### Prerequisites
- Python 3.11+ (3.12 or 3.13 recommended)
- Node.js 18+ (20/22 recommended)
- MySQL 8.0+

### 1.1 Create the MySQL database
```sql
CREATE DATABASE jj_selvam_water CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'jjwater'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON jj_selvam_water.* TO 'jjwater'@'localhost';
FLUSH PRIVILEGES;
```

### 1.2 Backend
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate     Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# edit .env → set DB_PASSWORD and a long random DJANGO_SECRET_KEY
python manage.py migrate
python manage.py createsuperuser      # this is your login for the app
python manage.py runserver            # API on http://127.0.0.1:8000
```
The backend uses PyMySQL, a pure-Python MySQL driver, so it does not require
native MySQL client libraries or build tools.

Optional, to try the app with sample data on a **test** database only: `python manage.py seed_demo`

### 1.3 Frontend
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173 (proxies /api to Django)
```
Open http://localhost:5173 and sign in with the superuser you created.

### 1.4 First steps in the app
1. **Settings** → enter your business details.
2. **Drivers** → add your drivers, set each weekly salary, and use **Leave days** to record monthly leave. Monthly base pay is weekly salary × 4; each leave deducts weekly salary ÷ 7.
3. **Customers** → add customers. Enter any old dues in **Previous outstanding balance**.
4. Start recording deliveries from **Daily Logbook** or **Water Deliveries**. Enter the delivery's total price, paid amount, and the balance is calculated automatically.

### 1.5 Run the automated tests
```bash
cd backend
DB_ENGINE=sqlite python manage.py test core      # Windows PowerShell: $env:DB_ENGINE="sqlite"; python manage.py test core
```
The tests check bill calculation, partial payments, later payments, edits and deletes, duplicate-payment protection, filters, ledger, driver collections, exports, backup/restore and login.

---

## 2. Production deployment (Ubuntu server / VPS)

```bash
# backend
cd /srv/jj-selvam-water/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# .env: DJANGO_DEBUG=False, DJANGO_ALLOWED_HOSTS=yourdomain.com,
#       CORS_ALLOWED_ORIGINS=https://yourdomain.com, CSRF_TRUSTED_ORIGINS=https://yourdomain.com
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3   # run via systemd

# frontend
cd ../frontend && npm ci && npm run build      # output in frontend/dist
```

**nginx** (frontend and API on the same domain, so no CORS issues):
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /srv/jj-selvam-water/frontend/dist;
    client_max_body_size 50M;

    location /api/    { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location /admin/  { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location /static/ { alias /srv/jj-selvam-water/backend/staticfiles/; }
    location /        { try_files $uri /index.html; }
}
```
Then enable HTTPS with `sudo certbot --nginx -d yourdomain.com`.

**systemd unit** `/etc/systemd/system/jjwater.service`:
```ini
[Unit]
Description=JJ Selvam Water API
After=network.target mysql.service
[Service]
WorkingDirectory=/srv/jj-selvam-water/backend
ExecStart=/srv/jj-selvam-water/backend/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3
Restart=always
User=www-data
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now jjwater`

---

## 3. How the money logic works

- **Bill** = the total delivery price entered when recording the delivery.
- A payment entered on the delivery form is linked to that delivery.
- **Later payments** are recorded on the Payments page (or the **Pay** button in Pending Balances). They are linked to the **customer**, never create a delivery entry, and pay off the **previous outstanding balance first, then the oldest unpaid deliveries**. You can also apply a payment to one specific delivery.
- After every add, edit or delete, the customer's balances are **rebuilt from the actual delivery and payment records** in a locked database transaction. Because nothing is added on top of old totals, a payment can't be counted twice and edits always correct the reports.
- A second payment with the same customer, amount and date within 10 minutes needs confirmation, which protects against double-clicks.
- **Status:** Paid = nothing owed. Partially Paid = some money received but a balance remains. Unpaid = nothing paid toward the outstanding dues.
- **Payment filters:** Not Paid = owes money and has paid nothing toward the current dues · Partially Paid = owes money, part paid · Balance Pending = anyone with balance > 0, including previous balance · Fully Paid = balance cleared.
- **Driver collections:** money a driver collects is recorded once, as a payment with "Received by: Driver". In *Payments → Driver cash collection* you mark it **Handed over** when the driver gives the cash to the office. This tracks owner and driver money separately without creating duplicate entries.
- Customers and drivers that have history **can't be deleted**. Mark them **inactive** instead. Deliveries also store the customer and driver names as they were on that day, so history stays correct when details change.

## 4. Backup & restore
- **Settings → Download backup** gives one JSON file with all business data (sequence counters included, so IDs never repeat after a restore).
- **Settings → Restore from file** replaces all data in one transaction. If anything fails, nothing changes. Login users are not touched.
- For a full server-level backup, also schedule a daily MySQL dump:
  `mysqldump -u jjwater -p jj_selvam_water > /backups/jjwater-$(date +%F).sql`

## 5. Users
The app uses Django's user accounts. Add more staff logins at `/admin` → Users. Admin users (*staff status*) can change settings and run backup/restore. Every user can change their own password in Settings.

## 6. API overview (all under `/api/`, token required except login)
| Endpoint | Purpose |
|---|---|
| `POST auth/login/` · `POST auth/logout/` · `GET auth/me/` · `POST auth/change-password/` | Authentication |
| `customers/` CRUD · `customers/balances/` (+`/export/`) · `customers/{id}/ledger/` (+`/export/`) | Customers, payment filters, ledger |
| `drivers/` CRUD | Drivers |
| `deliveries/` CRUD · `deliveries/export/` | Deliveries / logbook (filters: date, date_from, date_to, driver, water_type, status, search) |
| `payments/` CRUD · `payments/mark-handed-over/` · `payments/export/` | Payments & driver collections |
| `dashboard/?date=` | Dashboard |
| `reports/business/`, `reports/drivers/`, `reports/driver-collections/` (+`/export/`) | Reports (`?date_from=&date_to=&export=xlsx|pdf`) |
| `settings/`, `backup/`, `restore/`, `recalculate/` | Settings and maintenance |

## 7. Known limitations (stated honestly)
- No SMS/WhatsApp reminders. The reminders are shown on the dashboard and the Unpaid/Pending pages, with tap-to-call phone numbers.
- One business only, with no separate branches.
- Every logged-in user can enter and edit records. Only admins can change settings or restore backups. There are no finer-grained roles.
- Login tokens don't expire on a timer. Logging out or changing the password ends the session.
