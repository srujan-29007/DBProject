# Project: Enhanced E-Commerce & Logistics Management System
DBMS course project. Focus is database design; app is a thin full-stack layer.

## Stack
- DB: MySQL 8
- Backend: Node.js + Express + mysql2
- Frontend: React (Vite)

## Modules
1. User Management: SystemUser, Customer, Employee (IS-A, strict specialization)
2. Catalog Management: Category (1) -> Product (N)
3. Order Management: OrderRecord, Order_Item (M:N bridge between Order and Product)
4. Logistics & Shipment Tracking: Shipment (1:1 with OrderRecord)
5. Reporting & Analytics: views and queries

## Tables
- SystemUser(UserID PK, FirstName, LastName, Email UNIQUE, UserType)
- Customer(CustomerID PK/FK->SystemUser, ShippingAddress, PhoneNumber)
- Employee(EmployeeID PK/FK->SystemUser, JobRole, Salary)
- Category(CategoryID PK, CategoryName UNIQUE, Description)
- Product(ProductID PK, CategoryID FK, ProductName, Price, StockQuantity)
- OrderRecord(OrderID PK, CustomerID FK, OrderDate, TotalAmount, OrderStatus)
- Order_Item(OrderID, ProductID composite PK, Quantity, UnitPrice)
- Shipment(ShipmentID PK, OrderID UNIQUE FK, CourierName, TrackingNumber UNIQUE, EstimatedDelivery)

## Rules
- UserType must be 'Customer' or 'Employee'
- Quantity > 0, Price > 0, UnitPrice > 0
- UnitPrice is locked from Product.Price at purchase time
- Each approved order auto-creates exactly one Shipment
- Stock decreases on order; block order if stock is insufficient

## Working style
- Build one phase at a time; DB first, then backend, then frontend
- Keep code simple and commented; this is a student submission