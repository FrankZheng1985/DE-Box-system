-- 136: 询价单增加「预计到仓日期」，并把柜号放开给三种服务类型
--
-- 背景
-- ----
-- 1) 柜号：`inquiries.container_no` 是迁移 129 加的，当时只给本地派送用
--    （注释写死「仅本地派送」，建单代码里也硬判了 business_type）。
--    实际业务里 LTL 卡派和 FTL 卡车运输在预报时同样有柜号 —— 客户没地方填，
--    只能挤在「贵司单号」里将就。本次放开给三种服务类型都能填。
--    **列本身不用改**，只改注释；真正的限制在应用层（service.js 建单函数）。
--
-- 2) 预计到仓日期：车队要知道货大概哪天到仓库好排车，系统里没有这个字段。
--
-- 影响面
-- ------
-- - inquiries 加一个**可空**列 expected_arrival_date（DATE）
-- - 不改任何既有列的类型和约束，不动外键，存量 27 条询价全部不受影响
--
-- ⚠️ 为什么列必须可空
--    产品上这个字段是「新建时必填」的，但那只能约束**以后新建的单**。
--    库里已有的询价没有这个值，列若设 NOT NULL 迁移会直接失败。
--    必填校验放在应用层（前端表单 + 后端接口 + 导入解析），不放数据库。
--
-- 幂等：IF NOT EXISTS，重复执行无副作用。

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;

COMMENT ON COLUMN inquiries.expected_arrival_date IS
  '预计到仓日期，三种服务类型都填。只到日期不到钟点：客户建单时通常还不知道确切几点到。新建必填由应用层保证，历史数据为 NULL';

-- 柜号不再是本地派送专属，同步订正注释（列本身不动）
COMMENT ON COLUMN inquiries.container_no IS
  '柜号。三种服务类型都可填：本地派送是「一张询价单 = 一个柜」，LTL / FTL 预报时也各有柜号';

-- 核对用（不影响执行）：
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'inquiries' AND column_name IN ('container_no', 'expected_arrival_date');
