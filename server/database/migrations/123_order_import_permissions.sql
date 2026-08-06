-- 123: 订单批量导入补权限码
--
-- 背景：新增按运输产品分模板的订单批量导入
--   GET  /api/v1/orders/import-template?businessType=xxx  下载模板
--   POST /api/v1/orders/import/preview                    预览校验（不写库）
--   POST /api/v1/orders/import                            批量建单
--
-- 批量导入一次能建几十上百张单，比单张建单的影响面大得多，所以单独造码，
-- 不复用 order:create / portal:order_create —— 那样等于"能下单就能批量灌单"，
-- 想只放开单张建单时也没法收回。
--
-- 本迁移是 additive 的：只新增两个权限码 + 给既有角色授权，
-- 不改表结构、不动任何业务数据。
--
-- 配套代码改动：
--   server/modules/order/routes.js  三个端点挂 requirePermission('order:import', 'portal:order_import')
--   admin/src/constants/permissions.ts        菜单映射与页面按钮
--   customer-portal/src/constants/permissions.ts

-- 1) 两个新权限码
--    ⚠️ 每个码必须写成「行首一个左括号紧跟码」的形式：
--    scripts/check-permission-menu-sync.js 用 /^\s*\('码'/ 抓字典，
--    换行写成 VALUES (\n  '码' 的话脚本抓不到，门禁会报「代码引用了字典里没有的权限码」。
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description)
VALUES
  ('order:import', '批量导入订单', 'order', '订单管理', 'ACTION', 'OPERATOR', 109,
   '按运输产品下载 Excel 模板并批量建单，导入的订单同样进入待审核'),
  ('portal:order_import', '批量下单', 'portal', '客户门户', 'ACTION', 'CLIENT', 2009,
   '客户门户：下载模板后一次性提交多张订单，同样进入待审核')
ON CONFLICT (perm_code) DO NOTHING;

-- 3) 运营侧：原本就能建单的角色一并给上导入
INSERT INTO role_permissions (role_id, perm_code)
SELECT DISTINCT rp.role_id, 'order:import'
FROM role_permissions rp
WHERE rp.perm_code = 'order:create'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4) 客户门户侧：原本就能在线下单的角色一并给上批量下单
INSERT INTO role_permissions (role_id, perm_code)
SELECT DISTINCT rp.role_id, 'portal:order_import'
FROM role_permissions rp
WHERE rp.perm_code = 'portal:order_create'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 5) 超管与 boss 一并补上，符合"新权限自动给管理角色"的既有约定
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r
CROSS JOIN (VALUES ('order:import'), ('portal:order_import')) AS p(perm_code)
WHERE r.role_code IN ('sys_admin', 'boss')
ON CONFLICT (role_id, perm_code) DO NOTHING;
