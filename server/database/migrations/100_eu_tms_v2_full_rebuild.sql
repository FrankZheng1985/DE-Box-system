-- ============================================================================
-- EU-TMS V2 完整重建脚本
-- 按照 SAP S/4HANA ERP 设计原则构建
-- 日期：2026-04-10
-- 表数量：45 张
-- ============================================================================

-- ============================================================================
-- 第一步：清理所有旧表
-- ============================================================================
DROP TABLE IF EXISTS
  role_permissions, permissions, audit_logs, schema_migrations,
  tms_tracks, tms_shipments, tms_pricing,
  invoice_items, invoices, payments,
  order_items, orders,
  product_price_rules, products,
  customers, suppliers,
  system_messages, system_settings, basic_data,
  roles, users
CASCADE;

-- ============================================================================
-- 第二步：启用扩展
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- A. 组织与权限表 (7 张)
-- ============================================================================

-- A1. 公司代码（法律实体，SAP 对标: Company Code）
CREATE TABLE company_codes (
  code VARCHAR(10) PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  country VARCHAR(10) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  language VARCHAR(5) DEFAULT 'zh',
  tax_number VARCHAR(50),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A2. 业务区域（SAP 对标: Business Area）
CREATE TABLE business_areas (
  code VARCHAR(10) PRIMARY KEY,
  area_name VARCHAR(100) NOT NULL,
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A3. 角色表
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code VARCHAR(30) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  role_type VARCHAR(20) NOT NULL DEFAULT 'OPERATOR',  -- OPERATOR / CLIENT / CARRIER
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A4. 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  display_name VARCHAR(100),
  role_id UUID REFERENCES roles(id),
  user_type VARCHAR(20) NOT NULL DEFAULT 'OPERATOR',  -- OPERATOR / CLIENT / CARRIER
  linked_entity_id UUID,          -- 关联的客户ID或运输公司ID
  language VARCHAR(5) DEFAULT 'zh',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- A5. 授权对象定义（SAP 对标: Authorization Object）
CREATE TABLE auth_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_code VARCHAR(30) NOT NULL UNIQUE,
  object_name VARCHAR(100) NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'
);

-- A6. 授权值分配（SAP 对标: Authorization Values）
CREATE TABLE auth_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  auth_object_code VARCHAR(30) NOT NULL REFERENCES auth_objects(object_code),
  field_values JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- A7. 用户组织分配
CREATE TABLE user_org_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  business_area VARCHAR(10) REFERENCES business_areas(code),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, company_code, business_area)
);

-- ============================================================================
-- B. ERP 内核表 (13 张)
-- ============================================================================

-- B1. 凭证主表（SAP 对标: BKPF 凭证抬头）
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number VARCHAR(30) NOT NULL,
  doc_type VARCHAR(20) NOT NULL,
  fiscal_year INTEGER NOT NULL,
  posting_date DATE NOT NULL,
  document_date DATE NOT NULL,
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  reference VARCHAR(50),
  header_text VARCHAR(200),
  -- 来源追溯
  source_doc_type VARCHAR(20),
  source_doc_id UUID,
  -- 冲销关系
  is_reversal BOOLEAN DEFAULT false,
  reversed_doc_id UUID,
  reversal_reason VARCHAR(200),
  -- 状态
  status VARCHAR(20) DEFAULT 'POSTED',   -- POSTED / REVERSED / PARKED
  -- 操作人
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(doc_number, doc_type, fiscal_year, company_code)
);
CREATE INDEX idx_documents_type ON documents(doc_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_posting_date ON documents(posting_date);
CREATE INDEX idx_documents_source ON documents(source_doc_type, source_doc_id);

-- B2. 单据流表（SAP 对标: VBFA 单据流）
CREATE TABLE document_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preceding_doc_type VARCHAR(20) NOT NULL,
  preceding_doc_id UUID NOT NULL,
  subsequent_doc_type VARCHAR(20) NOT NULL,
  subsequent_doc_id UUID NOT NULL,
  flow_type VARCHAR(40) NOT NULL,
  quantity NUMERIC(12,3),
  amount NUMERIC(12,2),
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(preceding_doc_id, subsequent_doc_id)
);
CREATE INDEX idx_doc_flow_preceding ON document_flow(preceding_doc_id);
CREATE INDEX idx_doc_flow_subsequent ON document_flow(subsequent_doc_id);

