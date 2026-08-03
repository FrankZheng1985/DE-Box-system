-- ============================================================================
-- 118_notification_i18n_keys.sql
-- P9 收尾：通知的标题/正文改成「key + 变量」，让它能按收件人语言渲染
--
-- 背景：P9 把三端前端、Excel 表头、邮件外壳和两个客户侧邮件模板都做成三语了，
--       但走通用模板的那类通知邮件，**标题和正文仍然是中文**，站内信也一样。
--
--       原因是 notifications.title / .message 存的是**写库那一刻就渲染好的
--       中文成品**：
--         title:   `订单 ORD20260801 已确认`
--         message: `您的订单 ORD20260801 已通过审核`
--       发信时只拿得到这个字符串，翻不了。
--
-- 做法：additive 加三列，存「渲染用的 key」和「变量」，
--       原来的 title / message 照旧写中文成品不动：
--         title_key   = 'notify.orderConfirmed.title'
--         message_key = 'notify.orderConfirmed.message'
--         payload     = {"orderNo": "ORD20260801"}
--
--       读的一方（站内信列表、邮件队列）有 key 就按收件人语言渲染，
--       没有 key 就用原来的中文 title / message。
--
-- 为什么不直接把 title 改成存 key：
--   1. 存量数据全是中文成品，改语义会让老通知显示成 key
--   2. 通知表被开放 API、导出等多处读取，改字段含义影响面不可控
--   加列是纯增量，老数据和老代码一行都不用动。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title_key   VARCHAR(80);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_key VARCHAR(80);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload     JSONB;

COMMENT ON COLUMN notifications.title_key   IS
  '标题的语言包 key（server/i18n/locales 的 notify.*）；为空表示老数据，用 title 里的中文';
COMMENT ON COLUMN notifications.message_key IS
  '正文的语言包 key；为空表示老数据，用 message 里的中文';
COMMENT ON COLUMN notifications.payload     IS
  '渲染 title_key / message_key 用的变量，如 {"orderNo":"ORD20260801"}';

COMMIT;

-- ============================================================================
-- 回滚（如需）：删掉三列即可，title / message 里的中文一直都在，不会丢数据
-- ============================================================================
-- BEGIN;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS title_key;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS message_key;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS payload;
-- COMMIT;
