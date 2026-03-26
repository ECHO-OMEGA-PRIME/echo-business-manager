-- Echo Business Manager — Universal Multi-Tenant Schema
-- Combines profinish-api + cleanbrees-api + Pro CRM + AI Assistant + Notebook + Calendar

-- ═══ MULTI-TENANT ═══
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  company_name TEXT, company_phone TEXT, company_email TEXT,
  company_address TEXT, company_city TEXT, company_state TEXT, company_zip TEXT,
  company_website TEXT, company_logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6', accent_color TEXT DEFAULT '#1E40AF',
  tagline TEXT, industry TEXT,
  timezone TEXT DEFAULT 'America/Chicago', currency TEXT DEFAULT 'USD',
  default_tax_rate REAL DEFAULT 0, default_payment_terms TEXT DEFAULT 'net_30',
  invoice_prefix TEXT DEFAULT 'INV', quote_prefix TEXT DEFAULT 'QT',
  resend_api_key TEXT, twilio_sid TEXT, twilio_token TEXT, twilio_phone TEXT,
  api_key TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══ CRM — CONTACTS ═══
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  type TEXT DEFAULT 'customer', -- customer, lead, vendor, partner, subcontractor
  status TEXT DEFAULT 'active', -- active, inactive, archived
  first_name TEXT, last_name TEXT, company_name TEXT,
  email TEXT, phone TEXT, mobile TEXT,
  address TEXT, city TEXT, state TEXT, zip TEXT,
  source TEXT, -- website, referral, walk-in, social, cold-call, ad
  referral_code TEXT, referred_by TEXT,
  preferred_language TEXT DEFAULT 'en', payment_terms TEXT, tax_exempt INTEGER DEFAULT 0,
  lifetime_value REAL DEFAULT 0, lead_score INTEGER DEFAULT 0,
  last_contacted_at TEXT, notes TEXT, metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(tenant_id, type);

CREATE TABLE IF NOT EXISTS contact_tags (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT NOT NULL, tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(contact_id, tag)
);

