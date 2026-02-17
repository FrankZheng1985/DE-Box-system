-- 005_add_business_type.sql
-- 添加业务类型字段到订单表
-- 业务类型: release(放单服务), transport(运输服务), both(放单+运输)
-- 放单状态: pending(待放单), released(已放单), not_required(不需要放单)

-- 添加业务类型字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS business_type VARCHAR(20) DEFAULT 'both';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_status VARCHAR(20) DEFAULT 'pending';

-- 添加索引以支持筛选查询
CREATE INDEX IF NOT EXISTS idx_orders_business_type ON orders(business_type);
CREATE INDEX IF NOT EXISTS idx_orders_release_status ON orders(release_status);

-- 添加约束（可选，根据需要启用）
-- ALTER TABLE orders ADD CONSTRAINT chk_business_type CHECK (business_type IN ('release', 'transport', 'both'));
-- ALTER TABLE orders ADD CONSTRAINT chk_release_status CHECK (release_status IN ('pending', 'released', 'not_required'));

-- 更新现有订单数据
-- 如果有提单号且有运输信息，设置为 both
-- 如果只有提单号没有运输信息，设置为 release
-- 如果只有运输信息没有提单号，设置为 transport
UPDATE orders SET business_type = 'both', release_status = 'pending' WHERE business_type IS NULL;

-- 为仅运输的订单设置 release_status 为 not_required
UPDATE orders SET release_status = 'not_required' WHERE business_type = 'transport';

COMMENT ON COLUMN orders.business_type IS '业务类型: release(放单服务), transport(运输服务), both(放单+运输)';
COMMENT ON COLUMN orders.release_status IS '放单状态: pending(待放单), released(已放单), not_required(不需要放单)';
