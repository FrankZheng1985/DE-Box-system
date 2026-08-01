-- ============================================================================
-- 107_inquiry_quotation_loop.sql
-- 询价报价闭环·客户侧（需求 2 + 5.1 + 5.4）
--
-- 三件事：
--   1. inquiries 补联系人信息、LDM、客户单号 —— 清平姐要的"复制摘要"字段来源
--   2. 新表 inquiry_cargo_items 按件明细 —— 一张询价单可以有多行货物
--   3. quotations 补客户决策留痕 + 自动建单产出的订单外键
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 询价单补字段
--
--    地址不另开列：route_from / route_to 已是 JSONB，统一按订单
--    orders.pickup_address 的同一套形状 { country, city, zipCode, address } 存，
--    前后端才有唯一契约（踩坑 011 形态四就是两端形状不一致踩的）。
-- ----------------------------------------------------------------------------
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(100);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS contact_email VARCHAR(100);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS customer_ref  VARCHAR(100);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS ldm           NUMERIC(10,2);

COMMENT ON COLUMN inquiries.contact_name  IS '询价联系人姓名';
COMMENT ON COLUMN inquiries.contact_phone IS '询价联系人电话（复制摘要要用）';
COMMENT ON COLUMN inquiries.contact_email IS '询价联系人邮箱（报价邮件收件人）';
COMMENT ON COLUMN inquiries.customer_ref  IS '客户方单号 / 参考号，用于和客户对账';
COMMENT ON COLUMN inquiries.ldm           IS '装载米合计，由 inquiry_cargo_items 各行汇总回写';

CREATE INDEX IF NOT EXISTS idx_inquiries_customer_ref
  ON inquiries(customer_ref) WHERE customer_ref IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. 询价按件货物明细
--
--    单位约定（写死在这里，前后端都照这个来）：
--      长/宽/高 —— 厘米 cm（物流询价单的习惯单位）
--      单件实重 —— 千克 kg
--      单件体积 —— 立方米 m³ = 长 × 宽 × 高 ÷ 1,000,000
--      行级 LDM —— 装载米 = (长cm÷100) × (宽cm÷100) ÷ 2.4 × 件数
--                  2.4 是欧洲标准车厢内宽（米）
--
--    unit_volume_m3 / ldm 由后端自动算并允许人工覆盖，
--    覆盖过的行用 ldm_manual 标记，避免下次重算时把人工值冲掉。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inquiry_cargo_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id     UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  line_number    INTEGER NOT NULL,
  reference_no   VARCHAR(100),
  description    VARCHAR(255),
  quantity       INTEGER NOT NULL DEFAULT 1,
  length_cm      NUMERIC(10,2),
  width_cm       NUMERIC(10,2),
  height_cm      NUMERIC(10,2),
  unit_weight_kg NUMERIC(10,2),
  unit_volume_m3 NUMERIC(12,4),
  ldm            NUMERIC(10,2),
  ldm_manual     BOOLEAN NOT NULL DEFAULT false,
  stackable      BOOLEAN NOT NULL DEFAULT true,
  remarks        TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  inquiry_cargo_items          IS '询价按件货物明细（需求 5.4）';
COMMENT ON COLUMN inquiry_cargo_items.line_number    IS '行号，从 1 开始，同一询价单内唯一';
COMMENT ON COLUMN inquiry_cargo_items.reference_no   IS '该件的单号（客户单号 / 易抵达件号）';
COMMENT ON COLUMN inquiry_cargo_items.length_cm      IS '单件长（厘米）';
COMMENT ON COLUMN inquiry_cargo_items.width_cm       IS '单件宽（厘米）';
COMMENT ON COLUMN inquiry_cargo_items.height_cm      IS '单件高（厘米）';
COMMENT ON COLUMN inquiry_cargo_items.unit_weight_kg IS '单件实重（千克）';
COMMENT ON COLUMN inquiry_cargo_items.unit_volume_m3 IS '单件体积（立方米），长×宽×高÷1e6 自动算';
COMMENT ON COLUMN inquiry_cargo_items.ldm            IS '本行装载米合计（已含件数），长m×宽m÷2.4×件数';
COMMENT ON COLUMN inquiry_cargo_items.ldm_manual     IS 'true=LDM 被人工改过，重算时不覆盖';
COMMENT ON COLUMN inquiry_cargo_items.stackable      IS '是否可堆叠，不可堆叠的货 LDM 不打折';

CREATE UNIQUE INDEX IF NOT EXISTS uq_inquiry_cargo_items_line
  ON inquiry_cargo_items(inquiry_id, line_number);
CREATE INDEX IF NOT EXISTS idx_inquiry_cargo_items_inquiry
  ON inquiry_cargo_items(inquiry_id);

-- ----------------------------------------------------------------------------
-- 3. 报价单：客户决策留痕 + 自动建单产出
--
--    需求 2：客户接受报价后自动生成待审核订单。
--    converted_order_id 记住产出的订单，前端可以直接跳过去，
--    也让"这张报价到底建没建单"有唯一事实来源（不靠状态推断）。
--
--    新增状态 PENDING_DECISION（待定）：客户看过报价但还没拿定主意，
--    运营在列表里能一眼看出哪些单需要跟进。status 列没有 CHECK 约束，
--    加新值不需要改约束。
-- ----------------------------------------------------------------------------
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_response_at   TIMESTAMP;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_response_by   UUID REFERENCES users(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_response_note TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_order_id   UUID REFERENCES orders(id);

COMMENT ON COLUMN quotations.client_response_at   IS '客户做出接受/拒绝/待定决策的时间';
COMMENT ON COLUMN quotations.client_response_by   IS '做出决策的客户门户账号';
COMMENT ON COLUMN quotations.client_response_note IS '客户决策时填写的说明（拒绝原因 / 待定顾虑）';
COMMENT ON COLUMN quotations.converted_order_id   IS '接受报价后自动生成的订单，NULL 表示尚未建单';

CREATE INDEX IF NOT EXISTS idx_quotations_converted_order
  ON quotations(converted_order_id) WHERE converted_order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. 存量数据回填
--
--    已经走过"一键下单"的报价补上 converted_order_id，
--    靠单据流 document_flow 里报价→订单的连线反查。
--    没有连线的老单（手工建的）保持 NULL，不猜。
--
--    ⚠️ flow_type 的实际值是 'QUO_TO_ORD' 不是 'QUOTATION_TO_ORDER'：
--       document-engine.createDocument 传了 sourceDocType 时会自动建连线，
--       类型名是拼出来的 `${sourceDocType}_TO_${docType}`。
--       order/service.js 里那句显式 createFlowLink({flowType:'QUOTATION_TO_ORDER'})
--       因为 ON CONFLICT (preceding_doc_id, subsequent_doc_id) DO NOTHING
--       被静默跳过，从来没生效过。两个值都匹配，避免哪天那句被修好后漏回填。
-- ----------------------------------------------------------------------------
UPDATE quotations q
SET converted_order_id = o.id
FROM document_flow df
JOIN orders o ON o.document_id = df.subsequent_doc_id
WHERE df.preceding_doc_id = q.document_id
  AND df.flow_type IN ('QUO_TO_ORD', 'QUOTATION_TO_ORDER')
  AND q.converted_order_id IS NULL;

COMMIT;
