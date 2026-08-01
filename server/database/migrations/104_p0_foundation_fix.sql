-- ============================================================================
-- 104_p0_foundation_fix.sql
-- P0 地基修复包
--
-- 修复三类"代码在用但库里没有"的缺口：
--   1. 作废原因列 void_reason —— quotation/client/carrier 三个模块的作废接口在写这一列，
--      但 100 号建表脚本里没有（只有 004 给 orders/invoices/tms_shipments 加过）
--   2. 官网留言表 contact_inquiries —— contact/routes.js 在读写，任何迁移里都没建过
--   3. notifications 表的邮件发送状态列 —— 原来 EMAIL 渠道只入库不发送，
--      现在由 utils/email-queue.js 轮询发送，需要记录发送状态和重试次数
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 作废原因列
-- ----------------------------------------------------------------------------
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE clients    ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE carriers   ADD COLUMN IF NOT EXISTS void_reason TEXT;

COMMENT ON COLUMN quotations.void_reason IS '作废原因（作废时必填）';
COMMENT ON COLUMN clients.void_reason    IS '作废原因（作废时必填）';
COMMENT ON COLUMN carriers.void_reason   IS '作废原因（作废时必填）';

-- ----------------------------------------------------------------------------
-- 2. 官网留言表
--    字段与 server/modules/contact/routes.js 的读写完全对应
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  message TEXT NOT NULL,
  source VARCHAR(30) DEFAULT 'WEBSITE',       -- 来源：WEBSITE 官网 / PHONE 电话 / OTHER
  status VARCHAR(20) DEFAULT 'NEW',           -- NEW 新咨询 / REPLIED 已回复 / CLOSED 已关闭
  notes TEXT,                                 -- 内部备注
  replied_at TIMESTAMP,
  replied_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON contact_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_time ON contact_inquiries(created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. 通知表：邮件发送状态
--    email_status 为 NULL 表示这条通知不需要发邮件（纯站内信）
-- ----------------------------------------------------------------------------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_to VARCHAR(150);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status VARCHAR(20);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_attempts INTEGER DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_claimed_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_error TEXT;

COMMENT ON COLUMN notifications.email_to         IS '收件邮箱快照（发送时不再回查 users 表）';
COMMENT ON COLUMN notifications.email_status     IS 'NULL=不发邮件 / PENDING 待发送 / SENDING 已被某个进程领取 / SENT 已发送 / FAILED 发送失败';
COMMENT ON COLUMN notifications.email_attempts   IS '已尝试发送次数，达到上限后不再重试';
COMMENT ON COLUMN notifications.email_claimed_at IS '被轮询进程领取的时间，用于回收卡死记录（PM2 cluster 多进程并发）';

-- 只给待发送的行建索引，轮询任务扫描时不会全表扫
CREATE INDEX IF NOT EXISTS idx_notifications_email_pending
  ON notifications(created_at) WHERE email_status = 'PENDING';

COMMIT;
