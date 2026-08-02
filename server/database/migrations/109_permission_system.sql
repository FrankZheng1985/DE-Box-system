-- ============================================================================
-- 109_permission_system.sql
-- 权限体系（需求 9）
--
-- 三件事：
--   1. 新表 permissions        —— 权限码字典（module:action）
--   2. 新表 role_permissions   —— 角色 ↔ 权限码 的多对多分配
--   3. 给 101 里已 seed 的 8 个角色分配默认权限，让它们真正产生差别
--
-- 为什么不复用 auth_objects / auth_values（100 建的 SAP 风格授权对象）：
--   auth_objects seed 了 15 条，但 auth_values 是空表，且全仓库没有任何中间件
--   消费它——等于一套没落地的空架子。字段级授权（field_values JSONB）对本系统
--   过度设计，救活成本高于新建。两张表保留不动，本次不再扩展。
--
-- ⚠️ 注意：migration 100 开头的 DROP TABLE 清单里含 permissions / role_permissions
--    （那是 V1 遗留的同名表）。本地重建库时务必 100 → 101 → ... → 109 顺序执行，
--    不要在 109 之后回头重跑 100，否则本次新表会被 DROP CASCADE 掉。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. 前置校验：库里如果残留 V1 版的同名 permissions 表，必须先跑完 100 重建
--
--    V1 的 permissions 表字段是 (code, name, ...)，和本次的 (perm_code, ...) 不同。
--    下面用 IF NOT EXISTS 建表，遇到 V1 残留会静默跳过、随后 INSERT 报一堆
--    "column does not exist" —— 不如在这里直接把话说清楚。
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'permissions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'permissions'
                       AND column_name = 'perm_code')
  THEN
    RAISE EXCEPTION '检测到 V1 遗留的 permissions 表（无 perm_code 列）。本库尚未执行 100_eu_tms_v2_full_rebuild.sql，请先按 100→108 顺序重建后再执行本迁移。';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. 权限码字典
--
--    perm_code 统一用 `模块:动作` 小写下划线格式，和全局规范的 API 端点风格一致。
--    module / module_name 只用于角色权限页的分组展示。
--    perm_type：
--      MENU   —— 这条权限码同时控制一个菜单入口的可见性（前端 MENU_PERMISSIONS 用）
--      ACTION —— 只控制页面内的按钮或某个接口
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perm_code   VARCHAR(60)  NOT NULL UNIQUE,
  perm_name   VARCHAR(100) NOT NULL,
  module      VARCHAR(40)  NOT NULL,
  module_name VARCHAR(60)  NOT NULL,
  perm_type   VARCHAR(10)  NOT NULL DEFAULT 'ACTION',
  scope       VARCHAR(20)  NOT NULL DEFAULT 'OPERATOR',  -- OPERATOR / CLIENT / CARRIER
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_scope  ON permissions(scope);

