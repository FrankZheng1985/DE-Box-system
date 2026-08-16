-- 133: 订单加「服务渠道」（开发意见 #7，第 4 步：履约字段）
--
-- 背景
-- ----
-- 苏凌的意见里，本地派送要记「签收文件、跟踪号码、服务渠道」三样。
-- 前两样**已经天然具备**：Frank 拍板一票转一张订单（迁移 131），
-- 而订单本来就有 `tracking_number`（迁移 105 起）和 `order_files`（迁移 106），
-- 一票一单直接复用了它们，不用另做一套。只剩服务渠道没地方放。
--
-- 为什么是自由文本而不是枚举
-- ------------------------
-- 渠道会变（今天 DPD、明天多一家 GLS，或者自有车队），做成枚举意味着每加一家
-- 就要一次迁移；做成基础数据表又是为一个字段建一张表，过度了。
-- 先用自由文本，等真跑一段时间、渠道集合稳定了再决定要不要收敛成字典。
--
-- 影响面
-- ------
-- 只给 orders 加一个**可空**列，不改既有列与约束。存量订单全部为 NULL。
-- 幂等：IF NOT EXISTS，重复执行无副作用。

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_channel VARCHAR(50);

COMMENT ON COLUMN orders.service_channel IS
  '服务渠道：这一票实际由谁派送（自有车队 / DPD / DHL / GLS…）。'
  '与 tracking_number 是一对——跟踪号通常就是这个渠道给的。仅本地派送使用';

-- 执行后自查：
-- SELECT COUNT(*) FROM orders WHERE service_channel IS NOT NULL;   -- 应为 0
