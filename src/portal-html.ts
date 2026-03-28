/**
 * Universal Owner Portal — served by echo-business-manager Worker
 * Works for ALL tenants: ProFinish, Clean Brees, any future business
 * Auto-brands based on tenant settings (colors, logo, company name)
 */

export function getPortalHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Business Manager Portal</title>
<style>
:root{--primary:#3B82F6;--primary-dark:#1E40AF;--green:#22C55E;--red:#EF4444;--orange:#F59E0B;--gray-50:#F9FAFB;--gray-100:#F3F4F6;--gray-200:#E5E7EB;--gray-300:#D1D5DB;--gray-400:#9CA3AF;--gray-500:#6B7280;--gray-600:#4B5563;--gray-700:#374151;--gray-800:#1F2937;--gray-900:#111827;--radius:8px;--shadow:0 1px 3px rgba(0,0,0,.1)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--gray-50);color:var(--gray-800);min-height:100vh}
/* LOGIN */
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.login-card{background:#fff;border-radius:12px;padding:40px;width:100%;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}
.login-card h1{font-size:1.5rem;margin-bottom:8px}
.login-card p{color:var(--gray-500);margin-bottom:24px;font-size:.9rem}
.login-card input{width:100%;padding:12px 16px;border:1.5px solid var(--gray-200);border-radius:var(--radius);font-size:.95rem;margin-bottom:16px}
.login-card input:focus{outline:none;border-color:var(--primary)}
.login-card button{width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;font-weight:600;cursor:pointer}
.login-card button:hover{background:var(--primary-dark)}
.login-error{color:var(--red);font-size:.85rem;margin-top:8px;display:none}
/* LAYOUT */
.app{display:none}
.topbar{background:#fff;border-bottom:1px solid var(--gray-200);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.topbar-left{display:flex;align-items:center;gap:12px}
.topbar-logo{height:32px;border-radius:4px}
.topbar-title{font-weight:700;font-size:1.1rem}
.topbar-right{display:flex;align-items:center;gap:12px}
.topbar-right button{background:none;border:1px solid var(--gray-200);padding:6px 12px;border-radius:var(--radius);font-size:.8rem;cursor:pointer;color:var(--gray-600)}
.topbar-right button:hover{background:var(--gray-50)}
.main-wrap{display:flex;min-height:calc(100vh - 56px)}
.sidebar{width:220px;background:#fff;border-right:1px solid var(--gray-200);padding:12px 0;flex-shrink:0}
.sidebar a{display:flex;align-items:center;gap:10px;padding:10px 20px;color:var(--gray-600);text-decoration:none;font-size:.9rem;cursor:pointer;border-left:3px solid transparent}
.sidebar a:hover{background:var(--gray-50);color:var(--gray-800)}
.sidebar a.active{background:var(--gray-50);color:var(--primary);border-left-color:var(--primary);font-weight:600}
.content{flex:1;padding:24px;max-width:1200px}
/* CARDS */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px}
.stat-card{background:#fff;border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow)}
.stat-card .label{font-size:.75rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.stat-card .value{font-size:1.5rem;font-weight:700}
.card{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px;overflow:hidden}
.card-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--gray-100)}
.card-header h3{font-size:1rem;font-weight:600}
.card-body{padding:20px}
/* TABLE */
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px 16px;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);border-bottom:2px solid var(--gray-100)}
td{padding:10px 16px;border-bottom:1px solid var(--gray-50);font-size:.85rem}
tr.clickable{cursor:pointer}
tr.clickable:hover{background:var(--gray-50)}
/* BADGES */
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:600;text-transform:capitalize}
.badge-draft{background:#E5E7EB;color:#374151}.badge-sent{background:#DBEAFE;color:#1E40AF}
.badge-viewed{background:#FEF3C7;color:#92400E}.badge-accepted{background:#D1FAE5;color:#065F46}
.badge-rejected{background:#FEE2E2;color:#991B1B}.badge-converted{background:#EDE9FE;color:#5B21B6}
.badge-expired{background:#F3F4F6;color:#6B7280}.badge-paid{background:#D1FAE5;color:#065F46}
.badge-overdue{background:#FEE2E2;color:#991B1B}.badge-partial{background:#FEF3C7;color:#92400E}
.badge-void{background:#F3F4F6;color:#9CA3AF}.badge-pending{background:#FEF3C7;color:#92400E}
.badge-confirmed{background:#DBEAFE;color:#1E40AF}.badge-completed{background:#D1FAE5;color:#065F46}
.badge-cancelled{background:#FEE2E2;color:#991B1B}.badge-needs_scheduling{background:#FDE68A;color:#78350F}
/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:var(--radius);font-size:.85rem;font-weight:500;cursor:pointer;transition:all .15s}
.btn-sm{padding:5px 12px;font-size:.78rem}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-dark)}
.btn-success{background:var(--green);color:#fff}.btn-success:hover{opacity:.9}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover{opacity:.9}
.btn-warning{background:var(--orange);color:#fff}.btn-warning:hover{opacity:.9}
.btn-outline{background:#fff;border:1px solid var(--gray-200);color:var(--gray-600)}.btn-outline:hover{background:var(--gray-50)}
/* FORMS */
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:.8rem;font-weight:500;color:var(--gray-600);margin-bottom:4px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;border:1.5px solid var(--gray-200);border-radius:var(--radius);font-size:.9rem}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--primary)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
/* DETAIL VIEW */
.detail-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.detail-header h2{font-size:1.2rem}
.detail-actions{display:flex;gap:8px;flex-wrap:wrap}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px}
.meta-item{background:var(--gray-50);padding:12px;border-radius:var(--radius)}
.meta-item .meta-label{font-size:.7rem;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px}
.meta-item .meta-value{font-size:.9rem;font-weight:500;margin-top:2px}
.totals-block{text-align:right;margin-top:16px}
.totals-block .line{display:flex;justify-content:flex-end;gap:40px;padding:4px 0;font-size:.9rem}
.totals-block .line.grand{font-size:1.1rem;font-weight:700;border-top:2px solid var(--gray-200);padding-top:8px;margin-top:4px}
/* PANEL */
.panel{display:none}
.panel.active{display:block}
/* MODAL */
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:200;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:#fff;border-radius:12px;padding:24px;width:90%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.15)}
.modal h3{margin-bottom:16px;font-size:1.1rem}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
/* TOAST */
.toast{position:fixed;bottom:20px;right:20px;background:var(--gray-800);color:#fff;padding:12px 20px;border-radius:var(--radius);font-size:.85rem;z-index:300;display:none;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.toast.show{display:block;animation:slideIn .3s}
@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@media(max-width:768px){.sidebar{display:none}.content{padding:16px}.stats-row{grid-template-columns:1fr 1fr}.form-row{grid-template-columns:1fr}.meta-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-wrap" id="loginScreen">
  <div class="login-card">
    <h1>Business Manager</h1>
    <p>Enter your tenant API key to access your dashboard</p>
    <input type="password" id="loginKey" placeholder="Your API key (ebm_...)" onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">Sign In</button>
    <div class="login-error" id="loginError"></div>
  </div>
</div>

<!-- APP -->
<div class="app" id="app">
  <div class="topbar">
    <div class="topbar-left">
      <img class="topbar-logo" id="tbLogo" src="" alt="" style="display:none">
      <span class="topbar-title" id="tbTitle">Business Manager</span>
    </div>
    <div class="topbar-right">
      <button onclick="loadDash()">Refresh</button>
      <button onclick="doLogout()">Sign Out</button>
    </div>
  </div>
  <div class="main-wrap">
    <div class="sidebar" id="sidebar">
      <a onclick="showPanel('dashboard')" class="active" data-panel="dashboard">📊 Dashboard</a>
      <a onclick="showPanel('estimates')" data-panel="estimates">📋 Estimates</a>
      <a onclick="showPanel('invoices')" data-panel="invoices">💰 Invoices</a>
      <a onclick="showPanel('contacts')" data-panel="contacts">👥 Contacts</a>
      <a onclick="showPanel('bookings')" data-panel="bookings">📅 Bookings</a>
      <a onclick="showPanel('deals')" data-panel="deals">🎯 Deals</a>
      <a onclick="showPanel('tasks')" data-panel="tasks">✅ Tasks</a>
      <a onclick="showPanel('notebook')" data-panel="notebook">📓 Notebook</a>
    </div>
    <div class="content">

      <!-- DASHBOARD -->
      <div class="panel active" id="panel-dashboard">
        <div class="stats-row" id="dashStats"></div>
        <div class="card"><div class="card-header"><h3>Recent Activity</h3></div>
          <table><thead><tr><th>Action</th><th>Entity</th><th>Date</th></tr></thead>
          <tbody id="dashActivity"><tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
        </div>
      </div>

      <!-- ESTIMATES -->
      <div class="panel" id="panel-estimates">
        <div class="stats-row" id="estStats"></div>
        <!-- List View -->
        <div id="estListView">
          <div class="card">
            <div class="card-header"><h3>All Estimates</h3><button class="btn btn-primary btn-sm" onclick="openNewEstimate()">+ New Estimate</button></div>
            <table><thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Status</th><th>Approval</th><th>Date</th></tr></thead>
            <tbody id="estTable"><tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
          </div>
        </div>
        <!-- Detail View -->
        <div id="estDetailView" style="display:none">
          <div class="detail-header">
            <div><button class="btn btn-outline btn-sm" onclick="showEstList()" style="margin-right:12px">← Back</button><span id="estDetailNum" style="font-size:1.2rem;font-weight:700"></span> <span class="badge" id="estDetailBadge"></span></div>
            <div class="detail-actions" id="estDetailActions"></div>
          </div>
          <div class="meta-grid" id="estDetailMeta"></div>
          <div class="card"><div class="card-header"><h3>Line Items</h3><button class="btn btn-sm btn-outline" id="btnAddEstItem" onclick="openAddEstItem()">+ Add Item</button></div>
            <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th style="text-align:right">Total</th><th></th></tr></thead>
            <tbody id="estDetailItems"></tbody></table>
            <div class="totals-block" id="estDetailTotals"></div>
          </div>
          <div class="card" id="estNotesCard" style="display:none"><div class="card-header"><h3>Notes</h3></div><div class="card-body" id="estNotes"></div></div>
        </div>
      </div>

      <!-- INVOICES -->
      <div class="panel" id="panel-invoices">
        <div class="stats-row" id="invStats"></div>
        <div id="invListView">
          <div class="card">
            <div class="card-header"><h3>All Invoices</h3><button class="btn btn-primary btn-sm" onclick="openNewInvoice()">+ New Invoice</button></div>
            <table><thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th><th>Due</th></tr></thead>
            <tbody id="invTable"><tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
          </div>
        </div>
        <div id="invDetailView" style="display:none">
          <div class="detail-header">
            <div><button class="btn btn-outline btn-sm" onclick="showInvList()" style="margin-right:12px">← Back</button><span id="invDetailNum" style="font-size:1.2rem;font-weight:700"></span> <span class="badge" id="invDetailBadge"></span></div>
            <div class="detail-actions" id="invDetailActions"></div>
          </div>
          <div class="meta-grid" id="invDetailMeta"></div>
          <div class="card"><div class="card-header"><h3>Line Items</h3><button class="btn btn-sm btn-outline" id="btnAddInvItem" onclick="openAddInvItem()">+ Add Item</button></div>
            <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th style="text-align:right">Total</th><th></th></tr></thead>
            <tbody id="invDetailItems"></tbody></table>
            <div class="totals-block" id="invDetailTotals"></div>
          </div>
          <div class="card"><div class="card-header"><h3>Payments</h3><button class="btn btn-sm btn-success" id="btnRecordPay" onclick="togglePayForm()" style="display:none">Record Payment</button></div>
            <div id="payFormWrap" style="display:none;padding:16px 20px;border-bottom:1px solid var(--gray-100)">
              <div class="form-row">
                <div class="form-group"><label>Amount</label><input type="number" id="payAmt" step="0.01" placeholder="0.00"></div>
                <div class="form-group"><label>Method</label><select id="payMethod"><option>cash</option><option>check</option><option>card</option><option>zelle</option><option>venmo</option><option>paypal</option><option>ach</option></select></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label>Date</label><input type="date" id="payDate"></div>
                <div class="form-group"><label>Reference</label><input type="text" id="payRef" placeholder="Check #, etc"></div>
              </div>
              <button class="btn btn-success btn-sm" onclick="submitPayment()">Save Payment</button>
            </div>
            <table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody id="invPayTable"></tbody></table>
          </div>
        </div>
      </div>

      <!-- CONTACTS -->
      <div class="panel" id="panel-contacts">
        <div class="card">
          <div class="card-header"><h3>Contacts</h3>
            <div style="display:flex;gap:8px"><input type="text" id="contactSearch" placeholder="Search..." style="padding:6px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:.85rem" oninput="filterContacts()">
            <button class="btn btn-primary btn-sm" onclick="openNewContact()">+ New Contact</button></div>
          </div>
          <table><thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Type</th><th>Value</th></tr></thead>
          <tbody id="contactsTable"><tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
        </div>
      </div>

      <!-- BOOKINGS -->
      <div class="panel" id="panel-bookings">
        <div class="card">
          <div class="card-header"><h3>Bookings &amp; Appointments</h3><button class="btn btn-primary btn-sm" onclick="openNewBooking()">+ New Booking</button></div>
          <table><thead><tr><th>Title</th><th>Customer</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th></tr></thead>
          <tbody id="bookingsTable"><tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
        </div>
      </div>

      <!-- DEALS -->
      <div class="panel" id="panel-deals">
        <div class="card">
          <div class="card-header"><h3>Deals Pipeline</h3><button class="btn btn-primary btn-sm" onclick="openNewDeal()">+ New Deal</button></div>
          <table><thead><tr><th>Title</th><th>Contact</th><th>Stage</th><th>Value</th><th>Probability</th><th>Status</th></tr></thead>
          <tbody id="dealsTable"><tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
        </div>
      </div>

      <!-- TASKS -->
      <div class="panel" id="panel-tasks">
        <div class="card">
          <div class="card-header"><h3>Tasks</h3><button class="btn btn-primary btn-sm" onclick="openNewTask()">+ New Task</button></div>
          <table><thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead>
          <tbody id="tasksTable"><tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px">Loading...</td></tr></tbody></table>
        </div>
      </div>

      <!-- NOTEBOOK -->
      <div class="panel" id="panel-notebook">
        <div class="card">
          <div class="card-header"><h3>Notebook</h3><button class="btn btn-primary btn-sm" onclick="openNewNote()">+ New Note</button></div>
          <div id="notebookList" style="padding:16px"></div>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
  <div class="modal" id="modalContent"></div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
const API = '';
let TENANT_KEY = '';
let tenantInfo = {};
let currentEstId = null;
let currentInvId = null;
let allContacts = [];
let allEstimates = [];
let allInvoices = [];

function esc(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function money(n){return '$'+(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function shortDate(d){if(!d)return'--';return d.split('T')[0]}

async function api(path,opts={}){
  const h={'X-Tenant-Key':TENANT_KEY,'Content-Type':'application/json',...(opts.headers||{})};
  const r=await fetch(API+path,{...opts,headers:h});
  if(!r.ok){const e=await r.json().catch(()=>({error:'Request failed'}));throw new Error(e.error||'Request failed')}
  return r.json();
}
async function apiPost(path,body){return api(path,{method:'POST',body:JSON.stringify(body)})}
async function apiPut(path,body){return api(path,{method:'PUT',body:JSON.stringify(body)})}
async function apiDel(path){return api(path,{method:'DELETE'})}

function toast(msg,dur=3000){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show';setTimeout(()=>t.className='toast',dur)}

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
async function doLogin(){
  const key=document.getElementById('loginKey').value.trim();
  if(!key){document.getElementById('loginError').textContent='Enter your API key';document.getElementById('loginError').style.display='block';return}
  TENANT_KEY=key;
  try{
    const info=await api('/api/settings');
    tenantInfo=info;
    localStorage.setItem('ebm_key',key);
    applyBranding(info);
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='';
    loadDash();
  }catch(e){
    document.getElementById('loginError').textContent='Invalid API key. Check and try again.';
    document.getElementById('loginError').style.display='block';
    TENANT_KEY='';
  }
}

function doLogout(){
  localStorage.removeItem('ebm_key');
  TENANT_KEY='';
  document.getElementById('loginScreen').style.display='';
  document.getElementById('app').style.display='none';
}

function applyBranding(info){
  const c=info.primary_color||'#3B82F6';
  document.documentElement.style.setProperty('--primary',c);
  document.getElementById('tbTitle').textContent=info.company_name||'Business Manager';
  if(info.company_logo_url){document.getElementById('tbLogo').src=info.company_logo_url;document.getElementById('tbLogo').style.display=''}
  document.title=(info.company_name||'Business Manager')+' — Portal';
}

// Auto-login from stored key
(function(){
  const k=localStorage.getItem('ebm_key');
  if(k){document.getElementById('loginKey').value=k;doLogin()}
})();

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPanel(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  document.querySelectorAll('.sidebar a').forEach(a=>{a.classList.toggle('active',a.dataset.panel===name)});
  if(name==='estimates')loadEstimates();
  else if(name==='invoices')loadInvoices();
  else if(name==='contacts')loadContacts();
  else if(name==='bookings')loadBookings();
  else if(name==='deals')loadDeals();
  else if(name==='tasks')loadTasks();
  else if(name==='notebook')loadNotebook();
  else if(name==='dashboard')loadDash();
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function loadDash(){
  try{
    const d=await api('/api/analytics/summary');
    const s=document.getElementById('dashStats');
    s.innerHTML=\`
      <div class="stat-card"><div class="label">Total Contacts</div><div class="value">\${d.contacts?.total||0}</div></div>
      <div class="stat-card"><div class="label">Revenue (MTD)</div><div class="value" style="color:var(--green)">\${money(d.revenue?.mtd)}</div></div>
      <div class="stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--orange)">\${money(d.revenue?.outstanding)}</div></div>
      <div class="stat-card"><div class="label">Open Deals</div><div class="value">\${d.deals?.count||0} (\${money(d.deals?.value)})</div></div>
      <div class="stat-card"><div class="label">Upcoming Bookings</div><div class="value">\${d.bookings?.upcoming||0}</div></div>
      <div class="stat-card"><div class="label">Open Tasks</div><div class="value">\${d.tasks?.open||0}</div></div>
      <div class="stat-card"><div class="label">Avg Rating</div><div class="value">\${(d.reviews?.avg_rating||0).toFixed(1)}⭐ (\${d.reviews?.count||0})</div></div>
      <div class="stat-card"><div class="label">Low Stock Items</div><div class="value" style="color:\${(d.inventory?.low_stock||0)>0?'var(--red)':'inherit'}">\${d.inventory?.low_stock||0}</div></div>
    \`;
    const log=await api('/api/audit-log?limit=15');
    const tb=document.getElementById('dashActivity');
    tb.innerHTML='';
    if(!log.log||log.log.length===0){tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:20px">No activity yet</td></tr>';return}
    log.log.forEach(r=>{tb.innerHTML+=\`<tr><td>\${esc(r.action)}</td><td>\${esc(r.entity_type||'')} \${esc(r.entity_id?.substring(0,8)||'')}</td><td style="color:var(--gray-400);font-size:.8rem">\${shortDate(r.created_at)}</td></tr>\`});
  }catch(e){console.error('Dashboard error:',e)}
}

// ═══════════════════════════════════════════════
// ESTIMATES / QUOTES
// ═══════════════════════════════════════════════
async function loadEstimates(){
  try{
    const data=await api('/api/quotes');
    allEstimates=data.quotes||[];
    renderEstList();
    // Stats
    const s=document.getElementById('estStats');
    const total=allEstimates.length;
    const pending=allEstimates.filter(q=>q.status==='draft'||q.status==='sent'||q.status==='viewed').length;
    const approved=allEstimates.filter(q=>q.approval_status==='approved'||q.status==='accepted').length;
    const val=allEstimates.reduce((s,q)=>s+(q.total||0),0);
    s.innerHTML=\`
      <div class="stat-card"><div class="label">Total Estimates</div><div class="value">\${total}</div></div>
      <div class="stat-card"><div class="label">Pending</div><div class="value" style="color:var(--orange)">\${pending}</div></div>
      <div class="stat-card"><div class="label">Approved</div><div class="value" style="color:var(--green)">\${approved}</div></div>
      <div class="stat-card"><div class="label">Total Value</div><div class="value">\${money(val)}</div></div>
    \`;
  }catch(e){console.error(e);toast('Error loading estimates')}
}

function renderEstList(){
  const tb=document.getElementById('estTable');
  tb.innerHTML='';
  if(allEstimates.length===0){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">No estimates yet</td></tr>';return}
  allEstimates.forEach(q=>{
    const bc=badgeClass(q.status);
    const abc=q.approval_status==='approved'?'badge-accepted':q.approval_status==='rejected'?'badge-rejected':q.approval_status==='pending'?'badge-sent':'badge-draft';
    const name=q.first_name?(q.first_name+' '+(q.last_name||'')):'--';
    tb.innerHTML+=\`<tr class="clickable" onclick="loadEstDetail('\${esc(q.id)}')">
      <td style="font-weight:600;color:var(--primary)">\${esc(q.quote_number||q.id.substring(0,8))}</td>
      <td>\${esc(name)}</td>
      <td style="font-weight:600">\${money(q.total)}</td>
      <td><span class="badge \${bc}">\${esc(q.status)}</span></td>
      <td><span class="badge \${abc}">\${esc(q.approval_status||'none')}</span></td>
      <td style="color:var(--gray-400);font-size:.8rem">\${shortDate(q.issue_date||q.created_at)}</td>
    </tr>\`;
  });
}

function showEstList(){
  document.getElementById('estListView').style.display='';
  document.getElementById('estDetailView').style.display='none';
  currentEstId=null;
}

async function loadEstDetail(id){
  currentEstId=id;
  document.getElementById('estListView').style.display='none';
  document.getElementById('estDetailView').style.display='';
  try{
    const q=await api('/api/quotes/'+id);
    // Header
    document.getElementById('estDetailNum').textContent=q.quote_number||id.substring(0,8);
    const badge=document.getElementById('estDetailBadge');
    badge.className='badge '+badgeClass(q.status);
    badge.textContent=q.status;

    // Action buttons
    const acts=document.getElementById('estDetailActions');
    acts.innerHTML='';
    if(q.status!=='converted'){
      acts.innerHTML+=\`<button class="btn btn-sm btn-success" onclick="convertEstToInv('\${esc(id)}')">Convert to Invoice</button>\`;
    }
    if(q.status==='draft'||q.status==='sent'||q.status==='viewed'){
      acts.innerHTML+=\`<button class="btn btn-sm btn-primary" onclick="sendEstToCustomer('\${esc(id)}')">Send to Customer</button>\`;
    }
    acts.innerHTML+=\`<button class="btn btn-sm btn-outline" onclick="openEditEstimate('\${esc(id)}')">Edit</button>\`;
    acts.innerHTML+=\`<button class="btn btn-sm btn-warning" onclick="printEstimate('\${esc(id)}')">Print / PDF</button>\`;
    if(q.status==='draft'){
      acts.innerHTML+=\`<button class="btn btn-sm btn-danger" onclick="deleteEstimate('\${esc(id)}')">Delete</button>\`;
    }

    // Meta
    const name=q.first_name?(q.first_name+' '+(q.last_name||'')):'--';
    const meta=document.getElementById('estDetailMeta');
    meta.innerHTML=\`
      <div class="meta-item"><div class="meta-label">Customer</div><div class="meta-value">\${esc(name)}</div></div>
      <div class="meta-item"><div class="meta-label">Email</div><div class="meta-value">\${esc(q.contact_email||'--')}</div></div>
      <div class="meta-item"><div class="meta-label">Phone</div><div class="meta-value">\${esc(q.contact_phone||'--')}</div></div>
      <div class="meta-item"><div class="meta-label">Issue Date</div><div class="meta-value">\${shortDate(q.issue_date||q.created_at)}</div></div>
      <div class="meta-item"><div class="meta-label">Expiry Date</div><div class="meta-value">\${shortDate(q.expiry_date)}</div></div>
      <div class="meta-item"><div class="meta-label">Approval</div><div class="meta-value"><span class="badge \${q.approval_status==='approved'?'badge-accepted':q.approval_status==='rejected'?'badge-rejected':q.approval_status==='pending'?'badge-sent':'badge-draft'}">\${esc(q.approval_status||'none')}</span></div></div>
    \`;
    if(q.approved_at){meta.innerHTML+=\`<div class="meta-item"><div class="meta-label">Approved At</div><div class="meta-value">\${shortDate(q.approved_at)}</div></div>\`}
    if(q.approval_name){meta.innerHTML+=\`<div class="meta-item"><div class="meta-label">Approved By</div><div class="meta-value">\${esc(q.approval_name)}</div></div>\`}

    // Items
    const items=q.items||[];
    const itb=document.getElementById('estDetailItems');
    itb.innerHTML='';
    if(items.length===0){itb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">No line items</td></tr>'}
    else{items.forEach(it=>{
      const canDel=q.status==='draft';
      itb.innerHTML+=\`<tr><td>\${esc(it.description)}</td><td>\${it.quantity}</td><td>\${money(it.unit_price)}</td><td style="text-align:right;font-weight:600">\${money(it.total||it.quantity*it.unit_price)}</td><td style="text-align:right">\${canDel?\`<button class="btn btn-sm btn-danger" onclick="deleteEstItem('\${esc(id)}','\${esc(it.id)}')" style="padding:2px 8px">✕</button>\`:''}</td></tr>\`;
    })}
    document.getElementById('btnAddEstItem').style.display=(q.status==='draft'||q.status==='sent')?'':'none';

    // Totals
    const totals=document.getElementById('estDetailTotals');
    totals.innerHTML=\`
      <div class="line"><span>Subtotal</span><span>\${money(q.subtotal)}</span></div>
      \${q.discount>0?\`<div class="line"><span>Discount</span><span>-\${money(q.discount)}</span></div>\`:''}
      \${q.tax_amount>0?\`<div class="line"><span>Tax (\${((q.tax_rate||0)*100).toFixed(1)}%)</span><span>\${money(q.tax_amount)}</span></div>\`:''}
      <div class="line grand"><span>Total</span><span>\${money(q.total)}</span></div>
    \`;

    // Notes
    if(q.notes){document.getElementById('estNotesCard').style.display='';document.getElementById('estNotes').textContent=q.notes}
    else{document.getElementById('estNotesCard').style.display='none'}
  }catch(e){console.error(e);toast('Error loading estimate')}
}

async function convertEstToInv(id){
  if(!confirm('Convert this estimate to an invoice?'))return;
  try{
    const r=await apiPost('/api/quotes/'+id+'/convert',{});
    toast('Converted! Invoice '+r.invoice_number);
    loadEstimates();
    showEstList();
  }catch(e){toast('Error: '+e.message)}
}

async function sendEstToCustomer(id){
  try{
    const r=await apiPost('/api/quotes/'+id+'/send-to-customer',{});
    toast('Sent! '+(r.delivery?.email?.sent?'Email sent. ':'')+(r.delivery?.sms?.sent?'SMS sent.':''));
    loadEstDetail(id);
  }catch(e){toast('Error: '+e.message)}
}

async function deleteEstimate(id){
  if(!confirm('Delete this estimate? This cannot be undone.'))return;
  try{
    await apiDel('/api/quotes/'+id);
    toast('Estimate deleted');
    loadEstimates();
    showEstList();
  }catch(e){toast('Error: '+e.message)}
}

async function deleteEstItem(qId,itemId){
  try{await apiDel('/api/quotes/'+qId+'/items/'+itemId);toast('Item removed');loadEstDetail(qId)}catch(e){toast('Error: '+e.message)}
}

function printEstimate(id){
  const q=allEstimates.find(e=>e.id===id);
  if(!q)return;
  const w=window.open('','_blank');
  w.document.write('<html><head><title>Estimate '+esc(q.quote_number)+'</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:auto}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}th{background:#f3f4f6}h1{color:'+((tenantInfo||{}).primary_color||'#3B82F6')+'}.total{text-align:right;font-size:1.2em;font-weight:bold;margin-top:20px}@media print{body{padding:20px}}</style></head><body>');
  w.document.write('<h1>'+(tenantInfo.company_name||'Estimate')+'</h1>');
  w.document.write('<p>Estimate #'+esc(q.quote_number)+'</p>');
  w.document.write('<p>Date: '+shortDate(q.issue_date||q.created_at)+'</p>');
  w.document.write('<p>Valid Until: '+shortDate(q.expiry_date)+'</p>');
  if(q.first_name)w.document.write('<p>Customer: '+esc(q.first_name+' '+(q.last_name||''))+'</p>');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),500);
}

function openNewEstimate(){
  openModal(\`
    <h3>New Estimate</h3>
    <div class="form-group"><label>Contact</label><select id="mEstContact"><option value="">-- Select --</option></select></div>
    <div class="form-row">
      <div class="form-group"><label>Subtotal</label><input type="number" id="mEstSub" step="0.01" value="0"></div>
      <div class="form-group"><label>Tax Rate</label><input type="number" id="mEstTax" step="0.01" value="\${tenantInfo.default_tax_rate||0}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="mEstNotes" rows="3"></textarea></div>
    <div class="form-group"><label>Line Items (one per line: description | qty | rate)</label><textarea id="mEstItems" rows="4" placeholder="Interior Painting | 1 | 500\nExterior Trim | 2 | 150"></textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewEstimate()">Create Estimate</button></div>
  \`);
  const sel=document.getElementById('mEstContact');
  allContacts.forEach(c=>{sel.innerHTML+=\`<option value="\${esc(c.id)}">\${esc((c.first_name||'')+' '+(c.last_name||''))} \${c.company_name?'('+esc(c.company_name)+')':''}</option>\`});
}

async function submitNewEstimate(){
  const sub=parseFloat(document.getElementById('mEstSub').value)||0;
  const taxRate=parseFloat(document.getElementById('mEstTax').value)||0;
  const taxAmt=sub*taxRate;
  const itemsRaw=document.getElementById('mEstItems').value.trim();
  const items=[];
  let calcSub=0;
  if(itemsRaw){
    itemsRaw.split('\\n').forEach(line=>{
      const parts=line.split('|').map(s=>s.trim());
      if(parts[0]){
        const qty=parseFloat(parts[1])||1;
        const rate=parseFloat(parts[2])||0;
        items.push({description:parts[0],quantity:qty,unit_price:rate});
        calcSub+=qty*rate;
      }
    });
  }
  const finalSub=calcSub>0?calcSub:sub;
  const finalTax=finalSub*taxRate;
  try{
    const r=await apiPost('/api/quotes',{
      contact_id:document.getElementById('mEstContact').value||null,
      subtotal:finalSub,tax_rate:taxRate,tax_amount:finalTax,total:finalSub+finalTax,
      notes:document.getElementById('mEstNotes').value,
      items:items.length?items:undefined
    });
    closeModal();toast('Estimate '+r.quote_number+' created!');
    loadEstimates();
  }catch(e){toast('Error: '+e.message)}
}

function openEditEstimate(id){
  const q=allEstimates.find(e=>e.id===id);
  if(!q)return;
  openModal(\`
    <h3>Edit Estimate \${esc(q.quote_number)}</h3>
    <div class="form-row">
      <div class="form-group"><label>Subtotal</label><input type="number" id="mEditSub" step="0.01" value="\${q.subtotal||0}"></div>
      <div class="form-group"><label>Discount</label><input type="number" id="mEditDisc" step="0.01" value="\${q.discount||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Tax Rate</label><input type="number" id="mEditTax" step="0.0001" value="\${q.tax_rate||0}"></div>
      <div class="form-group"><label>Expiry Date</label><input type="date" id="mEditExp" value="\${q.expiry_date||''}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="mEditNotes" rows="3">\${esc(q.notes||'')}</textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditEstimate('\${esc(id)}')">Save Changes</button></div>
  \`);
}

async function submitEditEstimate(id){
  const sub=parseFloat(document.getElementById('mEditSub').value)||0;
  const disc=parseFloat(document.getElementById('mEditDisc').value)||0;
  const taxRate=parseFloat(document.getElementById('mEditTax').value)||0;
  const taxAmt=(sub-disc)*taxRate;
  try{
    await apiPut('/api/quotes/'+id,{
      subtotal:sub,discount:disc,tax_rate:taxRate,tax_amount:taxAmt,total:sub-disc+taxAmt,
      expiry_date:document.getElementById('mEditExp').value,
      notes:document.getElementById('mEditNotes').value
    });
    closeModal();toast('Estimate updated');loadEstDetail(id);loadEstimates();
  }catch(e){toast('Error: '+e.message)}
}

function openAddEstItem(){
  openModal(\`
    <h3>Add Line Item</h3>
    <div class="form-group"><label>Description</label><input type="text" id="mItemDesc"></div>
    <div class="form-row">
      <div class="form-group"><label>Quantity</label><input type="number" id="mItemQty" value="1" step="0.01"></div>
      <div class="form-group"><label>Unit Price</label><input type="number" id="mItemPrice" step="0.01" value="0"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAddEstItem()">Add Item</button></div>
  \`);
}

async function submitAddEstItem(){
  try{
    await apiPost('/api/quotes/'+currentEstId+'/items',{
      description:document.getElementById('mItemDesc').value,
      quantity:parseFloat(document.getElementById('mItemQty').value)||1,
      unit_price:parseFloat(document.getElementById('mItemPrice').value)||0
    });
    closeModal();toast('Item added');loadEstDetail(currentEstId);
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════
async function loadInvoices(){
  try{
    const data=await api('/api/invoices');
    allInvoices=data.invoices||[];
    renderInvList();
    const s=document.getElementById('invStats');
    const total=allInvoices.length;
    const unpaid=allInvoices.filter(i=>['sent','overdue','partial'].includes(i.status)).length;
    const collected=allInvoices.reduce((s,i)=>s+(i.amount_paid||0),0);
    const outstanding=allInvoices.reduce((s,i)=>{if(['sent','overdue','partial'].includes(i.status))return s+((i.total||0)-(i.amount_paid||0));return s},0);
    s.innerHTML=\`
      <div class="stat-card"><div class="label">Total Invoices</div><div class="value">\${total}</div></div>
      <div class="stat-card"><div class="label">Unpaid</div><div class="value" style="color:var(--orange)">\${unpaid}</div></div>
      <div class="stat-card"><div class="label">Collected</div><div class="value" style="color:var(--green)">\${money(collected)}</div></div>
      <div class="stat-card"><div class="label">Outstanding</div><div class="value" style="color:var(--red)">\${money(outstanding)}</div></div>
    \`;
  }catch(e){console.error(e)}
}

function renderInvList(){
  const tb=document.getElementById('invTable');
  tb.innerHTML='';
  if(allInvoices.length===0){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">No invoices yet</td></tr>';return}
  allInvoices.forEach(i=>{
    const today=new Date().toISOString().split('T')[0];
    const ds=(i.due_date&&i.due_date<today&&i.status!=='paid'&&i.status!=='void')?'overdue':i.status;
    const bc=badgeClass(ds);
    const name=i.first_name?(i.first_name+' '+(i.last_name||'')):(i.customer_name||'--');
    tb.innerHTML+=\`<tr class="clickable" onclick="loadInvDetail('\${esc(i.id)}')">
      <td style="font-weight:600;color:var(--primary)">\${esc(i.invoice_number||i.id.substring(0,8))}</td>
      <td>\${esc(name)}</td>
      <td style="font-weight:600">\${money(i.total)}</td>
      <td>\${(i.amount_paid||0)>0?money(i.amount_paid):'--'}</td>
      <td><span class="badge \${bc}">\${esc(ds)}</span></td>
      <td style="color:var(--gray-400);font-size:.8rem">\${shortDate(i.due_date)}</td>
    </tr>\`;
  });
}

function showInvList(){
  document.getElementById('invListView').style.display='';
  document.getElementById('invDetailView').style.display='none';
  currentInvId=null;
}

async function loadInvDetail(id){
  currentInvId=id;
  document.getElementById('invListView').style.display='none';
  document.getElementById('invDetailView').style.display='';
  try{
    const inv=await api('/api/invoices/'+id);
    const payments=await api('/api/invoices/'+id+'/payments');
    document.getElementById('invDetailNum').textContent=inv.invoice_number||id.substring(0,8);
    const today=new Date().toISOString().split('T')[0];
    const ds=(inv.due_date&&inv.due_date<today&&inv.status!=='paid'&&inv.status!=='void')?'overdue':inv.status;
    const badge=document.getElementById('invDetailBadge');
    badge.className='badge '+badgeClass(ds);
    badge.textContent=ds;

    // Actions
    const acts=document.getElementById('invDetailActions');
    acts.innerHTML='';
    if(inv.status!=='paid'&&inv.status!=='void'){
      document.getElementById('btnRecordPay').style.display='';
    }else{document.getElementById('btnRecordPay').style.display='none'}
    if(inv.status==='draft'){acts.innerHTML+=\`<button class="btn btn-sm btn-primary" onclick="sendInvoice('\${esc(id)}')">Send</button><button class="btn btn-sm btn-danger" onclick="deleteInvoice('\${esc(id)}')">Delete</button>\`}
    if(inv.status!=='void'&&inv.status!=='paid'){acts.innerHTML+=\`<button class="btn btn-sm btn-outline" onclick="voidInvoice('\${esc(id)}')">Void</button>\`}

    // Meta
    const name=inv.first_name?(inv.first_name+' '+(inv.last_name||'')):(inv.customer_name||'--');
    document.getElementById('invDetailMeta').innerHTML=\`
      <div class="meta-item"><div class="meta-label">Customer</div><div class="meta-value">\${esc(name)}</div></div>
      <div class="meta-item"><div class="meta-label">Issue Date</div><div class="meta-value">\${shortDate(inv.issue_date||inv.created_at)}</div></div>
      <div class="meta-item"><div class="meta-label">Due Date</div><div class="meta-value">\${shortDate(inv.due_date)}</div></div>
      <div class="meta-item"><div class="meta-label">Payment Terms</div><div class="meta-value">\${esc((inv.payment_terms||'net_30').replace('_',' '))}</div></div>
      \${inv.notes?\`<div class="meta-item" style="grid-column:span 2"><div class="meta-label">Notes</div><div class="meta-value">\${esc(inv.notes)}</div></div>\`:''}
    \`;

    // Items
    const items=inv.items||[];
    const itb=document.getElementById('invDetailItems');
    itb.innerHTML='';
    if(items.length===0){itb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">No items</td></tr>'}
    else{items.forEach(it=>{itb.innerHTML+=\`<tr><td>\${esc(it.description)}</td><td>\${it.quantity}</td><td>\${money(it.unit_price)}</td><td style="text-align:right;font-weight:600">\${money(it.total)}</td><td></td></tr>\`})}
    document.getElementById('btnAddInvItem').style.display=(inv.status==='draft')?'':'none';

    // Totals
    const balance=(inv.total||0)-(inv.amount_paid||0);
    document.getElementById('invDetailTotals').innerHTML=\`
      <div class="line"><span>Subtotal</span><span>\${money(inv.subtotal)}</span></div>
      \${inv.tax_amount>0?\`<div class="line"><span>Tax</span><span>\${money(inv.tax_amount)}</span></div>\`:''}
      <div class="line grand"><span>Total</span><span>\${money(inv.total)}</span></div>
      \${(inv.amount_paid||0)>0?\`<div class="line" style="color:var(--green)"><span>Paid</span><span>-\${money(inv.amount_paid)}</span></div><div class="line" style="font-weight:600;color:var(--orange)"><span>Balance</span><span>\${money(balance)}</span></div>\`:''}
    \`;

    // Payments
    const ptb=document.getElementById('invPayTable');
    ptb.innerHTML='';
    if(!payments.length){ptb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--gray-400)">No payments</td></tr>'}
    else{payments.forEach(p=>{ptb.innerHTML+=\`<tr><td>\${shortDate(p.payment_date)}</td><td style="text-transform:capitalize">\${esc(p.method||p.payment_method||'--')}</td><td>\${esc(p.reference||p.reference_number||'--')}</td><td style="text-align:right;font-weight:600;color:var(--green)">\${money(p.amount)}</td></tr>\`})}
    document.getElementById('payAmt').value=balance>0?balance.toFixed(2):'';
    document.getElementById('payDate').value=new Date().toISOString().split('T')[0];
    document.getElementById('payFormWrap').style.display='none';
  }catch(e){console.error(e);toast('Error loading invoice')}
}

function togglePayForm(){document.getElementById('payFormWrap').style.display=document.getElementById('payFormWrap').style.display==='none'?'':'none'}

async function submitPayment(){
  const amt=parseFloat(document.getElementById('payAmt').value);
  if(!amt||amt<=0){toast('Enter a valid amount');return}
  try{
    await apiPost('/api/payments',{invoice_id:currentInvId,amount:amt,payment_method:document.getElementById('payMethod').value,payment_date:document.getElementById('payDate').value,reference_number:document.getElementById('payRef').value});
    toast('Payment recorded');loadInvDetail(currentInvId);
  }catch(e){toast('Error: '+e.message)}
}

async function sendInvoice(id){try{await apiPost('/api/invoices/'+id+'/send',{});toast('Invoice sent');loadInvDetail(id)}catch(e){toast('Error: '+e.message)}}
async function deleteInvoice(id){if(!confirm('Delete this invoice?'))return;try{await apiDel('/api/invoices/'+id);toast('Deleted');loadInvoices();showInvList()}catch(e){toast('Error: '+e.message)}}
async function voidInvoice(id){if(!confirm('Void this invoice?'))return;try{await apiPut('/api/invoices/'+id,{status:'void'});toast('Voided');loadInvDetail(id)}catch(e){toast('Error: '+e.message)}}

function openNewInvoice(){
  openModal(\`
    <h3>New Invoice</h3>
    <div class="form-group"><label>Contact</label><select id="mInvContact"><option value="">-- Select --</option></select></div>
    <div class="form-row">
      <div class="form-group"><label>Due Date</label><input type="date" id="mInvDue"></div>
      <div class="form-group"><label>Payment Terms</label><select id="mInvTerms"><option>net_30</option><option>net_15</option><option>net_45</option><option>net_60</option><option>due_on_receipt</option></select></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="mInvNotes" rows="2"></textarea></div>
    <div class="form-group"><label>Line Items (one per line: description | qty | rate)</label><textarea id="mInvItems" rows="4" placeholder="Service | 1 | 500"></textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewInvoice()">Create Invoice</button></div>
  \`);
  const sel=document.getElementById('mInvContact');
  allContacts.forEach(c=>{sel.innerHTML+=\`<option value="\${esc(c.id)}">\${esc((c.first_name||'')+' '+(c.last_name||''))}</option>\`});
}

async function submitNewInvoice(){
  const itemsRaw=document.getElementById('mInvItems').value.trim();
  const items=[];let sub=0;
  if(itemsRaw){itemsRaw.split('\\n').forEach(line=>{const p=line.split('|').map(s=>s.trim());if(p[0]){const q=parseFloat(p[1])||1,r=parseFloat(p[2])||0;items.push({description:p[0],quantity:q,unit_price:r});sub+=q*r}})}
  const taxRate=tenantInfo.default_tax_rate||0;
  const taxAmt=sub*taxRate;
  try{
    const r=await apiPost('/api/invoices',{contact_id:document.getElementById('mInvContact').value||null,due_date:document.getElementById('mInvDue').value,payment_terms:document.getElementById('mInvTerms').value,subtotal:sub,tax_rate:taxRate,tax_amount:taxAmt,total:sub+taxAmt,notes:document.getElementById('mInvNotes').value,items});
    closeModal();toast('Invoice '+r.invoice_number+' created');loadInvoices();
  }catch(e){toast('Error: '+e.message)}
}

function openAddInvItem(){
  openModal(\`
    <h3>Add Line Item</h3>
    <div class="form-group"><label>Description</label><input type="text" id="mIItemDesc"></div>
    <div class="form-row">
      <div class="form-group"><label>Quantity</label><input type="number" id="mIItemQty" value="1" step="0.01"></div>
      <div class="form-group"><label>Unit Price</label><input type="number" id="mIItemPrice" step="0.01" value="0"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitAddInvItem()">Add Item</button></div>
  \`);
}

async function submitAddInvItem(){
  try{
    await apiPost('/api/invoices/'+currentInvId+'/items',{description:document.getElementById('mIItemDesc').value,quantity:parseFloat(document.getElementById('mIItemQty').value)||1,unit_price:parseFloat(document.getElementById('mIItemPrice').value)||0});
    closeModal();toast('Item added');loadInvDetail(currentInvId);
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════
async function loadContacts(){
  try{
    const data=await api('/api/contacts');
    allContacts=data.contacts||[];
    renderContacts(allContacts);
  }catch(e){console.error(e)}
}

function renderContacts(list){
  const tb=document.getElementById('contactsTable');
  tb.innerHTML='';
  if(list.length===0){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">No contacts yet</td></tr>';return}
  list.forEach(c=>{
    tb.innerHTML+=\`<tr class="clickable">
      <td style="font-weight:500">\${esc((c.first_name||'')+' '+(c.last_name||''))}</td>
      <td>\${esc(c.company_name||'--')}</td>
      <td>\${esc(c.email||'--')}</td>
      <td>\${esc(c.phone||'--')}</td>
      <td><span class="badge badge-\${c.type==='lead'?'sent':'accepted'}">\${esc(c.type||'customer')}</span></td>
      <td style="font-weight:500">\${money(c.lifetime_value)}</td>
    </tr>\`;
  });
}

function filterContacts(){
  const q=document.getElementById('contactSearch').value.toLowerCase();
  if(!q){renderContacts(allContacts);return}
  renderContacts(allContacts.filter(c=>{
    return ((c.first_name||'')+' '+(c.last_name||'')+' '+(c.company_name||'')+' '+(c.email||'')+' '+(c.phone||'')).toLowerCase().includes(q);
  }));
}

function openNewContact(){
  openModal(\`
    <h3>New Contact</h3>
    <div class="form-row">
      <div class="form-group"><label>First Name</label><input type="text" id="mCFirst"></div>
      <div class="form-group"><label>Last Name</label><input type="text" id="mCLast"></div>
    </div>
    <div class="form-group"><label>Company</label><input type="text" id="mCCompany"></div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" id="mCEmail"></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="mCPhone"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><select id="mCType"><option>customer</option><option>lead</option><option>vendor</option><option>partner</option></select></div>
      <div class="form-group"><label>Source</label><select id="mCSource"><option value="">--</option><option>website</option><option>referral</option><option>walk-in</option><option>social</option><option>cold-call</option><option>ad</option></select></div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewContact()">Create</button></div>
  \`);
}

async function submitNewContact(){
  try{
    await apiPost('/api/contacts',{first_name:document.getElementById('mCFirst').value,last_name:document.getElementById('mCLast').value,company_name:document.getElementById('mCCompany').value,email:document.getElementById('mCEmail').value,phone:document.getElementById('mCPhone').value,type:document.getElementById('mCType').value,source:document.getElementById('mCSource').value});
    closeModal();toast('Contact created');loadContacts();
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════════
async function loadBookings(){
  try{
    const data=await api('/api/bookings');
    const list=data.bookings||[];
    const tb=document.getElementById('bookingsTable');
    tb.innerHTML='';
    if(list.length===0){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">No bookings yet</td></tr>';return}
    list.forEach(b=>{
      const name=b.first_name?(b.first_name+' '+(b.last_name||'')):'--';
      const bc=badgeClass(b.status);
      tb.innerHTML+=\`<tr>
        <td style="font-weight:500">\${esc(b.title||b.service_name||'Booking')}</td>
        <td>\${esc(name)}</td>
        <td>\${shortDate(b.scheduled_date)}</td>
        <td>\${esc(b.time_start||'--')}</td>
        <td><span class="badge \${bc}">\${esc(b.status)}</span></td>
        <td>\${b.quoted_price?money(b.quoted_price):'--'}</td>
      </tr>\`;
    });
  }catch(e){console.error(e)}
}

function openNewBooking(){
  openModal(\`
    <h3>New Booking</h3>
    <div class="form-group"><label>Title</label><input type="text" id="mBTitle"></div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input type="date" id="mBDate"></div>
      <div class="form-group"><label>Time</label><input type="time" id="mBTime"></div>
    </div>
    <div class="form-group"><label>Contact</label><select id="mBContact"><option value="">-- Select --</option></select></div>
    <div class="form-group"><label>Address</label><input type="text" id="mBAddr"></div>
    <div class="form-group"><label>Quoted Price</label><input type="number" id="mBPrice" step="0.01"></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewBooking()">Create</button></div>
  \`);
  const sel=document.getElementById('mBContact');
  allContacts.forEach(c=>{sel.innerHTML+=\`<option value="\${esc(c.id)}">\${esc((c.first_name||'')+' '+(c.last_name||''))}</option>\`});
}

async function submitNewBooking(){
  try{
    await apiPost('/api/bookings',{title:document.getElementById('mBTitle').value,scheduled_date:document.getElementById('mBDate').value,time_start:document.getElementById('mBTime').value,contact_id:document.getElementById('mBContact').value||null,address:document.getElementById('mBAddr').value,quoted_price:parseFloat(document.getElementById('mBPrice').value)||0});
    closeModal();toast('Booking created');loadBookings();
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// DEALS
// ═══════════════════════════════════════════════
async function loadDeals(){
  try{
    const data=await api('/api/deals');
    const list=data.deals||[];
    const tb=document.getElementById('dealsTable');
    tb.innerHTML='';
    if(list.length===0){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">No deals yet</td></tr>';return}
    list.forEach(d=>{
      const name=d.first_name?(d.first_name+' '+(d.last_name||'')):'--';
      const bc=d.status==='won'?'badge-accepted':d.status==='lost'?'badge-rejected':'badge-sent';
      tb.innerHTML+=\`<tr>
        <td style="font-weight:500">\${esc(d.title)}</td><td>\${esc(name)}</td>
        <td>\${d.stage_name?\`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:\${d.stage_color||'#3B82F6'};margin-right:6px"></span>\${esc(d.stage_name)}\`:'--'}</td>
        <td style="font-weight:600">\${money(d.value)}</td>
        <td>\${d.probability}%</td>
        <td><span class="badge \${bc}">\${esc(d.status)}</span></td>
      </tr>\`;
    });
  }catch(e){console.error(e)}
}

function openNewDeal(){
  openModal(\`
    <h3>New Deal</h3>
    <div class="form-group"><label>Title</label><input type="text" id="mDTitle"></div>
    <div class="form-row">
      <div class="form-group"><label>Value</label><input type="number" id="mDValue" step="0.01"></div>
      <div class="form-group"><label>Expected Close</label><input type="date" id="mDClose"></div>
    </div>
    <div class="form-group"><label>Contact</label><select id="mDContact"><option value="">-- Select --</option></select></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewDeal()">Create</button></div>
  \`);
  const sel=document.getElementById('mDContact');
  allContacts.forEach(c=>{sel.innerHTML+=\`<option value="\${esc(c.id)}">\${esc((c.first_name||'')+' '+(c.last_name||''))}</option>\`});
}

async function submitNewDeal(){
  try{
    await apiPost('/api/deals',{title:document.getElementById('mDTitle').value,value:parseFloat(document.getElementById('mDValue').value)||0,expected_close_date:document.getElementById('mDClose').value,contact_id:document.getElementById('mDContact').value||null});
    closeModal();toast('Deal created');loadDeals();
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════
async function loadTasks(){
  try{
    const data=await api('/api/tasks');
    const list=data.tasks||[];
    const tb=document.getElementById('tasksTable');
    tb.innerHTML='';
    if(list.length===0){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px">No tasks</td></tr>';return}
    list.forEach(t=>{
      const pc=t.priority==='urgent'?'badge-rejected':t.priority==='high'?'badge-overdue':t.priority==='medium'?'badge-sent':'badge-draft';
      const sc=t.status==='completed'?'badge-accepted':t.status==='in_progress'?'badge-sent':'badge-draft';
      tb.innerHTML+=\`<tr>
        <td style="font-weight:500">\${esc(t.title)}</td>
        <td><span class="badge \${pc}">\${esc(t.priority)}</span></td>
        <td><span class="badge \${sc}">\${esc(t.status)}</span></td>
        <td style="color:var(--gray-400);font-size:.8rem">\${shortDate(t.due_date)}</td>
        <td>\${t.status!=='completed'?\`<button class="btn btn-sm btn-success" onclick="completeTask('\${esc(t.id)}')">Done</button>\`:''}</td>
      </tr>\`;
    });
  }catch(e){console.error(e)}
}

async function completeTask(id){try{await apiPut('/api/tasks/'+id,{status:'completed'});toast('Task completed');loadTasks()}catch(e){toast('Error: '+e.message)}}

function openNewTask(){
  openModal(\`
    <h3>New Task</h3>
    <div class="form-group"><label>Title</label><input type="text" id="mTTitle"></div>
    <div class="form-group"><label>Description</label><textarea id="mTDesc" rows="2"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Priority</label><select id="mTPri"><option>medium</option><option>low</option><option>high</option><option>urgent</option></select></div>
      <div class="form-group"><label>Due Date</label><input type="date" id="mTDue"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewTask()">Create</button></div>
  \`);
}

async function submitNewTask(){
  try{
    await apiPost('/api/tasks',{title:document.getElementById('mTTitle').value,description:document.getElementById('mTDesc').value,priority:document.getElementById('mTPri').value,due_date:document.getElementById('mTDue').value});
    closeModal();toast('Task created');loadTasks();
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// NOTEBOOK
// ═══════════════════════════════════════════════
async function loadNotebook(){
  try{
    const data=await api('/api/notebook');
    const list=data.notes||[];
    const el=document.getElementById('notebookList');
    el.innerHTML='';
    if(list.length===0){el.innerHTML='<p style="text-align:center;color:var(--gray-400);padding:20px">No notes yet</p>';return}
    list.forEach(n=>{
      el.innerHTML+=\`<div style="border:1px solid var(--gray-100);border-radius:var(--radius);padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>\${esc(n.title)}</strong>
          <span style="font-size:.75rem;color:var(--gray-400)">\${shortDate(n.created_at)} · \${esc(n.category||'general')}</span>
        </div>
        <p style="font-size:.85rem;color:var(--gray-600)">\${esc((n.content||'').substring(0,300))}\${(n.content||'').length>300?'...':''}</p>
      </div>\`;
    });
  }catch(e){console.error(e)}
}

function openNewNote(){
  openModal(\`
    <h3>New Note</h3>
    <div class="form-group"><label>Title</label><input type="text" id="mNTitle"></div>
    <div class="form-group"><label>Category</label><select id="mNCat"><option>general</option><option>meeting</option><option>idea</option><option>strategy</option><option>reference</option><option>client</option></select></div>
    <div class="form-group"><label>Content</label><textarea id="mNContent" rows="6"></textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitNewNote()">Save Note</button></div>
  \`);
}

async function submitNewNote(){
  try{
    await apiPost('/api/notebook',{title:document.getElementById('mNTitle').value,category:document.getElementById('mNCat').value,content:document.getElementById('mNContent').value});
    closeModal();toast('Note saved');loadNotebook();
  }catch(e){toast('Error: '+e.message)}
}

// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════
function openModal(html){document.getElementById('modalContent').innerHTML=html;document.getElementById('modalOverlay').classList.add('open')}
function closeModal(){document.getElementById('modalOverlay').classList.remove('open')}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function badgeClass(status){
  const m={draft:'badge-draft',sent:'badge-sent',viewed:'badge-viewed',accepted:'badge-accepted',approved:'badge-accepted',rejected:'badge-rejected',converted:'badge-converted',expired:'badge-expired',paid:'badge-paid',overdue:'badge-overdue',partial:'badge-partial',void:'badge-void',pending:'badge-pending',confirmed:'badge-confirmed',completed:'badge-completed',cancelled:'badge-cancelled',needs_scheduling:'badge-needs_scheduling',in_progress:'badge-sent',open:'badge-sent',won:'badge-accepted',lost:'badge-rejected'};
  return m[status]||'badge-draft';
}

// Load contacts in background for selects
(async function(){try{const d=await api('/api/contacts');allContacts=d.contacts||[]}catch(e){}})();
</script>
</body>
</html>`;
}