-- ----------------------------------------------------------------------------
-- 2. 角色权限分配
--
--    外键用 perm_code 而不是 permission_id：中间件和前端全程用权限码，
--    用码做外键可以少一次 JOIN，读起来也直观。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  perm_code  VARCHAR(60) NOT NULL REFERENCES permissions(perm_code) ON UPDATE CASCADE ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (role_id, perm_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- ----------------------------------------------------------------------------
-- 3. 权限码字典数据
--
--    ON CONFLICT DO UPDATE：只更新名称/分组等展示字段，重复执行安全。
-- ----------------------------------------------------------------------------
INSERT INTO permissions (perm_code, perm_name, module, module_name, perm_type, scope, sort_order, description) VALUES
  -- 仪表板
  ('dashboard:view',            '查看仪表板',        'dashboard',   '仪表板',     'MENU',   'OPERATOR', 10,  '运营首页统计看板'),

  -- 订单管理
  ('order:view',                '查看订单',          'order',       '订单管理',   'MENU',   'OPERATOR', 100, '订单列表与详情'),
  ('order:create',              '创建订单',          'order',       '订单管理',   'ACTION', 'OPERATOR', 101, NULL),
  ('order:edit',                '编辑订单',          'order',       '订单管理',   'ACTION', 'OPERATOR', 102, NULL),
  ('order:assign',              '派单给承运商',      'order',       '订单管理',   'ACTION', 'OPERATOR', 103, NULL),
  ('order:status',             '更新订单状态',      'order',       '订单管理',   'ACTION', 'OPERATOR', 104, '含运输状态、派送状态、跟踪号'),
  ('order:cancel',              '取消订单',          'order',       '订单管理',   'ACTION', 'OPERATOR', 105, NULL),
  ('order:file_upload',         '上传订单文件',      'order',       '订单管理',   'ACTION', 'OPERATOR', 106, '装车图 / CMR / 签收凭证'),
  ('order:file_delete',         '删除订单文件',      'order',       '订单管理',   'ACTION', 'OPERATOR', 107, NULL),
  ('order:export',              '导出订单',          'order',       '订单管理',   'ACTION', 'OPERATOR', 108, NULL),

  -- 询价管理
  ('inquiry:view',              '查看询价',          'inquiry',     '询价管理',   'MENU',   'OPERATOR', 200, NULL),
  ('inquiry:create',            '创建询价',          'inquiry',     '询价管理',   'ACTION', 'OPERATOR', 201, NULL),
  ('inquiry:edit',              '编辑询价',          'inquiry',     '询价管理',   'ACTION', 'OPERATOR', 202, NULL),
  ('inquiry:delete',            '删除询价',          'inquiry',     '询价管理',   'ACTION', 'OPERATOR', 203, NULL),
  ('inquiry:export',            '导出询价',          'inquiry',     '询价管理',   'ACTION', 'OPERATOR', 204, '含一键复制摘要'),

  -- 报价管理
  ('quotation:view',            '查看报价',          'quotation',   '报价管理',   'MENU',   'OPERATOR', 300, NULL),
  ('quotation:create',          '创建报价',          'quotation',   '报价管理',   'ACTION', 'OPERATOR', 301, '含试算价格'),
  ('quotation:edit',            '编辑报价',          'quotation',   '报价管理',   'ACTION', 'OPERATOR', 302, '含新版本'),
  ('quotation:send',            '发送报价给客户',    'quotation',   '报价管理',   'ACTION', 'OPERATOR', 303, NULL),
  ('quotation:decide',          '代客户接受/拒绝报价','quotation',   '报价管理',   'ACTION', 'OPERATOR', 304, '接受即自动生成待审核订单'),
  ('quotation:convert',         '报价转订单',        'quotation',   '报价管理',   'ACTION', 'OPERATOR', 305, NULL),
  ('quotation:void',            '作废报价',          'quotation',   '报价管理',   'ACTION', 'OPERATOR', 306, NULL),

  -- 服务商询价（P6 预留，先建码，界面下一阶段做）
  ('carrier_inquiry:view',      '查看服务商询价',    'carrier_inquiry', '服务商询价', 'ACTION', 'OPERATOR', 350, '成本敏感信息，只给服务商管理岗'),
  ('carrier_inquiry:manage',    '发起/维护服务商询价','carrier_inquiry', '服务商询价', 'ACTION', 'OPERATOR', 351, NULL),

  -- CMR
  ('cmr:view',                  '查看 CMR',          'cmr',         'CMR 管理',   'MENU',   'OPERATOR', 400, NULL),
  ('cmr:upload',                '上传 CMR',          'cmr',         'CMR 管理',   'ACTION', 'OPERATOR', 401, NULL),
  ('cmr:edit',                  '维护签署与货损',    'cmr',         'CMR 管理',   'ACTION', 'OPERATOR', 402, NULL),

  -- 船司放单
  ('shipping_release:view',     '查看船司放单',      'shipping_release', '船司放单', 'MENU',   'OPERATOR', 500, NULL),
  ('shipping_release:manage',   '放单操作',          'shipping_release', '船司放单', 'ACTION', 'OPERATOR', 501, '状态变更与授权放行'),

  -- 清关管理
  ('customs:view',              '查看清关',          'customs',     '清关管理',   'MENU',   'OPERATOR', 600, NULL),
  ('customs:manage',            '清关操作',          'customs',     '清关管理',   'ACTION', 'OPERATOR', 601, '状态变更、上传文件、异常登记'),

  -- GPS
  ('gps:view',                  '查看 GPS 追踪',     'gps',         'GPS 追踪',   'MENU',   'OPERATOR', 700, NULL),
  ('gps:manage',                '维护 GPS 数据',     'gps',         'GPS 追踪',   'ACTION', 'OPERATOR', 701, '手工上报轨迹点'),

  -- 财务
  ('finance:view',              '查看财务',          'finance',     '财务管理',   'MENU',   'OPERATOR', 800, '应收应付列表与汇总'),
  ('finance:create',            '创建财务记录',      'finance',     '财务管理',   'ACTION', 'OPERATOR', 801, NULL),
  ('finance:payment',           '登记收付款',        'finance',     '财务管理',   'ACTION', 'OPERATOR', 802, NULL),
  ('finance:void',              '作废财务记录',      'finance',     '财务管理',   'ACTION', 'OPERATOR', 803, NULL),
  ('finance:profit',            '查看利润分析',      'finance',     '财务管理',   'ACTION', 'OPERATOR', 804, '含成本，敏感'),
  ('finance:export',            '导出财务数据',      'finance',     '财务管理',   'ACTION', 'OPERATOR', 805, NULL),

  -- 发票模板
  ('invoice_template:view',     '查看发票模板',      'invoice_template', '发票模板', 'MENU',   'OPERATOR', 900, NULL),
  ('invoice_template:manage',   '维护发票模板',      'invoice_template', '发票模板', 'ACTION', 'OPERATOR', 901, NULL),

  -- 客户管理
  ('client:view',               '查看客户',          'client',      '客户管理',   'MENU',   'OPERATOR', 1000, NULL),
  ('client:create',             '新建客户',          'client',      '客户管理',   'ACTION', 'OPERATOR', 1001, NULL),
  ('client:edit',               '编辑客户',          'client',      '客户管理',   'ACTION', 'OPERATOR', 1002, '含启用/停用'),
  ('client:credit',             '维护信用额度与等级','client',      '客户管理',   'ACTION', 'OPERATOR', 1003, '敏感，默认只给经理和财务'),
  ('client:export',             '导出客户',          'client',      '客户管理',   'ACTION', 'OPERATOR', 1004, NULL),

  -- 运输公司
  ('carrier:view',              '查看运输公司',      'carrier',     '运输公司',   'MENU',   'OPERATOR', 1100, NULL),
  ('carrier:create',            '新建运输公司',      'carrier',     '运输公司',   'ACTION', 'OPERATOR', 1101, NULL),
  ('carrier:edit',              '编辑运输公司',      'carrier',     '运输公司',   'ACTION', 'OPERATOR', 1102, '含车辆维护、启用/停用'),
  ('carrier:export',            '导出运输公司',      'carrier',     '运输公司',   'ACTION', 'OPERATOR', 1103, NULL),

  -- 客户咨询（官网留言）
  ('contact:view',              '查看客户咨询',      'contact',     '客户咨询',   'ACTION', 'OPERATOR', 1200, NULL),
  ('contact:manage',            '处理客户咨询',      'contact',     '客户咨询',   'ACTION', 'OPERATOR', 1201, NULL),

  -- 通知中心
  ('notification:view',         '查看通知中心',      'notification','通知中心',   'MENU',   'OPERATOR', 1300, NULL),

  -- 系统管理
  ('system:settings',           '系统设置',          'system',      '系统管理',   'MENU',   'OPERATOR', 1400, '通知偏好、公司信息等'),
  ('system:user',               '用户管理',          'system',      '系统管理',   'MENU',   'OPERATOR', 1401, '新建员工账号、重置密码'),
  ('system:role',               '角色权限管理',      'system',      '系统管理',   'MENU',   'OPERATOR', 1402, '给角色勾选权限，权力最大的一项'),
  ('system:period',             '过账期间管理',      'system',      '系统管理',   'ACTION', 'OPERATOR', 1403, NULL),
  ('system:account',            '会计科目管理',      'system',      '系统管理',   'ACTION', 'OPERATOR', 1404, NULL),
  ('system:number_range',       '编号范围管理',      'system',      '系统管理',   'ACTION', 'OPERATOR', 1405, NULL),
  ('system:master_data',        '基础数据维护',      'system',      '系统管理',   'ACTION', 'OPERATOR', 1406, '车型、港口、国家等'),

  -- ==========================================================================
  -- 客户门户（scope = CLIENT）
  -- ==========================================================================
  ('portal:order_view',         '查看本公司订单',    'portal',      '客户门户',   'MENU',   'CLIENT', 2000, NULL),
  ('portal:order_create',       '在线下单',          'portal',      '客户门户',   'ACTION', 'CLIENT', 2001, NULL),
  ('portal:inquiry_manage',     '提交与管理询价',    'portal',      '客户门户',   'MENU',   'CLIENT', 2002, NULL),
  ('portal:quotation_view',     '查看报价',          'portal',      '客户门户',   'MENU',   'CLIENT', 2003, NULL),
  ('portal:quotation_decide',   '接受/拒绝报价',     'portal',      '客户门户',   'ACTION', 'CLIENT', 2004, '有金额约束力，默认只给客户管理员'),
  ('portal:billing_view',       '查看账单',          'portal',      '客户门户',   'MENU',   'CLIENT', 2005, NULL),
  ('portal:file_download',      '下载单据文件',      'portal',      '客户门户',   'ACTION', 'CLIENT', 2006, 'CMR / 清关文件'),
  ('portal:user_manage',        '管理本公司账号',    'portal',      '客户门户',   'MENU',   'CLIENT', 2007, '仅客户管理员'),
  -- 注：「账户设置」页是每个人改自己的资料，不设权限码；
  --     里面的公司级通知设置由 P4 按 client_admin 角色判断，本次不重复造码

  -- ==========================================================================
  -- 承运商门户（scope = CARRIER）
  -- ==========================================================================
  ('carrier_portal:task_view',       '查看运输任务',  'carrier_portal', '承运商门户', 'MENU',   'CARRIER', 3000, NULL),
  ('carrier_portal:task_respond',    '接受/拒绝任务', 'carrier_portal', '承运商门户', 'ACTION', 'CARRIER', 3001, NULL),
  ('carrier_portal:cmr_upload',      '上传 CMR',      'carrier_portal', '承运商门户', 'ACTION', 'CARRIER', 3002, NULL),
  ('carrier_portal:gps_report',      '上报 GPS 位置', 'carrier_portal', '承运商门户', 'ACTION', 'CARRIER', 3003, NULL),
  ('carrier_portal:billing_view',    '查看结算账单',  'carrier_portal', '承运商门户', 'MENU',   'CARRIER', 3004, NULL),
  ('carrier_portal:company_settings','维护公司资料',  'carrier_portal', '承运商门户', 'MENU',   'CARRIER', 3005, NULL)
ON CONFLICT (perm_code) DO UPDATE SET
  perm_name   = EXCLUDED.perm_name,
  module      = EXCLUDED.module,
  module_name = EXCLUDED.module_name,
  perm_type   = EXCLUDED.perm_type,
  scope       = EXCLUDED.scope,
  sort_order  = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- ----------------------------------------------------------------------------
-- 4. 默认角色权限分配
--
--    ON CONFLICT DO NOTHING —— 重复执行不会覆盖管理员在界面上改过的分配。
-- ----------------------------------------------------------------------------

-- 4.1 sys_admin：全部权限（含客户/承运商门户码，便于运营代客户排查问题）
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'sys_admin'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.2 op_manager 运营经理：全部运营端权限，但不碰用户/角色管理和会计科目
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'op_manager'
  AND p.scope = 'OPERATOR'
  AND p.perm_code NOT IN ('system:user', 'system:role', 'system:account', 'system:number_range',
                          'system:period',
                          'finance:create', 'finance:payment', 'finance:void')
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.3 op_staff 运营专员：日常操作岗
--     刻意不给：财务全部、client:credit（信用）、carrier_inquiry:*（服务商成本）、
--               各类作废/删除、系统管理 —— 这正是需求 5.3 信息隔离要的效果
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'op_staff'
  AND p.perm_code IN (
    'dashboard:view',
    'order:view', 'order:create', 'order:edit', 'order:assign', 'order:status',
    'order:file_upload', 'order:export',
    'inquiry:view', 'inquiry:create', 'inquiry:edit', 'inquiry:export',
    'quotation:view', 'quotation:create', 'quotation:edit', 'quotation:send',
    'cmr:view', 'cmr:upload', 'cmr:edit',
    'shipping_release:view', 'shipping_release:manage',
    'customs:view', 'customs:manage',
    'gps:view', 'gps:manage',
    'client:view', 'carrier:view',
    'contact:view', 'contact:manage',
    'notification:view'
  )
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.4 finance 财务人员：财务全权 + 只读业务数据 + 期间/科目
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'finance'
  AND p.perm_code IN (
    'dashboard:view',
    'order:view', 'order:export',
    'inquiry:view', 'quotation:view',
    'finance:view', 'finance:create', 'finance:payment', 'finance:void',
    'finance:profit', 'finance:export',
    'invoice_template:view', 'invoice_template:manage',
    'client:view', 'client:credit', 'client:export',
    'carrier:view', 'carrier:export',
    'notification:view',
    'system:period', 'system:account'
  )
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.5 client_admin 客户管理员：客户门户全部
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'client_admin' AND p.scope = 'CLIENT'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.6 client_user 客户用户：能下单能询价，但不能替公司拍板报价、看不到账单、管不了账号
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'client_user'
  AND p.perm_code IN (
    'portal:order_view', 'portal:order_create',
    'portal:inquiry_manage', 'portal:quotation_view',
    'portal:file_download'
  )
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.7 carrier_admin 承运商管理员：承运商门户全部
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'carrier_admin' AND p.scope = 'CARRIER'
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- 4.8 carrier_driver 司机：只做现场动作，看不到结算账单
INSERT INTO role_permissions (role_id, perm_code)
SELECT r.id, p.perm_code
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'carrier_driver'
  AND p.perm_code IN (
    'carrier_portal:task_view',
    'carrier_portal:cmr_upload',
    'carrier_portal:gps_report'
  )
ON CONFLICT (role_id, perm_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. 兜底：存量员工账号如果没有 role_id，补成运营专员
--
--    UserManagement 页有个存量 bug（提交时 Number(uuid) → NaN → null），
--    导致此前建的员工账号 role_id 很可能是空的。没有角色就没有任何权限，
--    上线后这些人会直接被挡在门外，所以这里兜一层底。
--    sys_admin 不在此列（它本来就有角色）。
-- ----------------------------------------------------------------------------
UPDATE users
SET role_id = (SELECT id FROM roles WHERE role_code = 'op_staff')
WHERE role_id IS NULL AND user_type = 'OPERATOR';

UPDATE users
SET role_id = (SELECT id FROM roles WHERE role_code = 'client_user')
WHERE role_id IS NULL AND user_type = 'CLIENT';

UPDATE users
SET role_id = (SELECT id FROM roles WHERE role_code = 'carrier_driver')
WHERE role_id IS NULL AND user_type = 'CARRIER';

COMMIT;
