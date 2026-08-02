-- ============================================================================
-- 114_open_api_webhook.sql
-- P8 第四阶段：开放 API 状态变更 Webhook 主动推送
--
-- 三件事：
--   1. api_keys 补 webhook_url / webhook_secret —— 每个合作方一个接收端点
--      ⚠️ webhook_secret 必须明文存储：HMAC-SHA256 签名需要服务端拿到原文，
--         这点和 API Key 只存哈希不同（签名密钥泄露只能伪造通知，不能调接口）
--   2. 新表 api_webhook_deliveries —— 投递 outbox（PENDING/SENDING/SENT/FAILED + 退避重试）
--      去重靠 UNIQUE(api_key_id, event_type, dedupe_key)（全列 NOT NULL 的普通唯一约束，
--      ON CONFLICT 可直接推断——刻意不用部分索引，避开踩坑 020）
--   3. system_settings 播种两个扫描游标（从当下开始，不回灌历史事件）
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS webhook_url    TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64);

COMMENT ON COLUMN api_keys.webhook_url    IS '状态变更推送的接收端点，NULL = 该合作方不启用 Webhook';
COMMENT ON COLUMN api_keys.webhook_secret IS 'HMAC-SHA256 签名密钥（需明文，签名要用原文），随首次配置 URL 自动生成';

CREATE TABLE IF NOT EXISTS api_webhook_deliveries (
  id               BIGSERIAL PRIMARY KEY,
  api_key_id       UUID NOT NULL REFERENCES api_keys(id),
  partner_code     VARCHAR(50) NOT NULL,
  event_type       VARCHAR(50) NOT NULL,
  dedupe_key       VARCHAR(120) NOT NULL,
  external_ref     VARCHAR(100),
  payload          JSONB NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  claimed_at       TIMESTAMP,
  last_status_code INTEGER,
  last_error       TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  sent_at          TIMESTAMP,
  UNIQUE (api_key_id, event_type, dedupe_key)
);

COMMENT ON TABLE  api_webhook_deliveries IS 'Webhook 投递 outbox（P8）：扫描器入队，分发器领取投递，双实例安全靠 SKIP LOCKED';
COMMENT ON COLUMN api_webhook_deliveries.dedupe_key IS '事件去重键：订单状态=状态日志UUID；报价事件=报价UUID:状态';
COMMENT ON COLUMN api_webhook_deliveries.status     IS 'PENDING 待投 / SENDING 已领取 / SENT 成功(2xx) / FAILED 重试耗尽';
COMMENT ON COLUMN api_webhook_deliveries.next_attempt_at IS '下次尝试时间，失败按 1m/5m/30m/2h/6h 退避';

CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_due
  ON api_webhook_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_key_time
  ON api_webhook_deliveries(api_key_id, created_at DESC);

-- 扫描游标：从迁移执行时刻开始，历史状态变更不补推
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
  ('open_api_webhook_cursor_orders',     NOW()::text, 'STRING', 'Webhook 扫描游标：order_status_logs.created_at'),
  ('open_api_webhook_cursor_quotations', NOW()::text, 'STRING', 'Webhook 扫描游标：quotations.updated_at')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