-- B3. 编号范围管理（SAP 对标: SNRO）
CREATE TABLE number_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type VARCHAR(30) NOT NULL,
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  fiscal_year INTEGER NOT NULL,
  prefix VARCHAR(20),
  range_start BIGINT NOT NULL DEFAULT 1,
  range_end BIGINT NOT NULL DEFAULT 999999,
  current_number BIGINT NOT NULL DEFAULT 0,
  number_format VARCHAR(50),
  is_external BOOLEAN DEFAULT false,
  UNIQUE(object_type, company_code, fiscal_year)
);

-- B4. 变更凭证抬头（SAP 对标: CDHDR）
CREATE TABLE change_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type VARCHAR(50) NOT NULL,
  object_id VARCHAR(100) NOT NULL,
  change_type VARCHAR(20) NOT NULL,    -- INSERT / UPDATE / DELETE / STATUS_CHANGE
  transaction_type VARCHAR(50),
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_reason TEXT
);
CREATE INDEX idx_change_docs_object ON change_documents(object_type, object_id);
CREATE INDEX idx_change_docs_time ON change_documents(changed_at DESC);

-- B5. 变更凭证明细（SAP 对标: CDPOS）
CREATE TABLE change_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_doc_id UUID NOT NULL REFERENCES change_documents(id) ON DELETE CASCADE,
  table_name VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  value_type VARCHAR(20) DEFAULT 'TEXT'
);
CREATE INDEX idx_change_items_doc ON change_document_items(change_doc_id);

-- B6. 定价过程（SAP 对标: Pricing Procedure）
CREATE TABLE pricing_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_code VARCHAR(20) NOT NULL UNIQUE,
  procedure_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- B7. 条件类型（SAP 对标: Condition Type）
CREATE TABLE condition_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code VARCHAR(10) NOT NULL UNIQUE,
  type_name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL,       -- PRICE / DISCOUNT / SURCHARGE / TAX
  plus_minus VARCHAR(1) DEFAULT '+',
  is_manual BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- B8. 存取顺序（SAP 对标: Access Sequence）
CREATE TABLE access_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_code VARCHAR(20) NOT NULL UNIQUE,
  sequence_name VARCHAR(100) NOT NULL
);

-- B9. 条件表定义
CREATE TABLE condition_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_code VARCHAR(20) NOT NULL UNIQUE,
  table_name VARCHAR(100) NOT NULL,
  key_fields JSONB NOT NULL
);

-- B10. 存取顺序步骤
CREATE TABLE access_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_sequence_id UUID NOT NULL REFERENCES access_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  condition_table_id UUID NOT NULL REFERENCES condition_tables(id),
  description VARCHAR(100),
  UNIQUE(access_sequence_id, step_number)
);

-- B11. 定价步骤
CREATE TABLE pricing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES pricing_procedures(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  condition_type_id UUID NOT NULL REFERENCES condition_types(id),
  description VARCHAR(100),
  from_step INTEGER,
  is_subtotal BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false,
  calc_type VARCHAR(20) DEFAULT 'FIXED',
  sort_order INTEGER NOT NULL,
  UNIQUE(procedure_id, step_number)
);

-- B12. 条件记录（实际价格数据）
CREATE TABLE condition_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_type_id UUID NOT NULL REFERENCES condition_types(id),
  condition_table_id UUID NOT NULL REFERENCES condition_tables(id),
  key_values JSONB NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  per_unit VARCHAR(20) DEFAULT 'PER_SHIPMENT',
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cond_records_type ON condition_records(condition_type_id);
CREATE INDEX idx_cond_records_keys ON condition_records USING GIN(key_values);
CREATE INDEX idx_cond_records_valid ON condition_records(valid_from, valid_to);

-- B13. 过账期间控制（SAP 对标: OB52）
CREATE TABLE posting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  fiscal_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'ALL',
  is_open BOOLEAN DEFAULT false,
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMP,
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP,
  UNIQUE(company_code, fiscal_year, period_month, account_type)
);

-- ============================================================================
-- C. 会计表 (6 张)
-- ============================================================================

-- C1. 科目表（SAP 对标: SKA1/SKAT）
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(20) NOT NULL UNIQUE,
  account_name VARCHAR(100) NOT NULL,
  account_type VARCHAR(20) NOT NULL,    -- ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE
  parent_code VARCHAR(20),
  is_reconciliation BOOLEAN DEFAULT false,
  is_postable BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- C2. 科目确定规则（SAP 对标: VKOA）
CREATE TABLE account_determination_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type VARCHAR(30) NOT NULL,
  business_type VARCHAR(20) DEFAULT 'ALL',
  debit_account VARCHAR(20) NOT NULL,
  credit_account VARCHAR(20) NOT NULL,
  description VARCHAR(200),
  UNIQUE(transaction_type, business_type)
);

