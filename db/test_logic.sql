-- ============================================================
-- test_logic.sql : demo of every trigger, the procedure and the views
-- Run with:  mysql -u root -t --force -e "source db/test_logic.sql"
-- (--force keeps going after the deliberate error in step 3)
-- ============================================================
USE ecommerce_db;

SELECT '=== 1. STOCK BEFORE ORDER ===' AS Step;
SELECT ProductID, ProductName, Price, StockQuantity
FROM Product WHERE ProductID IN (1, 2);
SELECT COUNT(*) AS OrdersBefore FROM OrderRecord;

SELECT '=== 2. PlaceOrder (price lock + stock decrease + total) ===' AS Step;
CALL PlaceOrder(2, '[{"productId":1,"qty":2},{"productId":2,"qty":1}]', @oid);
SELECT @oid AS NewOrderID;
SELECT * FROM OrderRecord WHERE OrderID = @oid;
SELECT * FROM Order_Item  WHERE OrderID = @oid;
SELECT ProductID, ProductName, StockQuantity AS StockAfter
FROM Product WHERE ProductID IN (1, 2);

SELECT '=== 3. INSUFFICIENT STOCK (expect ERROR 1644 below) ===' AS Step;
CALL PlaceOrder(2, '[{"productId":4,"qty":99}]', @bad);
SELECT COUNT(*) AS OrdersAfterFailedAttempt FROM OrderRecord;  -- unchanged: rolled back

SELECT '=== 4. APPROVE ORDER -> auto Shipment (1:1) ===' AS Step;
SELECT COUNT(*) AS ShipmentsBeforeApproval FROM Shipment WHERE OrderID = @oid;
UPDATE OrderRecord SET OrderStatus = 'Approved' WHERE OrderID = @oid;
SELECT * FROM Shipment WHERE OrderID = @oid;                   -- created by trigger

SELECT '=== 5. CANCEL ORDER -> stock restored ===' AS Step;
CALL PlaceOrder(3, '[{"productId":3,"qty":4}]', @oid2);
SELECT ProductID, ProductName, StockQuantity AS StockAfterOrder
FROM Product WHERE ProductID = 3;
UPDATE OrderRecord SET OrderStatus = 'Cancelled' WHERE OrderID = @oid2;
SELECT ProductID, ProductName, StockQuantity AS StockAfterCancel
FROM Product WHERE ProductID = 3;

SELECT '=== 6. VIEW: v_category_sales ===' AS Step;
SELECT * FROM v_category_sales;

SELECT '=== 7. VIEW: v_order_tracking ===' AS Step;
SELECT * FROM v_order_tracking;

SELECT '=== 8. VIEW: v_low_stock ===' AS Step;
SELECT * FROM v_low_stock;