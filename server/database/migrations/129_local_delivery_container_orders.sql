-- 129: 本地派送「柜 → 派送子订单 → 件」三层结构（开发意见 #7，第 1 步：询价侧）
--
-- 背景
-- ----
-- 本地派送实际是一个柜里装着发往不同地址的多票货，每票又有多件。
-- 现在的询价只有两层（询价单 → 件明细），派送地址只有一个 route_to，
-- 所以一个柜要拆成几十张询价单分别填，取件地址和柜号还得重复抄几十遍。
--
-- 方案见 docs/开发计划/2026-08-15-本地派送柜与子订单方案.md（Frank 2026-08-15 拍板）。
--
-- 影响面
-- ------
-- 1. inquiries 加一个可空列 container_no —— 其他服务类型留空
-- 2. 新表 inquiry_delivery_orders —— 柜下的派送子订单
-- 3. inquiry_cargo_items 加一个**可空**列 delivery_order_id
--
-- ⚠️ 第 3 条的「可空」是这次改动的安全边界：卡派 LTL / 卡车 FTL 的件明细
--    继续直接挂询价单（这一列为 NULL），现有两条业务线的读写行为一个字都不变。
--    只有本地派送的件明细挂到子订单上。
--
-- 不改任何既有列的类型和约束，不动外键，存量数据全部不受影响。
-- 幂等：全部 IF NOT EXISTS，重复执行无副作用。

-- ==================== 1. 柜号 ====================

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS container_no VARCHAR(30);

COMMENT ON COLUMN inquiries.container_no IS
  '柜号，仅本地派送（LOCAL_DELIVERY）使用：一张询价单 = 一个柜';

-- ==================== 2. 派送子订单 ====================

CREATE TABLE IF NOT EXISTS inquiry_delivery_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id        UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  line_number       INTEGER NOT NULL,

  -- 客户自己的子订单单号，不是系统编号，不占 ORD 计数器
  customer_sub_ref  VARCHAR(100),

  -- 国家/邮编/城市/地址 + 公司名/收件人/电话/邮箱，
  -- 结构与 inquiries.route_to 一致，多出 companyName 一项
  delivery_address  JSONB,

  -- 由件明细汇总回写，口径与 inquiries 表头的同名字段完全一致
  quantity          INTEGER,
  weight_kg         NUMERIC(10,2),
  volume_m3         NUMERIC(12,4),
  ldm               NUMERIC(10,2),

  remarks           TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- 一张询价单里的行号唯一（整单替换时按行号重排，和 inquiry_cargo_items 一个套路）
CREATE UNIQUE INDEX IF NOT EXISTS uq_inquiry_delivery_orders_line
  ON inquiry_delivery_orders(inquiry_id, line_number);

CREATE INDEX IF NOT EXISTS idx_inquiry_delivery_orders_inquiry
  ON inquiry_delivery_orders(inquiry_id);

COMMENT ON TABLE inquiry_delivery_orders IS
  '本地派送询价单（= 一个柜）下的派送子订单；每个子订单对应一个派送地址，接受报价后各生成一张订单';

-- ==================== 3. 件明细归属 ====================

ALTER TABLE inquiry_cargo_items
  ADD COLUMN IF NOT EXISTS delivery_order_id UUID
  REFERENCES inquiry_delivery_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_inquiry_cargo_items_delivery_order
  ON inquiry_cargo_items(delivery_order_id);

COMMENT ON COLUMN inquiry_cargo_items.delivery_order_id IS
  '这一件属于哪个派送子订单。NULL = 直接挂在询价单上（卡派 LTL / 卡车 FTL 的既有行为）';

-- 执行后自查：
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'inquiries' AND column_name = 'container_no';
-- SELECT COUNT(*) FROM inquiry_delivery_orders;                    -- 应为 0
-- SELECT COUNT(*) FROM inquiry_cargo_items WHERE delivery_order_id IS NOT NULL;  -- 应为 0