-- C3. 会计分录行（SAP 对标: ACDOCA 统一日记账）
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  line_number INTEGER NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  debit_credit VARCHAR(1) NOT NULL,     -- D(借) / C(贷)
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  local_amount NUMERIC(12,2),
  exchange_rate NUMERIC(10,6) DEFAULT 1.000000,
  subledger_type VARCHAR(20),           -- CLIENT / CARRIER
  subledger_id UUID,
  cost_center VARCHAR(20),
  profit_center VARCHAR(20),
  order_id UUID,
  business_type VARCHAR(20),
  posting_date DATE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  company_code VARCHAR(10) NOT NULL,
  UNIQUE(document_id, line_number)
);
CREATE INDEX idx_journal_account ON journal_entries(account_code);
CREATE INDEX idx_journal_subledger ON journal_entries(subledger_type, subledger_id);
CREATE INDEX idx_journal_period ON journal_entries(fiscal_year, period_month);
CREATE INDEX idx_journal_posting_date ON journal_entries(posting_date);

-- C4. 信用检查日志（SAP 对标: FSCM Credit）
CREATE TABLE credit_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  check_point VARCHAR(30) NOT NULL,
  order_id UUID,
  credit_limit NUMERIC(12,2),
  credit_exposure NUMERIC(12,2),
  order_amount NUMERIC(12,2),
  check_result VARCHAR(20) NOT NULL,    -- PASSED / WARNING / BLOCKED
  override_by UUID REFERENCES users(id),
  override_reason TEXT,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- C5. 三方匹配记录（SAP 对标: MR/MM 三方校验）
CREATE TABLE three_way_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  service_doc_id UUID,
  invoice_doc_id UUID,
  order_amount NUMERIC(12,2),
  order_weight NUMERIC(10,2),
  service_amount NUMERIC(12,2),
  service_weight NUMERIC(10,2),
  invoice_amount NUMERIC(12,2),
  invoice_weight NUMERIC(10,2),
  amount_variance NUMERIC(12,2),
  amount_variance_pct NUMERIC(5,2),
  match_result VARCHAR(20) NOT NULL,    -- MATCHED / WARNING / BLOCKED
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  approval_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- C6. 容差配置
CREATE TABLE tolerance_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type VARCHAR(30) NOT NULL,
  tolerance_pct_auto NUMERIC(5,2) DEFAULT 2.00,
  tolerance_pct_warn NUMERIC(5,2) DEFAULT 5.00,
  tolerance_abs_auto NUMERIC(12,2),
  tolerance_abs_warn NUMERIC(12,2),
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  is_active BOOLEAN DEFAULT true
);

-- ============================================================================
-- D. 主数据表 (4 张)
-- ============================================================================

-- D1. 客户档案
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  vat_number VARCHAR(50),
  country VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  contact_name VARCHAR(100),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  invoice_email VARCHAR(150),
  -- 信用管理字段（SAP 对标: Credit Management）
  credit_limit NUMERIC(12,2) DEFAULT 0,
  credit_exposure NUMERIC(12,2) DEFAULT 0,
  risk_category VARCHAR(10) DEFAULT 'MEDIUM',  -- LOW / MEDIUM / HIGH
  credit_blocked BOOLEAN DEFAULT false,
  last_credit_check TIMESTAMP,
  -- 基础字段
  credit_level CHAR(1) DEFAULT 'C',
  payment_terms INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  company_code VARCHAR(10) REFERENCES company_codes(code),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_company ON clients(company_code);

-- D2. 运输公司档案
CREATE TABLE carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  vat_number VARCHAR(50),
  country VARCHAR(100),
  transport_license VARCHAR(100),
  license_expiry DATE,
  insurance_number VARCHAR(100),
  insurance_expiry DATE,
  service_countries JSONB DEFAULT '[]',
  vehicle_types JSONB DEFAULT '[]',
  contact_name VARCHAR(100),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  address TEXT,
  performance_score NUMERIC(3,1) DEFAULT 5.0,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  company_code VARCHAR(10) REFERENCES company_codes(code),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_carriers_status ON carriers(status);

-- D3. 运输公司车队
CREATE TABLE carrier_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  plate_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(50),
  driver_name VARCHAR(100),
  driver_phone VARCHAR(50),
  has_gps BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'IDLE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- D4. 运输公司覆盖路线