CREATE TABLE IF NOT EXISTS contact_notes (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, contact_id TEXT NOT NULL,
  title TEXT, content TEXT NOT NULL, pinned INTEGER DEFAULT 0, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_activities (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, contact_id TEXT NOT NULL,
  type TEXT NOT NULL, -- call, email, sms, meeting, note, task, deal, invoice, payment, booking
  title TEXT, description TEXT, metadata TEXT, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON contact_activities(contact_id);

-- ═══ CRM — DEALS PIPELINE ═══
CREATE TABLE IF NOT EXISTS deal_stages (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  name TEXT NOT NULL, position INTEGER NOT NULL,
  probability REAL DEFAULT 0, color TEXT DEFAULT '#3B82F6',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, stage_id TEXT,
  title TEXT NOT NULL, value REAL DEFAULT 0, currency TEXT DEFAULT 'USD',
  probability REAL DEFAULT 0, expected_close_date TEXT, actual_close_date TEXT,
  status TEXT DEFAULT 'open', -- open, won, lost
  lost_reason TEXT, assigned_to TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_tenant ON deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(tenant_id, stage_id);

-- ═══ SERVICES CATALOG ═══
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  name TEXT NOT NULL, category TEXT, description TEXT,
  pricing_type TEXT DEFAULT 'flat', -- flat, hourly, sqft, custom
  base_price REAL DEFAULT 0, duration_minutes INTEGER DEFAULT 60,
  active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ BOOKINGS / APPOINTMENTS ═══
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, service_id TEXT,
  title TEXT, description TEXT,
  scheduled_date TEXT NOT NULL, time_start TEXT, time_end TEXT,
  duration_minutes INTEGER, status TEXT DEFAULT 'pending',
  address TEXT, city TEXT, quoted_price REAL,
  assigned_to TEXT, team_notes TEXT,
  reminder_sent INTEGER DEFAULT 0, weather_alert TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(tenant_id, scheduled_date);

-- ═══ CALENDAR EVENTS ═══
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT,
  event_type TEXT DEFAULT 'event', -- event, meeting, reminder, deadline, follow_up, personal
  start_date TEXT NOT NULL, start_time TEXT, end_date TEXT, end_time TEXT,
  all_day INTEGER DEFAULT 0, recurring TEXT DEFAULT 'none', -- none, daily, weekly, biweekly, monthly, yearly
  location TEXT, contact_id TEXT, deal_id TEXT, booking_id TEXT,
  color TEXT DEFAULT '#3B82F6', reminder_minutes INTEGER,
  completed INTEGER DEFAULT 0, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_tenant ON calendar_events(tenant_id, start_date);

-- ═══ INVOICES ═══
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  invoice_number TEXT, contact_id TEXT, booking_id TEXT, quote_id TEXT,
  issue_date TEXT, due_date TEXT,
  subtotal REAL DEFAULT 0, tax_rate REAL DEFAULT 0, tax_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0, total REAL DEFAULT 0, amount_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, partial, paid, overdue, void
  payment_terms TEXT, notes TEXT, share_token TEXT UNIQUE,
  sales_rep TEXT, paid_date TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_token ON invoices(share_token);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL,
  description TEXT NOT NULL, quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0,
  total REAL DEFAULT 0, sort_order INTEGER DEFAULT 0
);

-- ═══ QUOTES / ESTIMATES ═══
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  quote_number TEXT, contact_id TEXT, booking_id TEXT,
  issue_date TEXT, expiry_date TEXT,
  subtotal REAL DEFAULT 0, tax_rate REAL DEFAULT 0, tax_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0, total REAL DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, accepted, rejected, expired, converted
  approval_status TEXT DEFAULT 'none', -- none, pending, approved, rejected
  approval_token TEXT UNIQUE,
  approved_at TEXT, approval_name TEXT, approval_notes TEXT,
  notes TEXT, share_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(share_token);

CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL,
  description TEXT NOT NULL, quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0,
  total REAL DEFAULT 0, sort_order INTEGER DEFAULT 0
);

-- ═══ PAYMENTS ═══
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
  amount REAL NOT NULL, payment_method TEXT, -- cash, check, card, zelle, venmo, paypal, ach, other
  payment_date TEXT, reference_number TEXT, collected_by TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ CREDITS ═══
CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, invoice_id TEXT, amount REAL NOT NULL,
  credit_type TEXT DEFAULT 'credit_memo', -- credit_memo, discount, refund, goodwill, promo
  reason TEXT, status TEXT DEFAULT 'active', -- active, applied, void
  applied_at TEXT, created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ EXPENSES ═══
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  category TEXT, vendor TEXT, description TEXT, amount REAL NOT NULL,
  expense_date TEXT, receipt_url TEXT, receipt_data TEXT,
  booking_id TEXT, approved INTEGER DEFAULT 0, approved_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ EMPLOYEES / TEAM ═══
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT, phone TEXT, role TEXT DEFAULT 'staff', title TEXT,
  hourly_rate REAL DEFAULT 0, salary REAL,
  hire_date TEXT, status TEXT DEFAULT 'active',
  emergency_contact TEXT, emergency_phone TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══ TIME TRACKING ═══
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, employee_id TEXT NOT NULL,
  booking_id TEXT, work_date TEXT, start_time TEXT, end_time TEXT,
  hours REAL DEFAULT 0, overtime_hours REAL DEFAULT 0, hourly_rate REAL,
  notes TEXT, approved INTEGER DEFAULT 0, approved_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ PAYROLL ═══
CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, approved, paid
  total_gross REAL DEFAULT 0, total_deductions REAL DEFAULT 0, total_net REAL DEFAULT 0,
  paid_date TEXT, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY, payroll_run_id TEXT NOT NULL, employee_id TEXT NOT NULL,
  hours_regular REAL DEFAULT 0, hours_overtime REAL DEFAULT 0, rate REAL DEFAULT 0,
  gross_pay REAL DEFAULT 0, deductions REAL DEFAULT 0, net_pay REAL DEFAULT 0
);

