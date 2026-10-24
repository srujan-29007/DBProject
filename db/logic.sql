-- ============================================================
-- logic.sql : triggers, stored procedure, views
-- Run AFTER schema.sql and seed.sql
-- ============================================================
USE ecommerce_db;

DROP TRIGGER IF EXISTS trg_item_before_insert;
DROP TRIGGER IF EXISTS trg_item_after_insert;
DROP TRIGGER IF EXISTS trg_order_after_update;
DROP PROCEDURE IF EXISTS PlaceOrder;

DELIMITER $$

-- ------------------------------------------------------------
-- TRIGGER 1: lock the unit price at purchase time and block
--            the insert when stock is insufficient
-- ------------------------------------------------------------
CREATE TRIGGER trg_item_before_insert
BEFORE INSERT ON Order_Item
FOR EACH ROW
BEGIN
    DECLARE v_price DECIMAL(10,2);
    DECLARE v_stock INT;

    SELECT Price, StockQuantity INTO v_price, v_stock
    FROM Product
    WHERE ProductID = NEW.ProductID;

    IF v_stock < NEW.Quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock';
    END IF;

    -- Whatever UnitPrice was supplied, overwrite with the current price
    SET NEW.UnitPrice = v_price;
END$$

-- ------------------------------------------------------------
-- TRIGGER 2: reduce stock and grow the order total
-- ------------------------------------------------------------
CREATE TRIGGER trg_item_after_insert
AFTER INSERT ON Order_Item
FOR EACH ROW
BEGIN
    UPDATE Product
    SET StockQuantity = StockQuantity - NEW.Quantity
    WHERE ProductID = NEW.ProductID;

    UPDATE OrderRecord
    SET TotalAmount = TotalAmount + (NEW.Quantity * NEW.UnitPrice)
    WHERE OrderID = NEW.OrderID;
END$$

-- ------------------------------------------------------------
-- TRIGGER 3: order status changes
--   a) Approved  -> auto-create exactly one Shipment (1:1 rule)
--   b) Cancelled -> give the stock back
-- ------------------------------------------------------------
CREATE TRIGGER trg_order_after_update
AFTER UPDATE ON OrderRecord
FOR EACH ROW
BEGIN
    IF NEW.OrderStatus = 'Approved' AND OLD.OrderStatus <> 'Approved' THEN
        IF NOT EXISTS (SELECT 1 FROM Shipment WHERE OrderID = NEW.OrderID) THEN
            INSERT INTO Shipment (OrderID, CourierName, TrackingNumber, EstimatedDelivery)
            VALUES (
                NEW.OrderID,
                'Unassigned',
                CONCAT('TRK', LPAD(NEW.OrderID, 6, '0'), FLOOR(RAND() * 9000 + 1000)),
                DATE_ADD(CURDATE(), INTERVAL 5 DAY)
            );
        END IF;
    END IF;

    IF NEW.OrderStatus = 'Cancelled' AND OLD.OrderStatus <> 'Cancelled' THEN
        UPDATE Product p
        JOIN Order_Item oi ON oi.ProductID = p.ProductID
        SET p.StockQuantity = p.StockQuantity + oi.Quantity
        WHERE oi.OrderID = NEW.OrderID;
    END IF;
END$$

-- ------------------------------------------------------------
-- PROCEDURE: place an order from a JSON cart, all-or-nothing
--   p_items example: [{"productId":1,"qty":2},{"productId":3,"qty":1}]
-- ------------------------------------------------------------
CREATE PROCEDURE PlaceOrder(
    IN  p_customer_id INT,
    IN  p_items       JSON,
    OUT p_order_id    INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_order_id = NULL;
        RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO OrderRecord (CustomerID, OrderDate, TotalAmount, OrderStatus)
    VALUES (p_customer_id, CURDATE(), 0, 'Pending');

    SET p_order_id = LAST_INSERT_ID();

    -- UnitPrice 0.01 is only a placeholder; trg_item_before_insert replaces it
    INSERT INTO Order_Item (OrderID, ProductID, Quantity, UnitPrice)
    SELECT p_order_id, jt.productId, jt.qty, 0.01
    FROM JSON_TABLE(
        p_items, '$[*]'
        COLUMNS (
            productId INT PATH '$.productId',
            qty       INT PATH '$.qty'
        )
    ) AS jt;

    COMMIT;
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- VIEWS (Module 5: Reporting & Analytics)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_category_sales AS
SELECT  c.CategoryID,
        c.CategoryName,
        COALESCE(SUM(CASE WHEN o.OrderID IS NOT NULL THEN oi.Quantity ELSE 0 END), 0)
            AS TotalUnitsSold,
        COALESCE(SUM(CASE WHEN o.OrderID IS NOT NULL THEN oi.Quantity * oi.UnitPrice ELSE 0 END), 0)
            AS TotalRevenue
FROM Category c
LEFT JOIN Product     p  ON p.CategoryID = c.CategoryID
LEFT JOIN Order_Item  oi ON oi.ProductID = p.ProductID
LEFT JOIN OrderRecord o  ON o.OrderID = oi.OrderID AND o.OrderStatus <> 'Cancelled'
GROUP BY c.CategoryID, c.CategoryName;

CREATE OR REPLACE VIEW v_order_tracking AS
SELECT  o.OrderID,
        CONCAT(u.FirstName, ' ', u.LastName) AS CustomerName,
        o.OrderDate,
        o.OrderStatus,
        o.TotalAmount,
        s.CourierName,
        s.TrackingNumber,
        s.EstimatedDelivery
FROM OrderRecord o
JOIN SystemUser u ON u.UserID = o.CustomerID
LEFT JOIN Shipment s ON s.OrderID = o.OrderID;

CREATE OR REPLACE VIEW v_low_stock AS
SELECT  p.ProductID,
        p.ProductName,
        c.CategoryName,
        p.StockQuantity
FROM Product p
JOIN Category c ON c.CategoryID = p.CategoryID
WHERE p.StockQuantity < 10;