CREATE TABLE carrier_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  route_from VARCHAR(100) NOT NULL,
  route_to VARCHAR(100) NOT NULL,
  vehicle_type_preference VARCHAR(50),
  completed_count INTEGER DEFAULT 0,
  avg_transit_hours NUMERIC(6,1),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- E. 业务单据表 (11 张)
-- ============================================================================

-- E1. 运输订单（核心业务表）
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id),
  carrier_id UUID REFERENCES carriers(id),
  company_code VARCHAR(10) REFERENCES company_codes(code),
  business_area VARCHAR(10) REFERENCES business_areas(code),
  -- 业务类型
  business_type VARCHAR(20) NOT NULL,
  status VARCHAR(30) DEFAULT 'PENDING_REVIEW',
  delivery_status VARCHAR(30),
  transport_type VARCHAR(10),
  -- 货物信息
  cargo_description TEXT,
  cargo_weight_kg NUMERIC(10,2),
  cargo_volume_m3 NUMERIC(10,2),
  cargo_quantity INTEGER,
  -- 地址信息
  pickup_address JSONB,
  delivery_address JSONB,
  pickup_date DATE,
  delivery_date DATE,
  special_requirements VARCHAR(50),
  remarks TEXT,
  -- 集装箱物流专属字段
  eta TIMESTAMP,
  shipping_line VARCHAR(100),
  cnee VARCHAR(200),
  container_no VARCHAR(30),
  container_type VARCHAR(10),
  seal_no VARCHAR(30),
  bl_number VARCHAR(50),
  pod VARCHAR(100),
  final_destination TEXT,
  final_dest_address TEXT,
  expected_delivery_date DATE,
  release_method VARCHAR(20),
  needs_clearance BOOLEAN DEFAULT false,
  needs_release BOOLEAN DEFAULT false,
  release_status VARCHAR(30),
  clearance_status VARCHAR(30),
  -- 财务字段
  client_price NUMERIC(12,2),
  carrier_cost NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_orders_business_type ON orders(business_type);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_carrier ON orders(carrier_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_document ON orders(document_id);

-- E2. 订单状态变更日志
CREATE TABLE order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  changed_by UUID REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_status_logs ON order_status_logs(order_id);

-- E3. 询价单
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  inquiry_number VARCHAR(30) NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id),
  business_type VARCHAR(20) NOT NULL,
  transport_type VARCHAR(10),
  route_from JSONB,
  route_to JSONB,
  cargo_description TEXT,
  cargo_weight_kg NUMERIC(10,2),
  cargo_volume_m3 NUMERIC(10,2),
  cargo_quantity INTEGER,
  special_requirements TEXT,
  pod VARCHAR(100),
  container_type VARCHAR(10),
  remarks TEXT,
  status VARCHAR(20) DEFAULT 'PENDING_QUOTE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_inquiries_client ON inquiries(client_id);
CREATE INDEX idx_inquiries_status ON inquiries(status);

-- E4. 报价单
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  quotation_number VARCHAR(30) NOT NULL,
  inquiry_id UUID REFERENCES inquiries(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  version INTEGER DEFAULT 1,
  route_from JSONB,
  route_to JSONB,
  business_type VARCHAR(20),
  transport_type VARCHAR(10),
  base_freight NUMERIC(12,2),
  surcharge NUMERIC(12,2) DEFAULT 0,
  insurance_fee NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  valid_until DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_quotations_client ON quotations(client_id);
CREATE INDEX idx_quotations_status ON quotations(status);

-- E5. 报价定价明细行
CREATE TABLE quotation_pricing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  condition_type_code VARCHAR(10),
  description VARCHAR(100),
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  calc_type VARCHAR(20),
  is_subtotal BOOLEAN DEFAULT false,
  sort_order INTEGER NOT NULL
);

-- E6. CMR 单据
CREATE TABLE cmr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  cmr_number VARCHAR(50),
  file_url TEXT NOT NULL,
  file_type VARCHAR(10) DEFAULT 'PDF',
  sign_status VARCHAR(30) DEFAULT 'UNSIGNED',
  has_damage_note BOOLEAN DEFAULT false,
  damage_note TEXT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cmr_order ON cmr_documents(order_id);

-- E7. GPS 追踪记录
CREATE TABLE gps_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  city VARCHAR(100),
  country VARCHAR(100),
  speed_kmh NUMERIC(6,2),
  status VARCHAR(30),
  remarks TEXT,
  source VARCHAR(20) DEFAULT 'MANUAL',
  recorded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_gps_order ON gps_tracking(order_id);
CREATE INDEX idx_gps_time ON gps_tracking(recorded_at DESC);

