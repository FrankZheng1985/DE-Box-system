-- 134: 客户门户「修改订单基本信息」补权限码
--
-- 背景：飞书开发意见表第 12 条 —— 客户下单后发现尺寸重量/地址/国家填错了，
--   要能自己在原单上改，不用重新建一张。
--   新端点：PUT /api/v1/orders/:id/basic-info
--
-- 为什么单独造码，不复用 portal:order_create：
--   「能下单」和「能改已经提交的单」是两件事。改单会动已经进入我司视野的数据，
--   有的客户希望只让特定的人改（下单的人多、能改单的人少），复用建单码就没法分开收放。
--   运营侧不新增码：运营改单一直走 PUT /orders/:id + order:edit，不受影响。
--
-- 可改范围由**后端白名单**兜底（server/modules/order/routes.js 的 CLIENT_EDITABLE_FIELDS），
-- 权限码只管「能不能改」，不管「能改哪些字段」——
-- 尤其 client_price（报给这家客户的价）不在白名单里，客户改不了自己的价。
--
-- 状态守卫同样在后端：只有订单还在初始状态（卡车运输 PENDING_REVIEW / 本地派送
-- PENDING_QUOTE，即我司尚未受理）才允许客户改，一旦确认/派车就只能联系运营。
--
-- 本迁移是 additive 的：只新增一个权限码 + 给既有角色授权，
-- 不改表结构、不动任何业务数据。可重复执行。
--
-- 回滚：
--   DELETE FROM role_permissions WHERE perm_code = 'portal:order_edit';
--   DELETE FROM permissions      WHERE perm_code = 'portal:order_edit';

-- 1) 新权限码
--    ⚠️ 必须写成「行首一个左括号紧跟码」的形式：
--    scripts/check-permission-menu-sync.js 用 /^\s*\('码'/ 抓字典，
--    换行写成 VALUES (\n  '码' 的话脚本抓不到，门禁会报「代码引用了字典里没有的权限码」。
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description)
VALUES
  ('portal:order_edit', '修改订单', 'portal', '客户门户', 'ACTION', 'CLIENT', 2010,
   '客户门户：我司尚未受理前，自行修改订单的地址、货物、日期等基本信息（改不了金额和状态）')
ON CONFLICT (perm_code) DO NOTHING;

-- 2) 原本就能在线下单的角色一并给上改单
--    口径同迁移 123 给 portal:order_import 授权的做法
INSERT INTO role_permissions (role_id, perm_code)
SELECT DISTINCT rp.role_id, 'portal:order_edit'
FROM role_permissions rp
WHERE rp.perm_code = 'portal:order_create'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 3) 超管与 boss 一并补上，符合「新权限自动给管理角色」的既有约定
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, 'portal:order_edit'
FROM roles r
WHERE r.role_code IN ('sys_admin', 'boss')
ON CONFLICT (role_id, perm_code) DO NOTHING;
