import { useState, useEffect } from 'react';
import { api } from './api.js';

const STEPS = ['Pending', 'Approved', 'Shipped', 'Delivered'];
const NEXT = { Pending: 'Approved', Approved: 'Shipped', Shipped: 'Delivered' };
const LABEL = { Approved: 'Approve order', Shipped: 'Mark as shipped', Delivered: 'Mark as delivered' };
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');

// GET helper: returns [data, reload]
function useGet(path, token) {
  const [data, setData] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => { api(path, { token }).then(setData).catch(() => setData([])); }, [path, n]);
  return [data, () => setN((x) => x + 1)];
}

// The tracking strip: one tape segment per stage
function Track({ status }) {
  if (status === 'Cancelled') return <p className="cancelled">Cancelled</p>;
  const at = STEPS.indexOf(status);
  return <ol className="track">{STEPS.map((s, i) => <li key={s} className={i <= at ? 'done' : ''}>{s}</li>)}</ol>;
}

// ---------- Module 1: login / register ----------
function Auth({ onLogin }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({});
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      if (reg) await api('/auth/register', { method: 'POST', body: f });
      onLogin(await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } }));
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="auth" onSubmit={submit}>
      <h2>{reg ? 'Create your account' : 'Sign in'}</h2>
      {reg && <>
        <input placeholder="First name" required onChange={set('firstName')} />
        <input placeholder="Last name" required onChange={set('lastName')} />
        <input placeholder="Shipping address" required onChange={set('shippingAddress')} />
        <input placeholder="Phone number" onChange={set('phoneNumber')} />
      </>}
      <input type="email" placeholder="Email" required onChange={set('email')} />
      <input type="password" placeholder="Password" required onChange={set('password')} />
      {err && <p className="err">{err}</p>}
      <button className="primary">{reg ? 'Create account' : 'Sign in'}</button>
      <button type="button" onClick={() => setReg(!reg)}>{reg ? 'I already have an account' : 'New customer? Register'}</button>
      {!reg && <p className="hint">Demo: arjun.kumar@mail.com (customer) or meena.iyer@shop.com (staff). Password: password123</p>}
    </form>
  );
}

// ---------- Module 2 + 3: catalog and cart ----------
function Shop({ token }) {
  const [cats] = useGet('/categories');
  const [prods, reload] = useGet('/products');
  const [cat, setCat] = useState(0);
  const [cart, setCart] = useState({});
  const [msg, setMsg] = useState(null);
  const all = prods || [];
  const lines = all.filter((p) => cart[p.ProductID] > 0);
  const total = lines.reduce((s, p) => s + p.Price * cart[p.ProductID], 0);
  const step = (p, d) => setCart((c) => ({ ...c, [p.ProductID]: Math.max(0, Math.min((c[p.ProductID] || 0) + d, p.StockQuantity)) }));
  const checkout = async () => {
    try {
      const items = lines.map((p) => ({ productId: p.ProductID, qty: cart[p.ProductID] }));
      const r = await api('/orders', { method: 'POST', token, body: { items } });
      setMsg({ ok: `Order #${r.orderId} placed. Follow it under My orders.` }); setCart({});
    } catch (e) { setMsg({ err: e.message }); }
    reload();
  };
  return (
    <div className="shop">
      <section>
        <h2>Shop</h2>
        <div className="pills">
          {[{ CategoryID: 0, CategoryName: 'All' }, ...(cats || [])].map((c) =>
            <button key={c.CategoryID} className={cat === c.CategoryID ? 'on' : ''} onClick={() => setCat(c.CategoryID)}>{c.CategoryName}</button>)}
        </div>
        {all.filter((p) => !cat || p.CategoryID === cat).map((p) => (
          <div className="prod" key={p.ProductID}>
            <div>{p.ProductName}<small>{p.CategoryName}</small></div>
            <div>{money(p.Price)}<small className={p.StockQuantity < 10 ? 'low' : ''}>{p.StockQuantity ? `${p.StockQuantity} in stock` : 'Out of stock'}</small></div>
            <div className="step">
              <button disabled={!cart[p.ProductID]} onClick={() => step(p, -1)} aria-label={`Remove one ${p.ProductName}`}>−</button>
              {cart[p.ProductID] || 0}
              <button disabled={p.StockQuantity === 0 || cart[p.ProductID] >= p.StockQuantity} onClick={() => step(p, 1)} aria-label={`Add one ${p.ProductName}`}>+</button>
            </div>
          </div>
        ))}
      </section>
      <aside>
        <h3>Your cart</h3>
        {lines.length === 0 && <p className="muted">Add products to start an order.</p>}
        {lines.map((p) => <div className="line" key={p.ProductID}><span>{cart[p.ProductID]} × {p.ProductName}</span><span>{money(p.Price * cart[p.ProductID])}</span></div>)}
        {lines.length > 0 && <div className="line total"><span>Total</span><span>{money(total)}</span></div>}
        <button className="primary" style={{ width: '100%', marginTop: '.75rem' }} disabled={!lines.length} onClick={checkout}>Place order</button>
        {msg && <p className={msg.ok ? 'good' : 'err'}>{msg.ok || msg.err}</p>}
      </aside>
    </div>
  );
}

