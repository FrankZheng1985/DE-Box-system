-- ============================================================================
-- 127_inquiries_soft_delete.sql
-- 询价单软删除（开发意见 #2：客户批量导入错了要能自己删）
--
-- 为什么不物理删：
--   询价单是业务凭证的上游，客户删掉之后运营侧必须还能追溯"这张单去哪了、
--   谁什么时候删的"。原先 DELETE /inquiries/:id 是 DELETE FROM inquiries，
--   连带 inquiry_cargo_items 一起 CASCADE 掉，删完什么都不剩。
--
-- 删除条件由后端守卫（仅 PENDING_QUOTE，且运营还没建报价 / 没发服务商询价）。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

COMMENT ON COLUMN inquiries.deleted_at IS '软删除时间，NULL=未删除；所有业务查询必须过滤 deleted_at IS NULL';
COMMENT ON COLUMN inquiries.deleted_by IS '执行删除的用户（客户门户账号或运营账号）';

-- 部分索引：列表/统计每次都带 deleted_at IS NULL，只给未删除的行建索引，
-- 索引体积不会随历史删除量增长
CREATE INDEX IF NOT EXISTS idx_inquiries_not_deleted
  ON inquiries(created_at DESC) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 开放 API 的幂等唯一索引要放过已删除的单
--
-- 原索引（迁移 112）只按 (external_source, external_ref) 唯一。软删除之后这条
-- 记录还在表里，合作方拿同一个 externalOrderNo 重推就会撞 23505，而应用层的
-- 补查（service.js 的 catch 分支）已经过滤掉了已删单，查不到就把 23505 抛出去
-- 变成 500 —— 客户删掉错单后反而再也导不进来。
--
-- 索引名保持不变，用 DROP + CREATE 换谓词（IF NOT EXISTS 不会改已存在索引的定义）。
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS uq_inquiries_external;
CREATE UNIQUE INDEX uq_inquiries_external
  ON inquiries(external_source, external_ref)
  WHERE external_source IS NOT NULL AND external_ref IS NOT NULL AND deleted_at IS NULL;

COMMIT;
