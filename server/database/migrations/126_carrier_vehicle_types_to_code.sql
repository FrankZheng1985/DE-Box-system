-- 126: carriers.vehicle_types 由「英文名」统一为「基础数据代号」
--
-- 背景
-- ----
-- 同一个「车型」概念在系统里有两套词表：
--   * 基础数据 md_vehicle_types：代号 CURTAIN_SIDE / CONTAINER_CHASSIS / FLATBED / REFRIGERATED
--     （带 name_zh / name_en / name_de 三语名称）
--   * 承运商表单：**写死**在 CarrierList.tsx 里的英文名数组
--     ['Curtain Side', 'Container Chassis', 'Flatbed', 'Refrigerated']
--
-- 后果有三条：
--   1. 派单页按车型筛选**永远匹配不上**：'Curtain Side' 归一后是 'CURTAIN SIDE'（空格），
--      而代号是 'CURTAIN_SIDE'（下划线），差一个字符就永不相等
--   2. 在基础数据里新增车型，承运商表单看不到（它根本不读基础数据）
--   3. 英文名写死，中德文界面下也只显示英文
--
-- 本迁移把存量英文名转成代号；配套代码改动是 CarrierList.tsx 改读基础数据、存代号。
--
-- 影响面
-- ------
-- 只 UPDATE carriers.vehicle_types 这一列，**不改表结构、不动其他任何字段**。
-- 生产执行时该列 4 家承运商全是 []（已确认），本迁移在生产上是**零行变更**；
-- 写它是为了开发库 / 测试库里可能存在的英文名存量，以及留下"值域变了"的记录。
--
-- 幂等：只转换恰好等于旧英文名的元素，已经是代号的不受影响，重复执行结果相同。

-- 逐元素映射：把数组拆开、按名称换成代号、再聚合回 jsonb 数组
UPDATE carriers c
SET vehicle_types = COALESCE(mapped.arr, '[]'::jsonb)
FROM (
  SELECT c2.id,
         jsonb_agg(
           CASE elem
             WHEN 'Curtain Side'      THEN 'CURTAIN_SIDE'
             WHEN 'Container Chassis' THEN 'CONTAINER_CHASSIS'
             WHEN 'Flatbed'           THEN 'FLATBED'
             WHEN 'Refrigerated'      THEN 'REFRIGERATED'
             -- 认不出来的原样保留：宁可留着让人看见，也不要静默丢数据
             ELSE elem
           END
           ORDER BY ord
         ) AS arr
  FROM carriers c2,
       LATERAL jsonb_array_elements_text(c2.vehicle_types) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(c2.vehicle_types) = 'array'
    AND jsonb_array_length(c2.vehicle_types) > 0
  GROUP BY c2.id
) AS mapped
WHERE c.id = mapped.id;

-- 执行后自查：应当查不出任何仍是英文名的记录
-- SELECT company_name, vehicle_types FROM carriers
--  WHERE vehicle_types::text ~ 'Curtain Side|Container Chassis|Flatbed|Refrigerated';