// ---------- Module 3 + 4: one order card, used by customers and staff ----------
function Order({ o, token, staff, reload }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [courier, setCourier] = useState(o.CourierName || '');
  const [err, setErr] = useState('');
  const toggle = async () => { if (!open && !d) setD(await api('/orders/' + o.OrderID, { token })); setOpen(!open); };
  const act = async (fn) => { setErr(''); try { await fn(); reload(); } catch (e) { setErr(e.message); } };
  const setStatus = (status) => act(() => api(`/orders/${o.OrderID}/status`, { method: 'PATCH', token, body: { status } }));
  const live = !['Delivered', 'Cancelled'].includes(o.OrderStatus);
  return (
    <article className="order">
      <header onClick={toggle}>
        <b>Order #{o.OrderID}</b>
        {staff && <span>{o.CustomerName}</span>}
        <span className="muted">{o.OrderDate}</span>
        <b>{money(o.TotalAmount)}</b>
      </header>
      <Track status={o.OrderStatus} />
      {o.TrackingNumber && <p>Courier: {o.CourierName}. Tracking <code>{o.TrackingNumber}</code>. Expected by {o.EstimatedDelivery}.</p>}
      {open && d && (
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
          <tbody>{d.items.map((i) => <tr key={i.ProductID}><td>{i.ProductName}</td><td>{i.Quantity}</td><td>{money(i.UnitPrice)}</td><td>{money(i.LineTotal)}</td></tr>)}</tbody>
        </table>
      )}
      <div className="actions">
        {staff && live && <>
          {NEXT[o.OrderStatus] && <button className="primary" onClick={() => setStatus(NEXT[o.OrderStatus])}>{LABEL[NEXT[o.OrderStatus]]}</button>}
          {o.TrackingNumber && <>
            <input value={courier} placeholder="Courier name" onChange={(e) => setCourier(e.target.value)} />
            <button onClick={() => act(() => api('/shipments/' + o.OrderID, { method: 'PATCH', token, body: { courierName: courier } }))}>Save courier</button>
          </>}
          <button onClick={() => setStatus('Cancelled')}>Cancel order</button>
        </>}
        {!staff && o.OrderStatus === 'Pending' && <button onClick={() => act(() => api(`/orders/${o.OrderID}/cancel`, { method: 'PATCH', token }))}>Cancel order</button>}
        {err && <span className="err">{err}</span>}
      </div>
    </article>
  );
}

function MyOrders({ token }) {
  const [orders, reload] = useGet('/orders/mine', token);
  return <><h2>My orders</h2>
    {orders && !orders.length && <p className="muted">No orders yet. Pick something from the shop.</p>}
    {(orders || []).map((o) => <Order key={o.OrderID} o={o} token={token} reload={reload} />)}</>;
}