-- ═══ INVENTORY ═══
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  name TEXT NOT NULL, category TEXT, sku TEXT,
  quantity REAL DEFAULT 0, unit TEXT DEFAULT 'ea', unit_cost REAL DEFAULT 0,
  reorder_level REAL DEFAULT 0, vendor TEXT, last_restocked TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ REVIEWS ═══
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, reviewer_name TEXT,
  rating INTEGER NOT NULL, review_text TEXT,
  approved INTEGER DEFAULT 0, featured INTEGER DEFAULT 0,
  source TEXT DEFAULT 'direct', response TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ NPS ═══
CREATE TABLE IF NOT EXISTS nps_responses (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, score INTEGER NOT NULL,
  comment TEXT, follow_up_action TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ TASKS ═══
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  due_date TEXT, assigned_to TEXT,
  contact_id TEXT, deal_id TEXT, booking_id TEXT,
  completed_at TEXT, created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id, status);

-- ═══ NOTEBOOK ═══
CREATE TABLE IF NOT EXISTS notebook (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, content TEXT,
  category TEXT DEFAULT 'general', -- general, meeting, idea, strategy, reference, client
  pinned INTEGER DEFAULT 0, tags TEXT, ai_summary TEXT,
  contact_id TEXT, deal_id TEXT,
  created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══ AI ASSISTANT ═══
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  user_id TEXT, user_name TEXT,
  messages TEXT NOT NULL, summary TEXT, category TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══ FOLLOW-UPS / AUTOMATION ═══
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  contact_id TEXT, type TEXT NOT NULL, -- invoice_reminder, quote_follow_up, review_request, check_in, custom
  status TEXT DEFAULT 'pending', channel TEXT DEFAULT 'email',
  message TEXT, scheduled_at TEXT, sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ PROMOTIONS ═══
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT,
  discount_type TEXT DEFAULT 'percent', discount_value REAL DEFAULT 0,
  promo_code TEXT, active INTEGER DEFAULT 1,
  start_date TEXT, end_date TEXT,
  usage_count INTEGER DEFAULT 0, max_uses INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ REFERRALS ═══
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  referrer_id TEXT, referred_id TEXT,
  referrer_discount_applied INTEGER DEFAULT 0, referred_discount_applied INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ BLOG / CONTENT ═══
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  title TEXT NOT NULL, slug TEXT, content TEXT, excerpt TEXT,
  status TEXT DEFAULT 'draft', author TEXT, tags TEXT,
  seo_title TEXT, seo_description TEXT,
  published_at TEXT, created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ PROGRESS PHOTOS ═══
CREATE TABLE IF NOT EXISTS progress_photos (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  booking_id TEXT, r2_key TEXT, caption TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ PERMITS ═══
CREATE TABLE IF NOT EXISTS permits (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  booking_id TEXT, permit_number TEXT, type TEXT,
  status TEXT DEFAULT 'pending', jurisdiction TEXT,
  filed_date TEXT, expiration_date TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ CHECKLIST TEMPLATES ═══
CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  name TEXT NOT NULL, service_id TEXT, items_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  booking_id TEXT, template_id TEXT,
  item_text TEXT NOT NULL, completed INTEGER DEFAULT 0,
  completed_by TEXT, completed_at TEXT
);

-- ═══ JOB APPLICATIONS ═══
CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  position TEXT, experience TEXT, availability TEXT,
  drivers_license INTEGER DEFAULT 0, own_transportation INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new', notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ SETTINGS (tenant KV) ═══
CREATE TABLE IF NOT EXISTS settings (
  tenant_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, key)
);

-- ═══ AUDIT LOG ═══
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
  user_id TEXT, action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);
