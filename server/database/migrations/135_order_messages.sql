-- 135: 订单履约沟通日志（飞书开发意见 #14）
--
-- 背景
-- ----
-- 订单确认之后，履约过程中要跟客户传达的事情（到港了、清关卡住了、司机改约时间…）
-- 现在全靠线下微信群说，说完不留痕：客户看没看到不知道，客户回了什么散在聊天记录里，
-- 换个人接手就得从头翻群。意见 #14 要求把这段沟通搬到线上、挂在订单下面，
-- 让整个交付过程可视化。
--
-- 本次落地的链路（Frank 2026-08-28 拍板）：
--   运营在订单下写一条 → 客户门户订单详情可见 + 站内信/邮件通知
--   → 客户点「标记已读」，回执回传后台 → 客户可在该条下面回复 → 回复回传后台通知运营
--
-- ⚠️ 微信群推送这一步本次**不做**：个人微信群没有官方发送接口，
--    技术上只有企业微信群机器人 webhook 可行，而客户（翼能）用的是什么群还没确认。
--    代码里把「发通知」收敛在 sendOrderMessageNotification() 一个函数里，
--    将来接微信只需要在那里加一路出口，不用动表结构，所以本迁移不预留 webhook 字段
--    ——没确认的外部协议先不进库，免得字段和真实需要对不上。
--
-- 影响面：两张新表 + 两个新权限码。不改任何既有表的列、约束和数据。
-- 幂等：全部 IF NOT EXISTS / ON CONFLICT DO NOTHING，可重复执行。
--
-- 回滚：
--   DROP TABLE IF EXISTS order_message_reads;
--   DROP TABLE IF EXISTS order_messages;
--   DELETE FROM role_permissions WHERE perm_code IN ('order:message', 'portal:order_message');
--   DELETE FROM permissions      WHERE perm_code IN ('order:message', 'portal:order_message');

-- ==================== 1. 沟通消息 ====================

CREATE TABLE IF NOT EXISTS order_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- 回复挂在主消息下面，只有两层：主消息 parent_id 为 NULL，回复指向主消息。
  -- 不做无限层级——微信群里的对话本来就是「一件事 + 若干回应」，两层够用且好读。
  parent_id     UUID REFERENCES order_messages(id) ON DELETE CASCADE,

  -- 发送方身份：OPERATOR（我司运营）/ CLIENT（客户门户账号）
  -- 承运商不参与这条链路（他们看不到这个订单的客户沟通）
  sender_type   VARCHAR(20) NOT NULL CHECK (sender_type IN ('OPERATOR', 'CLIENT')),
  sender_id     UUID NOT NULL REFERENCES users(id),

  content       TEXT NOT NULL,

  created_at    TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE order_messages IS
  '订单履约沟通日志：运营与客户围绕某一张订单的往来信息，两层结构（主消息 + 回复）';
COMMENT ON COLUMN order_messages.parent_id IS
  'NULL = 主消息；非 NULL = 对该主消息的回复';

-- 详情页按订单取全部消息，按时间正序展示
CREATE INDEX IF NOT EXISTS idx_order_messages_order
  ON order_messages(order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_order_messages_parent
  ON order_messages(parent_id);

-- ==================== 2. 已读回执 ====================

-- 为什么单独一张表，而不是在 order_messages 上加一个 read_at：
-- 一家客户可以有多个门户账号（成员管理，迁移 118 起），
-- 「谁在什么时候读的」运营侧要能逐条看到，单列存不下。
-- 主键是 (message_id, user_id)，天然幂等——同一个人重复点「标记已读」不会重复计数。
CREATE TABLE IF NOT EXISTS order_message_reads (
  message_id  UUID NOT NULL REFERENCES order_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at     TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

COMMENT ON TABLE order_message_reads IS
  '订单沟通消息的已读回执：客户在门户点「标记已读」后写一行，运营端据此显示已读状态';

CREATE INDEX IF NOT EXISTS idx_order_message_reads_user
  ON order_message_reads(user_id);

-- ==================== 3. 权限码 ====================

-- ⚠️ 必须写成「行首一个左括号紧跟码」的形式：
--    scripts/check-permission-menu-sync.js 用 /^\s*\('码'/ 抓字典，
--    换行写成 VALUES (\n  '码' 的话脚本抓不到，门禁会报「代码引用了字典里没有的权限码」。
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description)
VALUES
  ('order:message', '订单沟通', 'order', '订单管理', 'ACTION', 'ALL', 1080,
   '在订单下发布履约沟通信息、查看客户回复与已读回执'),
  ('portal:order_message', '订单留言', 'portal', '客户门户', 'ACTION', 'CLIENT', 2020,
   '客户门户：查看我司发布的履约信息、标记已读、在其下回复处理意见')
ON CONFLICT (perm_code) DO NOTHING;

-- 3.1 运营侧：本来就能改订单状态的角色，都给上「订单沟通」
--     （口径同迁移 134：按既有的相近权限推导授权范围，不手工点名角色）
INSERT INTO role_permissions (role_id, perm_code)
SELECT DISTINCT rp.role_id, 'order:message'
FROM role_permissions rp
WHERE rp.perm_code = 'order:status'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 3.2 客户侧：能看订单的门户角色，都给上「订单留言」
--     看得到履约信息却回不了话没有意义，所以跟着 portal:order_view 走
INSERT INTO role_permissions (role_id, perm_code)
SELECT DISTINCT rp.role_id, 'portal:order_message'
FROM role_permissions rp
WHERE rp.perm_code = 'portal:order_view'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 3.3 超管与 boss 一并补上，符合「新权限自动给管理角色」的既有约定
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r
CROSS JOIN (VALUES ('order:message'), ('portal:order_message')) AS p(perm_code)
WHERE r.role_code IN ('sys_admin', 'boss')
ON CONFLICT (role_id, perm_code) DO NOTHING;
