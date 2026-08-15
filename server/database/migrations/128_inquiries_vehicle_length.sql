-- 128: 询价单增加「车型（车长）」列（开发意见 #10）
--
-- 背景
-- ----
-- 卡派 LTL 服务下，有些订单在询价前就已经明确要用多长的车去派送
-- （4m / 6.2m / 7.2-7.45m / 7.8-8.2m / 9.0-9.6m / 12m / 13.6m）。
-- 现在建询价单时没地方填，只能写在备注里，服务商询价和后续派车都用不上。
--
-- 为什么不复用 carriers.vehicle_types
-- ----------------------------------
-- 那一列存的是**车厢类型**（CURTAIN_SIDE 帘式 / CONTAINER_CHASSIS 集装箱底盘 /
-- FLATBED 平板 / REFRIGERATED 冷藏，见迁移 126），和「车长」是两个维度，
-- 一辆车两个属性都有。混用会重演踩坑 013 那种「两套词表一个名字」的错配，
-- 所以单开一列，代号也带 TRUCK_ 前缀区分开。
--
-- 「专车 / 拼车」不新增列
-- --------------------
-- 复用已有的 transport_type（值域 FTL / LTL）：FTL = 专车（整车），LTL = 拼车（零担），
-- 语义完全对得上，不必再造一个字段。
--
-- 影响面
-- ------
-- 只给 inquiries 加一个**可空**列，不改任何既有列、不动约束和外键，存量行全部为 NULL。
-- 幂等：IF NOT EXISTS，重复执行无副作用。

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS vehicle_length_code VARCHAR(20);

COMMENT ON COLUMN inquiries.vehicle_length_code IS
  '车型（车长）代号：TRUCK_4M / TRUCK_6_2M / TRUCK_7_2M / TRUCK_7_8M / TRUCK_9M / TRUCK_12M / TRUCK_13_6M；仅专车（transport_type=FTL）时有值';

-- 执行后自查：
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name = 'inquiries' AND column_name = 'vehicle_length_code';
