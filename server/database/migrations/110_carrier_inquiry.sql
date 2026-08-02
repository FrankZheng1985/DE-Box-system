-- ============================================================================
-- 110_carrier_inquiry.sql
-- 服务商询价管理（需求 5.3）
--
-- 三件事：
--   1. 新表 carrier_inquiries —— 一张客户询价单可以对多家服务商发起询价，
--      形成「客户询价 ↔ 服务商询价」对照，服务商回的成本记在这里
--   2. number_ranges 补 CINQ 编号范围 —— 服务商询价单号 CINQ-20260802-0001
--   3. quotations 补 carrier_cost / carrier_cost_source_id ——
--      报价时把选定服务商的成本带过来，算毛利有依据
--
-- ⚠️ 成本是敏感信息：本表的读写全部挂 carrier_inquiry:view / :manage 权限码
--    （权限码已在迁移 109 定义，op_staff 刻意没有）
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 服务商询价单
--
--    状态流转（全大写，和库里其它表一致 —— 踩坑 004）：
--      PENDING   已发起，等服务商回价
--      QUOTED    服务商已回价（成本已填）
--      SELECTED  选用了这家的报价（一张客户询价下最多一家）
--      DECLINED  服务商不报 / 拒绝
--      CANCELLED 运营取消这次询价
--
--    刻意不加 UNIQUE(inquiry_id, carrier_id)：
--    同一家服务商可能因为货量变化被反复询价（第二轮、第三轮），
--    加唯一约束会把正常业务挡死。防重复由前端提示 + 发起时的活动单校验负责。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carrier_inquiries (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_inquiry_number VARCHAR(30) NOT NULL UNIQUE,
  inquiry_id             UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  carrier_id             UUID NOT NULL REFERENCES carriers(id),
  status                 VARCHAR(20) NOT NULL DEFAULT 'PENDING',

  -- 发起方填的补充要求（例如"要带尾板"、"周五前提货"）
  request_remarks        TEXT,
  sent_at                TIMESTAMP DEFAULT NOW(),

  -- 服务商回价（运营手工回填）
  quoted_cost            NUMERIC(12,2),
  currency               VARCHAR(3) DEFAULT 'EUR',
  transit_days           INTEGER,
  valid_until            DATE,
  reply_remarks          TEXT,
  replied_at             TIMESTAMP,

  selected_at            TIMESTAMP,
  created_by             UUID REFERENCES users(id),
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  carrier_inquiries                        IS '服务商询价（需求 5.3）：对一张客户询价单向多家服务商问成本';
COMMENT ON COLUMN carrier_inquiries.carrier_inquiry_number IS '服务商询价单号 CINQ-YYYYMMDD-SEQ';
COMMENT ON COLUMN carrier_inquiries.status                 IS 'PENDING/QUOTED/SELECTED/DECLINED/CANCELLED';
COMMENT ON COLUMN carrier_inquiries.quoted_cost            IS '服务商报来的成本，成本敏感字段';
COMMENT ON COLUMN carrier_inquiries.transit_days           IS '服务商承诺时效（天）';

CREATE INDEX IF NOT EXISTS idx_carrier_inquiries_inquiry ON carrier_inquiries(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_carrier_inquiries_carrier ON carrier_inquiries(carrier_id);
CREATE INDEX IF NOT EXISTS idx_carrier_inquiries_status  ON carrier_inquiries(status);

-- 一张客户询价最多选用一家服务商（部分唯一索引，只约束 SELECTED）
CREATE UNIQUE INDEX IF NOT EXISTS uq_carrier_inquiries_selected
  ON carrier_inquiries(inquiry_id) WHERE status = 'SELECTED';

-- ----------------------------------------------------------------------------
-- 2. 编号范围
--
--    服务商询价是询价单的下挂记录，不是对外凭证 ——
--    刻意不走 documents 凭证引擎（不占凭证号、不进单据流），只借编号范围保证唯一有序。
-- ----------------------------------------------------------------------------
INSERT INTO number_ranges (object_type, company_code, fiscal_year, prefix,
                           range_start, range_end, current_number, number_format)
VALUES ('CINQ', 'DE01', 2026, 'CINQ-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}')
ON CONFLICT (object_type, company_code, fiscal_year) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. 报价单挂上成本来源
--
--    carrier_cost 只是"报价时参考的成本快照"，不是财务应付 ——
--    真正的应付账款仍然由 finance 模块在派单后按实际结算产生，两者不要混。
-- ----------------------------------------------------------------------------
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS carrier_cost           NUMERIC(12,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS carrier_cost_source_id UUID REFERENCES carrier_inquiries(id);

COMMENT ON COLUMN quotations.carrier_cost           IS '报价时参考的服务商成本快照（成本敏感字段，仅 carrier_inquiry:view 可见）';
COMMENT ON COLUMN quotations.carrier_cost_source_id IS '成本来自哪张服务商询价';

COMMIT;
