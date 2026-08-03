-- ============================================================================
-- 120_special_requirements_to_code.sql
-- 把「特殊要求」从存中文名改成存 code
--
-- 背景：orders.special_requirements / inquiries.special_requirements 存的是
--       md_special_requirements.name_zh（中文），不是 code。
--       103 种子文件里还专门写了注释说这是**刻意**与前端硬编码对齐的。
--
--       带来三个问题：
--       1. 运营在「基础数据维护」里改一次中文名，历史订单里的值就成了孤儿
--       2. 开放 API 的合作方得推中文过来，对外接口很别扭
--       3. 前端语言包只能拿中文当 key（specialRequirement.<中文>），很脆
--
-- 做法：按 md_special_requirements 的 name_zh → code 映射，把存量值换成 code。
--       映射表**从库里现查**，不写死 —— 生产的这张表运营已经改过
--       （加了「危险品」「UN3480电池」等种子里没有的行）。
--
-- ⚠️ 兼容性：换成 code 之后，开放 API 仍然接受合作方传中文，
--    后端在入库前会归一成 code（见 modules/open-api/service.js 的
--    normalizeSpecialRequirement）。所以合作方**不用改**。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 先看一眼会动到哪些值（执行时会打印出来，方便留档）
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '--- 迁移前 orders.special_requirements 分布 ---';
  FOR r IN
    SELECT special_requirements AS v, count(*) AS c
    FROM orders WHERE special_requirements IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
  LOOP
    RAISE NOTICE '  % : % 行', r.v, r.c;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. 换值：只换能在 md_special_requirements 里按 name_zh 找到 code 的
--    找不到的原样留着（可能是很久以前的手填值），不硬塞也不清空
-- ---------------------------------------------------------------------------
UPDATE orders o
SET special_requirements = md.code
FROM md_special_requirements md
WHERE o.special_requirements = md.name_zh;

UPDATE inquiries i
SET special_requirements = md.code
FROM md_special_requirements md
WHERE i.special_requirements = md.name_zh;

-- ---------------------------------------------------------------------------
-- 3. 换完再看一眼，以及有没有换不掉的
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD; leftover INT;
BEGIN
  RAISE NOTICE '--- 迁移后 orders.special_requirements 分布 ---';
  FOR r IN
    SELECT special_requirements AS v, count(*) AS c
    FROM orders WHERE special_requirements IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
  LOOP
    RAISE NOTICE '  % : % 行', r.v, r.c;
  END LOOP;

  SELECT count(*) INTO leftover
  FROM orders o
  WHERE o.special_requirements IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM md_special_requirements md WHERE md.code = o.special_requirements);
  IF leftover > 0 THEN
    RAISE NOTICE '⚠️ 还有 % 行的值在 md_special_requirements 里找不到对应 code，已原样保留', leftover;
  ELSE
    RAISE NOTICE '✅ orders 全部换成 code';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 回滚（如需）：把 code 换回中文名
-- ============================================================================
-- BEGIN;
-- UPDATE orders o SET special_requirements = md.name_zh
--   FROM md_special_requirements md WHERE o.special_requirements = md.code;
-- UPDATE inquiries i SET special_requirements = md.name_zh
--   FROM md_special_requirements md WHERE i.special_requirements = md.code;
-- COMMIT;
