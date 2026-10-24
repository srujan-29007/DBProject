-- ============================================================
-- seed.sql : sample data
-- Run AFTER schema.sql and BEFORE logic.sql
-- (triggers are not active yet, so we insert totals/stock directly)
-- ============================================================
USE ecommerce_db;

-- ---------- MODULE 1: USERS ----------
INSERT INTO SystemUser (UserID, FirstName, LastName, Email, PasswordHash, UserType) VALUES
(1, 'Arjun',  'Kumar',   'arjun.kumar@mail.com',   'hash_demo', 'Customer'),
(2, 'Priya',  'Sharma',  'priya.sharma@mail.com',  'hash_demo', 'Customer'),
(3, 'Rahul',  'Verma',   'rahul.verma@mail.com',   'hash_demo', 'Customer'),
(4, 'Meena',  'Iyer',    'meena.iyer@shop.com',    'hash_demo', 'Employee'),
(5, 'Karthik','Raj',     'karthik.raj@shop.com',   'hash_demo', 'Employee');

INSERT INTO Customer (CustomerID, ShippingAddress, PhoneNumber) VALUES
(1, '12 Anna Nagar, Chennai, Tamil Nadu 600040', '9876500001'),
(2, '45 Gandhi Road, Vellore, Tamil Nadu 632001', '9876500002'),
(3, '8 MG Road, Bengaluru, Karnataka 560001',     '9876500003');

INSERT INTO Employee (EmployeeID, JobRole, Salary) VALUES
(4, 'Store Manager',      55000.00),
(5, 'Logistics Executive', 32000.00);

-- ---------- MODULE 2: CATALOG ----------
INSERT INTO Category (CategoryID, CategoryName, Description) VALUES
(1, 'Electronics',     'Gadgets and accessories'),
(2, 'Books',           'Textbooks and reference books'),
(3, 'Clothing',        'Everyday apparel'),
(4, 'Home & Kitchen',  'Household and kitchen items');

INSERT INTO Product (ProductID, CategoryID, ProductName, Price, StockQuantity) VALUES
(1,  1, 'Wireless Mouse',           799.00,  50),
(2,  1, 'Bluetooth Headphones',    2499.00,   8),
(3,  1, 'USB-C Charger',            999.00,  30),
(4,  1, 'Power Bank 10000mAh',     1799.00,   5),
(5,  2, 'SQL Fundamentals',         450.00,  40),
(6,  2, 'Database System Concepts',1200.00,  15),
(7,  2, 'Python Crash Course',      650.00,   7),
(8,  3, 'Cotton T-Shirt',           399.00, 100),
(9,  3, 'Denim Jeans',             1499.00,  25),
(10, 3, 'Hooded Sweatshirt',       1299.00,   9),
(11, 4, 'Steel Water Bottle',       499.00,  60),
(12, 4, 'Non-stick Pan',            899.00,  18),
(13, 4, 'Electric Kettle',         1199.00,   6);

-- ---------- MODULE 3: ORDERS ----------
INSERT INTO OrderRecord (OrderID, CustomerID, OrderDate, TotalAmount, OrderStatus) VALUES
(1, 1, '2026-10-10', 3547.00, 'Delivered'),
(2, 1, '2026-10-18', 3297.00, 'Shipped'),
(3, 2, '2026-10-20', 2099.00, 'Approved'),
(4, 3, '2026-10-22', 1497.00, 'Pending'),
(5, 2, '2026-10-15', 3098.00, 'Cancelled');

INSERT INTO Order_Item (OrderID, ProductID, Quantity, UnitPrice) VALUES
-- Order 1: 2x799 + 450 + 1499 = 3547
(1, 1, 2,  799.00),
(1, 5, 1,  450.00),
(1, 9, 1, 1499.00),
-- Order 2: 2499 + 2x399 = 3297
(2, 2, 1, 2499.00),
(2, 8, 2,  399.00),
-- Order 3: 1200 + 899 = 2099
(3, 6, 1, 1200.00),
(3, 12,1,  899.00),
-- Order 4: 3x499 = 1497
(4, 11,3,  499.00),
-- Order 5 (cancelled): 1799 + 1299 = 3098
(5, 4, 1, 1799.00),
(5, 10,1, 1299.00);

-- ---------- MODULE 4: SHIPMENTS (only Approved/Shipped/Delivered) ----------
INSERT INTO Shipment (ShipmentID, OrderID, CourierName, TrackingNumber, EstimatedDelivery) VALUES
(1, 1, 'Delhivery',  'DLV1001', '2026-10-15'),
(2, 2, 'BlueDart',   'BDT1002', '2026-10-26'),
(3, 3, 'Unassigned', 'UNA1003', '2026-10-27');