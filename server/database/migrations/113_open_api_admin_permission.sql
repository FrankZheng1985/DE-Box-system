-- ============================================================================
-- 113_open_api_admin_permission.sql
-- P8 第二阶段：admin 端「开放 API 管理」页面的权限码（权限四件套第 1 件）
--
--   open_api:manage —— 合作方密钥签发/停用/换钥匙 + API 请求日志查看
--
--   默认分配：sys_admin、op_manager（对接管理属运营管理层职责；
--   op_staff 刻意不给 —— 密钥能以客户名义建单，等同于"替客户下单"的钥匙）
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description) VALUES
  ('open_api:manage', '开放API对接管理', 'open_api', '开放API', 'MENU', 'OPERATOR', 360,
   '合作方密钥签发/停用/换钥匙与请求日志查看（P8）')
ON CONFLICT (perm_code) DO UPDATE SET
  perm_name   = EXCLUDED.perm_name,
  module      = EXCLUDED.module,
  module_name = EXCLUDED.module_name,
  perm_type   = EXCLUDED.perm_type,
  scope       = EXCLUDED.scope,
  sort_order  = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- 默认分配（DO NOTHING：不覆盖管理员在角色权限页做过的调整）
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, 'open_api:manage'
FROM roles r
WHERE r.role_code IN ('sys_admin', 'op_manager')
ON CONFLICT (role_id, perm_code) DO NOTHING;

COMMIT;
