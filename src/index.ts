/**
 * Echo Business Manager — Universal Multi-Tenant Business Operations Platform
 *
 * Merges ALL capabilities from profinish-api (91 routes) + cleanbrees-api (85+ routes)
 * PLUS: Pro CRM (deals pipeline, tags, activity feed), AI Assistant, Notebook, Calendar
 *
 * Any business registers as a tenant → gets full business ops out of the box.
 * 30+ D1 tables, 130+ REST endpoints, multi-tenant auth via X-Tenant-Key.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  DB: D1Database;
  R2: R2Bucket;
  DOC_DELIVERY: Fetcher;
  ADMIN_API_KEY: string;
}

interface Tenant {
  id: string; name: string; slug: string; api_key: string;
  company_name: string; company_phone: string; company_email: string;
  company_address: string; company_city: string; company_state: string; company_zip: string;
  company_website: string; company_logo_url: string;
  primary_color: string; accent_color: string; tagline: string; industry: string;
  timezone: string; currency: string; default_tax_rate: number; default_payment_terms: string;
  invoice_prefix: string; quote_prefix: string;
  resend_api_key: string; twilio_sid: string; twilio_token: string; twilio_phone: string;
}

const app = new Hono<{ Bindings: Env; Variables: { tenant: Tenant } }>();
const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const uuid = () => crypto.randomUUID();

app.use('*', cors({ origin: '*', allowMethods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }));

// ═══════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════

async function getTenant(db: D1Database, apiKey: string): Promise<Tenant | null> {
  if (!apiKey) return null;
  return db.prepare('SELECT * FROM tenants WHERE api_key = ?').bind(apiKey).first() as Promise<Tenant | null>;
}

function requireAdmin(c: any): Response | null {
  const key = c.req.header('X-Admin-Key') || c.req.header('X-Echo-API-Key');
  if (key && key === c.env.ADMIN_API_KEY) return null;
  return c.json({ error: 'Admin auth required' }, 401);
}

// Tenant auth middleware for /api/* routes
app.use('/api/*', async (c, next) => {
  const key = c.req.header('X-Tenant-Key') || c.req.header('X-Echo-API-Key');
  if (!key) return c.json({ error: 'X-Tenant-Key required' }, 401);
  const tenant = await getTenant(c.env.DB, key);
  if (!tenant) return c.json({ error: 'Invalid tenant key' }, 401);
  c.set('tenant', tenant);
  await next();
});

// ═══════════════════════════════════════════════════════════
// HEALTH & SCHEMA
// ═══════════════════════════════════════════════════════════

app.get('/', (c) => c.json({ service: 'echo-business-manager', version: '1.0.0', status: 'ok' }));
app.get('/health', (c) => c.json({ status: 'healthy', service: 'echo-business-manager', version: '1.0.0', timestamp: new Date().toISOString() }));

app.post('/init-schema', async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const schema = `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,company_name TEXT,company_phone TEXT,company_email TEXT,company_address TEXT,company_city TEXT,company_state TEXT,company_zip TEXT,company_website TEXT,company_logo_url TEXT,primary_color TEXT DEFAULT '#3B82F6',accent_color TEXT DEFAULT '#1E40AF',tagline TEXT,industry TEXT,timezone TEXT DEFAULT 'America/Chicago',currency TEXT DEFAULT 'USD',default_tax_rate REAL DEFAULT 0,default_payment_terms TEXT DEFAULT 'net_30',invoice_prefix TEXT DEFAULT 'INV',quote_prefix TEXT DEFAULT 'QT',resend_api_key TEXT,twilio_sid TEXT,twilio_token TEXT,twilio_phone TEXT,api_key TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT (datetime('now')),updated_at TEXT DEFAULT (datetime('now')))`;
  // Schema initialized via wrangler d1 execute -- this endpoint is just a health gate
  return c.json({ ok: true, message: 'Use wrangler d1 execute with schema.sql for full init' });
});

// ═══════════════════════════════════════════════════════════
// TENANT MANAGEMENT (admin auth)
// ═══════════════════════════════════════════════════════════

app.post('/tenants', async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await c.req.json() as any;
  if (!b.name) return c.json({ error: 'name required' }, 400);
  const id = uid();
  const slug = (b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const apiKey = 'ebm_' + uid() + uid();
  await c.env.DB.prepare(
    `INSERT INTO tenants (id, name, slug, company_name, company_phone, company_email, company_address, company_city, company_state, company_zip, company_website, company_logo_url, primary_color, accent_color, tagline, industry, timezone, currency, default_tax_rate, default_payment_terms, invoice_prefix, quote_prefix, api_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, b.name, slug, b.company_name||'', b.company_phone||'', b.company_email||'',
    b.company_address||'', b.company_city||'', b.company_state||'', b.company_zip||'',
    b.company_website||'', b.company_logo_url||'', b.primary_color||'#3B82F6', b.accent_color||'#1E40AF',
    b.tagline||'', b.industry||'', b.timezone||'America/Chicago', b.currency||'USD',
    b.default_tax_rate||0, b.default_payment_terms||'net_30', b.invoice_prefix||'INV', b.quote_prefix||'QT', apiKey
  ).run();
  // Seed default deal stages
  const stages = ['Lead','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'];
  for (let i = 0; i < stages.length; i++) {
    await c.env.DB.prepare('INSERT INTO deal_stages (id, tenant_id, name, position, probability, color) VALUES (?,?,?,?,?,?)')
      .bind(uid(), id, stages[i], i, i < 5 ? (i * 25) : 0, ['#94A3B8','#3B82F6','#F59E0B','#8B5CF6','#22C55E','#EF4444'][i]).run();
  }
  return c.json({ ok: true, tenant_id: id, api_key: apiKey, slug }, 201);
});

app.get('/tenants', async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const rows = await c.env.DB.prepare('SELECT id, name, slug, company_name, industry, created_at FROM tenants ORDER BY created_at DESC').all();
  return c.json(rows.results);
});

app.get('/tenants/:id', async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const t = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(c.req.param('id')).first();
  return t ? c.json(t) : c.json({ error: 'Not found' }, 404);
});

app.put('/tenants/:id', async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await c.req.json() as any;
  const fields = ['name','company_name','company_phone','company_email','company_address','company_city','company_state','company_zip','company_website','company_logo_url','primary_color','accent_color','tagline','industry','timezone','currency','default_tax_rate','default_payment_terms','invoice_prefix','quote_prefix','resend_api_key','twilio_sid','twilio_token','twilio_phone'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  if (!updates.length) return c.json({ error: 'No fields to update' }, 400);
  updates.push("updated_at = datetime('now')");
  vals.push(c.req.param('id'));
  await c.env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no tenant auth)
// ═══════════════════════════════════════════════════════════

// Public invoice view by share token
app.get('/invoices/public/:token', async (c) => {
  const inv = await c.env.DB.prepare(
    `SELECT i.*, t.company_name, t.company_phone, t.company_email, t.company_address, t.company_city, t.company_state, t.company_zip, t.company_website, t.company_logo_url, t.primary_color
     FROM invoices i JOIN tenants t ON i.tenant_id = t.id WHERE i.share_token = ?`
  ).bind(c.req.param('token')).first() as any;
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);
  const items = await c.env.DB.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order').bind(inv.id).all();
  const payments = await c.env.DB.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC').bind(inv.id).all();
  const contact = inv.contact_id ? await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(inv.contact_id).first() : null;
  return c.json({ invoice: inv, items: items.results, payments: payments.results, contact });
});

// Public quote view by share token
app.get('/quotes/public/:token', async (c) => {
  const q = await c.env.DB.prepare(
    `SELECT q.*, t.company_name, t.company_phone, t.company_email, t.company_address, t.company_city, t.company_state, t.company_zip, t.company_website, t.company_logo_url, t.primary_color
     FROM quotes q JOIN tenants t ON q.tenant_id = t.id WHERE q.share_token = ?`
  ).bind(c.req.param('token')).first() as any;
  if (!q) return c.json({ error: 'Quote not found' }, 404);
  const items = await c.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').bind(q.id).all();
  const contact = q.contact_id ? await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(q.contact_id).first() : null;
  return c.json({ quote: q, items: items.results, contact });
});

// Public reviews
app.get('/reviews/public/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const rows = await c.env.DB.prepare('SELECT reviewer_name, rating, review_text, source, created_at FROM reviews WHERE tenant_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 50').bind(t.id).all();
  return c.json(rows.results);
});

// Public booking submission
app.post('/book/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const b = await c.req.json() as any;
  // Auto-create contact if email provided
  let contactId = null;
  if (b.email || b.phone) {
    const existing = b.email ? await c.env.DB.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND email = ?').bind(t.id, b.email).first() : null;
    if (existing) { contactId = (existing as any).id; }
    else {
      contactId = uid();
      await c.env.DB.prepare('INSERT INTO contacts (id, tenant_id, type, first_name, last_name, email, phone, source) VALUES (?,?,?,?,?,?,?,?)')
        .bind(contactId, t.id, 'customer', b.first_name||'', b.last_name||'', b.email||'', b.phone||'', 'website').run();
    }
  }
  const bookingId = uid();
  await c.env.DB.prepare(
    'INSERT INTO bookings (id, tenant_id, contact_id, service_id, title, description, scheduled_date, time_start, address, city, quoted_price) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(bookingId, t.id, contactId, b.service_id||null, b.title||'Service Request', b.description||'', b.scheduled_date||'', b.time_start||'', b.address||'', b.city||'', b.quoted_price||0).run();
  return c.json({ ok: true, booking_id: bookingId }, 201);
});

// Public review submission
app.post('/review/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const b = await c.req.json() as any;
  if (!b.rating) return c.json({ error: 'rating required' }, 400);
  const id = uid();
  await c.env.DB.prepare('INSERT INTO reviews (id, tenant_id, reviewer_name, rating, review_text, source) VALUES (?,?,?,?,?,?)')
    .bind(id, t.id, b.reviewer_name||'Anonymous', b.rating, b.review_text||'', b.source||'direct').run();
  return c.json({ ok: true, review_id: id }, 201);
});

// Public NPS submission
app.post('/nps/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const b = await c.req.json() as any;
  const id = uid();
  const action = b.score >= 9 ? 'thank_promoter' : b.score >= 7 ? 'follow_up' : 'urgent_outreach';
  await c.env.DB.prepare('INSERT INTO nps_responses (id, tenant_id, contact_id, score, comment, follow_up_action) VALUES (?,?,?,?,?,?)')
    .bind(id, t.id, b.contact_id||null, b.score, b.comment||'', action).run();
  return c.json({ ok: true, id, follow_up_action: action }, 201);
});

// Public services catalog
app.get('/services/public/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const rows = await c.env.DB.prepare('SELECT id, name, category, description, pricing_type, base_price, duration_minutes FROM services WHERE tenant_id = ? AND active = 1 ORDER BY sort_order').bind(t.id).all();
  return c.json(rows.results);
});

// Public job application
app.post('/apply/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO job_applications (id, tenant_id, first_name, last_name, email, phone, position, experience, availability, drivers_license, own_transportation) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.first_name||'', b.last_name||'', b.email||'', b.phone||'', b.position||'', b.experience||'', b.availability||'', b.drivers_license?1:0, b.own_transportation?1:0).run();
  return c.json({ ok: true, application_id: id }, 201);
});

// ═══ PUBLIC ESTIMATE/QUOTE APPROVAL FLOW ═══

// Customer views approval page — returns quote data + tenant branding for UI rendering
app.get('/quotes/approve/:token', async (c) => {
  const q = await c.env.DB.prepare(
    `SELECT q.*, t.company_name, t.company_phone, t.company_email, t.company_address, t.company_city, t.company_state, t.company_zip, t.company_website, t.company_logo_url, t.primary_color, t.accent_color, t.tagline
     FROM quotes q JOIN tenants t ON q.tenant_id = t.id WHERE q.approval_token = ?`
  ).bind(c.req.param('token')).first() as any;
  if (!q) return c.json({ error: 'Estimate not found or link expired' }, 404);
  if (q.approval_status === 'approved') return c.json({ error: 'This estimate has already been approved', quote: { quote_number: q.quote_number, status: q.status, approval_status: q.approval_status, approved_at: q.approved_at } }, 200);
  if (q.approval_status === 'rejected') return c.json({ error: 'This estimate was declined', quote: { quote_number: q.quote_number, status: q.status, approval_status: q.approval_status } }, 200);
  const items = await c.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').bind(q.id).all();
  const contact = q.contact_id ? await c.env.DB.prepare('SELECT first_name, last_name, email, phone, address, city, state, zip FROM contacts WHERE id = ?').bind(q.contact_id).first() : null;
  // Mark as viewed
  if (q.status === 'sent') {
    await c.env.DB.prepare("UPDATE quotes SET status = 'viewed', updated_at = datetime('now') WHERE id = ?").bind(q.id).run();
  }
  return c.json({ quote: q, items: items.results, contact, can_approve: q.status !== 'expired' && q.status !== 'converted' });
});

// Customer approves or rejects the estimate
app.post('/quotes/approve/:token', async (c) => {
  const b = await c.req.json() as any;
  const action = b.action; // 'approve' or 'reject'
  if (!action || !['approve', 'reject'].includes(action)) return c.json({ error: 'action must be approve or reject' }, 400);

  const q = await c.env.DB.prepare(
    'SELECT q.*, t.id as t_id FROM quotes q JOIN tenants t ON q.tenant_id = t.id WHERE q.approval_token = ?'
  ).bind(c.req.param('token')).first() as any;
  if (!q) return c.json({ error: 'Estimate not found' }, 404);
  if (q.approval_status !== 'none' && q.approval_status !== 'pending') {
    return c.json({ error: `This estimate has already been ${q.approval_status}` }, 400);
  }
  if (q.status === 'expired' || q.status === 'converted') {
    return c.json({ error: `This estimate is ${q.status} and cannot be acted upon` }, 400);
  }

  if (action === 'approve') {
    // Mark quote as approved
    await c.env.DB.prepare(
      "UPDATE quotes SET status = 'accepted', approval_status = 'approved', approved_at = datetime('now'), approval_name = ?, approval_notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(b.name || '', b.notes || '', q.id).run();

    // Auto-create a booking/job that needs to be scheduled
    const bookingId = uid();
    const items = await c.env.DB.prepare('SELECT description FROM quote_items WHERE quote_id = ?').bind(q.id).all();
    const desc = (items.results as any[]).map(i => i.description).join(', ');
    await c.env.DB.prepare(
      "INSERT INTO bookings (id, tenant_id, contact_id, title, description, scheduled_date, quoted_price, status) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(bookingId, q.tenant_id, q.contact_id || null, `Job from ${q.quote_number}`, `Approved estimate: ${desc}`, '', q.total || 0, 'needs_scheduling').run();

    // Link the booking back to the quote
    await c.env.DB.prepare('UPDATE quotes SET booking_id = ? WHERE id = ?').bind(bookingId, q.id).run();

    // Log activity on contact
    if (q.contact_id) {
      await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
        .bind(uid(), q.tenant_id, q.contact_id, 'booking', `Estimate ${q.quote_number} approved → Job created`, JSON.stringify({ quote_id: q.id, booking_id: bookingId })).run();
    }

    // Create a task for the team to schedule it
    await c.env.DB.prepare(
      "INSERT INTO tasks (id, tenant_id, title, description, status, priority, contact_id, booking_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(uid(), q.tenant_id, `Schedule job from ${q.quote_number}`, `Customer approved estimate ${q.quote_number} ($${(q.total||0).toFixed(2)}). Job needs to be scheduled.`, 'pending', 'high', q.contact_id||null, bookingId, 'system').run();

    return c.json({ ok: true, message: 'Estimate approved! We will contact you to schedule your appointment.', booking_id: bookingId });
  } else {
    // Reject
    await c.env.DB.prepare(
      "UPDATE quotes SET status = 'rejected', approval_status = 'rejected', approval_name = ?, approval_notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(b.name || '', b.notes || '', q.id).run();
    if (q.contact_id) {
      await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title) VALUES (?,?,?,?,?)')
        .bind(uid(), q.tenant_id, q.contact_id, 'note', `Estimate ${q.quote_number} declined${b.notes ? ': ' + b.notes : ''}`).run();
    }
    return c.json({ ok: true, message: 'Estimate declined. Thank you for your time.' });
  }
});

// Public blog
app.get('/blog/:slug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const rows = await c.env.DB.prepare("SELECT id, title, slug, excerpt, author, tags, published_at FROM blog_posts WHERE tenant_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 50").bind(t.id).all();
  return c.json(rows.results);
});

app.get('/blog/:slug/:postSlug', async (c) => {
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(c.req.param('slug')).first() as any;
  if (!t) return c.json({ error: 'Business not found' }, 404);
  const post = await c.env.DB.prepare("SELECT * FROM blog_posts WHERE tenant_id = ? AND slug = ? AND status = 'published'").bind(t.id, c.req.param('postSlug')).first();
  return post ? c.json(post) : c.json({ error: 'Post not found' }, 404);
});

// ═══════════════════════════════════════════════════════════
// CRM — CONTACTS (tenant-scoped)
// ═══════════════════════════════════════════════════════════

app.get('/api/contacts', async (c) => {
  const t = c.get('tenant');
  const { type, status, search, limit } = c.req.query() as any;
  let sql = 'SELECT * FROM contacts WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) { sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company_name LIKE ? OR phone LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s,s); }
  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)||100}`;
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ contacts: rows.results, total: rows.results.length });
});

app.get('/api/contacts/:id', async (c) => {
  const t = c.get('tenant');
  const contact = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first();
  if (!contact) return c.json({ error: 'Not found' }, 404);
  const [tags, notes, activities, invoices, bookings] = await Promise.all([
    c.env.DB.prepare('SELECT tag FROM contact_tags WHERE contact_id = ?').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM contact_notes WHERE contact_id = ? ORDER BY pinned DESC, created_at DESC LIMIT 20').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM contact_activities WHERE contact_id = ? ORDER BY created_at DESC LIMIT 30').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT id, invoice_number, total, status, issue_date FROM invoices WHERE contact_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10').bind(c.req.param('id'), t.id).all(),
    c.env.DB.prepare('SELECT id, title, scheduled_date, status FROM bookings WHERE contact_id = ? AND tenant_id = ? ORDER BY scheduled_date DESC LIMIT 10').bind(c.req.param('id'), t.id).all(),
  ]);
  return c.json({ ...contact as any, tags: (tags.results as any[]).map(r => r.tag), notes: notes.results, activities: activities.results, invoices: invoices.results, bookings: bookings.results });
});

app.post('/api/contacts', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  const refCode = (b.first_name||'X').slice(0,3).toUpperCase() + id.slice(0,5).toUpperCase();
  await c.env.DB.prepare(
    'INSERT INTO contacts (id, tenant_id, type, status, first_name, last_name, company_name, email, phone, mobile, address, city, state, zip, source, referral_code, referred_by, preferred_language, payment_terms, tax_exempt, notes, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.type||'customer', b.status||'active', b.first_name||'', b.last_name||'', b.company_name||'', b.email||'', b.phone||'', b.mobile||'', b.address||'', b.city||'', b.state||'', b.zip||'', b.source||'', refCode, b.referred_by||'', b.preferred_language||'en', b.payment_terms||'', b.tax_exempt?1:0, b.notes||'', b.metadata ? JSON.stringify(b.metadata) : null).run();
  // Add tags if provided
  if (b.tags && Array.isArray(b.tags)) {
    for (const tag of b.tags) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO contact_tags (id, tenant_id, contact_id, tag) VALUES (?,?,?,?)').bind(uid(), t.id, id, tag).run();
    }
  }
  // Log activity
  await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title) VALUES (?,?,?,?,?)').bind(uid(), t.id, id, 'note', 'Contact created').run();
  return c.json({ ok: true, contact_id: id, referral_code: refCode }, 201);
});

app.put('/api/contacts/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['type','status','first_name','last_name','company_name','email','phone','mobile','address','city','state','zip','source','preferred_language','payment_terms','tax_exempt','lead_score','notes','metadata'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(f === 'metadata' && typeof b[f] === 'object' ? JSON.stringify(b[f]) : b[f]); } }
  if (!updates.length) return c.json({ error: 'No fields' }, 400);
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  // Update tags if provided
  if (b.tags && Array.isArray(b.tags)) {
    await c.env.DB.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
    for (const tag of b.tags) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO contact_tags (id, tenant_id, contact_id, tag) VALUES (?,?,?,?)').bind(uid(), t.id, c.req.param('id'), tag).run();
    }
  }
  return c.json({ ok: true });
});

app.delete('/api/contacts/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE contacts SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Contact Notes
app.post('/api/contacts/:id/notes', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO contact_notes (id, tenant_id, contact_id, title, content, pinned, created_by) VALUES (?,?,?,?,?,?,?)')
    .bind(id, t.id, c.req.param('id'), b.title||'', b.content, b.pinned?1:0, b.created_by||'').run();
  await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title) VALUES (?,?,?,?,?)').bind(uid(), t.id, c.req.param('id'), 'note', b.title||'Note added').run();
  return c.json({ ok: true, note_id: id }, 201);
});

// Contact Activities
app.post('/api/contacts/:id/activities', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, description, metadata, created_by) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, t.id, c.req.param('id'), b.type||'note', b.title||'', b.description||'', b.metadata ? JSON.stringify(b.metadata) : null, b.created_by||'').run();
  await c.env.DB.prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true, activity_id: id }, 201);
});

// Contact Tags
app.post('/api/contacts/:id/tags', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.tag) return c.json({ error: 'tag required' }, 400);
  await c.env.DB.prepare('INSERT OR IGNORE INTO contact_tags (id, tenant_id, contact_id, tag) VALUES (?,?,?,?)').bind(uid(), t.id, c.req.param('id'), b.tag).run();
  return c.json({ ok: true }, 201);
});

app.delete('/api/contacts/:id/tags/:tag', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tenant_id = ? AND tag = ?').bind(c.req.param('id'), t.id, c.req.param('tag')).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// CRM — DEALS PIPELINE
// ═══════════════════════════════════════════════════════════

app.get('/api/deals', async (c) => {
  const t = c.get('tenant'); const { status, stage_id } = c.req.query() as any;
  let sql = `SELECT d.*, c.first_name, c.last_name, c.company_name as contact_company, ds.name as stage_name, ds.color as stage_color
             FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id LEFT JOIN deal_stages ds ON d.stage_id = ds.id WHERE d.tenant_id = ?`;
  const params: any[] = [t.id];
  if (status) { sql += ' AND d.status = ?'; params.push(status); }
  if (stage_id) { sql += ' AND d.stage_id = ?'; params.push(stage_id); }
  sql += ' ORDER BY d.created_at DESC';
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ deals: rows.results });
});

app.get('/api/deals/pipeline', async (c) => {
  const t = c.get('tenant');
  const stages = await c.env.DB.prepare('SELECT * FROM deal_stages WHERE tenant_id = ? ORDER BY position').bind(t.id).all();
  const deals = await c.env.DB.prepare(
    `SELECT d.*, c.first_name, c.last_name, c.company_name as contact_company FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id WHERE d.tenant_id = ? AND d.status = 'open' ORDER BY d.created_at DESC`
  ).bind(t.id).all();
  // Group deals by stage
  const pipeline = (stages.results as any[]).map(s => ({
    ...s, deals: (deals.results as any[]).filter(d => d.stage_id === s.id),
    total_value: (deals.results as any[]).filter(d => d.stage_id === s.id).reduce((sum: number, d: any) => sum + (d.value||0), 0),
  }));
  return c.json({ pipeline });
});

app.get('/api/deals/:id', async (c) => {
  const t = c.get('tenant');
  const deal = await c.env.DB.prepare(
    `SELECT d.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone, ds.name as stage_name
     FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id LEFT JOIN deal_stages ds ON d.stage_id = ds.id WHERE d.id = ? AND d.tenant_id = ?`
  ).bind(c.req.param('id'), t.id).first();
  if (!deal) return c.json({ error: 'Not found' }, 404);
  const activities = await c.env.DB.prepare('SELECT * FROM contact_activities WHERE tenant_id = ? AND metadata LIKE ? ORDER BY created_at DESC LIMIT 20').bind(t.id, `%${c.req.param('id')}%`).all();
  return c.json({ ...deal as any, activities: activities.results });
});

app.post('/api/deals', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  // Get first stage if not specified
  let stageId = b.stage_id;
  if (!stageId) {
    const first = await c.env.DB.prepare('SELECT id FROM deal_stages WHERE tenant_id = ? ORDER BY position LIMIT 1').bind(t.id).first() as any;
    stageId = first?.id || null;
  }
  await c.env.DB.prepare(
    'INSERT INTO deals (id, tenant_id, contact_id, stage_id, title, value, currency, probability, expected_close_date, assigned_to, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.contact_id||null, stageId, b.title, b.value||0, b.currency||t.currency, b.probability||0, b.expected_close_date||'', b.assigned_to||'', b.notes||'').run();
  // Log activity on contact
  if (b.contact_id) {
    await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
      .bind(uid(), t.id, b.contact_id, 'deal', `Deal created: ${b.title}`, JSON.stringify({ deal_id: id })).run();
  }
  return c.json({ ok: true, deal_id: id }, 201);
});

app.put('/api/deals/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['contact_id','stage_id','title','value','currency','probability','expected_close_date','actual_close_date','status','lost_reason','assigned_to','notes'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  if (!updates.length) return c.json({ error: 'No fields' }, 400);
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.post('/api/deals/:id/move', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.stage_id) return c.json({ error: 'stage_id required' }, 400);
  const stage = await c.env.DB.prepare('SELECT probability FROM deal_stages WHERE id = ? AND tenant_id = ?').bind(b.stage_id, t.id).first() as any;
  await c.env.DB.prepare("UPDATE deals SET stage_id = ?, probability = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(b.stage_id, stage?.probability||0, c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Deal Stages CRUD
app.get('/api/deal-stages', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare('SELECT * FROM deal_stages WHERE tenant_id = ? ORDER BY position').bind(t.id).all();
  return c.json(rows.results);
});

app.post('/api/deal-stages', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO deal_stages (id, tenant_id, name, position, probability, color) VALUES (?,?,?,?,?,?)')
    .bind(id, t.id, b.name, b.position||0, b.probability||0, b.color||'#3B82F6').run();
  return c.json({ ok: true, stage_id: id }, 201);
});

// ═══════════════════════════════════════════════════════════
// SERVICES CATALOG
// ═══════════════════════════════════════════════════════════

app.get('/api/services', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare('SELECT * FROM services WHERE tenant_id = ? ORDER BY sort_order, name').bind(t.id).all();
  return c.json(rows.results);
});

app.post('/api/services', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO services (id, tenant_id, name, category, description, pricing_type, base_price, duration_minutes, sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.name, b.category||'', b.description||'', b.pricing_type||'flat', b.base_price||0, b.duration_minutes||60, b.sort_order||0).run();
  return c.json({ ok: true, service_id: id }, 201);
});

app.put('/api/services/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['name','category','description','pricing_type','base_price','duration_minutes','active','sort_order'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/services/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// BOOKINGS / APPOINTMENTS
// ═══════════════════════════════════════════════════════════

app.get('/api/bookings', async (c) => {
  const t = c.get('tenant'); const { status, date, month } = c.req.query() as any;
  let sql = `SELECT b.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone, s.name as service_name
             FROM bookings b LEFT JOIN contacts c ON b.contact_id = c.id LEFT JOIN services s ON b.service_id = s.id WHERE b.tenant_id = ?`;
  const params: any[] = [t.id];
  if (status) { sql += ' AND b.status = ?'; params.push(status); }
  if (date) { sql += ' AND b.scheduled_date = ?'; params.push(date); }
  if (month) { sql += ' AND b.scheduled_date LIKE ?'; params.push(month + '%'); }
  sql += ' ORDER BY b.scheduled_date DESC, b.time_start';
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ bookings: rows.results });
});

app.get('/api/bookings/:id', async (c) => {
  const t = c.get('tenant');
  const b = await c.env.DB.prepare(
    `SELECT b.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone, s.name as service_name
     FROM bookings b LEFT JOIN contacts c ON b.contact_id = c.id LEFT JOIN services s ON b.service_id = s.id WHERE b.id = ? AND b.tenant_id = ?`
  ).bind(c.req.param('id'), t.id).first();
  return b ? c.json(b) : c.json({ error: 'Not found' }, 404);
});

app.post('/api/bookings', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare(
    'INSERT INTO bookings (id, tenant_id, contact_id, service_id, title, description, scheduled_date, time_start, time_end, duration_minutes, address, city, quoted_price, assigned_to, team_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.contact_id||null, b.service_id||null, b.title||'Appointment', b.description||'', b.scheduled_date, b.time_start||'', b.time_end||'', b.duration_minutes||60, b.address||'', b.city||'', b.quoted_price||0, b.assigned_to||'', b.team_notes||'').run();
  if (b.contact_id) {
    await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
      .bind(uid(), t.id, b.contact_id, 'booking', `Booking: ${b.title||'Appointment'}`, JSON.stringify({ booking_id: id })).run();
  }
  return c.json({ ok: true, booking_id: id }, 201);
});

app.put('/api/bookings/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['contact_id','service_id','title','description','scheduled_date','time_start','time_end','duration_minutes','status','address','city','quoted_price','assigned_to','team_notes','reminder_sent','weather_alert'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.post('/api/bookings/:id/status', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(b.status, c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// CALENDAR EVENTS
// ═══════════════════════════════════════════════════════════

app.get('/api/calendar', async (c) => {
  const t = c.get('tenant'); const { start, end, type } = c.req.query() as any;
  let sql = 'SELECT * FROM calendar_events WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (start) { sql += ' AND start_date >= ?'; params.push(start); }
  if (end) { sql += ' AND start_date <= ?'; params.push(end); }
  if (type) { sql += ' AND event_type = ?'; params.push(type); }
  sql += ' ORDER BY start_date, start_time';
  const events = await c.env.DB.prepare(sql).bind(...params).all();
  // Also include bookings as calendar items
  let bSql = 'SELECT id, title, scheduled_date as start_date, time_start as start_time, time_end as end_time, status, contact_id, \'booking\' as event_type, \'#F59E0B\' as color FROM bookings WHERE tenant_id = ?';
  const bParams: any[] = [t.id];
  if (start) { bSql += ' AND scheduled_date >= ?'; bParams.push(start); }
  if (end) { bSql += ' AND scheduled_date <= ?'; bParams.push(end); }
  bSql += ' ORDER BY scheduled_date';
  const bookings = await c.env.DB.prepare(bSql).bind(...bParams).all();
  return c.json({ events: [...events.results, ...bookings.results] });
});

app.post('/api/calendar', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare(
    'INSERT INTO calendar_events (id, tenant_id, title, description, event_type, start_date, start_time, end_date, end_time, all_day, recurring, location, contact_id, deal_id, booking_id, color, reminder_minutes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.title, b.description||'', b.event_type||'event', b.start_date, b.start_time||'', b.end_date||b.start_date, b.end_time||'', b.all_day?1:0, b.recurring||'none', b.location||'', b.contact_id||null, b.deal_id||null, b.booking_id||null, b.color||'#3B82F6', b.reminder_minutes||null, b.created_by||'').run();
  return c.json({ ok: true, event_id: id }, 201);
});

app.put('/api/calendar/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['title','description','event_type','start_date','start_time','end_date','end_time','all_day','recurring','location','contact_id','deal_id','color','reminder_minutes','completed'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/calendar/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM calendar_events WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════

app.get('/api/invoices', async (c) => {
  const t = c.get('tenant'); const { status, contact_id } = c.req.query() as any;
  let sql = `SELECT i.*, c.first_name, c.last_name, c.company_name as contact_company FROM invoices i LEFT JOIN contacts c ON i.contact_id = c.id WHERE i.tenant_id = ?`;
  const params: any[] = [t.id];
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  if (contact_id) { sql += ' AND i.contact_id = ?'; params.push(contact_id); }
  sql += ' ORDER BY i.created_at DESC';
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ invoices: rows.results });
});

app.get('/api/invoices/:id', async (c) => {
  const t = c.get('tenant');
  const inv = await c.env.DB.prepare(
    `SELECT i.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone, c.address as contact_address, c.city as contact_city, c.state as contact_state, c.zip as contact_zip
     FROM invoices i LEFT JOIN contacts c ON i.contact_id = c.id WHERE i.id = ? AND i.tenant_id = ?`
  ).bind(c.req.param('id'), t.id).first();
  if (!inv) return c.json({ error: 'Not found' }, 404);
  const [items, payments] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order').bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC').bind(c.req.param('id')).all(),
  ]);
  return c.json({ ...inv as any, items: items.results, payments: payments.results });
});

app.post('/api/invoices', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  // Auto-generate invoice number
  const count = await c.env.DB.prepare('SELECT COUNT(*) as c FROM invoices WHERE tenant_id = ?').bind(t.id).first() as any;
  const now = new Date();
  const num = `${t.invoice_prefix||'INV'}-${now.getFullYear().toString().slice(2)}${String(now.getMonth()+1).padStart(2,'0')}-${String((count?.c||0)+1).padStart(4,'0')}`;
  const shareToken = uuid();
  const taxRate = b.tax_rate ?? t.default_tax_rate ?? 0;
  const subtotal = b.subtotal || 0;
  const taxAmount = b.tax_amount ?? (subtotal * taxRate / 100);
  const total = b.total ?? (subtotal + taxAmount - (b.discount||0));
  // Calculate due date from payment terms
  const terms = b.payment_terms || t.default_payment_terms || 'net_30';
  const days = terms === 'due_on_receipt' ? 0 : parseInt(terms.replace('net_','')) || 30;
  const dueDate = b.due_date || new Date(now.getTime() + days*86400000).toISOString().split('T')[0];

  await c.env.DB.prepare(
    'INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, booking_id, quote_id, issue_date, due_date, subtotal, tax_rate, tax_amount, discount, total, status, payment_terms, notes, share_token, sales_rep) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, num, b.contact_id||null, b.booking_id||null, b.quote_id||null, b.issue_date||now.toISOString().split('T')[0], dueDate, subtotal, taxRate, taxAmount, b.discount||0, total, b.status||'draft', terms, b.notes||'', shareToken, b.sales_rep||'').run();
  // Add line items
  if (b.items && Array.isArray(b.items)) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      const itemTotal = (it.quantity||1) * (it.unit_price||0);
      await c.env.DB.prepare('INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?,?,?,?,?,?,?)')
        .bind(uid(), id, it.description, it.quantity||1, it.unit_price||0, itemTotal, i).run();
    }
  }
  if (b.contact_id) {
    await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
      .bind(uid(), t.id, b.contact_id, 'invoice', `Invoice ${num} created ($${total.toFixed(2)})`, JSON.stringify({ invoice_id: id })).run();
  }
  return c.json({ ok: true, invoice_id: id, invoice_number: num, share_token: shareToken, share_url: `https://echo-business-manager.bmcii1976.workers.dev/invoices/public/${shareToken}` }, 201);
});

app.put('/api/invoices/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['contact_id','issue_date','due_date','subtotal','tax_rate','tax_amount','discount','total','status','payment_terms','notes','sales_rep','paid_date'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/invoices/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(c.req.param('id')).run();
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.post('/api/invoices/:id/send', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE invoices SET status = 'sent', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.post('/api/invoices/:id/void', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE invoices SET status = 'void', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Invoice Items
app.post('/api/invoices/:id/items', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const itemId = uid();
  const itemTotal = (b.quantity||1) * (b.unit_price||0);
  await c.env.DB.prepare('INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?,?,?,?,?,?,?)')
    .bind(itemId, c.req.param('id'), b.description, b.quantity||1, b.unit_price||0, itemTotal, b.sort_order||0).run();
  // Recalc totals
  const items = await c.env.DB.prepare('SELECT SUM(total) as s FROM invoice_items WHERE invoice_id = ?').bind(c.req.param('id')).first() as any;
  const inv = await c.env.DB.prepare('SELECT tax_rate, discount FROM invoices WHERE id = ?').bind(c.req.param('id')).first() as any;
  const sub = items?.s || 0;
  const tax = sub * (inv?.tax_rate||0) / 100;
  await c.env.DB.prepare("UPDATE invoices SET subtotal = ?, tax_amount = ?, total = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(sub, tax, sub + tax - (inv?.discount||0), c.req.param('id'), t.id).run();
  return c.json({ ok: true, item_id: itemId }, 201);
});

app.delete('/api/invoices/:invId/items/:itemId', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?').bind(c.req.param('itemId'), c.req.param('invId')).run();
  const items = await c.env.DB.prepare('SELECT SUM(total) as s FROM invoice_items WHERE invoice_id = ?').bind(c.req.param('invId')).first() as any;
  const inv = await c.env.DB.prepare('SELECT tax_rate, discount FROM invoices WHERE id = ?').bind(c.req.param('invId')).first() as any;
  const sub = items?.s || 0; const tax = sub * (inv?.tax_rate||0) / 100;
  await c.env.DB.prepare("UPDATE invoices SET subtotal = ?, tax_amount = ?, total = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(sub, tax, sub + tax - (inv?.discount||0), c.req.param('invId'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// QUOTES / ESTIMATES
// ═══════════════════════════════════════════════════════════

app.get('/api/quotes', async (c) => {
  const t = c.get('tenant'); const { status } = c.req.query() as any;
  let sql = `SELECT q.*, c.first_name, c.last_name FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id WHERE q.tenant_id = ?`;
  const params: any[] = [t.id];
  if (status) { sql += ' AND q.status = ?'; params.push(status); }
  sql += ' ORDER BY q.created_at DESC';
  return c.json({ quotes: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.get('/api/quotes/:id', async (c) => {
  const t = c.get('tenant');
  const q = await c.env.DB.prepare('SELECT q.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id WHERE q.id = ? AND q.tenant_id = ?').bind(c.req.param('id'), t.id).first();
  if (!q) return c.json({ error: 'Not found' }, 404);
  const items = await c.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').bind(c.req.param('id')).all();
  return c.json({ ...q as any, items: items.results });
});

app.post('/api/quotes', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as c FROM quotes WHERE tenant_id = ?').bind(t.id).first() as any;
  const now = new Date();
  const num = `${t.quote_prefix||'QT'}-${now.getFullYear().toString().slice(2)}${String(now.getMonth()+1).padStart(2,'0')}-${String((count?.c||0)+1).padStart(4,'0')}`;
  const shareToken = uuid();
  const expiry = new Date(now.getTime() + 30*86400000).toISOString().split('T')[0];
  const approvalToken = uuid();
  await c.env.DB.prepare(
    'INSERT INTO quotes (id, tenant_id, quote_number, contact_id, booking_id, issue_date, expiry_date, subtotal, tax_rate, tax_amount, discount, total, notes, share_token, approval_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, num, b.contact_id||null, b.booking_id||null, b.issue_date||now.toISOString().split('T')[0], b.expiry_date||expiry, b.subtotal||0, b.tax_rate??t.default_tax_rate??0, b.tax_amount||0, b.discount||0, b.total||0, b.notes||'', shareToken, approvalToken).run();
  if (b.items && Array.isArray(b.items)) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      await c.env.DB.prepare('INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, total, sort_order) VALUES (?,?,?,?,?,?,?)')
        .bind(uid(), id, it.description, it.quantity||1, it.unit_price||0, (it.quantity||1)*(it.unit_price||0), i).run();
    }
  }
  return c.json({ ok: true, quote_id: id, quote_number: num, share_token: shareToken, approval_token: approvalToken, approval_url: `https://echo-business-manager.bmcii1976.workers.dev/quotes/approve/${approvalToken}` }, 201);
});

app.put('/api/quotes/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['contact_id','expiry_date','subtotal','tax_rate','tax_amount','discount','total','status','notes'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.post('/api/quotes/:id/send', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE quotes SET status = 'sent', approval_status = 'pending', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Send estimate to customer via email with approval link
app.post('/api/quotes/:id/send-to-customer', async (c) => {
  const t = c.get('tenant');
  const q = await c.env.DB.prepare('SELECT q.*, c.first_name, c.last_name, c.email as contact_email, c.phone as contact_phone FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id WHERE q.id = ? AND q.tenant_id = ?').bind(c.req.param('id'), t.id).first() as any;
  if (!q) return c.json({ error: 'Quote not found' }, 404);
  const items = await c.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').bind(q.id).all();
  const b = await c.req.json() as any;
  const approvalUrl = `https://echo-business-manager.bmcii1976.workers.dev/quotes/approve/${q.approval_token}`;
  const viewUrl = `https://echo-business-manager.bmcii1976.workers.dev/quotes/public/${q.share_token}`;
  const results: { email?: any; sms?: any } = {};

  // Build email HTML
  const itemsHtml = (items.results as any[]).map(it =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee">${it.description}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${(it.unit_price||0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${(it.total||0).toFixed(2)}</td></tr>`
  ).join('');

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      ${t.company_logo_url ? `<img src="${t.company_logo_url}" alt="${t.company_name}" style="max-height:60px;margin-bottom:16px">` : ''}
      <h2 style="color:${t.primary_color||'#3B82F6'}">Estimate from ${t.company_name||t.name}</h2>
      <p>Hi ${q.first_name || 'there'},</p>
      <p>${b.message || `Please review your estimate ${q.quote_number} below.`}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead><tr style="background:${t.primary_color||'#3B82F6'};color:white">
          <th style="padding:10px;text-align:left">Description</th><th style="padding:10px;text-align:center">Qty</th><th style="padding:10px;text-align:right">Rate</th><th style="padding:10px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="text-align:right;margin:16px 0">
        ${q.discount > 0 ? `<p>Subtotal: $${(q.subtotal||0).toFixed(2)}</p><p>Discount: -$${q.discount.toFixed(2)}</p>` : ''}
        ${q.tax_amount > 0 ? `<p>Tax (${q.tax_rate}%): $${q.tax_amount.toFixed(2)}</p>` : ''}
        <p style="font-size:18px;font-weight:bold">Total: $${(q.total||0).toFixed(2)}</p>
      </div>
      ${q.notes ? `<p style="background:#f9fafb;padding:12px;border-radius:8px">${q.notes}</p>` : ''}
      <div style="text-align:center;margin:32px 0">
        <a href="${approvalUrl}" style="display:inline-block;background:${t.primary_color||'#22C55E'};color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold">Review & Approve Estimate</a>
      </div>
      <p style="font-size:12px;color:#6B7280">Estimate valid until ${q.expiry_date || 'N/A'}. ${t.company_name} | ${t.company_phone || ''} | ${t.company_email || ''}</p>
    </div>`;

  // Send email if tenant has Resend configured
  const emailTo = b.email || q.contact_email;
  if (emailTo && t.resend_api_key) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.resend_api_key}` },
        body: JSON.stringify({
          from: `${t.company_name} <noreply@${t.company_website?.replace(/^https?:\/\//, '') || 'echo-op.com'}>`,
          to: emailTo,
          subject: b.subject || `Estimate ${q.quote_number} from ${t.company_name} — $${(q.total||0).toFixed(2)}`,
          html: emailHtml,
        }),
      });
      results.email = { sent: resp.ok, to: emailTo };
    } catch (e: any) { results.email = { sent: false, error: e.message }; }
  }

  // Send SMS if tenant has Twilio configured
  const smsTo = b.phone || q.contact_phone;
  if (smsTo && t.twilio_sid && t.twilio_token && t.twilio_phone) {
    const smsBody = `${t.company_name}: Your estimate ${q.quote_number} for $${(q.total||0).toFixed(2)} is ready. Review & approve: ${approvalUrl}`;
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.twilio_sid}/Messages.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${t.twilio_sid}:${t.twilio_token}`) },
        body: `To=${encodeURIComponent(smsTo)}&From=${encodeURIComponent(t.twilio_phone)}&Body=${encodeURIComponent(smsBody)}`,
      });
      results.sms = { sent: resp.ok, to: smsTo };
    } catch (e: any) { results.sms = { sent: false, error: e.message }; }
  }

  // Mark quote as sent with pending approval
  await c.env.DB.prepare("UPDATE quotes SET status = 'sent', approval_status = 'pending', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(q.id, t.id).run();

  // Log activity
  if (q.contact_id) {
    await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
      .bind(uid(), t.id, q.contact_id, 'email', `Estimate ${q.quote_number} sent for approval`, JSON.stringify({ quote_id: q.id, ...results })).run();
  }

  return c.json({ ok: true, approval_url: approvalUrl, view_url: viewUrl, delivery: results });
});

app.post('/api/quotes/:id/accept', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE quotes SET status = 'accepted', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Convert quote to invoice
app.post('/api/quotes/:id/convert', async (c) => {
  const t = c.get('tenant');
  const q = await c.env.DB.prepare('SELECT * FROM quotes WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first() as any;
  if (!q) return c.json({ error: 'Not found' }, 404);
  const qItems = await c.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id = ?').bind(q.id).all();
  // Create invoice from quote
  const invId = uid();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as c FROM invoices WHERE tenant_id = ?').bind(t.id).first() as any;
  const now = new Date();
  const num = `${t.invoice_prefix||'INV'}-${now.getFullYear().toString().slice(2)}${String(now.getMonth()+1).padStart(2,'0')}-${String((count?.c||0)+1).padStart(4,'0')}`;
  const terms = t.default_payment_terms || 'net_30';
  const days = terms === 'due_on_receipt' ? 0 : parseInt(terms.replace('net_','')) || 30;
  const dueDate = new Date(now.getTime() + days*86400000).toISOString().split('T')[0];
  const shareToken = uuid();
  await c.env.DB.prepare(
    'INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, booking_id, quote_id, issue_date, due_date, subtotal, tax_rate, tax_amount, discount, total, payment_terms, notes, share_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(invId, t.id, num, q.contact_id, q.booking_id, q.id, now.toISOString().split('T')[0], dueDate, q.subtotal, q.tax_rate, q.tax_amount, q.discount, q.total, terms, q.notes, shareToken).run();
  for (const it of qItems.results as any[]) {
    await c.env.DB.prepare('INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?,?,?,?,?,?,?)')
      .bind(uid(), invId, it.description, it.quantity, it.unit_price, it.total, it.sort_order).run();
  }
  await c.env.DB.prepare("UPDATE quotes SET status = 'converted', updated_at = datetime('now') WHERE id = ?").bind(q.id).run();
  return c.json({ ok: true, invoice_id: invId, invoice_number: num }, 201);
});

app.post('/api/quotes/:id/items', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const itemId = uid();
  await c.env.DB.prepare('INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, total, sort_order) VALUES (?,?,?,?,?,?,?)')
    .bind(itemId, c.req.param('id'), b.description, b.quantity||1, b.unit_price||0, (b.quantity||1)*(b.unit_price||0), b.sort_order||0).run();
  return c.json({ ok: true, item_id: itemId }, 201);
});

app.delete('/api/quotes/:qId/items/:itemId', async (c) => {
  await c.env.DB.prepare('DELETE FROM quote_items WHERE id = ? AND quote_id = ?').bind(c.req.param('itemId'), c.req.param('qId')).run();
  return c.json({ ok: true });
});

app.delete('/api/quotes/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM quote_items WHERE quote_id = ?').bind(c.req.param('id')).run();
  await c.env.DB.prepare('DELETE FROM quotes WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════

app.get('/api/payments', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare(
    `SELECT p.*, i.invoice_number FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id WHERE p.tenant_id = ? ORDER BY p.payment_date DESC LIMIT 200`
  ).bind(t.id).all();
  return c.json({ payments: rows.results });
});

app.post('/api/payments', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.invoice_id || !b.amount) return c.json({ error: 'invoice_id and amount required' }, 400);
  const id = uid();
  await c.env.DB.prepare('INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_method, payment_date, reference_number, collected_by, notes) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.invoice_id, b.amount, b.payment_method||'other', b.payment_date||new Date().toISOString().split('T')[0], b.reference_number||'', b.collected_by||'', b.notes||'').run();
  // Update invoice
  const inv = await c.env.DB.prepare('SELECT total, amount_paid, contact_id FROM invoices WHERE id = ?').bind(b.invoice_id).first() as any;
  if (inv) {
    const newPaid = (inv.amount_paid||0) + b.amount;
    const status = newPaid >= inv.total ? 'paid' : 'partial';
    await c.env.DB.prepare("UPDATE invoices SET amount_paid = ?, status = ?, paid_date = CASE WHEN ? >= total THEN datetime('now') ELSE paid_date END, updated_at = datetime('now') WHERE id = ?")
      .bind(newPaid, status, newPaid, b.invoice_id).run();
    // Update contact LTV
    if (inv.contact_id) {
      await c.env.DB.prepare('UPDATE contacts SET lifetime_value = lifetime_value + ? WHERE id = ?').bind(b.amount, inv.contact_id).run();
      await c.env.DB.prepare('INSERT INTO contact_activities (id, tenant_id, contact_id, type, title, metadata) VALUES (?,?,?,?,?,?)')
        .bind(uid(), t.id, inv.contact_id, 'payment', `Payment $${b.amount.toFixed(2)} via ${b.payment_method||'other'}`, JSON.stringify({ payment_id: id })).run();
    }
  }
  return c.json({ ok: true, payment_id: id }, 201);
});

// ═══════════════════════════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════════════════════════

app.get('/api/credits', async (c) => {
  const t = c.get('tenant');
  return c.json({ credits: (await c.env.DB.prepare('SELECT * FROM credits WHERE tenant_id = ? ORDER BY created_at DESC').bind(t.id).all()).results });
});

app.post('/api/credits', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO credits (id, tenant_id, contact_id, invoice_id, amount, credit_type, reason) VALUES (?,?,?,?,?,?,?)')
    .bind(id, t.id, b.contact_id||null, b.invoice_id||null, b.amount, b.credit_type||'credit_memo', b.reason||'').run();
  return c.json({ ok: true, credit_id: id }, 201);
});

app.post('/api/credits/:id/apply', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.invoice_id) return c.json({ error: 'invoice_id required' }, 400);
  const credit = await c.env.DB.prepare('SELECT amount FROM credits WHERE id = ? AND tenant_id = ? AND status = ?').bind(c.req.param('id'), t.id, 'active').first() as any;
  if (!credit) return c.json({ error: 'Credit not found or already applied' }, 404);
  await c.env.DB.prepare("UPDATE credits SET status = 'applied', invoice_id = ?, applied_at = datetime('now') WHERE id = ?").bind(b.invoice_id, c.req.param('id')).run();
  await c.env.DB.prepare("UPDATE invoices SET amount_paid = amount_paid + ?, status = CASE WHEN amount_paid + ? >= total THEN 'paid' ELSE 'partial' END, updated_at = datetime('now') WHERE id = ?")
    .bind(credit.amount, credit.amount, b.invoice_id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════

app.get('/api/expenses', async (c) => {
  const t = c.get('tenant'); const { category, start, end } = c.req.query() as any;
  let sql = 'SELECT * FROM expenses WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (start) { sql += ' AND expense_date >= ?'; params.push(start); }
  if (end) { sql += ' AND expense_date <= ?'; params.push(end); }
  sql += ' ORDER BY expense_date DESC LIMIT 200';
  return c.json({ expenses: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.post('/api/expenses', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO expenses (id, tenant_id, category, vendor, description, amount, expense_date, receipt_url, receipt_data, booking_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.category||'other', b.vendor||'', b.description||'', b.amount, b.expense_date||new Date().toISOString().split('T')[0], b.receipt_url||'', b.receipt_data ? JSON.stringify(b.receipt_data) : null, b.booking_id||null).run();
  return c.json({ ok: true, expense_id: id }, 201);
});

app.put('/api/expenses/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['category','vendor','description','amount','expense_date','receipt_url','approved','approved_by'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/expenses/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM expenses WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Receipt upload to R2
app.post('/api/expenses/:id/receipt', async (c) => {
  const t = c.get('tenant');
  const body = await c.req.json() as any;
  if (!body.data_base64) return c.json({ error: 'data_base64 required' }, 400);
  const key = `${t.slug}/receipts/${new Date().getFullYear()}/${c.req.param('id')}.${body.ext||'jpg'}`;
  const data = Uint8Array.from(atob(body.data_base64), ch => ch.charCodeAt(0));
  await c.env.R2.put(key, data, { httpMetadata: { contentType: body.content_type || 'image/jpeg' } });
  await c.env.DB.prepare('UPDATE expenses SET receipt_url = ? WHERE id = ? AND tenant_id = ?').bind(key, c.req.param('id'), t.id).run();
  return c.json({ ok: true, r2_key: key });
});

// ═══════════════════════════════════════════════════════════
// EMPLOYEES / TEAM
// ═══════════════════════════════════════════════════════════

app.get('/api/employees', async (c) => {
  const t = c.get('tenant'); const { status } = c.req.query() as any;
  let sql = 'SELECT * FROM employees WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY first_name';
  return c.json({ employees: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.get('/api/employees/:id', async (c) => {
  const t = c.get('tenant');
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first();
  return emp ? c.json(emp) : c.json({ error: 'Not found' }, 404);
});

app.post('/api/employees', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare(
    'INSERT INTO employees (id, tenant_id, first_name, last_name, email, phone, role, title, hourly_rate, salary, hire_date, emergency_contact, emergency_phone, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.first_name, b.last_name, b.email||'', b.phone||'', b.role||'staff', b.title||'', b.hourly_rate||0, b.salary||null, b.hire_date||new Date().toISOString().split('T')[0], b.emergency_contact||'', b.emergency_phone||'', b.notes||'').run();
  return c.json({ ok: true, employee_id: id }, 201);
});

app.put('/api/employees/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['first_name','last_name','email','phone','role','title','hourly_rate','salary','status','emergency_contact','emergency_phone','notes'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// TIME TRACKING
// ═══════════════════════════════════════════════════════════

app.get('/api/time', async (c) => {
  const t = c.get('tenant'); const { employee_id, start, end, approved } = c.req.query() as any;
  let sql = `SELECT te.*, e.first_name, e.last_name FROM time_entries te LEFT JOIN employees e ON te.employee_id = e.id WHERE te.tenant_id = ?`;
  const params: any[] = [t.id];
  if (employee_id) { sql += ' AND te.employee_id = ?'; params.push(employee_id); }
  if (start) { sql += ' AND te.work_date >= ?'; params.push(start); }
  if (end) { sql += ' AND te.work_date <= ?'; params.push(end); }
  if (approved !== undefined) { sql += ' AND te.approved = ?'; params.push(parseInt(approved)); }
  sql += ' ORDER BY te.work_date DESC, te.start_time DESC';
  return c.json({ time_entries: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.post('/api/time', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  const emp = await c.env.DB.prepare('SELECT hourly_rate FROM employees WHERE id = ? AND tenant_id = ?').bind(b.employee_id, t.id).first() as any;
  await c.env.DB.prepare(
    'INSERT INTO time_entries (id, tenant_id, employee_id, booking_id, work_date, start_time, end_time, hours, overtime_hours, hourly_rate, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.employee_id, b.booking_id||null, b.work_date||new Date().toISOString().split('T')[0], b.start_time||'', b.end_time||'', b.hours||0, b.overtime_hours||0, b.hourly_rate||emp?.hourly_rate||0, b.notes||'').run();
  return c.json({ ok: true, time_entry_id: id }, 201);
});

app.post('/api/time/:id/approve', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare('UPDATE time_entries SET approved = 1, approved_by = ? WHERE id = ? AND tenant_id = ?').bind(b.approved_by||'', c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════

app.get('/api/payroll', async (c) => {
  const t = c.get('tenant');
  return c.json({ payroll_runs: (await c.env.DB.prepare('SELECT * FROM payroll_runs WHERE tenant_id = ? ORDER BY period_end DESC').bind(t.id).all()).results });
});

app.get('/api/payroll/:id', async (c) => {
  const t = c.get('tenant');
  const run = await c.env.DB.prepare('SELECT * FROM payroll_runs WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first();
  if (!run) return c.json({ error: 'Not found' }, 404);
  const items = await c.env.DB.prepare(
    'SELECT pi.*, e.first_name, e.last_name FROM payroll_items pi JOIN employees e ON pi.employee_id = e.id WHERE pi.payroll_run_id = ?'
  ).bind(c.req.param('id')).all();
  return c.json({ ...run as any, items: items.results });
});

app.post('/api/payroll', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.period_start || !b.period_end) return c.json({ error: 'period_start and period_end required' }, 400);
  const runId = uid();
  // Aggregate approved hours
  const entries = await c.env.DB.prepare(
    'SELECT te.employee_id, SUM(te.hours) as total_hours, SUM(te.overtime_hours) as total_ot, te.hourly_rate FROM time_entries te WHERE te.tenant_id = ? AND te.approved = 1 AND te.work_date BETWEEN ? AND ? GROUP BY te.employee_id'
  ).bind(t.id, b.period_start, b.period_end).all();
  let totalGross = 0, totalNet = 0;
  for (const e of entries.results as any[]) {
    const gross = (e.total_hours * e.hourly_rate) + (e.total_ot * e.hourly_rate * 1.5);
    const deductions = gross * 0.22; // ~22% tax estimate
    const net = gross - deductions;
    totalGross += gross; totalNet += net;
    await c.env.DB.prepare('INSERT INTO payroll_items (id, payroll_run_id, employee_id, hours_regular, hours_overtime, rate, gross_pay, deductions, net_pay) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(uid(), runId, e.employee_id, e.total_hours, e.total_ot, e.hourly_rate, gross, deductions, net).run();
  }
  await c.env.DB.prepare('INSERT INTO payroll_runs (id, tenant_id, period_start, period_end, total_gross, total_deductions, total_net) VALUES (?,?,?,?,?,?,?)')
    .bind(runId, t.id, b.period_start, b.period_end, totalGross, totalGross - totalNet, totalNet).run();
  return c.json({ ok: true, payroll_run_id: runId, total_gross: totalGross, total_net: totalNet, employees: entries.results.length }, 201);
});

app.post('/api/payroll/:id/approve', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'approved' WHERE id = ? AND tenant_id = ?").bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════

app.get('/api/inventory', async (c) => {
  const t = c.get('tenant');
  return c.json({ inventory: (await c.env.DB.prepare('SELECT * FROM inventory WHERE tenant_id = ? ORDER BY name').bind(t.id).all()).results });
});

app.post('/api/inventory', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO inventory (id, tenant_id, name, category, sku, quantity, unit, unit_cost, reorder_level, vendor, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.name, b.category||'', b.sku||'', b.quantity||0, b.unit||'ea', b.unit_cost||0, b.reorder_level||0, b.vendor||'', b.notes||'').run();
  return c.json({ ok: true, item_id: id }, 201);
});

app.put('/api/inventory/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['name','category','sku','quantity','unit','unit_cost','reorder_level','vendor','notes'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.post('/api/inventory/:id/restock', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare("UPDATE inventory SET quantity = quantity + ?, last_restocked = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(b.quantity||0, c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.delete('/api/inventory/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM inventory WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// REVIEWS & NPS
// ═══════════════════════════════════════════════════════════

app.get('/api/reviews', async (c) => {
  const t = c.get('tenant'); const { approved } = c.req.query() as any;
  let sql = 'SELECT * FROM reviews WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (approved !== undefined) { sql += ' AND approved = ?'; params.push(parseInt(approved)); }
  sql += ' ORDER BY created_at DESC';
  return c.json({ reviews: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.put('/api/reviews/:id/approve', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('UPDATE reviews SET approved = 1 WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.put('/api/reviews/:id/respond', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare('UPDATE reviews SET response = ? WHERE id = ? AND tenant_id = ?').bind(b.response, c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.delete('/api/reviews/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM reviews WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.get('/api/nps', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare('SELECT * FROM nps_responses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100').bind(t.id).all();
  const all = rows.results as any[];
  const promoters = all.filter(r => r.score >= 9).length;
  const detractors = all.filter(r => r.score <= 6).length;
  const nps = all.length ? Math.round(((promoters - detractors) / all.length) * 100) : 0;
  return c.json({ nps_score: nps, total: all.length, promoters, passives: all.length - promoters - detractors, detractors, responses: all });
});

// ═══════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════

app.get('/api/tasks', async (c) => {
  const t = c.get('tenant'); const { status, priority, assigned_to } = c.req.query() as any;
  let sql = 'SELECT * FROM tasks WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  if (assigned_to) { sql += ' AND assigned_to = ?'; params.push(assigned_to); }
  sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date";
  return c.json({ tasks: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.post('/api/tasks', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare(
    'INSERT INTO tasks (id, tenant_id, title, description, status, priority, due_date, assigned_to, contact_id, deal_id, booking_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.title, b.description||'', b.status||'pending', b.priority||'medium', b.due_date||null, b.assigned_to||'', b.contact_id||null, b.deal_id||null, b.booking_id||null, b.created_by||'').run();
  return c.json({ ok: true, task_id: id }, 201);
});

app.put('/api/tasks/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['title','description','status','priority','due_date','assigned_to','contact_id','deal_id'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  if (b.status === 'completed') { updates.push("completed_at = datetime('now')"); }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/tasks/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// NOTEBOOK
// ═══════════════════════════════════════════════════════════

app.get('/api/notebook', async (c) => {
  const t = c.get('tenant'); const { category, search } = c.req.query() as any;
  let sql = 'SELECT * FROM notebook WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (search) { sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'; const s = `%${search}%`; params.push(s,s,s); }
  sql += ' ORDER BY pinned DESC, updated_at DESC';
  return c.json({ notes: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.get('/api/notebook/:id', async (c) => {
  const t = c.get('tenant');
  const note = await c.env.DB.prepare('SELECT * FROM notebook WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first();
  return note ? c.json(note) : c.json({ error: 'Not found' }, 404);
});

app.post('/api/notebook', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare(
    'INSERT INTO notebook (id, tenant_id, title, content, category, pinned, tags, contact_id, deal_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, t.id, b.title, b.content||'', b.category||'general', b.pinned?1:0, b.tags||'', b.contact_id||null, b.deal_id||null, b.created_by||'').run();
  return c.json({ ok: true, note_id: id }, 201);
});

app.put('/api/notebook/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['title','content','category','pinned','tags','ai_summary','contact_id','deal_id'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  updates.push("updated_at = datetime('now')"); vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE notebook SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/notebook/:id', async (c) => {
  const t = c.get('tenant');
  await c.env.DB.prepare('DELETE FROM notebook WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════════════════════

app.post('/api/ai/chat', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const userMsg = b.message || (b.messages && b.messages[b.messages.length - 1]?.content) || '';
  if (!userMsg) return c.json({ error: 'message required' }, 400);

  // Build business context for the AI
  const [contactCount, invoiceStats, bookingStats, taskCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as c FROM contacts WHERE tenant_id = ?').bind(t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as revenue, SUM(CASE WHEN status IN ('sent','overdue') THEN total - amount_paid ELSE 0 END) as outstanding FROM invoices WHERE tenant_id = ?").bind(t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as upcoming FROM bookings WHERE tenant_id = ? AND scheduled_date >= date('now') AND status IN ('pending','confirmed')").bind(t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ? AND status IN ('pending','in_progress')").bind(t.id).first(),
  ]);

  const systemPrompt = `You are an AI business assistant for ${t.company_name || t.name}. You help with scheduling, invoicing, customer management, and business operations.

Business Context:
- ${(contactCount as any)?.c || 0} contacts
- ${(invoiceStats as any)?.total || 0} invoices ($${((invoiceStats as any)?.revenue || 0).toFixed(0)} revenue, $${((invoiceStats as any)?.outstanding || 0).toFixed(0)} outstanding)
- ${(bookingStats as any)?.upcoming || 0} upcoming appointments
- ${(taskCount as any)?.c || 0} open tasks

Be helpful, concise, and proactive. Suggest actions when appropriate.`;

  // Route to Engine Runtime GEN-01 or fallback
  try {
    const aiResp = await fetch('https://echo-engine-runtime.bmcii1976.workers.dev/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine_id: 'GEN-01', query: userMsg, context: systemPrompt, max_tokens: 1000 }),
    });
    const aiData = await aiResp.json() as any;
    const reply = aiData.response || aiData.answer || aiData.result || 'I apologize, I could not generate a response. Please try again.';

    // Save conversation
    const convId = b.conversation_id || uid();
    if (b.conversation_id) {
      const existing = await c.env.DB.prepare('SELECT messages FROM ai_conversations WHERE id = ? AND tenant_id = ?').bind(convId, t.id).first() as any;
      const msgs = existing ? JSON.parse(existing.messages) : [];
      msgs.push({ role: 'user', content: userMsg }, { role: 'assistant', content: reply });
      await c.env.DB.prepare("UPDATE ai_conversations SET messages = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(msgs), convId).run();
    } else {
      await c.env.DB.prepare('INSERT INTO ai_conversations (id, tenant_id, user_id, user_name, messages, category) VALUES (?,?,?,?,?,?)')
        .bind(convId, t.id, b.user_id||'', b.user_name||'', JSON.stringify([{ role: 'user', content: userMsg }, { role: 'assistant', content: reply }]), 'chat').run();
    }
    return c.json({ reply, conversation_id: convId });
  } catch (e: any) {
    return c.json({ reply: `I'm having trouble connecting to the AI service. Error: ${e.message}. Please try again shortly.`, conversation_id: b.conversation_id || uid() });
  }
});

app.get('/api/ai/conversations', async (c) => {
  const t = c.get('tenant');
  return c.json({ conversations: (await c.env.DB.prepare('SELECT id, user_name, summary, category, created_at, updated_at FROM ai_conversations WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 50').bind(t.id).all()).results });
});

app.get('/api/ai/conversations/:id', async (c) => {
  const t = c.get('tenant');
  const conv = await c.env.DB.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first();
  return conv ? c.json(conv) : c.json({ error: 'Not found' }, 404);
});

// ═══════════════════════════════════════════════════════════
// FOLLOW-UPS & AUTOMATION
// ═══════════════════════════════════════════════════════════

app.get('/api/follow-ups', async (c) => {
  const t = c.get('tenant'); const { status } = c.req.query() as any;
  let sql = `SELECT f.*, c.first_name, c.last_name, c.email, c.phone FROM follow_ups f LEFT JOIN contacts c ON f.contact_id = c.id WHERE f.tenant_id = ?`;
  const params: any[] = [t.id];
  if (status) { sql += ' AND f.status = ?'; params.push(status); }
  sql += ' ORDER BY f.scheduled_at';
  return c.json({ follow_ups: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

app.post('/api/follow-ups', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO follow_ups (id, tenant_id, contact_id, type, channel, message, scheduled_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, t.id, b.contact_id||null, b.type, b.channel||'email', b.message||'', b.scheduled_at||'').run();
  return c.json({ ok: true, follow_up_id: id }, 201);
});

app.put('/api/follow-ups/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['status','channel','message','scheduled_at','sent_at'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE follow_ups SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════

app.get('/api/promotions', async (c) => {
  const t = c.get('tenant');
  return c.json({ promotions: (await c.env.DB.prepare('SELECT * FROM promotions WHERE tenant_id = ? ORDER BY created_at DESC').bind(t.id).all()).results });
});

app.post('/api/promotions', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO promotions (id, tenant_id, title, description, discount_type, discount_value, promo_code, active, start_date, end_date, max_uses) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.title, b.description||'', b.discount_type||'percent', b.discount_value||0, b.promo_code||'', b.active??1, b.start_date||'', b.end_date||'', b.max_uses||null).run();
  return c.json({ ok: true, promotion_id: id }, 201);
});

app.put('/api/promotions/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['title','description','discount_type','discount_value','promo_code','active','start_date','end_date','max_uses'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE promotions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// BLOG / CONTENT
// ═══════════════════════════════════════════════════════════

app.get('/api/blog', async (c) => {
  const t = c.get('tenant'); const { status } = c.req.query() as any;
  let sql = 'SELECT * FROM blog_posts WHERE tenant_id = ?';
  if (status) sql += ` AND status = '${status}'`; else sql += " AND status = 'published'";
  sql += ' ORDER BY published_at DESC';
  return c.json({ posts: (await c.env.DB.prepare(sql).bind(t.id).all()).results });
});

app.post('/api/blog', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  const slug = (b.title||'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  await c.env.DB.prepare('INSERT INTO blog_posts (id, tenant_id, title, slug, content, excerpt, status, author, tags, seo_title, seo_description) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.title, slug, b.content||'', b.excerpt||'', b.status||'draft', b.author||'', b.tags||'', b.seo_title||b.title, b.seo_description||b.excerpt||'').run();
  return c.json({ ok: true, post_id: id, slug }, 201);
});

app.put('/api/blog/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const fields = ['title','slug','content','excerpt','status','author','tags','seo_title','seo_description'];
  const updates: string[] = []; const vals: any[] = [];
  for (const f of fields) { if (b[f] !== undefined) { updates.push(`${f} = ?`); vals.push(b[f]); } }
  if (b.status === 'published') { updates.push("published_at = datetime('now')"); }
  vals.push(c.req.param('id'), t.id);
  await c.env.DB.prepare(`UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PERMITS, CHECKLISTS, PHOTOS, REFERRALS, JOB APPLICATIONS
// ═══════════════════════════════════════════════════════════

// Permits
app.get('/api/permits', async (c) => {
  const t = c.get('tenant');
  return c.json({ permits: (await c.env.DB.prepare('SELECT * FROM permits WHERE tenant_id = ? ORDER BY expiration_date').bind(t.id).all()).results });
});

app.post('/api/permits', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO permits (id, tenant_id, booking_id, permit_number, type, status, jurisdiction, filed_date, expiration_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.id, b.booking_id||null, b.permit_number||'', b.type||'', b.status||'pending', b.jurisdiction||'', b.filed_date||'', b.expiration_date||'', b.notes||'').run();
  return c.json({ ok: true, permit_id: id }, 201);
});

// Checklists
app.get('/api/checklists/templates', async (c) => {
  const t = c.get('tenant');
  return c.json({ templates: (await c.env.DB.prepare('SELECT * FROM checklist_templates WHERE tenant_id = ? ORDER BY name').bind(t.id).all()).results });
});

app.post('/api/checklists/templates', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const id = uid();
  await c.env.DB.prepare('INSERT INTO checklist_templates (id, tenant_id, name, service_id, items_json) VALUES (?,?,?,?,?)')
    .bind(id, t.id, b.name, b.service_id||null, JSON.stringify(b.items||[])).run();
  return c.json({ ok: true, template_id: id }, 201);
});

app.get('/api/checklists/:bookingId', async (c) => {
  const t = c.get('tenant');
  return c.json({ items: (await c.env.DB.prepare('SELECT * FROM checklist_items WHERE tenant_id = ? AND booking_id = ? ORDER BY rowid').bind(t.id, c.req.param('bookingId')).all()).results });
});

app.post('/api/checklists/:bookingId/apply/:templateId', async (c) => {
  const t = c.get('tenant');
  const tmpl = await c.env.DB.prepare('SELECT items_json FROM checklist_templates WHERE id = ? AND tenant_id = ?').bind(c.req.param('templateId'), t.id).first() as any;
  if (!tmpl) return c.json({ error: 'Template not found' }, 404);
  const items = JSON.parse(tmpl.items_json || '[]');
  for (const item of items) {
    await c.env.DB.prepare('INSERT INTO checklist_items (id, tenant_id, booking_id, template_id, item_text) VALUES (?,?,?,?,?)')
      .bind(uid(), t.id, c.req.param('bookingId'), c.req.param('templateId'), item).run();
  }
  return c.json({ ok: true, items_added: items.length }, 201);
});

app.put('/api/checklists/items/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare("UPDATE checklist_items SET completed = ?, completed_by = ?, completed_at = datetime('now') WHERE id = ? AND tenant_id = ?")
    .bind(b.completed?1:0, b.completed_by||'', c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

// Progress Photos
app.get('/api/photos/:bookingId', async (c) => {
  const t = c.get('tenant');
  return c.json({ photos: (await c.env.DB.prepare('SELECT * FROM progress_photos WHERE tenant_id = ? AND booking_id = ? ORDER BY created_at').bind(t.id, c.req.param('bookingId')).all()).results });
});

app.post('/api/photos', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.data_base64 || !b.booking_id) return c.json({ error: 'data_base64 and booking_id required' }, 400);
  const id = uid();
  const key = `${t.slug}/photos/${b.booking_id}/${id}.${b.ext||'jpg'}`;
  const data = Uint8Array.from(atob(b.data_base64), ch => ch.charCodeAt(0));
  await c.env.R2.put(key, data, { httpMetadata: { contentType: b.content_type || 'image/jpeg' } });
  await c.env.DB.prepare('INSERT INTO progress_photos (id, tenant_id, booking_id, r2_key, caption) VALUES (?,?,?,?,?)')
    .bind(id, t.id, b.booking_id, key, b.caption||'').run();
  return c.json({ ok: true, photo_id: id, r2_key: key }, 201);
});

// Referrals
app.get('/api/referrals', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare(
    `SELECT r.*, c1.first_name as referrer_first, c1.last_name as referrer_last, c2.first_name as referred_first, c2.last_name as referred_last
     FROM referrals r LEFT JOIN contacts c1 ON r.referrer_id = c1.id LEFT JOIN contacts c2 ON r.referred_id = c2.id WHERE r.tenant_id = ? ORDER BY r.created_at DESC`
  ).bind(t.id).all();
  return c.json({ referrals: rows.results });
});

app.post('/api/referrals/track', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.referral_code || !b.referred_id) return c.json({ error: 'referral_code and referred_id required' }, 400);
  const referrer = await c.env.DB.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND referral_code = ?').bind(t.id, b.referral_code).first() as any;
  if (!referrer) return c.json({ error: 'Invalid referral code' }, 404);
  const id = uid();
  await c.env.DB.prepare('INSERT INTO referrals (id, tenant_id, referrer_id, referred_id) VALUES (?,?,?,?)').bind(id, t.id, referrer.id, b.referred_id).run();
  return c.json({ ok: true, referral_id: id }, 201);
});

// Job Applications
app.get('/api/applications', async (c) => {
  const t = c.get('tenant');
  return c.json({ applications: (await c.env.DB.prepare('SELECT * FROM job_applications WHERE tenant_id = ? ORDER BY created_at DESC').bind(t.id).all()).results });
});

app.put('/api/applications/:id', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  await c.env.DB.prepare('UPDATE job_applications SET status = ?, notes = ? WHERE id = ? AND tenant_id = ?')
    .bind(b.status||'reviewed', b.notes||'', c.req.param('id'), t.id).run();
  return c.json({ ok: true });
});

app.post('/api/applications/:id/hire', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  const app = await c.env.DB.prepare('SELECT * FROM job_applications WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), t.id).first() as any;
  if (!app) return c.json({ error: 'Not found' }, 404);
  const empId = uid();
  await c.env.DB.prepare('INSERT INTO employees (id, tenant_id, first_name, last_name, email, phone, role, hourly_rate, hire_date) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(empId, t.id, app.first_name, app.last_name, app.email, app.phone, b.role||'staff', b.hourly_rate||0, new Date().toISOString().split('T')[0]).run();
  await c.env.DB.prepare("UPDATE job_applications SET status = 'hired' WHERE id = ?").bind(c.req.param('id')).run();
  return c.json({ ok: true, employee_id: empId }, 201);
});

// ═══════════════════════════════════════════════════════════
// DOCUMENT DELIVERY (proxied via service binding)
// ═══════════════════════════════════════════════════════════

function docFetch(env: Env, tenantKey: string, path: string, init?: RequestInit): Promise<Response> {
  return env.DOC_DELIVERY.fetch(new Request('https://doc/' + path.replace(/^\//, ''), {
    ...init, headers: { 'Content-Type': 'application/json', 'X-Tenant-Key': tenantKey, ...(init?.headers || {}) },
  }));
}

app.post('/api/documents/generate', async (c) => {
  const t = c.get('tenant');
  const resp = await docFetch(c.env, t.api_key, '/documents/generate', { method: 'POST', body: JSON.stringify(await c.req.json()) });
  return c.json(await resp.json(), resp.status as any);
});

app.get('/api/documents', async (c) => {
  const t = c.get('tenant');
  const url = new URL(c.req.url);
  const resp = await docFetch(c.env, t.api_key, '/documents' + url.search);
  return c.json(await resp.json(), resp.status as any);
});

app.post('/api/documents/deliver/email', async (c) => {
  const t = c.get('tenant');
  const resp = await docFetch(c.env, t.api_key, '/deliver/email', { method: 'POST', body: JSON.stringify(await c.req.json()) });
  return c.json(await resp.json(), resp.status as any);
});

app.post('/api/documents/deliver/sms', async (c) => {
  const t = c.get('tenant');
  const resp = await docFetch(c.env, t.api_key, '/deliver/sms', { method: 'POST', body: JSON.stringify(await c.req.json()) });
  return c.json(await resp.json(), resp.status as any);
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════

app.get('/api/analytics/summary', async (c) => {
  const t = c.get('tenant');
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const [contacts, revenue, expenses, bookings, openDeals, tasks, reviews, inventory] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN type = \'lead\' THEN 1 ELSE 0 END) as leads, SUM(CASE WHEN type = \'customer\' THEN 1 ELSE 0 END) as customers FROM contacts WHERE tenant_id = ?').bind(t.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total, COALESCE(SUM(amount_paid),0) as collected, COALESCE(SUM(CASE WHEN status IN ('sent','overdue') THEN total - amount_paid ELSE 0 END),0) as outstanding, COALESCE(SUM(CASE WHEN issue_date >= ? THEN total ELSE 0 END),0) as mtd FROM invoices WHERE tenant_id = ?`).bind(monthStart, t.id).first(),
    c.env.DB.prepare('SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(CASE WHEN expense_date >= ? THEN amount ELSE 0 END),0) as mtd FROM expenses WHERE tenant_id = ?').bind(monthStart, t.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('pending','confirmed') AND scheduled_date >= date('now') THEN 1 ELSE 0 END) as upcoming, SUM(CASE WHEN status = 'completed' AND scheduled_date >= ? THEN 1 ELSE 0 END) as completed_mtd FROM bookings WHERE tenant_id = ?`).bind(monthStart, t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(value),0) as value FROM deals WHERE tenant_id = ? AND status = 'open'").bind(t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as open, SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent FROM tasks WHERE tenant_id = ? AND status IN ('pending','in_progress')").bind(t.id).first(),
    c.env.DB.prepare("SELECT COALESCE(AVG(rating),0) as avg_rating, COUNT(*) as count FROM reviews WHERE tenant_id = ? AND approved = 1").bind(t.id).first(),
    c.env.DB.prepare("SELECT COUNT(*) as low_stock FROM inventory WHERE tenant_id = ? AND quantity <= reorder_level AND reorder_level > 0").bind(t.id).first(),
  ]);
  return c.json({ contacts, revenue, expenses, bookings, deals: openDeals, tasks, reviews, inventory });
});

app.get('/api/analytics/revenue', async (c) => {
  const t = c.get('tenant'); const { months } = c.req.query() as any;
  const m = parseInt(months) || 12;
  const rows = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', issue_date) as month, COUNT(*) as invoices, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(amount_paid),0) as collected
     FROM invoices WHERE tenant_id = ? AND issue_date >= date('now', '-${m} months') GROUP BY month ORDER BY month`
  ).bind(t.id).all();
  return c.json({ revenue_by_month: rows.results });
});

app.get('/api/analytics/expenses', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare(
    "SELECT category, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM expenses WHERE tenant_id = ? GROUP BY category ORDER BY total DESC"
  ).bind(t.id).all();
  return c.json({ expenses_by_category: rows.results });
});

app.get('/api/analytics/ar-aging', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare(
    `SELECT id, invoice_number, contact_id, total, amount_paid, (total - amount_paid) as balance, due_date,
     CAST(julianday('now') - julianday(due_date) AS INTEGER) as days_overdue
     FROM invoices WHERE tenant_id = ? AND status IN ('sent','overdue','partial') AND total > amount_paid ORDER BY days_overdue DESC`
  ).bind(t.id).all();
  const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
  for (const r of rows.results as any[]) {
    const bal = r.balance;
    if (r.days_overdue <= 0) aging.current += bal;
    else if (r.days_overdue <= 30) aging.days_1_30 += bal;
    else if (r.days_overdue <= 60) aging.days_31_60 += bal;
    else if (r.days_overdue <= 90) aging.days_61_90 += bal;
    else aging.days_90_plus += bal;
  }
  return c.json({ aging, invoices: rows.results });
});

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

app.get('/api/settings', async (c) => {
  const t = c.get('tenant');
  const rows = await c.env.DB.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').bind(t.id).all();
  const settings: Record<string, string> = {};
  for (const r of rows.results as any[]) settings[r.key] = r.value;
  // Include tenant branding
  return c.json({ ...settings, company_name: t.company_name, company_phone: t.company_phone, company_email: t.company_email, primary_color: t.primary_color, industry: t.industry });
});

app.put('/api/settings', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  for (const [key, value] of Object.entries(b)) {
    await c.env.DB.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))").bind(t.id, key, String(value)).run();
  }
  return c.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// FILE UPLOAD
// ═══════════════════════════════════════════════════════════

app.post('/api/upload', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!b.data_base64) return c.json({ error: 'data_base64 required' }, 400);
  const key = b.key || `${t.slug}/uploads/${Date.now()}-${uid()}.${b.ext||'bin'}`;
  const data = Uint8Array.from(atob(b.data_base64), ch => ch.charCodeAt(0));
  await c.env.R2.put(key, data, { httpMetadata: { contentType: b.content_type || 'application/octet-stream' } });
  return c.json({ ok: true, r2_key: key });
});

// ═══════════════════════════════════════════════════════════
// DELIVER: EMAIL & SMS (tenant-level using tenant's credentials)
// ═══════════════════════════════════════════════════════════

app.post('/api/send/email', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!t.resend_api_key) return c.json({ error: 'Email not configured. Set resend_api_key on tenant.' }, 503);
  if (!b.to || !b.subject) return c.json({ error: 'to and subject required' }, 400);
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.resend_api_key}` },
    body: JSON.stringify({ from: b.from || `${t.company_name} <noreply@${t.company_website?.replace(/^https?:\/\//, '') || 'echo-op.com'}>`, to: b.to, subject: b.subject, html: b.html || b.text || '' }),
  });
  return c.json(await resp.json(), resp.status as any);
});

app.post('/api/send/sms', async (c) => {
  const t = c.get('tenant'); const b = await c.req.json() as any;
  if (!t.twilio_sid || !t.twilio_token) return c.json({ error: 'SMS not configured. Set twilio_sid, twilio_token, twilio_phone on tenant.' }, 503);
  if (!b.to || !b.message) return c.json({ error: 'to and message required' }, 400);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.twilio_sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${t.twilio_sid}:${t.twilio_token}`) },
    body: `To=${encodeURIComponent(b.to)}&From=${encodeURIComponent(t.twilio_phone || '')}&Body=${encodeURIComponent(b.message)}`,
  });
  return c.json({ ok: resp.ok, status: resp.status });
});

// ═══════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════

app.get('/api/audit-log', async (c) => {
  const t = c.get('tenant'); const { entity_type, limit } = c.req.query() as any;
  let sql = 'SELECT * FROM audit_log WHERE tenant_id = ?';
  const params: any[] = [t.id];
  if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 100}`;
  return c.json({ log: (await c.env.DB.prepare(sql).bind(...params).all()).results });
});

export default app;
