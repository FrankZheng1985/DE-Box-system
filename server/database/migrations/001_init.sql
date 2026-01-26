-- 德国Box运输管理系统 - 数据库初始化脚本
-- PostgreSQL

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    avatar VARCHAR(500),
    role VARCHAR(50) DEFAULT 'operator',
    status VARCHAR(20) DEFAULT 'active',
    last_login_time TIMESTAMP,
    last_login_ip VARCHAR(50),
    login_count INTEGER DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    role_code VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    create_time TIMESTAMP DEFAULT NOW()
);

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    permission_code VARCHAR(100) UNIQUE NOT NULL,
    permission_name VARCHAR(100) NOT NULL,
    module VARCHAR(50),
    description TEXT,
    category VARCHAR(50),
    create_time TIMESTAMP DEFAULT NOW()
);

-- 角色权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_code VARCHAR(50) NOT NULL,
    permission_code VARCHAR(100) NOT NULL,
    UNIQUE(role_code, permission_code)
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    update_time TIMESTAMP DEFAULT NOW()
);

-- 基础数据表
CREATE TABLE IF NOT EXISTS basic_data (
    id VARCHAR(50) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    sort_order INTEGER DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 系统消息表
CREATE TABLE IF NOT EXISTS system_messages (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    type VARCHAR(50) DEFAULT 'info',
    status VARCHAR(20) DEFAULT 'unread',
    priority INTEGER DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 客户表
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    level VARCHAR(20) DEFAULT 'normal',
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    credit_limit DECIMAL(15,2) DEFAULT 0,
    payment_terms INTEGER DEFAULT 30,
    sales_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    remark TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 供应商表
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    type VARCHAR(50) DEFAULT 'carrier',
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    payment_terms INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'active',
    remark TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    order_no VARCHAR(50) UNIQUE NOT NULL,
    customer_id VARCHAR(50),
    customer_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft',
    total_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'EUR',
    remark TEXT,
    operator_id VARCHAR(50),
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 订单明细表
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50),
    product_name VARCHAR(255),
    quantity DECIMAL(15,4) DEFAULT 0,
    price DECIMAL(15,4) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW()
);

-- TMS运输单表
CREATE TABLE IF NOT EXISTS tms_shipments (
    id VARCHAR(50) PRIMARY KEY,
    shipment_no VARCHAR(50) UNIQUE NOT NULL,
    order_id VARCHAR(50),
    tracking_no VARCHAR(100),
    carrier VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    origin VARCHAR(255),
    destination VARCHAR(255),
    estimated_delivery TIMESTAMP,
    actual_delivery TIMESTAMP,
    freight_cost DECIMAL(15,2) DEFAULT 0,
    remark TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- TMS运输轨迹表
CREATE TABLE IF NOT EXISTS tms_tracks (
    id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    track_time TIMESTAMP,
    create_time TIMESTAMP DEFAULT NOW()
);

-- TMS运费价格表
CREATE TABLE IF NOT EXISTS tms_pricing (
    id VARCHAR(50) PRIMARY KEY,
    carrier VARCHAR(100),
    origin_zone VARCHAR(100),
    destination_zone VARCHAR(100),
    weight_min DECIMAL(10,2) DEFAULT 0,
    weight_max DECIMAL(10,2),
    price_per_kg DECIMAL(10,4) DEFAULT 0,
    min_price DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'active',
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 发票表
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    customer_id VARCHAR(50),
    customer_name VARCHAR(255),
    invoice_date DATE,
    due_date DATE,
    total_amount DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'draft',
    remark TEXT,
    operator_id VARCHAR(50),
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 发票明细表
CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(50) PRIMARY KEY,
    invoice_id VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,4) DEFAULT 1,
    unit_price DECIMAL(15,4) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW()
);

-- 收付款记录表
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    invoice_id VARCHAR(50),
    amount DECIMAL(15,2) DEFAULT 0,
    payment_date DATE,
    payment_method VARCHAR(50),
    remark TEXT,
    operator_id VARCHAR(50),
    create_time TIMESTAMP DEFAULT NOW()
);

-- 产品表
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    unit VARCHAR(20) DEFAULT 'unit',
    base_price DECIMAL(15,4) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'active',
    description TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 产品价格规则表
CREATE TABLE IF NOT EXISTS product_price_rules (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    min_quantity DECIMAL(15,4) DEFAULT 0,
    max_quantity DECIMAL(15,4),
    price DECIMAL(15,4) DEFAULT 0,
    discount_rate DECIMAL(5,4) DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_sales_id ON customers(sales_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_tms_shipments_shipment_no ON tms_shipments(shipment_no);
CREATE INDEX IF NOT EXISTS idx_tms_shipments_order_id ON tms_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_no ON invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
