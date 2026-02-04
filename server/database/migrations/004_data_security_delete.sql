-- 德国Box运输管理系统 - 数据安全与软删除迁移脚本
-- PostgreSQL
-- 
-- 内容：
-- 1. 为基础数据表添加软删除字段
-- 2. 为订单/发票添加作废字段
-- 3. 创建删除前引用检查函数（防止误删有业务数据的基础资料）

-- ==================== 1. 软删除字段 ====================

-- 用户表
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- 客户表
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- 供应商表
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- 产品表
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- 基础数据表
ALTER TABLE basic_data ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 创建软删除索引（优化查询性能）
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users(is_deleted);
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_deleted ON suppliers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);

-- ==================== 2. 订单/发票作废字段 ====================

-- 订单表 - 作废信息
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_time TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS void_by VARCHAR(50);

-- 发票表 - 作废信息
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_time TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_by VARCHAR(50);

-- TMS运输单 - 作废信息
ALTER TABLE tms_shipments ADD COLUMN IF NOT EXISTS void_time TIMESTAMP;
ALTER TABLE tms_shipments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE tms_shipments ADD COLUMN IF NOT EXISTS void_by VARCHAR(50);

-- ==================== 3. 删除前引用检查函数 ====================

-- 客户删除检查：如果有未完成订单或发票，禁止删除
CREATE OR REPLACE FUNCTION check_before_delete_customer()
RETURNS TRIGGER AS $$
BEGIN
    -- 检查是否有关联订单（非取消状态）
    IF EXISTS (SELECT 1 FROM orders WHERE customer_id = OLD.id AND status NOT IN ('cancelled', 'draft')) THEN
        RAISE EXCEPTION '该客户存在关联订单，无法删除。请先将客户状态设为"停用"。';
    END IF;
    
    -- 检查是否有关联发票（非草稿状态）
    IF EXISTS (SELECT 1 FROM invoices WHERE customer_id = OLD.id AND status != 'draft') THEN
        RAISE EXCEPTION '该客户存在关联发票，无法删除。请先将客户状态设为"停用"。';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 供应商删除检查
CREATE OR REPLACE FUNCTION check_before_delete_supplier()
RETURNS TRIGGER AS $$
BEGIN
    -- 检查是否有关联运输单
    IF EXISTS (SELECT 1 FROM tms_shipments WHERE carrier = OLD.name AND status NOT IN ('cancelled')) THEN
        RAISE EXCEPTION '该供应商存在关联运输单，无法删除。请先将供应商状态设为"停用"。';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 产品删除检查：如果有订单明细引用，禁止删除
CREATE OR REPLACE FUNCTION check_before_delete_product()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM order_items WHERE product_id = OLD.id) THEN
        RAISE EXCEPTION '该产品已被订单引用，无法删除。请先将产品状态设为"停用"。';
    END IF;
    
    IF EXISTS (SELECT 1 FROM invoice_items WHERE description LIKE '%' || OLD.name || '%') THEN
        RAISE EXCEPTION '该产品已被发票引用，无法删除。请先将产品状态设为"停用"。';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 用户删除检查：如果有操作记录，禁止删除
CREATE OR REPLACE FUNCTION check_before_delete_user()
RETURNS TRIGGER AS $$
BEGIN
    -- 检查是否有创建的订单
    IF EXISTS (SELECT 1 FROM orders WHERE operator_id = OLD.id) THEN
        RAISE EXCEPTION '该用户存在操作记录，无法删除。请先将用户状态设为"停用"。';
    END IF;
    
    -- 检查是否有创建的发票
    IF EXISTS (SELECT 1 FROM invoices WHERE operator_id = OLD.id) THEN
        RAISE EXCEPTION '该用户存在操作记录，无法删除。请先将用户状态设为"停用"。';
    END IF;
    
    -- 检查是否是客户的销售负责人
    IF EXISTS (SELECT 1 FROM customers WHERE sales_id = OLD.id) THEN
        RAISE EXCEPTION '该用户是客户的销售负责人，无法删除。请先转移客户负责人后再操作。';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ==================== 4. 绑定触发器 ====================

-- 客户删除触发器
DROP TRIGGER IF EXISTS trg_check_delete_customer ON customers;
CREATE TRIGGER trg_check_delete_customer
BEFORE DELETE ON customers
FOR EACH ROW EXECUTE FUNCTION check_before_delete_customer();

-- 供应商删除触发器
DROP TRIGGER IF EXISTS trg_check_delete_supplier ON suppliers;
CREATE TRIGGER trg_check_delete_supplier
BEFORE DELETE ON suppliers
FOR EACH ROW EXECUTE FUNCTION check_before_delete_supplier();

-- 产品删除触发器
DROP TRIGGER IF EXISTS trg_check_delete_product ON products;
CREATE TRIGGER trg_check_delete_product
BEFORE DELETE ON products
FOR EACH ROW EXECUTE FUNCTION check_before_delete_product();

-- 用户删除触发器
DROP TRIGGER IF EXISTS trg_check_delete_user ON users;
CREATE TRIGGER trg_check_delete_user
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION check_before_delete_user();

-- ==================== 5. 记录迁移版本 ====================

INSERT INTO schema_migrations (version, description) 
VALUES ('004', '数据安全增强：软删除字段、作废字段、删除前业务引用检查触发器')
ON CONFLICT (version) DO NOTHING;

-- 完成提示
DO $$ 
BEGIN
    RAISE NOTICE '✅ 数据安全迁移脚本执行完成';
END $$;
