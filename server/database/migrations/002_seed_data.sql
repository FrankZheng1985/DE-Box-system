-- 德国Box运输管理系统 - 初始数据

-- 插入默认角色
INSERT INTO roles (role_code, role_name, description, is_system) VALUES
    ('admin', '系统管理员', '拥有所有权限', TRUE),
    ('manager', '经理', '管理权限', TRUE),
    ('operator', '操作员', '基础操作权限', TRUE),
    ('finance', '财务', '财务相关权限', TRUE),
    ('sales', '销售', '销售相关权限', TRUE)
ON CONFLICT (role_code) DO NOTHING;

-- 插入权限
INSERT INTO permissions (permission_code, permission_name, module, category) VALUES
    -- 系统概览
    ('dashboard:view', '查看概览', '系统概览', '查看'),
    -- 订单管理
    ('bill:view', '查看订单', '订单管理', '查看'),
    ('bill:view_all', '查看所有订单', '订单管理', '查看'),
    ('bill:create', '创建订单', '订单管理', '操作'),
    ('bill:edit', '编辑订单', '订单管理', '操作'),
    ('bill:delete', '删除订单', '订单管理', '操作'),
    -- TMS运输
    ('tms:view', '查看运输', 'TMS运输', '查看'),
    ('tms:operate', '运输操作', 'TMS运输', '操作'),
    ('tms:pricing', '运费管理', 'TMS运输', '管理'),
    ('tms:conditions', '条件管理', 'TMS运输', '管理'),
    -- CRM客户
    ('crm:view', '查看客户', 'CRM客户', '查看'),
    ('crm:manage', '管理客户', 'CRM客户', '管理'),
    -- 供应商
    ('supplier:view', '查看供应商', '供应商', '查看'),
    ('supplier:manage', '管理供应商', '供应商', '管理'),
    -- 财务
    ('finance:view', '查看财务', '财务管理', '查看'),
    ('finance:manage', '管理财务', '财务管理', '管理'),
    ('finance:invoice_view', '查看发票', '财务管理', '查看'),
    ('finance:invoice_create', '创建发票', '财务管理', '操作'),
    ('finance:payment_view', '查看收款', '财务管理', '查看'),
    ('finance:report_view', '查看报表', '财务管理', '查看'),
    -- 产品定价
    ('product:view', '查看产品', '产品定价', '查看'),
    ('product:manage', '管理产品', '产品定价', '管理'),
    -- 系统管理
    ('system:user', '用户管理', '系统管理', '管理'),
    ('system:basic_data', '基础数据', '系统管理', '管理'),
    ('system:info_center', '信息中心', '系统管理', '管理')
ON CONFLICT (permission_code) DO NOTHING;

-- 管理员拥有所有权限
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'admin', permission_code FROM permissions
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 经理权限
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('manager', 'dashboard:view'),
    ('manager', 'bill:view'),
    ('manager', 'bill:view_all'),
    ('manager', 'bill:create'),
    ('manager', 'bill:edit'),
    ('manager', 'tms:view'),
    ('manager', 'tms:operate'),
    ('manager', 'crm:view'),
    ('manager', 'crm:manage'),
    ('manager', 'supplier:view'),
    ('manager', 'finance:view'),
    ('manager', 'finance:invoice_view'),
    ('manager', 'finance:report_view'),
    ('manager', 'product:view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 操作员权限
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('operator', 'dashboard:view'),
    ('operator', 'bill:view'),
    ('operator', 'bill:create'),
    ('operator', 'tms:view'),
    ('operator', 'crm:view'),
    ('operator', 'product:view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 财务权限
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('finance', 'dashboard:view'),
    ('finance', 'bill:view'),
    ('finance', 'finance:view'),
    ('finance', 'finance:manage'),
    ('finance', 'finance:invoice_view'),
    ('finance', 'finance:invoice_create'),
    ('finance', 'finance:payment_view'),
    ('finance', 'finance:report_view'),
    ('finance', 'crm:view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 销售权限
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('sales', 'dashboard:view'),
    ('sales', 'bill:view'),
    ('sales', 'bill:create'),
    ('sales', 'crm:view'),
    ('sales', 'crm:manage'),
    ('sales', 'product:view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- 创建默认管理员账号（V1 遗留脚本，已不使用；密码不在此记录）
INSERT INTO users (id, username, password, name, email, role, status)
VALUES (
    'user-admin-001',
    'admin',
    '$2b$10$gakA1sZD0Zgc52W3A1AC4eKs6ZjAXRfQLKLwEeFioeDeE7ypJcGvq',
    '系统管理员',
    'admin@example.com',
    'admin',
    'active'
) ON CONFLICT (username) DO NOTHING;
