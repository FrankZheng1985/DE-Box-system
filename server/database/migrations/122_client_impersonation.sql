-- 122: 运营人员以【自己的身份】进入某家客户的客户门户
--
-- 背景：运营排查"客户说他那边看不到某张单"时，只能靠截图来回问。
-- 本迁移配套的功能让有权限的运营人员在客户列表点一下，
-- 直接进入该客户视角的客户门户。
--
-- ⚠️ 关键设计：进去的是【员工本人的身份】，不借用客户的任何账号。
--    JWT 里 id / username 是员工自己的，只有 userType 和 linkedEntityId
--    被设成 CLIENT + 目标客户 —— 因为 order / inquiry / cmr / customs / gps /
--    finance / notification 七个模块的租户过滤全写成
--    `if (userType === 'CLIENT' && linkedEntityId) { 加过滤 }`，
--    身份不是 CLIENT 的话这些分支根本不走，等于在客户门户里不加过滤看全部客户。
--    所以"外壳是客户、内核是员工"不是取巧，是唯一能同时满足
--    「以员工身份」和「只看得到这一家」的做法。
--
--    好处：客户的账号不被占用、last_login_at 不被污染、
--    客户哪怕一个门户账号都还没建也能进去看。
--
-- 为什么要建表而不是在内存里放票据：
--   生产 pm2 是 `-i 2` 双实例（见 CLAUDE.md 部署规范）。内存 Map 存的票据
--   只有签发它的那个实例认得，换单（exchange）请求被负载均衡打到另一个实例
--   就查无此票 —— 而且这种失败是随机的、约一半概率，最难排查。
--
-- 这张表同时就是审计台账：哪个员工、什么时候、进了哪家客户的门户。
-- 「在门户里的操作与客户本人等效」是既定口径（员工可代客下单），
-- 正因为能写，留痕才是硬要求。

-- 1) 门户代入会话表（一次性票据 + 审计台账）
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 票据只存 sha256，不存明文：拿到库读权限也无法凭表里的值换出 token
  ticket_hash VARCHAR(64) NOT NULL UNIQUE,

  -- 发起并使用这次会话的员工。用户名冗余一份，账号日后被改名/删除时台账仍可读
  operator_user_id UUID NOT NULL REFERENCES users(id),
  operator_username VARCHAR(50) NOT NULL,

  -- 进入的是哪家客户的门户
  target_client_id UUID NOT NULL REFERENCES clients(id),
  target_company_name VARCHAR(200) NOT NULL,

  client_ip VARCHAR(64),

  -- 票据有效期极短（代码里给 60 秒），够浏览器跳一次页就行
  expires_at TIMESTAMP NOT NULL,
  -- 换出 token 的时刻。非空 = 已用过，一次性
  used_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 换票走 ticket_hash 唯一索引即可；这两个索引是给审计查询用的
CREATE INDEX IF NOT EXISTS idx_impersonation_operator
  ON impersonation_sessions (operator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_target_client
  ON impersonation_sessions (target_client_id, created_at DESC);

COMMENT ON TABLE impersonation_sessions IS '员工以自己身份进入客户门户的一次性票据与审计台账';

-- 2) 新增权限码
--    perm_type 用 ACTION：它不是一个菜单，而是客户列表里的一个按钮。
--    sort_order 顺到 client 模块的 1005（1000-1004 已被 view/create/edit/credit/export 占用）
--
--    ⚠️ 权限码必须像下面这样和左括号写在同一行。
--    scripts/check-permission-menu-sync.js 用 /^\s*\('码'/ 逐行扫描迁移文件来建字典，
--    写成 `VALUES (` 换行再写码，脚本就扫不到，于是把代码里正常的引用报成
--    「引用了字典里没有的权限码」——迁移其实完全正常，只是校验脚本看不见。
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description)
VALUES
  ('client:impersonate', '进入客户门户', 'client', '客户管理', 'ACTION', 'OPERATOR', 1005,
   '以员工本人身份进入该客户视角的客户门户，期间操作与客户本人等效并全程留痕，仅授权给需要代客排查的岗位')
ON CONFLICT (perm_code) DO NOTHING;

-- 权限码名称在开发期调整过一次（原为「登录客户门户」），
-- 已经执行过旧版本迁移的环境在这里对齐，避免两套环境显示不一致
UPDATE permissions
   SET perm_name = '进入客户门户',
       description = '以员工本人身份进入该客户视角的客户门户，期间操作与客户本人等效并全程留痕，仅授权给需要代客排查的岗位'
 WHERE perm_code = 'client:impersonate';

-- 3) 默认只给 sys_admin 和 op_manager
--    刻意不给 boss —— 虽然既有约定是"新权限自动给管理角色"，
--    但这个码的能力是"以客户视角写数据"，不是"看得更多"，
--    给需要代客排查的岗位就够了。其他角色可在「角色权限」页自行勾选。
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, 'client:impersonate'
FROM roles r
WHERE r.role_code IN ('sys_admin', 'op_manager')
ON CONFLICT (role_id, perm_code) DO NOTHING;
