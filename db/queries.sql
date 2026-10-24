-- ============================================================
-- queries.sql : demo queries for screenshots
-- Run with:  mysql -u root -t -e "source db/queries.sql"
-- ============================================================
USE ecommerce_db;

SELECT '=== Q1. IS-A join: every user with their role details ===' AS Query_;
SELECT u.UserID,
       CONCAT(u.FirstName, ' ', u.LastName) AS FullName,
       u.UserType,
       c.ShippingAddress,
       e.JobRole
FROM SystemUser u
LEFT JOIN Customer c ON c.CustomerID = u.UserID
LEFT JOIN Employee e ON e.EmployeeID = u.UserID;

SELECT '=== Q2. Full order lines: customer, product, category, line total ===' AS Query_;
SELECT o.OrderID,
       CONCAT(u.FirstName, ' ', u.LastName) AS Customer,
       p.ProductName,
       cat.CategoryName,
       oi.Quantity,
       oi.UnitPrice,
       oi.Quantity * oi.UnitPrice AS LineTotal
FROM OrderRecord o
JOIN Customer c    ON c.CustomerID = o.CustomerID
JOIN SystemUser u  ON u.UserID = c.CustomerID
JOIN Order_Item oi ON oi.OrderID = o.OrderID
JOIN Product p     ON p.ProductID = oi.ProductID
JOIN Category cat  ON cat.CategoryID = p.CategoryID
ORDER BY o.OrderID, p.ProductName;

SELECT '=== Q3. GROUP BY + HAVING: customers who spent over 3000 (excl. cancelled) ===' AS Query_;
SELECT CONCAT(u.FirstName, ' ', u.LastName) AS Customer,
       COUNT(DISTINCT o.OrderID)            AS Orders,
       SUM(oi.Quantity * oi.UnitPrice)      AS TotalSpent
FROM SystemUser u
JOIN OrderRecord o ON o.CustomerID = u.UserID
JOIN Order_Item oi ON oi.OrderID = o.OrderID
WHERE o.OrderStatus <> 'Cancelled'
GROUP BY u.UserID, u.FirstName, u.LastName
HAVING SUM(oi.Quantity * oi.UnitPrice) > 3000
ORDER BY TotalSpent DESC;

SELECT '=== Q4. Top 3 best-selling products by units ===' AS Query_;
SELECT p.ProductName,
       SUM(oi.Quantity) AS UnitsSold
FROM Product p
JOIN Order_Item oi ON oi.ProductID = p.ProductID
JOIN OrderRecord o ON o.OrderID = oi.OrderID
WHERE o.OrderStatus <> 'Cancelled'
GROUP BY p.ProductID, p.ProductName
ORDER BY UnitsSold DESC
LIMIT 3;

SELECT '=== Q5. Subquery: products priced above the catalogue average ===' AS Query_;
SELECT ProductName, Price
FROM Product
WHERE Price > (SELECT AVG(Price) FROM Product)
ORDER BY Price DESC;

SELECT '=== Q6. Correlated subquery: products never ordered ===' AS Query_;
SELECT p.ProductID, p.ProductName
FROM Product p
WHERE NOT EXISTS (
    SELECT 1 FROM Order_Item oi WHERE oi.ProductID = p.ProductID
);

SELECT '=== Q7. Average order value per status ===' AS Query_;
SELECT OrderStatus,
       COUNT(*)         AS Orders,
       AVG(TotalAmount) AS AvgOrderValue
FROM OrderRecord
GROUP BY OrderStatus
ORDER BY Orders DESC;

SELECT '=== Q8. Logistics: shipments still waiting for a courier ===' AS Query_;
SELECT s.ShipmentID, s.OrderID, s.TrackingNumber, s.EstimatedDelivery,
       o.OrderStatus
FROM Shipment s
JOIN OrderRecord o ON o.OrderID = s.OrderID
WHERE s.CourierName = 'Unassigned';

SELECT '=== Q9. Integrity check: users whose UserType has no matching role row (expect 0 rows) ===' AS Query_;
SELECT u.UserID, u.UserType
FROM SystemUser u
LEFT JOIN Customer c ON c.CustomerID = u.UserID
LEFT JOIN Employee e ON e.EmployeeID = u.UserID
WHERE (u.UserType = 'Customer' AND c.CustomerID IS NULL)
   OR (u.UserType = 'Employee' AND e.EmployeeID IS NULL);

SELECT '=== Q10. Integrity check: orders without exactly one shipment when Approved/Shipped/Delivered (expect 0 rows) ===' AS Query_;
SELECT o.OrderID, o.OrderStatus
FROM OrderRecord o
LEFT JOIN Shipment s ON s.OrderID = o.OrderID
WHERE o.OrderStatus IN ('Approved', 'Shipped', 'Delivered')
  AND s.ShipmentID IS NULL;