-- ============================================================================
-- EU-TMS V2 初始化数据
-- 包含：公司代码、业务区域、科目表、编号范围、角色、admin 用户、定价引擎配置
-- ============================================================================

-- ============================================================================
-- 1. 组织架构
-- ============================================================================

INSERT INTO company_codes (code, company_name, country, currency, tax_number, address) VALUES
  ('DE01', 'Triple Delta GmbH', 'DE', 'EUR', NULL, 'Germany');

INSERT INTO business_areas (code, area_name, company_code, description) VALUES
  ('CS', '篷布车运输', 'DE01', '欧洲公路整车/拼车运输'),
  ('CT', '集装箱物流', 'DE01', '海运集装箱到港后陆运配送');

-- ============================================================================
-- 2. 科目表 (Chart of Accounts)
-- ============================================================================

INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_code, is_reconciliation, is_postable) VALUES
  -- 资产类
  ('1000', '银行存款', 'ASSET', NULL, false, true),
  ('1100', '银行存款-EUR', 'ASSET', '1000', false, true),
  ('1110', '银行存款-GBP', 'ASSET', '1000', false, true),
  ('1120', '银行存款-PLN', 'ASSET', '1000', false, true),
  ('1200', '应收账款', 'ASSET', NULL, true, false),       -- 调节科目，不可直接过账
  ('1210', '应收账款-客户', 'ASSET', '1200', true, false),
  ('1300', '预付款项', 'ASSET', NULL, false, true),
  ('1400', 'GR/IR 暂估清算', 'ASSET', NULL, false, true), -- 三方匹配暂估

  -- 负债类
  ('2000', '应付账款', 'LIABILITY', NULL, true, false),    -- 调节科目
  ('2100', '应付账款-承运商', 'LIABILITY', '2000', true, false),
  ('2200', '应付税款', 'LIABILITY', NULL, false, true),
  ('2210', '应付增值税', 'LIABILITY', '2200', false, true),
  ('2300', '预收款项', 'LIABILITY', NULL, false, true),

  -- 收入类
  ('4000', '运输收入', 'REVENUE', NULL, false, false),
  ('4100', '篷布车运输收入', 'REVENUE', '4000', false, true),
  ('4200', '集装箱物流收入', 'REVENUE', '4000', false, true),
  ('4300', '附加服务收入', 'REVENUE', '4000', false, true),

  -- 成本类
  ('5000', '运输成本', 'EXPENSE', NULL, false, false),
  ('5100', '篷布车运输成本', 'EXPENSE', '5000', false, true),
  ('5200', '集装箱物流成本', 'EXPENSE', '5000', false, true),
  ('5300', '燃油附加费', 'EXPENSE', '5000', false, true),
  ('5400', '保险费用', 'EXPENSE', '5000', false, true),
  ('5900', '价格差异', 'EXPENSE', '5000', false, true),  -- 三方匹配差异

  -- 费用类
  ('6000', '营业费用', 'EXPENSE', NULL, false, false),
  ('6100', '管理费用', 'EXPENSE', '6000', false, true),
  ('6200', '销售费用', 'EXPENSE', '6000', false, true);

-- ============================================================================
-- 3. 科目确定规则 (Account Determination)
-- ============================================================================

