-- 131: 订单记住来源报价（开发意见 #7，第 3 步：一柜转 N 单）
--
-- 背景
-- ----
-- 本地派送的一张报价（= 一个柜）接受后要生成 **N 张订单**，一票派送一张
-- （Frank 2026-08-15 拍板）。而 `quotations.converted_order_id` 上有
-- 部分唯一索引（迁移 107），**一张报价只记得住一张订单**：
--
--   CREATE UNIQUE INDEX uq_quotations_converted_order
--     ON quotations(converted_order_id) WHERE converted_order_id IS NOT NULL;
--
-- 那个索引不能删 —— 它防的是「一张订单被两张报价重复转出」，仍然有效。
-- 所以反过来在订单侧记来源：N 张订单都指回同一张报价。
--
-- `converted_order_id` 继续记第一张，前端「跳转到订单」的既有逻辑不用改。
--
-- 影响面
-- ------
-- 只给 orders 加一个**可空**列，不改既有列与约束。存量订单全部为 NULL。
-- 幂等：IF NOT EXISTS，重复执行无副作用。

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_quotation_id UUID REFERENCES quotations(id);

CREATE INDEX IF NOT EXISTS idx_orders_source_quotation
  ON orders(source_quotation_id) WHERE source_quotation_id IS NOT NULL;

COMMENT ON COLUMN orders.source_quotation_id IS
  '这张订单由哪张报价转出。本地派送一柜转 N 单时，N 张订单都指向同一张报价；'
  '柜级归集另有 orders.container_no';

-- 执行后自查：
-- SELECT COUNT(*) FROM orders WHERE source_quotation_id IS NOT NULL;   -- 应为 0
