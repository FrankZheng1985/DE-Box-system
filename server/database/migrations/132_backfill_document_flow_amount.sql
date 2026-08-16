-- 132: 回填报价→订单单据流的金额（踩坑 017 遗留）
--
-- 背景
-- ----
-- `document_flow` 里所有 QUO→ORD 连线的 `amount` / `currency` 长期是 NULL。
-- 根因是同一条连线被建了两次、第一次赢了：
--   1. `document-engine.js` 的 createDocument() 收到 sourceDocType 就自动建一条，
--      类型名是拼的（'QUO' + '_TO_' + 'ORD' = QUO_TO_ORD），**不带金额**
--   2. `order/service.js` 随后显式调 createFlowLink() 补金额，撞唯一约束
--      被 `ON CONFLICT DO NOTHING` **整条丢弃**，金额跟着一起丢
-- 详见 docs/踩坑经验库/017_单据流类型名对不上导致回填落空.md
--
-- 代码侧已在本次修复：金额提前到 createDocument 传入（flowAmount/flowCurrency），
-- 且 createFlowLink 的 ON CONFLICT 改为只补空值，不再静默丢弃。
-- 这个迁移负责把**存量**那些已经建出来的空金额连线补上。
--
-- 影响面
-- ------
-- 只 UPDATE `document_flow` 的 amount / currency 两列，不改表结构、不改 flow_type、
-- 不动任何其他表。只碰 `amount IS NULL` 的行，已经有金额的一律不动。
-- 2026-08-16 执行前生产实际只有 1 行待回填（订单 EU-20260808-0004，900.00 EUR）。
-- 幂等：回填后 amount 不再为 NULL，重复执行影响 0 行。
--
-- 回滚
-- ----
-- 需要退回的话，把这批行的两列重新置空即可（下面注释掉的那句）。

UPDATE document_flow df
SET amount   = o.client_price,
    currency = COALESCE(o.currency, 'EUR')
FROM orders o
WHERE o.document_id = df.subsequent_doc_id
  -- 两个名字都要匹配：库里存的是拼出来的 QUO_TO_ORD，
  -- 而业务层那段死代码想写的是 QUOTATION_TO_ORDER（同踩坑 017 的处理）
  AND df.flow_type IN ('QUO_TO_ORD', 'QUOTATION_TO_ORDER')
  AND df.amount IS NULL
  AND o.client_price IS NOT NULL;

-- 回滚用（需要时手工执行）：
-- UPDATE document_flow SET amount = NULL, currency = NULL
-- WHERE flow_type IN ('QUO_TO_ORD', 'QUOTATION_TO_ORDER');