// ---------- Staff views ----------
function StaffOrders({ token }) {
  const [orders, reload] = useGet('/orders', token);
  return <><h2>All orders</h2>{(orders || []).map((o) => <Order key={o.OrderID} o={o} token={token} staff reload={reload} />)}</>;
}

function Overview({ token }) {
  const [s] = useGet('/reports/summary', token);
  const [sales] = useGet('/reports/category-sales', token);
  const [low] = useGet('/reports/low-stock', token);
  return (<>
    <h2>Overview</h2>
    {s && s.TotalOrders !== undefined && <dl className="stats">
      <div><dt>Orders</dt><dd>{s.TotalOrders}</dd></div>
      <div><dt>Revenue (excl. cancelled)</dt><dd>{money(s.Revenue)}</dd></div>
      <div><dt>Customers</dt><dd>{s.Customers}</dd></div>
      <div><dt>Low-stock products</dt><dd>{s.LowStockItems}</dd></div>
    </dl>}
    <h3>Sales by category</h3>
    <table><thead><tr><th>Category</th><th>Units sold</th><th>Revenue</th></tr></thead>
      <tbody>{(sales || []).map((r) => <tr key={r.CategoryID}><td>{r.CategoryName}</td><td>{r.TotalUnitsSold}</td><td>{money(r.TotalRevenue)}</td></tr>)}</tbody></table>
    <h3>Running low (under 10 units)</h3>
    <table><thead><tr><th>Product</th><th>Category</th><th>Stock</th></tr></thead>
      <tbody>{(low || []).map((r) => <tr key={r.ProductID}><td>{r.ProductName}</td><td>{r.CategoryName}</td><td className="low">{r.StockQuantity}</td></tr>)}</tbody></table>
  </>);
}

function ProductRow({ p, token, reload }) {
  const [price, setPrice] = useState(p.Price);
  const [stock, setStock] = useState(p.StockQuantity);
  const [err, setErr] = useState('');
  const save = async () => {
    try { await api('/products/' + p.ProductID, { method: 'PATCH', token, body: { price: Number(price), stockQuantity: Number(stock) } }); setErr(''); reload(); }
    catch (e) { setErr(e.message); }
  };
  return (<tr>
    <td>{p.ProductName}</td><td>{p.CategoryName}</td>
    <td><input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
    <td><input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} /></td>
    <td><button onClick={save}>Save</button> {err && <span className="err">{err}</span>}</td>
  </tr>);
}

function Products({ token }) {
  const [prods, reload] = useGet('/products');
  return (<><h2>Products and stock</h2>
    <table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
      <tbody>{(prods || []).map((p) => <ProductRow key={p.ProductID} p={p} token={token} reload={reload} />)}</tbody></table></>);
}

// ---------- App shell ----------
export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('session') || 'null'));
  const [page, setPage] = useState('');
  if (!session) return <Auth onLogin={(d) => { localStorage.setItem('session', JSON.stringify(d)); setSession(d); setPage(''); }} />;

  const { token, user } = session;
  const staff = user.userType === 'Employee';
  const tabs = staff ? ['Overview', 'Orders', 'Products'] : ['Shop', 'My orders'];
  const current = tabs.includes(page) ? page : tabs[0];
  const logout = () => { localStorage.removeItem('session'); setSession(null); };

  return (<>
    <nav className="bar">
      <b>Parcelwise</b>
      {tabs.map((t) => <button key={t} className={t === current ? 'on' : ''} onClick={() => setPage(t)}>{t}</button>)}
      <span>{user.name}</span>
      <button onClick={logout}>Sign out</button>
    </nav>
    <main>
      {current === 'Shop' && <Shop token={token} />}
      {current === 'My orders' && <MyOrders token={token} />}
      {current === 'Overview' && <Overview token={token} />}
      {current === 'Orders' && <StaffOrders token={token} />}
      {current === 'Products' && <Products token={token} />}
    </main>
  </>);
}