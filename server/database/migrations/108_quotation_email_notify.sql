-- ============================================================================
-- 108_quotation_email_notify.sql
-- 报价邮件通知 + 客户通知设置（需求 5.2 + 8）
--
-- 四件事：
--   1. 新表 quotation_response_tokens —— 邮件里「同意/拒绝/待定」链接的一次性凭证
--   2. notifications 补 email_template / email_payload —— 让邮件队列能选模板
--   3. notification_preferences 扩展到客户公司维度
--   4. system_settings 补付款提醒与报价邮件的配置项
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. 报价确认链接的一次性 token
--
--    需求 5.2 原文问的是"系统能否读客户回复邮件"。系统没有 IMAP 收信能力，
--    做内容解析成本高且不可靠，改为邮件里放三个确认链接（计划书「四、待确认」第 2 条）。
--
--    安全设计：
--      - 只存 token 的 SHA-256 哈希，明文仅出现在那封邮件里（和密码重置同一套路数）
--        —— 库被读走也无法伪造链接
--      - 单次使用：used_at 一旦写上就不再受理
--      - 有过期时间：默认取报价的 valid_until，没有就按 system_settings 的天数
--      - 记录 used_ip / used_action 便于事后追溯"到底是谁点的"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation_response_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL UNIQUE,
  expires_at    TIMESTAMP NOT NULL,
  used_at       TIMESTAMP,
  used_action   VARCHAR(20),
  used_ip       VARCHAR(64),
  sent_to       VARCHAR(200),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  quotation_response_tokens             IS '报价确认链接的一次性凭证（需求 5.2）';
COMMENT ON COLUMN quotation_response_tokens.token_hash  IS 'token 的 SHA-256 十六进制哈希，明文只存在于邮件中';
COMMENT ON COLUMN quotation_response_tokens.expires_at  IS '过期时间，默认取报价 valid_until';
COMMENT ON COLUMN quotation_response_tokens.used_at     IS '已使用时间，非空表示该链接作废';
COMMENT ON COLUMN quotation_response_tokens.used_action IS '客户点的是 ACCEPT / REJECT / PENDING';
COMMENT ON COLUMN quotation_response_tokens.sent_to     IS '这封邮件发给了谁，便于追溯';

CREATE INDEX IF NOT EXISTS idx_quotation_tokens_quotation
  ON quotation_response_tokens(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_tokens_unused
  ON quotation_response_tokens(expires_at) WHERE used_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. 通知表补邮件模板信息
--
--    P0 建的邮件队列（utils/email-queue.js）对每封邮件都套同一个
--    notificationEmail(title, message) 纯文本模板 —— 渲染不出带按钮的报价邮件。
--    这里补两列让队列能按模板名分发，email_payload 存模板需要的变量。
--    老数据 email_template 为 NULL，队列继续走默认模板，行为不变。
-- ----------------------------------------------------------------------------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_template VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_payload  JSONB;

COMMENT ON COLUMN notifications.email_template IS '邮件模板名，NULL 表示用默认的通用通知模板';
COMMENT ON COLUMN notifications.email_payload  IS '模板渲染所需变量（如报价金额、确认链接）';

-- user_id 放开为可空：报价邮件的收件人是询价单上填的联系邮箱，
-- 这个人未必在系统里有账号，硬塞一个 user_id 等于伪造收件人。
-- 放开后一行 notification 表示三种情况之一：
--   user_id 非空、email_to 空 → 纯站内信
--   user_id 空、email_to 非空 → 纯对外邮件（本次新增的场景）
--   两者都非空             → 站内信 + 邮件
-- 用 CHECK 卡住"两个都空"的无意义行。
-- 存量行 user_id 都非空，不受影响；按 user_id 查站内信的语句也不用改（NULL 行天然不匹配）。
ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notification_target;
ALTER TABLE notifications
  ADD CONSTRAINT chk_notification_target
  CHECK (user_id IS NOT NULL OR email_to IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 3. 通知偏好扩展到客户公司维度（需求 8）
--
--    原表只有 user_id 一个维度，客户公司管理员没法给整个公司设默认。
--    改成 user_id 和 client_id 二选一：
--      user_id 非空   → 这个人的个人偏好（优先级高）
--      client_id 非空 → 这家公司的默认偏好（个人没设时兜底）
--
--    原来的 UNIQUE(user_id, event_type) 必须换成两个部分唯一索引，
--    否则公司级记录的 user_id 全是 NULL，在 UNIQUE 里 NULL 互不相等，
--    同一家公司同一事件能插进无数条重复行。
-- ----------------------------------------------------------------------------
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE notification_preferences ALTER COLUMN user_id DROP NOT NULL;

-- 丢掉原来的整表唯一约束（名字是 PostgreSQL 自动生成的，用 IF EXISTS 兜住）
ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_user_id_event_type_key;

-- user_id / client_id 必须且只能有一个非空，否则这行归属不明
ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS chk_notification_pref_owner;
ALTER TABLE notification_preferences
  ADD CONSTRAINT chk_notification_pref_owner
  CHECK ((user_id IS NOT NULL AND client_id IS NULL)
      OR (user_id IS NULL AND client_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_pref_user
  ON notification_preferences(user_id, event_type) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_pref_client
  ON notification_preferences(client_id, event_type) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN notification_preferences.client_id IS '客户公司级默认偏好；与 user_id 二选一';

-- ----------------------------------------------------------------------------
-- 4. 提醒相关配置
--
--    放进已有的 system_settings（key-value 表，后端读写接口早就有，前端一直没用）。
--    ON CONFLICT DO NOTHING —— 重复执行不会把管理员改过的值冲回默认。
-- ----------------------------------------------------------------------------
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
  ('quotation_email_enabled',      'true', 'BOOLEAN', '发送报价时是否给客户发确认邮件'),
  ('quotation_token_valid_days',   '14',   'NUMBER',  '报价确认链接有效天数（报价本身有有效期时以其为准）'),
  ('payment_reminder_enabled',     'true', 'BOOLEAN', '是否发送账单到期提醒'),
  ('payment_reminder_days_before', '7',    'NUMBER',  '账单到期前提前几天提醒'),
  ('overdue_reminder_enabled',     'true', 'BOOLEAN', '是否发送逾期催款提醒'),
  ('overdue_auto_flag_enabled',    'true', 'BOOLEAN', '是否每天自动把逾期账单标记为 OVERDUE')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
