-- ============================================================================
-- 125_carrier_inquiry_email.sql
-- 服务商询价邮件直发（Frank 2026-08-07 定，调整 2026-08-02「只登记不发邮件」的决定）
--
-- 三件事：
--   1. carriers 补 inquiry_emails —— 每家服务商可登记多个接受询价的邮箱，
--      发询价邮件时全部作为收件人；为空则回退用 contact_email
--   2. carrier_inquiries 补 email_recipients / email_notification_id ——
--      记录这单询价邮件发给了谁、对应哪条邮件队列记录
--      （发送状态 / 失败原因不在本表重复存一份，从 notifications 那边查，
--        避免两处状态互相对不上）
--   3. notifications.email_to 放宽 VARCHAR(150) → TEXT ——
--      多个收件邮箱逗号相连，150 字符装不下；varchar→text 只是元数据变更，
--      不重写表、不锁数据
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS inquiry_emails JSONB DEFAULT '[]';

COMMENT ON COLUMN carriers.inquiry_emails
  IS '接受询价的邮箱列表（JSON 字符串数组）；为空时发询价邮件回退用 contact_email';

ALTER TABLE carrier_inquiries
  ADD COLUMN IF NOT EXISTS email_recipients JSONB DEFAULT '[]';

-- 引用邮件队列记录：通知行如果将来被清理，这里置空即可，不能反过来挡住清理
ALTER TABLE carrier_inquiries
  ADD COLUMN IF NOT EXISTS email_notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL;

COMMENT ON COLUMN carrier_inquiries.email_recipients
  IS '最近一次询价邮件的收件人列表（JSON 数组），空数组 = 没发过邮件';
COMMENT ON COLUMN carrier_inquiries.email_notification_id
  IS '最近一次询价邮件对应的 notifications 行，发送状态/失败原因从那边查';

ALTER TABLE notifications
  ALTER COLUMN email_to TYPE TEXT;

COMMIT;
