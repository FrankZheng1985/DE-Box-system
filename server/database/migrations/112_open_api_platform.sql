-- ============================================================================
-- 112_open_api_platform.sql
-- P8 开放 API 对接平台（需求 4 + 5.1 第三种来源）
--
-- 三件事：
--   1. api_keys —— 合作方（易抵达/傲翼/翼能）的 API 密钥档案
--   2. api_request_logs —— 开放 API 请求留痕（成功失败都记）
--   3. inquiries / orders 补 external_source / external_ref —— 幂等去重的事实来源
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. API 密钥档案
--
--    密钥明文只在生成那一刻出现一次（脚本打印给对方），库里只存 SHA-256。
--    key_prefix 存明文前 12 位，用于人工核对"对方手里那把是不是这条记录"。
--
--    client_id：这把钥匙推进来的询价/订单都挂在这个客户名下 ——
--    开放 API 没有登录态，"单子是谁的"由钥匙绑定，不信请求体。
--
--    created_by 兼任免登录场景的"操作人"（踩坑 019：凭证引擎的
--    created_by 是 NOT NULL REFERENCES users(id)，不能传 null 也不能伪造）。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code       VARCHAR(50)  NOT NULL UNIQUE,
  partner_name       VARCHAR(100) NOT NULL,
  client_id          UUID NOT NULL REFERENCES clients(id),
  key_prefix         VARCHAR(20)  NOT NULL,
  key_hash           VARCHAR(64)  NOT NULL UNIQUE,
  status             VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  rate_limit_per_min INTEGER      NOT NULL DEFAULT 60,
  ip_whitelist       JSONB        NOT NULL DEFAULT '[]',
  last_used_at       TIMESTAMP,
  remarks            TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  api_keys IS '开放 API 合作方密钥（P8，需求 4）';
COMMENT ON COLUMN api_keys.partner_code       IS '合作方代码（YIDIDA / AOYI / YINENG…），大写，进 external_source';
COMMENT ON COLUMN api_keys.client_id          IS '该合作方推单挂靠的客户档案，身份由钥匙绑定而非请求体';
COMMENT ON COLUMN api_keys.key_prefix         IS '密钥明文前 12 位，仅用于人工核对，不能反推密钥';
COMMENT ON COLUMN api_keys.key_hash           IS '密钥 SHA-256 十六进制，库里不存明文';
COMMENT ON COLUMN api_keys.status             IS 'ACTIVE 启用 / DISABLED 停用';
COMMENT ON COLUMN api_keys.rate_limit_per_min IS '每分钟请求上限（按钥匙计）';
COMMENT ON COLUMN api_keys.ip_whitelist       IS 'JSON 数组；空数组 = 不限来源 IP';
COMMENT ON COLUMN api_keys.created_by         IS '建钥匙的运营账号，兼任 API 建单时凭证的操作人（踩坑 019）';

-- ----------------------------------------------------------------------------
-- 2. 开放 API 请求日志
--
--    高频写入用 BIGSERIAL，不用 UUID。
--    partner_code 冗余一份：钥匙换绑/停用后历史日志仍然可读。
--    写日志一律走独立池连接（踩坑 027）：业务事务回滚时，
--    "失败的请求"恰恰是最需要留痕的。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_request_logs (
  id            BIGSERIAL PRIMARY KEY,
  api_key_id    UUID REFERENCES api_keys(id),
  partner_code  VARCHAR(50),
  method        VARCHAR(10),
  path          VARCHAR(200),
  external_ref  VARCHAR(100),
  status_code   INTEGER,
  result        VARCHAR(30),
  error_message TEXT,
  request_body  JSONB,
  ip            VARCHAR(64),
  duration_ms   INTEGER,
  created_at    TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  api_request_logs IS '开放 API 请求留痕（P8）；写入走独立池连接，不随业务事务回滚';
COMMENT ON COLUMN api_request_logs.external_ref IS '对方系统单号（幂等键的一半），无法解析请求体时为 NULL';
COMMENT ON COLUMN api_request_logs.result IS 'SUCCESS / DUPLICATE / VALIDATION_ERROR / AUTH_ERROR / FORBIDDEN / RATE_LIMITED / BUSINESS_ERROR / SERVER_ERROR';

CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_time
  ON api_request_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_external_ref
  ON api_request_logs(external_ref) WHERE external_ref IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. 幂等去重字段
--
--    同一合作方同一外部单号只允许落一条询价/一张订单。
--    用部分唯一索引（两列都非空才参与唯一性），人工建的单两列都是 NULL，完全不受影响。
--
--    ⚠️ 踩坑 020：部分唯一索引没法被裸 ON CONFLICT 推断。
--       消费方（open-api 模块）用"事务内先查后插 + 捕获 23505"实现幂等，
--       不写 ON CONFLICT，后来人别改回去。
-- ----------------------------------------------------------------------------
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS external_ref    VARCHAR(100);
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS external_ref    VARCHAR(100);

COMMENT ON COLUMN inquiries.external_source IS '来源系统（api_keys.partner_code），人工建单为 NULL';
COMMENT ON COLUMN inquiries.external_ref    IS '来源系统的单号，与 external_source 组成幂等键';
COMMENT ON COLUMN orders.external_source    IS '来源系统（api_keys.partner_code），人工建单为 NULL';
COMMENT ON COLUMN orders.external_ref       IS '来源系统的单号，与 external_source 组成幂等键';

CREATE UNIQUE INDEX IF NOT EXISTS uq_inquiries_external
  ON inquiries(external_source, external_ref)
  WHERE external_source IS NOT NULL AND external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external
  ON orders(external_source, external_ref)
  WHERE external_source IS NOT NULL AND external_ref IS NOT NULL;

COMMIT;
