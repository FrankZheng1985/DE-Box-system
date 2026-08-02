-- ============================================================================
-- 115_open_api_log_retention.sql
-- P8 收尾：开放 API 日志保留策略
--
-- 背景：api_request_logs 和 api_webhook_deliveries 只写不删。合作方接入后，
--       每次推送/回查各 1 条请求日志，每次状态变更 1 条投递记录——
--       日均几千条、一年百万级不夸张。趁两张表还是空的把清理做掉，
--       等有了存量再补，就要额外处理历史数据。
--
-- 保留天数走 system_settings，运营在系统设置里可调，不用改代码。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
  ('open_api_log_retention_days', '90', 'NUMBER',
   '开放 API 请求日志保留天数，超期自动清理；设为 0 表示永不清理'),
  ('open_api_delivery_retention_days', '90', 'NUMBER',
   'Webhook 投递记录保留天数（仅清理已完结的 SENT/FAILED，待投递的不动）；设为 0 表示永不清理')
ON CONFLICT (setting_key) DO NOTHING;

-- 清理按时间倒序扫，给两张表的时间列补索引（api_request_logs 已有
-- (api_key_id, created_at DESC) 复合索引，但清理是全表按时间过滤，用不上它的前缀）
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created
  ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_status_created
  ON api_webhook_deliveries(status, created_at);

COMMIT;