INSERT INTO account_determination_rules (transaction_type, business_type, debit_account, credit_account, description) VALUES
  -- 应收确认
  ('AR_INVOICE', 'CURTAIN_SIDE', '1210', '4100', '篷布车运输应收确认：借 应收账款，贷 运输收入'),
  ('AR_INVOICE', 'CONTAINER', '1210', '4200', '集装箱物流应收确认：借 应收账款，贷 运输收入'),
  ('AR_INVOICE', 'ALL', '1210', '4100', '通用应收确认'),
  -- 收款
  ('AR_PAYMENT', 'ALL', '1100', '1210', '客户收款：借 银行，贷 应收账款'),
  -- 应付确认
  ('AP_INVOICE', 'CURTAIN_SIDE', '5100', '2100', '篷布车运输应付确认：借 运输成本，贷 应付账款'),
  ('AP_INVOICE', 'CONTAINER', '5200', '2100', '集装箱物流应付确认：借 运输成本，贷 应付账款'),
  ('AP_INVOICE', 'ALL', '5100', '2100', '通用应付确认'),
  -- 付款
  ('AP_PAYMENT', 'ALL', '2100', '1100', '支付承运商：借 应付账款，贷 银行'),
  -- 冲销
  ('AR_REVERSAL', 'ALL', '4100', '1210', '应收冲销：借 收入冲回，贷 应收冲回'),
  ('AP_REVERSAL', 'ALL', '2100', '5100', '应付冲销：借 应付冲回，贷 成本冲回'),
  -- 三方匹配差异
  ('PRICE_VARIANCE', 'ALL', '5900', '2100', '价格差异：借 价格差异，贷 应付账款'),
  -- 暂估
  ('GR_ACCRUAL', 'ALL', '5100', '1400', '暂估入账：借 运输成本，贷 GR/IR 清算'),
  ('IR_CLEAR', 'ALL', '1400', '2100', '暂估清算：借 GR/IR 清算，贷 应付账款');

-- ============================================================================
-- 4. 编号范围 (Number Ranges)
-- ============================================================================

