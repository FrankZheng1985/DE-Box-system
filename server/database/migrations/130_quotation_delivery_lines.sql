-- 130: 报价按派送子订单逐条报价（开发意见 #7，第 2 步：报价侧）
--
-- 背景
-- ----
-- 本地派送的询价是「一个柜 → 多票派送」（迁移 129）。苏凌要的是
-- **每一票单独报价 + 整柜合计**，客户按票核价、按柜确认。
-- 现在的 quotations 只有一个 total_price，装不下逐票价格。
--
-- 为什么单开一张表，而不是把价格存回 inquiry_delivery_orders
-- ------------------------------------------------------
-- 报价是**有版本的**（quotations.version，改价走 POST /:id/new-version）。
-- 价格存回询价的子订单上，第二版会直接把第一版覆盖掉，历史版本再也查不回来。
-- 挂在 quotation 下面，每一版各有各的行，天然就是历史。
--
-- 与 quotation_pricing_items 的区别
-- --------------------------------
-- 那张表是**费用项**维度（基础运费/燃油附加/保险…，来自定价引擎），
-- 这张是**派送票**维度。两者正交，一张报价可以同时有两者。
--
-- 影响面
-- ------
-- 只新增一张表，不改任何既有列与约束。卡派 LTL / 卡车 FTL 的报价完全不经过它。
-- 幂等：IF NOT EXISTS，重复执行无副作用。

CREATE TABLE IF NOT EXISTS quotation_delivery_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id       UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  -- 指向询价里的那一票；询价子订单被删时这行跟着走，不留悬空引用（踩坑 061）
  delivery_order_id  UUID NOT NULL REFERENCES inquiry_delivery_orders(id) ON DELETE CASCADE,

  -- 这一票的派送费。允许 0（免费送/已包含在别处），所以不加 CHECK > 0
  price              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           VARCHAR(3) DEFAULT 'EUR',
  remarks            TEXT,

  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- 一版报价里同一票只能有一行价格
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_delivery_lines
  ON quotation_delivery_lines(quotation_id, delivery_order_id);

CREATE INDEX IF NOT EXISTS idx_quotation_delivery_lines_quotation
  ON quotation_delivery_lines(quotation_id);

COMMENT ON TABLE quotation_delivery_lines IS
  '本地派送报价的逐票明细：一行 = 一票派送的报价；quotations.total_price 是这些行之和';

-- 执行后自查：
-- SELECT COUNT(*) FROM quotation_delivery_lines;   -- 应为 0