-- E8. 船司放单记录
CREATE TABLE shipping_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  release_status VARCHAR(30) DEFAULT 'NOT_REQUIRED',
  courier_service VARCHAR(100),
  courier_address TEXT,
  release_valid_until DATE,
  authorized_by UUID REFERENCES users(id),
  authorized_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- E9. 清关记录
CREATE TABLE customs_clearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  status VARCHAR(30) DEFAULT 'PENDING',
  customs_broker VARCHAR(200),
  exception_reason TEXT,
  cleared_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- E10. 清关文件
CREATE TABLE customs_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clearance_id UUID NOT NULL REFERENCES customs_clearances(id) ON DELETE CASCADE,
  file_name VARCHAR(200),
  file_url TEXT NOT NULL,
  file_type VARCHAR(50),
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- E11. 财务记录（应收/应付）
CREATE TABLE financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  journal_entry_doc_id UUID REFERENCES documents(id),
  record_number VARCHAR(30) NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id),
  type VARCHAR(20) NOT NULL,              -- RECEIVABLE / PAYABLE
  counterparty_type VARCHAR(20) NOT NULL, -- CLIENT / CARRIER
  counterparty_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  payment_status VARCHAR(20) DEFAULT 'UNPAID',
  due_date DATE,
  paid_date DATE,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  invoice_template_id UUID,
  auto_generated BOOLEAN DEFAULT false,
  remarks TEXT,
  company_code VARCHAR(10) REFERENCES company_codes(code),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_financial_type ON financial_records(type);
CREATE INDEX idx_financial_status ON financial_records(payment_status);
CREATE INDEX idx_financial_counterparty ON financial_records(counterparty_type, counterparty_id);
CREATE INDEX idx_financial_due_date ON financial_records(due_date);

-- ============================================================================
-- F. 模板与配置表 (3 张)
-- ============================================================================

-- F1. 发票模板
CREATE TABLE invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  client_id UUID REFERENCES clients(id),
  client_type VARCHAR(20) DEFAULT 'GENERAL',
  route_pattern JSONB,
  default_price NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  tax_rate NUMERIC(5,2) DEFAULT 19.00,
  header_info JSONB,
  footer_info TEXT,
  auto_trigger VARCHAR(30),
  auto_send_email BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- F2. 自动开票规则
CREATE TABLE auto_invoice_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES invoice_templates(id),
  trigger_condition VARCHAR(30) NOT NULL,
  default_template_id UUID REFERENCES invoice_templates(id),
  invoice_number_format VARCHAR(50),
  auto_send_method VARCHAR(20),
  auto_send_email BOOLEAN DEFAULT true,
  overdue_reminder BOOLEAN DEFAULT false,
  batch_merge_client BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- F3. 通知偏好
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  channel_email BOOLEAN DEFAULT true,
  channel_system BOOLEAN DEFAULT true,
  UNIQUE(user_id, event_type)
);

-- ============================================================================
-- G. 工作流表 (4 张)
-- ============================================================================

-- G1. 工作流定义
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_code VARCHAR(30) NOT NULL UNIQUE,
  workflow_name VARCHAR(100) NOT NULL,
  trigger_object_type VARCHAR(30) NOT NULL,
  trigger_condition JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- G2. 工作流步骤
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_type VARCHAR(20) NOT NULL,
  agent_type VARCHAR(20) NOT NULL,
  agent_value VARCHAR(100),
  condition_field VARCHAR(50),
  condition_operator VARCHAR(10),
  condition_value VARCHAR(100),
  true_step INTEGER,
  false_step INTEGER,
  deadline_hours INTEGER,
  escalation_step INTEGER,
  UNIQUE(workflow_id, step_number)
);

-- G3. 工作流实例
CREATE TABLE workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
  object_type VARCHAR(30) NOT NULL,
  object_id UUID NOT NULL,
  current_step INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'IN_PROGRESS',
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- G4. 审批工作项
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  assigned_to UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  decision VARCHAR(20),
  decision_note TEXT,
  decided_at TIMESTAMP,
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_work_items_assigned ON work_items(assigned_to, status);

-- ============================================================================
-- H. 系统表 (2 张)
-- ============================================================================

-- H1. 通知记录
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  related_order_id UUID,
  channel VARCHAR(20) DEFAULT 'SYSTEM',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_time ON notifications(created_at DESC);

-- H2. 系统配置
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type VARCHAR(20) DEFAULT 'STRING',
  description VARCHAR(200),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 完成：共 45 张表
-- ============================================================================
