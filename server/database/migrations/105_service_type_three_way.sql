-- ============================================================================
-- 105_service_type_three_way.sql
-- 服务类型三分类改造（需求 1）
--
-- business_type 从两值改为三值：
--   CURTAIN_SIDE（篷布车） → TRUCK_LTL      卡车派送 LTL
--   CONTAINER  （集装箱）  → TRUCK_FTL      卡车运输 FTL
--   （新增）              → LOCAL_DELIVERY 本地派送
--
-- ⚠️ 关键：CURTAIN_SIDE / CONTAINER 在本系统里同时扮演三个角色，
--    必须一起迁移，只改 orders.business_type 会导致：
--      1. account_determination_rules 匹配不到 → 静默 fallback 到 ALL 规则
--         → 原集装箱业务的收入会记进 4100 而不是 4200，账做错且不报错
--      2. pricing_procedures 匹配不到 → 报价取不到定价过程
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 业务范围（business_areas）：新增本地派送
--    orders.business_area 有外键指向这张表，必须先建再用
-- ----------------------------------------------------------------------------
INSERT INTO business_areas (code, area_name, company_code, description) VALUES
  ('LD', '本地派送', 'DE01', '本地短途派送业务')
ON CONFLICT (code) DO NOTHING;

-- 同步已有两个业务范围的名称（名实相符）
UPDATE business_areas SET area_name = '卡车派送 LTL', description = '欧洲公路零担/拼车运输'
  WHERE code = 'CS';
UPDATE business_areas SET area_name = '卡车运输 FTL', description = '整车运输，含海运集装箱到港后陆运配送'
  WHERE code = 'CT';

-- ----------------------------------------------------------------------------
-- 2. 会计科目：新增本地派送收入/成本，并给已有科目改名
--    只改名称，科目代码不动 —— 已过账的凭证不受影响
-- ----------------------------------------------------------------------------
-- ⚠️ 4300 已是「附加服务收入」、5300 已是「燃油附加费」、5400 已是「保险费用」，
--    所以本地派送用 4400 / 5500。
--    下面这段断言是必须的：如果哪天这两个号也被占了，
--    ON CONFLICT DO NOTHING 会静默跳过插入，而后面的科目确定规则照样指过去，
--    结果就是本地派送的收入成本被记到别的科目上，且系统一声不吭。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '4400' AND account_name <> '本地派送收入') THEN
    RAISE EXCEPTION '科目 4400 已被占用（当前名称：%），本地派送收入需要另选科目号',
      (SELECT account_name FROM chart_of_accounts WHERE account_code = '4400');
  END IF;
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = '5500' AND account_name <> '本地派送成本') THEN
    RAISE EXCEPTION '科目 5500 已被占用（当前名称：%），本地派送成本需要另选科目号',
      (SELECT account_name FROM chart_of_accounts WHERE account_code = '5500');
  END IF;
END $$;

INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_code, is_reconciliation, is_active) VALUES
  ('4400', '本地派送收入', 'REVENUE', '4000', false, true),
  ('5500', '本地派送成本', 'EXPENSE', '5000', false, true)
ON CONFLICT (account_code) DO NOTHING;

UPDATE chart_of_accounts SET account_name = '卡车运输LTL收入' WHERE account_code = '4100';
UPDATE chart_of_accounts SET account_name = '卡车运输FTL收入' WHERE account_code = '4200';
UPDATE chart_of_accounts SET account_name = '卡车运输LTL成本' WHERE account_code = '5100';
UPDATE chart_of_accounts SET account_name = '卡车运输FTL成本' WHERE account_code = '5200';

-- ----------------------------------------------------------------------------
-- 3. 科目确定规则：跟着 business_type 一起改，否则记错账
-- ----------------------------------------------------------------------------
UPDATE account_determination_rules SET business_type = 'TRUCK_LTL' WHERE business_type = 'CURTAIN_SIDE';
UPDATE account_determination_rules SET business_type = 'TRUCK_FTL' WHERE business_type = 'CONTAINER';

UPDATE account_determination_rules
   SET description = '卡车运输LTL应收确认：借 应收账款，贷 运输收入'
 WHERE transaction_type = 'AR_INVOICE' AND business_type = 'TRUCK_LTL';
