-- 德国Box运输管理系统 - ERP增强迁移脚本
-- PostgreSQL
-- 
-- 内容：
-- 1. 添加审计日志表
-- 2. 添加外键约束
-- 3. 添加缺失的索引
-- 4. 优化数据完整性

-- ==================== 1. 审计日志表 ====================

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),                    -- 操作用户ID
    action VARCHAR(100) NOT NULL,           -- 操作类型
    target_type VARCHAR(50),                -- 目标对象类型 (order, invoice, customer 等)
    target_id VARCHAR(50),                  -- 目标对象ID
    details JSONB,                          -- 详细信息 (JSON格式)
    ip_address VARCHAR(50),                 -- 请求IP地址
    create_time TIMESTAMP DEFAULT NOW()     -- 创建时间
);

-- 审计日志索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_create_time ON audit_logs(create_time);

-- ==================== 2. 外键约束 ====================

-- 注意: 添加外键前需要确保数据一致性，这些语句使用 IF NOT EXISTS 等价写法
-- 如果已存在约束则跳过

-- 订单表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_orders_customer' AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_customer 
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_orders_customer already exists or cannot be created';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_orders_operator' AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_operator 
            FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_orders_operator already exists or cannot be created';
END $$;

-- 订单明细表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_order_items_order' AND table_name = 'order_items'
    ) THEN
        ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order 
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_order_items_order already exists or cannot be created';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_order_items_product' AND table_name = 'order_items'
    ) THEN
        ALTER TABLE order_items ADD CONSTRAINT fk_order_items_product 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_order_items_product already exists or cannot be created';
END $$;

-- 发票表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_invoices_customer' AND table_name = 'invoices'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer 
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_invoices_customer already exists or cannot be created';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_invoices_operator' AND table_name = 'invoices'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT fk_invoices_operator 
            FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_invoices_operator already exists or cannot be created';
END $$;

-- 发票明细表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_invoice_items_invoice' AND table_name = 'invoice_items'
    ) THEN
        ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoice 
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_invoice_items_invoice already exists or cannot be created';
END $$;

-- 支付记录表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_payments_invoice' AND table_name = 'payments'
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT fk_payments_invoice 
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_payments_invoice already exists or cannot be created';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_payments_operator' AND table_name = 'payments'
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT fk_payments_operator 
            FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_payments_operator already exists or cannot be created';
END $$;

-- TMS运输单表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_tms_shipments_order' AND table_name = 'tms_shipments'
    ) THEN
        ALTER TABLE tms_shipments ADD CONSTRAINT fk_tms_shipments_order 
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_tms_shipments_order already exists or cannot be created';
END $$;

-- TMS运输轨迹表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_tms_tracks_shipment' AND table_name = 'tms_tracks'
    ) THEN
        ALTER TABLE tms_tracks ADD CONSTRAINT fk_tms_tracks_shipment 
            FOREIGN KEY (shipment_id) REFERENCES tms_shipments(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_tms_tracks_shipment already exists or cannot be created';
END $$;

-- 角色权限关联表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_role_permissions_role' AND table_name = 'role_permissions'
    ) THEN
        ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_role 
            FOREIGN KEY (role_code) REFERENCES roles(role_code) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_role_permissions_role already exists or cannot be created';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_role_permissions_permission' AND table_name = 'role_permissions'
    ) THEN
        ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_permission 
            FOREIGN KEY (permission_code) REFERENCES permissions(permission_code) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_role_permissions_permission already exists or cannot be created';
END $$;

-- 客户表外键 (销售负责人)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_customers_sales' AND table_name = 'customers'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT fk_customers_sales 
            FOREIGN KEY (sales_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_customers_sales already exists or cannot be created';
END $$;

-- 产品价格规则表外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_product_price_rules_product' AND table_name = 'product_price_rules'
    ) THEN
        ALTER TABLE product_price_rules ADD CONSTRAINT fk_product_price_rules_product 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_product_price_rules_product already exists or cannot be created';
END $$;

-- ==================== 3. 添加缺失的索引 ====================

CREATE INDEX IF NOT EXISTS idx_orders_create_time ON orders(create_time);
CREATE INDEX IF NOT EXISTS idx_orders_operator_id ON orders(operator_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_create_time ON invoices(create_time);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_tms_shipments_status ON tms_shipments(status);
CREATE INDEX IF NOT EXISTS idx_tms_shipments_create_time ON tms_shipments(create_time);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_level ON customers(level);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ==================== 4. 添加约束检查 ====================

-- 确保金额不为负数
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_orders_total_amount'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_total_amount CHECK (total_amount >= 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Check constraint chk_orders_total_amount already exists';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_invoices_amounts'
    ) THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_amounts 
            CHECK (total_amount >= 0 AND paid_amount >= 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Check constraint chk_invoices_amounts already exists';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_payments_amount'
    ) THEN
        ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Check constraint chk_payments_amount already exists';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'chk_customers_credit_limit'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT chk_customers_credit_limit CHECK (credit_limit >= 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Check constraint chk_customers_credit_limit already exists';
END $$;

-- ==================== 5. 添加版本控制表（记录迁移历史） ====================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- 记录本次迁移
INSERT INTO schema_migrations (version, description) 
VALUES ('003', 'ERP增强：审计日志、外键约束、数据完整性约束')
ON CONFLICT (version) DO NOTHING;

-- 完成提示
DO $$ 
BEGIN
    RAISE NOTICE '✅ ERP增强迁移脚本执行完成';
END $$;
