// ============================================================
// Enhanced E-Commerce & Logistics Management System : API
// Thin layer over MySQL. The database enforces the business rules:
//   - price lock, stock check/decrease, order total  -> triggers
//   - all-or-nothing order placement                 -> PlaceOrder procedure
//   - auto Shipment on approval, stock restore       -> trigger
// ============================================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ecommerce_db',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL columns come back as numbers, not strings
  dateStrings: true,    // DATE columns come back as 'YYYY-MM-DD' (no timezone shift)
});

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// ---------- helpers ----------
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// auth('Employee') -> only employees; auth() -> any logged-in user
function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Login required' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (requiredRole && req.user.userType !== requiredRole) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
  };
}

const ORDER_WITH_SHIPMENT = `
  SELECT o.OrderID, o.CustomerID, o.OrderDate, o.OrderStatus, o.TotalAmount,
         s.CourierName, s.TrackingNumber, s.EstimatedDelivery
  FROM OrderRecord o
  LEFT JOIN Shipment s ON s.OrderID = o.OrderID`;

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ============================================================
// MODULE 1: USER MANAGEMENT  (SystemUser -> Customer / Employee)
// ============================================================

// Register a new CUSTOMER (SystemUser row + Customer row, one transaction)
app.post('/api/auth/register', wrap(async (req, res) => {
  const { firstName, lastName, email, password, shippingAddress, phoneNumber } = req.body;
  if (!firstName || !lastName || !email || !password || !shippingAddress) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const hash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query(
      `INSERT INTO SystemUser (FirstName, LastName, Email, PasswordHash, UserType)
       VALUES (?, ?, ?, ?, 'Customer')`,
      [firstName, lastName, email, hash]
    );
    await conn.query(
      `INSERT INTO Customer (CustomerID, ShippingAddress, PhoneNumber) VALUES (?, ?, ?)`,
      [u.insertId, shippingAddress, phoneNumber || null]
    );
    await conn.commit();
    res.status(201).json({ userId: u.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    `SELECT UserID, FirstName, LastName, PasswordHash, UserType
     FROM SystemUser WHERE Email = ?`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.PasswordHash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  const name = `${user.FirstName} ${user.LastName}`;
  const token = jwt.sign(
    { userId: user.UserID, userType: user.UserType, name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { userId: user.UserID, name, userType: user.UserType } });
}));

app.get('/api/me', auth(), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.UserID, u.FirstName, u.LastName, u.Email, u.UserType,
            c.ShippingAddress, c.PhoneNumber, e.JobRole
     FROM SystemUser u
     LEFT JOIN Customer c ON c.CustomerID = u.UserID
     LEFT JOIN Employee e ON e.EmployeeID = u.UserID
     WHERE u.UserID = ?`,
    [req.user.userId]
  );
  res.json(rows[0]);
}));

// ============================================================
// MODULE 2: CATALOG MANAGEMENT  (Category 1 -> N Product)
// ============================================================

app.get('/api/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM Category ORDER BY CategoryName');
  res.json(rows);
}));

app.post('/api/categories', auth('Employee'), wrap(async (req, res) => {
  const { categoryName, description } = req.body;
  if (!categoryName) return res.status(400).json({ error: 'categoryName required' });
  const [r] = await pool.query(
    'INSERT INTO Category (CategoryName, Description) VALUES (?, ?)',
    [categoryName, description || null]
  );
  res.status(201).json({ categoryId: r.insertId });
}));

app.get('/api/products', wrap(async (req, res) => {
  const { categoryId } = req.query;
  const sql = `
    SELECT p.ProductID, p.ProductName, p.Price, p.StockQuantity,
           c.CategoryID, c.CategoryName
    FROM Product p
    JOIN Category c ON c.CategoryID = p.CategoryID
    ${categoryId ? 'WHERE p.CategoryID = ?' : ''}
    ORDER BY c.CategoryName, p.ProductName`;
  const [rows] = await pool.query(sql, categoryId ? [categoryId] : []);
  res.json(rows);
}));

app.post('/api/products', auth('Employee'), wrap(async (req, res) => {
  const { categoryId, productName, price, stockQuantity } = req.body;
  if (!categoryId || !productName || price == null) {
    return res.status(400).json({ error: 'categoryId, productName, price required' });
  }
  const [r] = await pool.query(
    `INSERT INTO Product (CategoryID, ProductName, Price, StockQuantity)
     VALUES (?, ?, ?, ?)`,
    [categoryId, productName, price, stockQuantity ?? 0]
  );
  res.status(201).json({ productId: r.insertId });
}));

// Update price and/or stock (send only what changes)
app.patch('/api/products/:id', auth('Employee'), wrap(async (req, res) => {
  const { price, stockQuantity } = req.body;
  const [r] = await pool.query(
    `UPDATE Product
     SET Price = COALESCE(?, Price), StockQuantity = COALESCE(?, StockQuantity)
     WHERE ProductID = ?`,
    [price ?? null, stockQuantity ?? null, req.params.id]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ updated: true });
}));

// ============================================================
// MODULE 3: ORDER MANAGEMENT  (OrderRecord, Order_Item)
// ============================================================

// Place an order. Body: { items: [{ productId, qty }, ...] }
// Calls the PlaceOrder stored procedure: transaction + triggers do the rest.
app.post('/api/orders', auth('Customer'), wrap(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // merge duplicate products (Order_Item has PK on OrderID + ProductID)
  const merged = new Map();
  for (const it of items) {
    const productId = Number(it.productId);
    const qty = Number(it.qty);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid item in cart' });
    }
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }
  const cart = [...merged].map(([productId, qty]) => ({ productId, qty }));

  const conn = await pool.getConnection(); // same connection needed for @oid
  try {
    await conn.query('CALL PlaceOrder(?, ?, @oid)', [req.user.userId, JSON.stringify(cart)]);
    const [[row]] = await conn.query('SELECT @oid AS orderId');
    res.status(201).json({ orderId: row.orderId });
  } finally {
    conn.release();
  }
}));

// Logged-in customer's own orders (with shipment info)
app.get('/api/orders/mine', auth('Customer'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `${ORDER_WITH_SHIPMENT} WHERE o.CustomerID = ? ORDER BY o.OrderID DESC`,
    [req.user.userId]
  );
  res.json(rows);
}));

// All orders for staff (uses the v_order_tracking view)
app.get('/api/orders', auth('Employee'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_order_tracking ORDER BY OrderID DESC');
  res.json(rows);
}));

// One order with its line items (owner or employee only)
app.get('/api/orders/:id', auth(), wrap(async (req, res) => {
  const [orders] = await pool.query(`${ORDER_WITH_SHIPMENT} WHERE o.OrderID = ?`, [req.params.id]);
  const order = orders[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user.userType === 'Customer' && order.CustomerID !== req.user.userId) {
    return res.status(403).json({ error: 'Not your order' });
  }
  const [items] = await pool.query(
    `SELECT oi.ProductID, p.ProductName, oi.Quantity, oi.UnitPrice,
            oi.Quantity * oi.UnitPrice AS LineTotal
     FROM Order_Item oi
     JOIN Product p ON p.ProductID = oi.ProductID
     WHERE oi.OrderID = ?`,
    [req.params.id]
  );
  res.json({ ...order, items });
}));

// Customer cancels their own order (only while Pending). Trigger restores stock.
app.patch('/api/orders/:id/cancel', auth('Customer'), wrap(async (req, res) => {
  const [r] = await pool.query(
    `UPDATE OrderRecord SET OrderStatus = 'Cancelled'
     WHERE OrderID = ? AND CustomerID = ? AND OrderStatus = 'Pending'`,
    [req.params.id, req.user.userId]
  );
  if (r.affectedRows === 0) {
    return res.status(400).json({ error: 'Only your own Pending orders can be cancelled' });
  }
  res.json({ cancelled: true });
}));

// Employee moves an order along. Triggers handle shipment creation / stock restore.
app.patch('/api/orders/:id/status', auth('Employee'), wrap(async (req, res) => {
  const { status } = req.body;
  const allowed = ['Approved', 'Shipped', 'Delivered', 'Cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of ${allowed.join(', ')}` });
  }
  const [rows] = await pool.query('SELECT OrderStatus FROM OrderRecord WHERE OrderID = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  if (['Delivered', 'Cancelled'].includes(rows[0].OrderStatus)) {
    return res.status(400).json({ error: `Order is already ${rows[0].OrderStatus}` });
  }
  await pool.query('UPDATE OrderRecord SET OrderStatus = ? WHERE OrderID = ?', [status, req.params.id]);
  const [updated] = await pool.query(`${ORDER_WITH_SHIPMENT} WHERE o.OrderID = ?`, [req.params.id]);
  res.json(updated[0]);
}));

