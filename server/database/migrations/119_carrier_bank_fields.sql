-- ============================================================================
-- 119_carrier_bank_fields.sql
-- 承运商加银行字段（配合「公司设置」页真正能存住）
--
-- 背景：承运商门户的「公司设置」页有 8 个字段，但它 PUT 的是
--       /system/settings/account —— 那个接口只认 email / phone /
--       displayName / language 四个字段，其余 6 个**发过去直接被忽略**。
--       页面还照样弹「保存成功」，承运商填完刷新就没了。
--
--       6 个丢掉的字段里，5 个在 carriers 表里有对应列
--       （company_name / contact_name / address / vat_number / contact_phone），
--       只有银行名和账号没有列。
--
-- 为什么值得加这两列：我们是**付钱给承运商**的一方，收款账户本来就该记在
--       承运商档案里。现在这个信息散在邮件和微信里，运营每次付款都要翻聊天记录。
--
-- 只加在 carriers，不加在 clients：客户是我们开票收钱的对象，
--       我们不需要存客户的收款账户。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

ALTER TABLE carriers ADD COLUMN IF NOT EXISTS bank_name    VARCHAR(200);
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS bank_account VARCHAR(100);

COMMENT ON COLUMN carriers.bank_name    IS '收款银行名称（承运商在门户「公司设置」里自己维护）';
COMMENT ON COLUMN carriers.bank_account IS '收款账号 / IBAN';

COMMIT;

-- ============================================================================
-- 回滚（如需）
-- ============================================================================
-- BEGIN;
-- ALTER TABLE carriers DROP COLUMN IF EXISTS bank_name;
-- ALTER TABLE carriers DROP COLUMN IF EXISTS bank_account;
-- COMMIT;