INSERT INTO number_ranges (object_type, company_code, fiscal_year, prefix, range_start, range_end, current_number, number_format) VALUES
  ('ORD', 'DE01', 2026, 'EU-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}'),
  ('INQ', 'DE01', 2026, 'INQ-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}'),
  ('QUO', 'DE01', 2026, 'QUO-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}'),
  ('SRV', 'DE01', 2026, 'SRV-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('CMR', 'DE01', 2026, 'CMR-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('FI_AR', 'DE01', 2026, 'INV-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('FI_AP', 'DE01', 2026, 'BILL-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('FI_PAY', 'DE01', 2026, 'PAY-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('FI_REC', 'DE01', 2026, 'REC-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('FI_REV', 'DE01', 2026, 'REV-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('REL', 'DE01', 2026, 'REL-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('CUS', 'DE01', 2026, 'CUS-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}'),
  ('CLT', 'DE01', 2026, 'C-', 1, 99999, 0, '{PREFIX}{SEQ:5}'),
  ('CAR', 'DE01', 2026, 'S-', 1, 99999, 0, '{PREFIX}{SEQ:5}');

-- ============================================================================
-- 5. 过账期间（2026年，默认开放当前月）
-- ============================================================================

INSERT INTO posting_periods (company_code, fiscal_year, period_month, account_type, is_open) VALUES
  ('DE01', 2026, 1, 'ALL', false),
  ('DE01', 2026, 2, 'ALL', false),
  ('DE01', 2026, 3, 'ALL', false),
  ('DE01', 2026, 4, 'ALL', true),   -- 当前月份开放
  ('DE01', 2026, 5, 'ALL', false),
  ('DE01', 2026, 6, 'ALL', false),
  ('DE01', 2026, 7, 'ALL', false),
  ('DE01', 2026, 8, 'ALL', false),
  ('DE01', 2026, 9, 'ALL', false),
  ('DE01', 2026, 10, 'ALL', false),
  ('DE01', 2026, 11, 'ALL', false),
  ('DE01', 2026, 12, 'ALL', false);

-- ============================================================================
-- 6. 容差配置
-- ============================================================================

INSERT INTO tolerance_config (match_type, tolerance_pct_auto, tolerance_pct_warn, tolerance_abs_auto, tolerance_abs_warn, company_code) VALUES
  ('AMOUNT', 2.00, 5.00, 50.00, 200.00, 'DE01'),
  ('QUANTITY', 2.00, 5.00, NULL, NULL, 'DE01');

-- ============================================================================
-- 7. 角色
-- ============================================================================

INSERT INTO roles (role_code, role_name, role_type, description, is_system) VALUES
  ('sys_admin', '系统管理员', 'OPERATOR', '拥有所有权限', true),
  ('op_manager', '运营经理', 'OPERATOR', '运营管理权限', true),
  ('op_staff', '运营专员', 'OPERATOR', '基础运营权限', true),
  ('finance', '财务人员', 'OPERATOR', '财务相关权限', true),
  ('client_admin', '客户管理员', 'CLIENT', '客户端管理权限', true),
  ('client_user', '客户用户', 'CLIENT', '客户端基础权限', true),
  ('carrier_admin', '承运商管理员', 'CARRIER', '承运商管理权限', true),
  ('carrier_driver', '承运商司机', 'CARRIER', '承运商基础权限', true);

-- ============================================================================
-- 8. 授权对象
-- ============================================================================

INSERT INTO auth_objects (object_code, object_name, description, fields) VALUES
  ('ORDER_MGMT', '订单管理', '运输订单的创建、编辑、审批权限', '["company_code","business_area","activity"]'),
  ('QUOTATION_MGMT', '报价管理', '询价和报价的管理权限', '["company_code","activity"]'),
  ('FINANCE_AR', '应收管理', '应收账款和客户发票管理', '["company_code","activity"]'),
  ('FINANCE_AP', '应付管理', '应付账款和承运商费用管理', '["company_code","activity"]'),
  ('FINANCE_POST', '过账权限', '财务凭证过账权限', '["company_code","account_type","activity"]'),
  ('CLIENT_MGMT', '客户管理', '客户主数据管理', '["company_code","activity"]'),
  ('CARRIER_MGMT', '承运商管理', '承运商主数据管理', '["company_code","activity"]'),
  ('CREDIT_MGMT', '信用管理', '客户信用管理和释放权限', '["company_code","activity"]'),
  ('PERIOD_MGMT', '期间管理', '过账期间开关权限', '["company_code","activity"]'),
  ('SYSTEM_ADMIN', '系统管理', '系统配置和用户管理', '["activity"]'),
  ('CMR_MGMT', 'CMR管理', 'CMR单据管理', '["company_code","activity"]'),
  ('GPS_MGMT', 'GPS追踪', 'GPS追踪管理', '["company_code","activity"]'),
  ('RELEASE_MGMT', '放单管理', '船司放单管理', '["company_code","activity"]'),
  ('CUSTOMS_MGMT', '清关管理', '清关流程管理', '["company_code","activity"]'),
  ('WORKFLOW_ADMIN', '工作流管理', '审批工作流配置', '["activity"]');

-- ============================================================================
-- 9. admin 用户（密码: admin123，bcrypt 哈希）
-- ============================================================================

-- 先获取 sys_admin 角色的 ID
INSERT INTO users (username, password_hash, email, display_name, role_id, user_type, is_active)
SELECT 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
       'admin@triple-delta.de', '系统管理员', id, 'OPERATOR', true
FROM roles WHERE role_code = 'sys_admin';

-- 分配组织
INSERT INTO user_org_assignments (user_id, company_code, business_area, is_default)
SELECT u.id, 'DE01', NULL, true
FROM users u WHERE u.username = 'admin';

-- ============================================================================
-- 10. 定价引擎配置
-- ============================================================================

-- 定价过程
INSERT INTO pricing_procedures (procedure_code, procedure_name, description) VALUES
  ('CURTAIN_SIDE', '篷布车运输定价', '欧洲公路运输标准定价过程'),
  ('CONTAINER', '集装箱物流定价', '海运集装箱陆运配送定价过程');

-- 条件类型
INSERT INTO condition_types (type_code, type_name, category, plus_minus, is_manual) VALUES
  ('PR00', '基础运费', 'PRICE', '+', false),
  ('KA00', '客户折扣', 'DISCOUNT', '-', false),
  ('KF00', '燃油附加费', 'SURCHARGE', '+', false),
  ('ZAD1', 'ADR危险品附加费', 'SURCHARGE', '+', false),
  ('ZAD2', '超宽超重附加费', 'SURCHARGE', '+', false),
  ('ZAD3', '尾板附加费', 'SURCHARGE', '+', true),
  ('ZCT1', '港口操作费', 'SURCHARGE', '+', false),
  ('ZCT2', '集装箱拖车费', 'SURCHARGE', '+', false),
  ('ZINS', '运输保险费', 'SURCHARGE', '+', false),
  ('MWST', '增值税', 'TAX', '+', false),
  ('ZMAN', '手动调整', 'PRICE', '+', true);

-- 存取顺序
INSERT INTO access_sequences (sequence_code, sequence_name) VALUES
  ('AS01', '客户+路线+柜型'),
  ('AS02', '客户等级+路线'),
  ('AS03', '路线'),
  ('AS04', '国家税率');

-- 条件表
INSERT INTO condition_tables (table_code, table_name, key_fields) VALUES
  ('CT01', '客户+起终点+柜型', '["client_id","route_from","route_to","container_type"]'),
  ('CT02', '客户+起终点', '["client_id","route_from","route_to"]'),
  ('CT03', '信用等级+起终点', '["credit_level","route_from","route_to"]'),
  ('CT04', '起终点+柜型', '["route_from","route_to","container_type"]'),
  ('CT05', '起终点', '["route_from","route_to"]'),
  ('CT06', '国家', '["country"]');

-- 篷布车运输定价步骤
INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, is_mandatory, sort_order)
SELECT pp.id, 10, ct.id, '基础运费', 'FIXED', true, 10
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'PR00';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 20, ct.id, '客户折扣', 'PERCENT', 20
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'KA00';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 30, ct.id, '燃油附加费', 'FIXED', 30
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'KF00';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 40, ct.id, 'ADR危险品附加费', 'FIXED', 40
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'ZAD1';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 50, ct.id, '超宽超重附加费', 'FIXED', 50
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'ZAD2';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 60, ct.id, '尾板附加费', 'FIXED', 60
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'ZAD3';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 90, ct.id, '增值税', 'PERCENT', 90
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CURTAIN_SIDE' AND ct.type_code = 'MWST';

-- 集装箱物流定价步骤
INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, is_mandatory, sort_order)
SELECT pp.id, 10, ct.id, '基础运费', 'FIXED', true, 10
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'PR00';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 20, ct.id, '客户折扣', 'PERCENT', 20
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'KA00';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 30, ct.id, '港口操作费', 'FIXED', 30
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'ZCT1';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 40, ct.id, '集装箱拖车费', 'FIXED', 40
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'ZCT2';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 50, ct.id, '运输保险费', 'PERCENT', 50
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'ZINS';

INSERT INTO pricing_steps (procedure_id, step_number, condition_type_id, description, calc_type, sort_order)
SELECT pp.id, 90, ct.id, '增值税', 'PERCENT', 90
FROM pricing_procedures pp, condition_types ct WHERE pp.procedure_code = 'CONTAINER' AND ct.type_code = 'MWST';

-- ============================================================================
-- 11. 系统配置
-- ============================================================================

INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
  ('system_name', 'EU-TMS 欧洲运输管理系统', 'STRING', '系统名称'),
  ('system_version', '2.0.0', 'STRING', '系统版本'),
  ('default_currency', 'EUR', 'STRING', '默认货币'),
  ('default_tax_rate', '19', 'NUMBER', '默认税率（德国）'),
  ('default_payment_terms', '30', 'NUMBER', '默认账期（天）'),
  ('credit_check_enabled', 'true', 'BOOLEAN', '是否启用信用检查'),
  ('three_way_match_enabled', 'true', 'BOOLEAN', '是否启用三方匹配'),
  ('auto_invoice_enabled', 'false', 'BOOLEAN', '是否启用自动开票'),
  ('email_notifications_enabled', 'true', 'BOOLEAN', '是否启用邮件通知');

-- ============================================================================
-- 完成：初始化数据已插入
-- ============================================================================
