-- 121: 公司资料维护补权限码
--
-- 背景：PUT /api/v1/system/settings/company 此前只挂了 authenticate，不查任何权限码。
-- 后果是任何绑定了公司的门户账号都能改本公司档案，包括承运商的
-- bank_name / bank_account —— 那是结算打款字段，被低权限账号或被盗号者
-- 改成他人 IBAN 就是资金欺诈面。实测把 carrier_admin 的
-- carrier_portal:company_settings 移除后仍能改成功，说明该权限码形同虚设。
--
-- 本迁移是 additive 的：只新增一个权限码 + 给 client_admin 授权，
-- 不改表结构、不动任何业务数据。
--
-- 配套代码改动：system/routes.js 里 **只给 PUT /settings/company** 挂上
--   requirePermission('system:settings', 'portal:company_settings', 'carrier_portal:company_settings')
-- GET 不挂 —— 客户门户设置页对全员可见，普通成员角色 client_user 没有这个
-- 权限码，GET 一挂上页面里公司名/地址/联系人就会变成空白；而且读也只能读到
-- 自己公司（resolveCompanyScope 只认 JWT 的 linkedEntityId），风险面在写不在读。
--
-- 效果：运营 / 客户管理员 / 承运商管理员照常可改；
--       carrier_driver、client_user 能看不能改，被挡在银行字段之外。

-- 1) 新增客户门户的公司资料权限码
--    （承运商侧的 carrier_portal:company_settings 早已存在，无需重复插入）
--    字段取值对齐同组的 portal:user_manage（scope=CLIENT，sort_order 顺排到 2008）
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description)
VALUES (
  'portal:company_settings',
  '维护本公司资料',
  'portal',
  '客户门户',
  'MENU',
  'CLIENT',
  2008,
  '客户门户：查看并修改本公司名称、地址、联系人、税号等档案信息'
)
ON CONFLICT (perm_code) DO NOTHING;

-- 2) 客户管理员保持原有能力（不授权的话，本次挂权限码会让他们失去改公司资料的能力）
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, 'portal:company_settings'
FROM roles r
WHERE r.role_code = 'client_admin'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 3) 超管与 boss 类角色一并补上，符合"新权限自动给管理角色"的既有约定
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, 'portal:company_settings'
FROM roles r
WHERE r.role_code IN ('sys_admin', 'boss')
ON CONFLICT (role_id, perm_code) DO NOTHING;