// ============================================================
// MODULE 4: LOGISTICS & SHIPMENT TRACKING  (Order 1:1 Shipment)
// ============================================================

app.get('/api/shipments', auth('Employee'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.ShipmentID, s.OrderID, s.CourierName, s.TrackingNumber,
            s.EstimatedDelivery, o.OrderStatus
     FROM Shipment s
     JOIN OrderRecord o ON o.OrderID = s.OrderID
     ORDER BY s.ShipmentID DESC`
  );
  res.json(rows);
}));

// Assign courier / change delivery estimate (shipment is auto-created on approval)
app.patch('/api/shipments/:orderId', auth('Employee'), wrap(async (req, res) => {
  const { courierName, estimatedDelivery } = req.body;
  const [r] = await pool.query(
    `UPDATE Shipment
     SET CourierName = COALESCE(?, CourierName),
         EstimatedDelivery = COALESCE(?, EstimatedDelivery)
     WHERE OrderID = ?`,
    [courierName ?? null, estimatedDelivery ?? null, req.params.orderId]
  );
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: 'No shipment for this order (approve the order first)' });
  }
  res.json({ updated: true });
}));

// ============================================================
// MODULE 5: REPORTING & ANALYTICS  (views)
// ============================================================

app.get('/api/reports/category-sales', auth('Employee'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_category_sales ORDER BY TotalRevenue DESC');
  res.json(rows);
}));

app.get('/api/reports/low-stock', auth('Employee'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_low_stock ORDER BY StockQuantity');
  res.json(rows);
}));

app.get('/api/reports/summary', auth('Employee'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM OrderRecord) AS TotalOrders,
       (SELECT COALESCE(SUM(TotalAmount), 0) FROM OrderRecord WHERE OrderStatus <> 'Cancelled') AS Revenue,
       (SELECT COUNT(*) FROM Customer) AS Customers,
       (SELECT COUNT(*) FROM Product WHERE StockQuantity < 10) AS LowStockItems`
  );
  res.json(rows[0]);
}));

// ---------- error handler: turns DB errors into clean messages ----------
app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage }); // trigger SIGNAL
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already exists (duplicate value)' });
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'A value breaks a database rule (e.g. price or quantity must be > 0)' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Referenced record does not exist' });
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));