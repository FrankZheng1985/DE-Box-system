-- ============================================================================
-- 111_client_level_carrier_category.sql
-- P7：客户等级信用（需求 6） + 服务商分类（需求 7）
--
-- 三件事：
--   1. clients 补 client_level（VIP / NORMAL）—— 商务分级，和信用等级分开
--   2. carriers 补 carrier_category / carrier_type / remarks
--   3. 不新增权限码：客户信用沿用 client:credit，承运商沿用 carrier:edit
--
-- ⚠️ 为什么 client_level 要和 credit_level 分开（2026-08-02 Frank 拍板）：
--    credit_level(A/B/C/D) 是财务风险评级，由账龄和回款表现决定，财务岗维护；
--    需求 6 说的「VIP / 普通」是商务待遇分级，由销售关系和货量决定，业务岗维护。
--    两者口径不同，硬塞进一个字段会出现「想给回款一般的老客户挂 VIP」做不到的死角。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 客户商务等级
--    存量客户一律 NORMAL，VIP 由业务岗手工挑。
-- ----------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_level VARCHAR(10) NOT NULL DEFAULT 'NORMAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_client_level'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT chk_clients_client_level
      CHECK (client_level IN ('VIP', 'NORMAL'));
  END IF;
END $$;

COMMENT ON COLUMN clients.client_level IS '商务等级：VIP / NORMAL（与财务风险评级 credit_level 无关）';

CREATE INDEX IF NOT EXISTS idx_clients_level ON clients(client_level);

-- ----------------------------------------------------------------------------
-- 2. 承运商分类 / 类型 / 备注
--
--    carrier_category —— 是不是自己人
--      EXTERNAL   外部服务商（默认，存量全部落这里）
--      OWN_FLEET  自营车辆
--
--    carrier_type —— 这家的组织形态，直接影响能不能压价、能不能包月
--      PLATFORM    平台型（自己不养车，转手派）
--      FLEET       自营车队型
--      INDIVIDUAL  个体车辆
--    刻意允许 NULL：存量 carriers 没人知道是哪一类，留空让运营慢慢补，
--    不硬塞一个默认值制造假数据。
--
--    remarks —— 特点/优势/短板，纯文本给调度看
-- ----------------------------------------------------------------------------
ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS carrier_category VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL';
ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS carrier_type VARCHAR(20);
ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS remarks TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_carriers_category'
  ) THEN
    ALTER TABLE carriers ADD CONSTRAINT chk_carriers_category
      CHECK (carrier_category IN ('EXTERNAL', 'OWN_FLEET'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_carriers_type'
  ) THEN
    -- carrier_type 允许 NULL，所以约束里要放行 NULL
    ALTER TABLE carriers ADD CONSTRAINT chk_carriers_type
      CHECK (carrier_type IS NULL OR carrier_type IN ('PLATFORM', 'FLEET', 'INDIVIDUAL'));
  END IF;
END $$;

COMMENT ON COLUMN carriers.carrier_category IS '分类：EXTERNAL 外部服务商 / OWN_FLEET 自营车辆';
COMMENT ON COLUMN carriers.carrier_type IS '类型：PLATFORM 平台型 / FLEET 自营车队型 / INDIVIDUAL 个体车辆（可空）';
COMMENT ON COLUMN carriers.remarks IS '特点/优势/短板备注，调度选车时参考';

CREATE INDEX IF NOT EXISTS idx_carriers_category ON carriers(carrier_category);

COMMIT;

-- ============================================================================
-- 验证
-- ============================================================================
-- SELECT client_level, COUNT(*) FROM clients GROUP BY client_level;
-- SELECT carrier_category, carrier_type, COUNT(*) FROM carriers
--   GROUP BY carrier_category, carrier_type;
