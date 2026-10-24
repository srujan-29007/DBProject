-- ============================================================
-- Enhanced E-Commerce & Logistics Management System
-- schema.sql  (MySQL 8.0+)
-- ============================================================

DROP DATABASE IF EXISTS ecommerce_db;
CREATE DATABASE ecommerce_db;
USE ecommerce_db;

-- ------------------------------------------------------------
-- MODULE 1: USER MANAGEMENT (IS-A: SystemUser -> Customer/Employee)
-- ------------------------------------------------------------
CREATE TABLE SystemUser (
    UserID       INT AUTO_INCREMENT PRIMARY KEY,
    FirstName    VARCHAR(50)  NOT NULL,
    LastName     VARCHAR(50)  NOT NULL,
    Email        VARCHAR(100) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,          -- needed for app login
    UserType     VARCHAR(20)  NOT NULL,
    CONSTRAINT chk_usertype CHECK (UserType IN ('Customer', 'Employee'))
);

CREATE TABLE Customer (
    CustomerID      INT PRIMARY KEY,
    ShippingAddress VARCHAR(255) NOT NULL,
    PhoneNumber     VARCHAR(15),
    CONSTRAINT fk_customer_user FOREIGN KEY (CustomerID)
        REFERENCES SystemUser(UserID) ON DELETE CASCADE
);

CREATE TABLE Employee (
    EmployeeID INT PRIMARY KEY,
    JobRole    VARCHAR(50) NOT NULL,
    Salary     DECIMAL(10, 2),
    CONSTRAINT fk_employee_user FOREIGN KEY (EmployeeID)
        REFERENCES SystemUser(UserID) ON DELETE CASCADE,
    CONSTRAINT chk_salary CHECK (Salary IS NULL OR Salary > 0)
);

-- ------------------------------------------------------------
-- MODULE 2: CATALOG MANAGEMENT (Category 1 -> N Product)
-- ------------------------------------------------------------
CREATE TABLE Category (
    CategoryID   INT AUTO_INCREMENT PRIMARY KEY,
    CategoryName VARCHAR(100) NOT NULL UNIQUE,
    Description  VARCHAR(500)
);

CREATE TABLE Product (
    ProductID     INT AUTO_INCREMENT PRIMARY KEY,
    CategoryID    INT NOT NULL,
    ProductName   VARCHAR(100)  NOT NULL,
    Price         DECIMAL(10, 2) NOT NULL,
    StockQuantity INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_product_category FOREIGN KEY (CategoryID)
        REFERENCES Category(CategoryID) ON DELETE RESTRICT,
    CONSTRAINT chk_price CHECK (Price > 0),
    CONSTRAINT chk_stock CHECK (StockQuantity >= 0)
);

-- ------------------------------------------------------------
-- MODULE 3: ORDER MANAGEMENT (Customer 1 -> N Order, Order M:N Product)
-- ------------------------------------------------------------
CREATE TABLE OrderRecord (
    OrderID     INT AUTO_INCREMENT PRIMARY KEY,
    CustomerID  INT NOT NULL,
    OrderDate   DATE NOT NULL,
    TotalAmount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    OrderStatus VARCHAR(30) NOT NULL DEFAULT 'Pending',
    CONSTRAINT fk_order_customer FOREIGN KEY (CustomerID)
        REFERENCES Customer(CustomerID) ON DELETE RESTRICT,
    CONSTRAINT chk_orderstatus CHECK (
        OrderStatus IN ('Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled')
    )
);

CREATE TABLE Order_Item (
    OrderID   INT NOT NULL,
    ProductID INT NOT NULL,
    Quantity  INT NOT NULL,
    UnitPrice DECIMAL(10, 2) NOT NULL,           -- price locked at purchase time
    PRIMARY KEY (OrderID, ProductID),
    CONSTRAINT fk_item_order FOREIGN KEY (OrderID)
        REFERENCES OrderRecord(OrderID) ON DELETE CASCADE,
    CONSTRAINT fk_item_product FOREIGN KEY (ProductID)
        REFERENCES Product(ProductID) ON DELETE RESTRICT,
    CONSTRAINT chk_quantity CHECK (Quantity > 0),
    CONSTRAINT chk_unitprice CHECK (UnitPrice > 0)
);

-- ------------------------------------------------------------
-- MODULE 4: LOGISTICS & SHIPMENT TRACKING (Order 1 : 1 Shipment)
-- ------------------------------------------------------------
CREATE TABLE Shipment (
    ShipmentID        INT AUTO_INCREMENT PRIMARY KEY,
    OrderID           INT NOT NULL UNIQUE,       -- UNIQUE enforces the 1:1 rule
    CourierName       VARCHAR(50)  NOT NULL DEFAULT 'Unassigned',
    TrackingNumber    VARCHAR(100) NOT NULL UNIQUE,
    EstimatedDelivery DATE,
    CONSTRAINT fk_shipment_order FOREIGN KEY (OrderID)
        REFERENCES OrderRecord(OrderID) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Indexes for common lookups
-- ------------------------------------------------------------
CREATE INDEX idx_product_category ON Product(CategoryID);
CREATE INDEX idx_order_customer   ON OrderRecord(CustomerID);
CREATE INDEX idx_order_status     ON OrderRecord(OrderStatus);