UPDATE account_determination_rules
   SET description = '卡车运输FTL应收确认：借 应收账款，贷 运输收入'
 WHERE transaction_type = 'AR_INVOICE' AND business_type = 'TRUCK_FTL';
UPDATE account_determination_rules
   SET description = '卡车运输LTL应付确认：借 运输成本，贷 应付账款'
 WHERE transaction_type = 'AP_INVOICE' AND business_type = 'TRUCK_LTL';
UPDATE account_determination_rules
   SET description = '卡车运输FTL应付确认：借 运输成本，贷 应付账款'
 WHERE transaction_type = 'AP_INVOICE' AND business_type = 'TRUCK_FTL';

-- 本地派送单独核算（4400 收入 / 5500 成本，见上方科目号说明）
INSERT INTO account_determination_rules (transaction_type, business_type, debit_account, credit_account, description) VALUES
  ('AR_INVOICE', 'LOCAL_DELIVERY', '1210', '4400', '本地派送应收确认：借 应收账款，贷 本地派送收入'),
  ('AP_INVOICE', 'LOCAL_DELIVERY', '5500', '2100', '本地派送应付确认：借 本地派送成本，贷 应付账款')
ON CONFLICT (transaction_type, business_type) DO UPDATE
  SET debit_account = EXCLUDED.debit_account,
      credit_account = EXCLUDED.credit_account,
      description = EXCLUDED.description;

-- ----------------------------------------------------------------------------
-- 4. 定价过程：procedure_code 同步改名，并新增本地派送过程
--    quotation/routes.js 是用 businessType 推导 procedureCode 的，两边必须一致
-- ----------------------------------------------------------------------------
UPDATE pricing_procedures
   SET procedure_code = 'TRUCK_LTL', procedure_name = '卡车派送LTL定价', description = '欧洲公路零担运输标准定价过程'
 WHERE procedure_code = 'CURTAIN_SIDE';
UPDATE pricing_procedures
   SET procedure_code = 'TRUCK_FTL', procedure_name = '卡车运输FTL定价', description = '整车运输定价过程（含集装箱陆运配送）'
 WHERE procedure_code = 'CONTAINER';

INSERT INTO pricing_procedures (procedure_code, procedure_name, description) VALUES
  ('LOCAL_DELIVERY', '本地派送定价', '本地短途派送定价过程')
ON CONFLICT (procedure_code) DO NOTHING;

-- 本地派送定价步骤：先给一个基础运费，后续按业务需要再补
INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, is_mandatory, sort_order)
SELECT pp.id, 10, ct.id, '基础运费', 'FIXED', true, 10
  FROM pricing_procedures pp, condition_types ct
 WHERE pp.procedure_code = 'LOCAL_DELIVERY' AND ct.type_code = 'PR00'
   AND NOT EXISTS (
     SELECT 1 FROM pricing_steps ps WHERE ps.procedure_id = pp.id AND ps.step_number = 10
   );

-- ----------------------------------------------------------------------------
-- 5. 业务数据：订单和报价的 business_type 改值
--    存量分布（2026-08-01 生产）：CONTAINER 27 单、CURTAIN_SIDE 1 单
--    映射已与业务确认：CONTAINER 全部算 FTL
-- ----------------------------------------------------------------------------
UPDATE orders SET business_type = 'TRUCK_LTL' WHERE business_type = 'CURTAIN_SIDE';
UPDATE orders SET business_type = 'TRUCK_FTL' WHERE business_type = 'CONTAINER';

UPDATE quotations SET business_type = 'TRUCK_LTL' WHERE business_type = 'CURTAIN_SIDE';
UPDATE quotations SET business_type = 'TRUCK_FTL' WHERE business_type = 'CONTAINER';

-- 询价表也有业务类型（客户门户提交时写入）
UPDATE inquiries SET business_type = 'TRUCK_LTL' WHERE business_type = 'CURTAIN_SIDE';
UPDATE inquiries SET business_type = 'TRUCK_FTL' WHERE business_type = 'CONTAINER';

-- ----------------------------------------------------------------------------
-- 6. 本地派送：跟踪号字段
--    运营手工填写，客户门户可见
-- ----------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
COMMENT ON COLUMN orders.tracking_number IS '本地派送跟踪号（运营手工填写，客户门户可见）';

CREATE INDEX IF NOT EXISTS idx_orders_tracking_number
  ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

COMMIT;
