-- 德国Box运输管理系统 - 订单状态管理增强迁移脚本
-- PostgreSQL
-- 
-- 内容：
-- 1. orders表新增船司放单相关字段
-- 2. orders表新增清关放行相关字段
-- 3. orders表新增派送状态相关字段
-- 4. orders表新增货物类型和送仓地址字段
-- 5. 新建放单服务公司表
-- 6. 新建运输服务商表

-- ==================== 1. 船司放单相关字段 ====================

-- 放单类型: not_required(无需放单), original(正本), telex(电放), seaway(Seaway Bill)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_type VARCHAR(20) DEFAULT 'not_required';

-- 船司放单状态: not_required(无需放单), pending_mail(正本待邮寄), mailed(正本已邮寄), pending_release(待放行), released(船司放行)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_release_status VARCHAR(30) DEFAULT 'not_required';

-- 放单服务公司ID
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_service_company_id VARCHAR(50);

-- 正本邮寄地址（反馈给客户）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_mail_address TEXT;

-- 放行有效期
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_valid_until DATE;

-- 放行确认时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_confirmed_at TIMESTAMP;

-- 放行确认人
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_confirmed_by VARCHAR(50);

-- ==================== 2. 清关放行相关字段 ====================

-- 清关状态: pending(待清关), cleared(已放行)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customs_clearance_status VARCHAR(20) DEFAULT 'pending';

-- 清关完成时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customs_cleared_at TIMESTAMP;

-- 清关确认人（客户）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customs_cleared_by VARCHAR(50);

-- ==================== 3. 派送状态相关字段 ====================

-- 派送状态: waiting(等待安排), fleet_confirmed(车队已确认), in_transit(运输中), completed(完成), abnormal(状态异常), cmr_received(CMR已回传)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT 'waiting';

-- 运输服务商ID
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_service_provider_id VARCHAR(50);

-- 预计送仓时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP;

-- 车队确认时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_confirmed_at TIMESTAMP;

-- 提柜时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMP;

-- 派送完成时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_completed_at TIMESTAMP;

-- 完成确认人（客户或操作员）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_completed_by VARCHAR(50);

-- 异常原因
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_abnormal_reason TEXT;

-- CMR文件URL
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cmr_file_url VARCHAR(500);

-- CMR上传时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cmr_uploaded_at TIMESTAMP;

-- ==================== 4. 货物类型和送仓地址 ====================

-- 货物类型: general(普货), dangerous(危险品), temperature_controlled(温控)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_type VARCHAR(30) DEFAULT 'general';

-- 送仓地址
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_address TEXT;

-- ==================== 5. 放单服务公司表 ====================

CREATE TABLE IF NOT EXISTS release_service_companies (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    remark TEXT,
    status VARCHAR(20) DEFAULT 'active',
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_release_service_companies_code ON release_service_companies(code);
CREATE INDEX IF NOT EXISTS idx_release_service_companies_status ON release_service_companies(status);

-- ==================== 6. 运输服务商表 ====================

CREATE TABLE IF NOT EXISTS delivery_service_providers (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    service_area TEXT,              -- 服务区域
    address TEXT,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    remark TEXT,
    status VARCHAR(20) DEFAULT 'active',
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_delivery_service_providers_code ON delivery_service_providers(code);
CREATE INDEX IF NOT EXISTS idx_delivery_service_providers_status ON delivery_service_providers(status);

-- ==================== 7. orders表新增索引 ====================

CREATE INDEX IF NOT EXISTS idx_orders_release_type ON orders(release_type);
CREATE INDEX IF NOT EXISTS idx_orders_carrier_release_status ON orders(carrier_release_status);
CREATE INDEX IF NOT EXISTS idx_orders_customs_clearance_status ON orders(customs_clearance_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_cargo_type ON orders(cargo_type);

-- ==================== 8. 外键约束 ====================

-- 放单服务公司外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_orders_release_service_company' AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_release_service_company 
            FOREIGN KEY (release_service_company_id) REFERENCES release_service_companies(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_orders_release_service_company already exists or cannot be created';
END $$;

-- 运输服务商外键
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_orders_delivery_service_provider' AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_delivery_service_provider 
            FOREIGN KEY (delivery_service_provider_id) REFERENCES delivery_service_providers(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Foreign key fk_orders_delivery_service_provider already exists or cannot be created';
END $$;

-- ==================== 9. 插入示例数据 ====================

-- 放单服务公司示例数据
INSERT INTO release_service_companies (id, code, name, address, contact_person, phone, email, status) VALUES
    ('rsc-001', 'EURORELEASE', 'Euro Release GmbH', 'Hafenstraße 123, 20457 Hamburg, Germany', 'Hans Mueller', '+49-40-12345678', 'info@eurorelease.de', 'active'),
    ('rsc-002', 'PORTSERVICE', 'Port Service Hamburg', 'Am Sandtorkai 50, 20457 Hamburg, Germany', 'Peter Schmidt', '+49-40-87654321', 'service@portservice.de', 'active'),
    ('rsc-003', 'GERMANDOCS', 'German Docs Logistics', 'Speicherstadt 10, 20457 Hamburg, Germany', 'Klaus Weber', '+49-40-11223344', 'docs@germandocs.de', 'active')
ON CONFLICT (code) DO NOTHING;

-- 运输服务商示例数据
INSERT INTO delivery_service_providers (id, code, name, service_area, address, contact_person, phone, email, status) VALUES
    ('dsp-001', 'GERMANTRANS', 'German Trans GmbH', '德国全境', 'Industriestraße 45, 22113 Hamburg, Germany', 'Frank Müller', '+49-40-55667788', 'dispatch@germantrans.de', 'active'),
    ('dsp-002', 'EUROLOGISTICS', 'Euro Logistics Express', '德国、荷兰、比利时', 'Europastraße 100, 28195 Bremen, Germany', 'Michael Braun', '+49-421-99887766', 'booking@eurologistics.eu', 'active'),
    ('dsp-003', 'BERLINFREIGHT', 'Berlin Freight Services', '柏林及周边地区', 'Berliner Ring 200, 10115 Berlin, Germany', 'Anna Schneider', '+49-30-44556677', 'info@berlinfreight.de', 'active')
ON CONFLICT (code) DO NOTHING;

-- ==================== 10. 记录迁移版本 ====================

INSERT INTO schema_migrations (version, description) 
VALUES ('005', '订单状态管理增强：船司放单、清关放行、派送状态、货物类型、送仓地址字段，放单服务公司表，运输服务商表')
ON CONFLICT (version) DO NOTHING;

-- 完成提示
DO $$ 
BEGIN
    RAISE NOTICE '✅ 订单状态管理增强迁移脚本执行完成';
END $$;
