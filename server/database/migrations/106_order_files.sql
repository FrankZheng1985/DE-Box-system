-- ============================================================================
-- 106_order_files.sql
-- 订单文件中心（需求 3）
--
-- 以订单为维度管理文件：装车图 / CMR / 签收凭证 / 其他。
-- CMR 仍然单独存 cmr_documents（签署状态/货损是它的专属价值），
-- order_files 里的 CMR 类别只是"这个订单有一份 CMR 文件"的统一视图入口。
--
-- ⚠️ 签收凭证类别命名用 POD_PROOF，刻意避开 orders.pod（那是"卸港"）。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  -- LOADING_PHOTO 装车图 / CMR 运输单据 / POD_PROOF 签收凭证 / OTHER 其他
  file_category VARCHAR(20) NOT NULL DEFAULT 'OTHER'
    CHECK (file_category IN ('LOADING_PHOTO', 'CMR', 'POD_PROOF', 'OTHER')),
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  -- OSS 对象路径（本地存储时为空；删除文件时靠它删 OSS 对象）
  oss_path TEXT,
  file_type VARCHAR(10) DEFAULT 'PDF',
  file_size_bytes BIGINT,
  remarks TEXT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE order_files IS '订单文件中心：以订单为维度的文件管理（装车图/CMR/签收凭证/其他）';
COMMENT ON COLUMN order_files.file_category IS 'LOADING_PHOTO 装车图 / CMR 运输单据 / POD_PROOF 签收凭证 / OTHER 其他（POD_PROOF 命名避开 orders.pod 卸港字段）';
COMMENT ON COLUMN order_files.oss_path IS 'OSS 对象路径，本地存储时为 NULL，删除时用于同步删 OSS 对象';

CREATE INDEX IF NOT EXISTS idx_order_files_order ON order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_category ON order_files(order_id, file_category);

COMMIT;
