# EU-TMS 欧洲运输管理系统 - 技术方案与开发计划 V2

> 版本：V2.0 | 日期：2026-04-10 | 基于 PRD V1.1 + 原型图
> **架构标准：参照 SAP S/4HANA ERP 设计原则**

---

## 一、ERP 底层架构设计原则

### 1.1 与 SAP 的核心对标

本系统不是简单的 Web 管理后台，而是按照 SAP ERP 的核心设计哲学构建的企业级系统。以下是必须严格遵守的 10 大架构原则：

| 序号 | SAP 设计原则 | 本系统实现 | 优先级 |
|------|-------------|-----------|--------|
| 1 | **凭证原则 (Belegprinzip)** | 每笔业务操作产生不可变凭证，冲销产生反向凭证 | P0 |
| 2 | **单据流 (Document Flow)** | 询价→报价→订单→运单→费用→发票→收付款，完整链路追溯 | P0 |
| 3 | **组织架构 (Org Structure)** | 公司代码 → 业务区域 → 服务渠道，多维度数据隔离 | P0 |
| 4 | **总账/子账簿 (GL/Subledger)** | 客户子账簿 + 供应商子账簿 → 调节科目 → 总账 | P0 |
| 5 | **三方匹配 (3-Way Match)** | 运输订单 vs 服务确认 vs 承运商发票，容差控制 | P1 |
| 6 | **变更凭证 (Change Document)** | 字段级变更追踪：谁、何时、改了什么、从什么改成什么 | P0 |
| 7 | **编号范围 (Number Range)** | 统一编号管理，按类型/年度/组织分配，支持前缀配置 | P1 |
| 8 | **条件定价 (Pricing Procedure)** | 可配置定价引擎：基础运费 + 附加费 + 折扣 + 税，规则不硬编码 | P1 |
| 9 | **信用管理 (Credit Mgmt)** | 客户信用额度、风险等级、下单时自动信用检查 | P1 |
| 10 | **过账期间 (Posting Period)** | 会计期间开关控制，防止对已结账月份误操作 | P1 |
| 11 | **审批工作流 (Workflow)** | 可配置的审批流程，支持条件分支和超时升级 | P2 |
| 12 | **授权对象 (Auth Object)** | 组织维度 × 操作维度的细粒度权限控制 | P1 |

### 1.2 核心设计哲学

```
┌──────────────────────────────────────────────────────┐
│              SAP ERP 核心设计哲学                       │
│                                                      │
│  1. 一切业务操作皆产生凭证（不可变，只能冲销）            │
│  2. 凭证之间通过引用关系形成完整单据流                    │
│  3. 财务凭证由业务操作自动生成（自动科目确定）             │
│  4. 所有数据变更有字段级审计追踪                         │
│  5. 权限控制到 组织维度 × 操作维度                      │
│  6. 价格和规则可配置，不硬编码                           │
│  7. 状态只能有序流转，不可跳跃                           │
│  8. 期间控制防止对历史数据的误操作                        │
│  9. 跨单据的数据一致性校验（三方匹配）                    │
│  10. 异常处理走审批工作流，不走后门                       │
└──────────────────────────────────────────────────────┘
```

---

## 二、系统架构总览

### 2.1 三端架构 + ERP 内核

```
                         ┌─────────────────┐
                         │   Nginx 网关     │
                         └───────┬─────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │  运营管理端    │   │  客户门户     │   │ 运输公司门户  │
    │  :5174       │   │  :5175       │   │  :5176       │
    │  React + TS  │   │  React + TS  │   │  React + TS  │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           └──────────────────┼──────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │     ERP API 层 (Express.js)    │
              ├───────────────────────────────┤
              │  ┌─────────┐  ┌─────────────┐ │
              │  │ 认证授权  │  │  API 路由    │ │
              │  │ (RBAC)  │  │             │ │
              │  └─────────┘  └─────────────┘ │
              ├───────────────────────────────┤
              │     ERP 内核引擎层              │
              │  ┌─────────────────────────┐  │
              │  │ 凭证引擎  │ 编号范围管理  │  │
              │  ├─────────────────────────┤  │
              │  │ 单据流引擎 │ 定价引擎     │  │
              │  ├─────────────────────────┤  │
              │  │ 变更追踪   │ 信用管理    │  │
              │  ├─────────────────────────┤  │
              │  │ 期间控制   │ 工作流引擎   │  │
              │  ├─────────────────────────┤  │
              │  │ 通知引擎   │ 科目确定    │  │
              │  └─────────────────────────┘  │
              ├───────────────────────────────┤
              │     业务模块层                  │
              │  ┌────┬────┬────┬────┬────┐   │
              │  │订单 │报价 │CMR │GPS │财务│   │
              │  │管理 │管理 │管理 │追踪│管理│   │
              │  ├────┼────┼────┼────┼────┤   │
              │  │放单 │清关 │客户 │承运│通知│   │
              │  │管理 │管理 │管理 │管理│中心│   │
              │  └────┴────┴────┴────┴────┘   │
              ├───────────────────────────────┤
              │     数据访问层 (DAL)            │
              │  ┌─────────────────────────┐  │
              │  │  PostgreSQL + 事务管理    │  │
              │  └─────────────────────────┘  │
              └───────────────────────────────┘
```

### 2.2 ERP 内核引擎 —— 与普通 Web 系统的根本区别

普通 Web 系统的业务逻辑直接写在 Controller/Service 里；而 ERP 系统有一层**独立的内核引擎**，所有业务模块必须通过内核引擎来操作数据。

```
server/
├── core/                          ← ERP 内核引擎（新增）
│   ├── document-engine.js         ← 凭证引擎
│   ├── document-flow.js           ← 单据流引擎
│   ├── number-range.js            ← 编号范围管理
│   ├── change-tracker.js          ← 变更凭证追踪
│   ├── pricing-engine.js          ← 条件定价引擎
│   ├── credit-manager.js          ← 信用管理
│   ├── posting-period.js          ← 过账期间控制
│   ├── workflow-engine.js         ← 审批工作流
│   ├── account-determination.js   ← 自动科目确定
│   ├── notification-engine.js     ← 通知引擎
│   └── index.js                   ← 内核统一入口
├── modules/                       ← 业务模块（调用 core）
│   ├── order/
│   ├── quotation/
│   ├── finance/
│   └── ...
├── middleware/
├── database/
└── app.js
```

---

## 三、ERP 内核引擎详细设计

### 3.1 凭证引擎 (Document Engine)

**SAP 对标**：SAP 的 Belegprinzip（凭证原则）

**核心规则**：
- 每笔业务操作产生一个不可变的凭证记录
- 凭证一旦过账，只能通过「冲销」产生反向凭证来纠正，**禁止直接 UPDATE/DELETE**
- 每个凭证由「凭证类型 + 凭证编号 + 会计年度」唯一标识

```sql
-- 凭证主表（所有业务操作的底层记录）
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number VARCHAR(30) NOT NULL,            -- 凭证编号（由编号范围引擎生成）
  doc_type VARCHAR(20) NOT NULL,              -- 凭证类型（见下表）
  fiscal_year INTEGER NOT NULL,               -- 会计年度
  posting_date DATE NOT NULL,                 -- 过账日期
  document_date DATE NOT NULL,                -- 凭证日期
  company_code VARCHAR(10) NOT NULL,          -- 公司代码
  reference VARCHAR(50),                      -- 参考号（外部单号）
  header_text VARCHAR(200),                   -- 凭证说明
  
  -- 来源追溯
  source_doc_type VARCHAR(20),                -- 来源凭证类型
  source_doc_id UUID,                         -- 来源凭证 ID
  
  -- 冲销关系
  is_reversal BOOLEAN DEFAULT false,          -- 是否为冲销凭证
  reversed_doc_id UUID,                       -- 被冲销的凭证 ID
  reversal_reason VARCHAR(200),               -- 冲销原因
  
  -- 状态
  status VARCHAR(20) DEFAULT 'POSTED',        -- POSTED / REVERSED / PARKED(暂存)
  
  -- 操作人
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(doc_number, doc_type, fiscal_year, company_code)
);
```

**凭证类型对照表**：

| 凭证类型 | 说明 | SAP 对标 | 编号前缀 |
|---------|------|---------|---------|
| `ORD` | 运输订单 | 销售订单 (VA01) | EU- |
| `INQ` | 询价单 | 询价 (VA11) | INQ- |
| `QUO` | 报价单 | 报价 (VA21) | QUO- |
| `SRV` | 服务确认 | 交货确认 (VL01) | SRV- |
| `CMR` | CMR 单据 | 交货单 (VL01N) | CMR- |
| `FI_AR` | 应收发票 | 应收发票 (FB70) | INV-AR- |
| `FI_AP` | 应付发票 | 应付发票 (FB60) | INV-AP- |
| `FI_PAY` | 付款凭证 | 付款 (F-53/F-58) | PAY- |
| `FI_REC` | 收款凭证 | 收款 (F-28) | REC- |
| `FI_REV` | 冲销凭证 | 冲销 (FB08) | REV- |
| `REL` | 放单记录 | - | REL- |
| `CUS` | 清关记录 | - | CUS- |
| `GPS` | GPS 追踪 | - | GPS- |

**凭证引擎 API**：

```javascript
// server/core/document-engine.js

class DocumentEngine {
  
  // 创建凭证（核心方法，所有业务操作必须通过此方法）
  async createDocument(tx, {
    docType,           // 凭证类型
    companyCode,       // 公司代码
    postingDate,       // 过账日期
    documentDate,      // 凭证日期
    reference,         // 外部参考号
    headerText,        // 说明
    sourceDocType,     // 来源凭证类型
    sourceDocId,       // 来源凭证 ID
    lineItems,         // 行项目数组
    createdBy          // 操作人
  }) {
    // 1. 过账期间检查（调用 PostingPeriod）
    // 2. 生成凭证编号（调用 NumberRange）
    // 3. 写入凭证主表
    // 4. 写入凭证行项目表
    // 5. 更新单据流（调用 DocumentFlow）
    // 6. 记录变更日志（调用 ChangeTracker）
    // 返回凭证 ID 和编号
  }
  
  // 冲销凭证（不是删除，是产生反向凭证）
  async reverseDocument(tx, {
    originalDocId,     // 被冲销的凭证 ID
    reversalReason,    // 冲销原因
    postingDate,       // 冲销过账日期
    createdBy          // 操作人
  }) {
    // 1. 检查原凭证状态（已冲销的不能再冲销）
    // 2. 过账期间检查
    // 3. 生成冲销凭证（金额取反）
    // 4. 标记原凭证为已冲销
    // 5. 更新单据流
    // 6. 触发反向业务逻辑（如恢复信用额度）
  }
  
  // 暂存凭证（草稿，未过账）
  async parkDocument(tx, { ... }) { ... }
  
  // 过账暂存凭证
  async postParkedDocument(tx, { docId, createdBy }) { ... }
}
```

### 3.2 单据流引擎 (Document Flow)

**SAP 对标**：SAP 的 VBFA（单据流表）

**核心概念**：任何一个凭证，都能向前追溯到它的来源，向后追溯到它产生的后续凭证，形成一条完整的业务链路。

```sql
-- 单据流表（记录凭证之间的引用关系）
CREATE TABLE document_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preceding_doc_type VARCHAR(20) NOT NULL,    -- 前序凭证类型
  preceding_doc_id UUID NOT NULL,             -- 前序凭证 ID
  subsequent_doc_type VARCHAR(20) NOT NULL,   -- 后续凭证类型
  subsequent_doc_id UUID NOT NULL,            -- 后续凭证 ID
  flow_type VARCHAR(30) NOT NULL,             -- 关系类型（见下表）
  quantity NUMERIC(12,3),                     -- 涉及数量（用于部分处理）
  amount NUMERIC(12,2),                       -- 涉及金额
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(preceding_doc_id, subsequent_doc_id)
);

CREATE INDEX idx_doc_flow_preceding ON document_flow(preceding_doc_id);
CREATE INDEX idx_doc_flow_subsequent ON document_flow(subsequent_doc_id);
```

**TMS 完整单据流**：

```
客户询价 (INQ)
    ↓ INQUIRY_TO_QUOTATION
运营报价 (QUO)
    ↓ QUOTATION_TO_ORDER
运输订单 (ORD)
    ├── ORDER_TO_SERVICE → 服务确认 (SRV)
    ├── ORDER_TO_CMR → CMR 单据 (CMR)
    ├── ORDER_TO_RELEASE → 船司放单 (REL)
    ├── ORDER_TO_CUSTOMS → 清关记录 (CUS)
    ├── ORDER_TO_AR → 应收发票 (FI_AR)
    │                       ↓ INVOICE_TO_PAYMENT
    │                  收款凭证 (FI_REC)
    └── ORDER_TO_AP → 应付发票 (FI_AP)
                            ↓ INVOICE_TO_PAYMENT
                       付款凭证 (FI_PAY)
```

**单据流引擎 API**：

```javascript
// server/core/document-flow.js

class DocumentFlowEngine {
  
  // 记录单据流关系
  async createFlowLink(tx, {
    precedingDocType, precedingDocId,
    subsequentDocType, subsequentDocId,
    flowType, quantity, amount, currency
  }) { ... }
  
  // 获取完整单据流（向前 + 向后追溯）
  async getFullDocumentFlow(docId) {
    // 递归查询所有前序和后续凭证
    // 返回树状结构
  }
  
  // 检查单据处理完整性（是否所有行项目都已处理）
  async checkCompleteness(docId) { ... }
}
```

### 3.3 编号范围管理 (Number Range)

**SAP 对标**：SAP 的 SNRO（编号范围管理事务）

```sql
-- 编号范围配置表
CREATE TABLE number_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type VARCHAR(30) NOT NULL,          -- 对象类型（ORD/INQ/QUO/FI_AR 等）
  company_code VARCHAR(10) NOT NULL,         -- 公司代码
  fiscal_year INTEGER NOT NULL,              -- 会计年度
  prefix VARCHAR(20),                        -- 前缀（如 EU-、INV-）
  range_start BIGINT NOT NULL,               -- 起始号码
  range_end BIGINT NOT NULL,                 -- 结束号码
  current_number BIGINT NOT NULL,            -- 当前号码
  number_format VARCHAR(50),                 -- 格式模板（如 {PREFIX}{YEAR}{SEQ:6}）
  is_external BOOLEAN DEFAULT false,         -- 是否允许外部编号
  
  UNIQUE(object_type, company_code, fiscal_year)
);

-- 示例数据
INSERT INTO number_ranges VALUES
  (gen_random_uuid(), 'ORD', 'DE01', 2026, 'EU-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}', false),
  (gen_random_uuid(), 'INQ', 'DE01', 2026, 'INQ-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}', false),
  (gen_random_uuid(), 'QUO', 'DE01', 2026, 'QUO-', 1, 999999, 0, '{PREFIX}{YYYYMMDD}-{SEQ:4}', false),
  (gen_random_uuid(), 'FI_AR', 'DE01', 2026, 'INV-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}', false),
  (gen_random_uuid(), 'FI_AP', 'DE01', 2026, 'BILL-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}', false),
  (gen_random_uuid(), 'FI_PAY', 'DE01', 2026, 'PAY-', 1, 999999, 0, '{PREFIX}{YEAR}-{SEQ:6}', false);
```

```javascript
// server/core/number-range.js

class NumberRangeManager {
  
  // 获取下一个编号（带行锁，并发安全）
  async getNextNumber(tx, objectType, companyCode) {
    // SELECT ... FOR UPDATE 防止并发冲突
    // current_number + 1
    // 检查是否超出范围
    // 按 number_format 格式化
    // 返回格式化后的编号
  }
  
  // 编号格式化
  formatNumber(format, { prefix, year, yearMonth, seq }) {
    // {PREFIX}{YYYYMMDD}-{SEQ:4} → EU-20260410-0001
    // {PREFIX}{YEAR}-{SEQ:6}     → INV-2026-000001
  }
}
```

### 3.4 变更凭证追踪 (Change Tracker)

**SAP 对标**：SAP 的 CDHDR/CDPOS（变更凭证表）

```sql
-- 变更凭证抬头
CREATE TABLE change_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type VARCHAR(50) NOT NULL,           -- 对象类型（ORDER/CLIENT/CARRIER/INVOICE 等）
  object_id VARCHAR(100) NOT NULL,            -- 对象编号/ID
  change_type VARCHAR(20) NOT NULL,           -- INSERT / UPDATE / DELETE / STATUS_CHANGE
  transaction_type VARCHAR(50),               -- 业务操作类型（CREATE_ORDER / ASSIGN_CARRIER 等）
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_reason TEXT                           -- 变更原因（冲销时必填）
);

-- 变更凭证明细（字段级追踪）
CREATE TABLE change_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_doc_id UUID NOT NULL REFERENCES change_documents(id),
  table_name VARCHAR(100) NOT NULL,           -- 表名
  field_name VARCHAR(100) NOT NULL,           -- 字段名
  field_label VARCHAR(100),                   -- 字段中文标签
  old_value TEXT,                             -- 旧值
  new_value TEXT,                             -- 新值
  value_type VARCHAR(20) DEFAULT 'TEXT'       -- TEXT / NUMBER / DATE / JSON
);

CREATE INDEX idx_change_docs_object ON change_documents(object_type, object_id);
CREATE INDEX idx_change_docs_time ON change_documents(changed_at DESC);
```

```javascript
// server/core/change-tracker.js

class ChangeTracker {
  
  // 自动对比新旧数据，记录字段级变更
  async trackChanges(tx, {
    objectType,
    objectId,
    changeType,         // INSERT / UPDATE / STATUS_CHANGE
    transactionType,    // 业务操作类型
    tableName,
    oldData,            // 旧数据对象（UPDATE 时必传）
    newData,            // 新数据对象
    trackedFields,      // 需要追踪的字段列表 [{name, label}]
    changedBy,
    changeReason
  }) {
    // 1. 创建变更凭证抬头
    // 2. 逐字段对比 oldData 和 newData
    // 3. 有差异的字段写入变更明细
    // 4. INSERT 类型记录所有字段的新值
  }
  
  // 获取对象的完整变更历史
  async getChangeHistory(objectType, objectId) { ... }
}
```

### 3.5 条件定价引擎 (Pricing Engine)

**SAP 对标**：SAP 的条件技术 (Condition Technique) + 定价过程 (Pricing Procedure)

```sql
-- 定价过程（计算步骤的模板）
CREATE TABLE pricing_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_code VARCHAR(20) NOT NULL UNIQUE, -- CURTAIN_SIDE / CONTAINER
  procedure_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- 定价步骤（定价过程中的每个计算步骤）
CREATE TABLE pricing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES pricing_procedures(id),
  step_number INTEGER NOT NULL,               -- 步骤号（10, 20, 30...）
  condition_type_id UUID NOT NULL REFERENCES condition_types(id),
  description VARCHAR(100),
  from_step INTEGER,                          -- 基于哪个步骤计算（百分比类）
  is_subtotal BOOLEAN DEFAULT false,          -- 是否为小计行
  is_mandatory BOOLEAN DEFAULT false,         -- 是否必填
  calc_type VARCHAR(20) DEFAULT 'FIXED',      -- FIXED(固定) / PERCENT(百分比) / FORMULA(公式)
  sort_order INTEGER NOT NULL,
  
  UNIQUE(procedure_id, step_number)
);

-- 条件类型（价格要素定义）
CREATE TABLE condition_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code VARCHAR(10) NOT NULL UNIQUE,      -- PR00, K007, KF00 等
  type_name VARCHAR(100) NOT NULL,            -- 基础运费、折扣、附加费等
  category VARCHAR(20) NOT NULL,              -- PRICE / DISCOUNT / SURCHARGE / TAX
  plus_minus VARCHAR(1) DEFAULT '+',          -- + 加 / - 减
  access_sequence_id UUID REFERENCES access_sequences(id),
  is_manual BOOLEAN DEFAULT false,            -- 是否允许手动输入
  is_active BOOLEAN DEFAULT true
);

-- 存取顺序（搜索策略）
CREATE TABLE access_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_code VARCHAR(20) NOT NULL UNIQUE,
  sequence_name VARCHAR(100) NOT NULL
);

-- 存取顺序步骤（按优先级依次查找）
CREATE TABLE access_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_sequence_id UUID NOT NULL REFERENCES access_sequences(id),
  step_number INTEGER NOT NULL,
  condition_table_id UUID NOT NULL REFERENCES condition_tables(id),
  description VARCHAR(100),
  
  UNIQUE(access_sequence_id, step_number)
);

-- 条件表定义（搜索的关键字段组合）
CREATE TABLE condition_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_code VARCHAR(20) NOT NULL UNIQUE,
  table_name VARCHAR(100) NOT NULL,
  key_fields JSONB NOT NULL                   -- ["client_id","route_from","route_to","container_type"]
);

-- 条件记录（实际的价格数据）
CREATE TABLE condition_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_type_id UUID NOT NULL REFERENCES condition_types(id),
  condition_table_id UUID NOT NULL REFERENCES condition_tables(id),
  key_values JSONB NOT NULL,                  -- {"client_id":"xxx","route_from":"Hamburg","route_to":"Munich"}
  amount NUMERIC(12,2) NOT NULL,              -- 金额或百分比
  currency VARCHAR(3) DEFAULT 'EUR',
  per_unit VARCHAR(20),                       -- PER_SHIPMENT / PER_KG / PER_CBM / PERCENT
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_condition_records_type ON condition_records(condition_type_id);
CREATE INDEX idx_condition_records_keys ON condition_records USING GIN(key_values);
CREATE INDEX idx_condition_records_valid ON condition_records(valid_from, valid_to);
```

**TMS 定价过程示例配置**：

```
篷布车运输定价过程 (CURTAIN_SIDE)：
┌──────┬────────────┬──────────┬──────────┐
│ 步骤  │ 条件类型    │ 说明      │ 搜索策略  │
├──────┼────────────┼──────────┼──────────┤
│  10  │ PR00       │ 基础运费  │ 客户+路线 → 路线 → 默认 │
│  20  │ KA00       │ 客户折扣  │ 客户+路线 → 客户等级   │
│  30  │ KF00       │ 燃油附加费 │ 路线 → 默认           │
│  40  │ ZAD1       │ ADR危险品  │ 路线+ADR              │
│  50  │ ZAD2       │ 超宽超重   │ 路线+重量              │
│  60  │ ZAD3       │ 尾板附加费 │ 固定金额              │
│  90  │ SUBTOTAL   │ 小计      │ -                     │
│  95  │ MWST       │ 增值税    │ 国家税率              │
│  99  │ TOTAL      │ 总计      │ -                     │
└──────┴────────────┴──────────┴──────────┘
```

```javascript
// server/core/pricing-engine.js

class PricingEngine {
  
  // 执行定价计算
  async calculatePrice(tx, {
    procedureCode,     // 定价过程代码
    inputData          // 输入数据（客户、路线、货物信息等）
  }) {
    // 1. 加载定价过程和步骤
    // 2. 按步骤顺序执行：
    //    a. 根据条件类型找存取顺序
    //    b. 按存取顺序优先级依次查找条件记录
    //    c. 找到第一个匹配的就停止（Exclusive）
    //    d. 计算金额（固定/百分比/公式）
    // 3. 返回定价结果（各步骤明细 + 总计）
  }
  
  // 获取定价明细（用于报价展示）
  async getPricingBreakdown(orderId) { ... }
}
```

### 3.6 信用管理 (Credit Manager)

**SAP 对标**：SAP 的 FSCM 信用管理

```sql
-- 客户信用主数据（在 clients 表中扩展）
-- credit_limit        NUMERIC(12,2)    -- 信用额度
-- credit_exposure     NUMERIC(12,2)    -- 当前信用敞口（系统自动计算）
-- risk_category       VARCHAR(10)      -- LOW/MEDIUM/HIGH
-- credit_blocked      BOOLEAN          -- 是否信用冻结
-- last_credit_check   TIMESTAMP        -- 上次信用检查时间

-- 信用检查日志
CREATE TABLE credit_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  check_point VARCHAR(30) NOT NULL,           -- ORDER_CREATE / ORDER_CONFIRM / DELIVERY
  order_id UUID REFERENCES orders(id),
  credit_limit NUMERIC(12,2),                 -- 检查时的信用额度
  credit_exposure NUMERIC(12,2),              -- 检查时的信用敞口
  order_amount NUMERIC(12,2),                 -- 本次订单金额
  check_result VARCHAR(20) NOT NULL,          -- PASSED / WARNING / BLOCKED
  override_by UUID REFERENCES users(id),      -- 如果人工放行，记录审批人
  override_reason TEXT,                       -- 放行原因
  checked_at TIMESTAMP DEFAULT NOW()
);
```

```javascript
// server/core/credit-manager.js

class CreditManager {
  
  // 信用检查（创建订单时自动调用）
  async checkCredit(tx, clientId, orderAmount, checkPoint) {
    // 1. 获取客户信用数据
    // 2. 计算信用敞口 = 未清应收 + 在途订单金额
    // 3. 判断：(敞口 + 新订单) vs 信用额度
    // 4. 根据风险等级决定检查策略：
    //    LOW:  静态检查（仅看应收）
    //    MED:  动态检查（应收 + 在途）
    //    HIGH: 严格检查（应收 + 在途 + 未确认）
    // 5. 记录检查日志
    // 6. 返回 PASSED / WARNING / BLOCKED
  }
  
  // 更新信用敞口（订单创建/完成/付款时自动调用）
  async updateExposure(tx, clientId) { ... }
  
  // 人工信用释放（需要主管权限）
  async overrideBlock(tx, orderId, overrideBy, reason) { ... }
}
```

### 3.7 过账期间控制 (Posting Period)

**SAP 对标**：SAP 的 OB52（过账期间维护）

```sql
-- 过账期间控制表
CREATE TABLE posting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(10) NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,             -- 1-12 (正常期间) + 13-16 (特殊期间)
  account_type VARCHAR(20) NOT NULL,         -- ALL / RECEIVABLE / PAYABLE / EXPENSE
  is_open BOOLEAN DEFAULT false,
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMP,
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP,
  
  UNIQUE(company_code, fiscal_year, period_month, account_type)
);
```

```javascript
// server/core/posting-period.js

class PostingPeriodManager {
  
  // 检查过账期间是否开放
  async checkPeriod(companyCode, postingDate, accountType) {
    // 从 postingDate 推导 fiscal_year 和 period_month
    // 查询 posting_periods 表
    // 先查具体 accountType，再查 ALL
    // 返回 true/false + 错误信息
  }
  
  // 开放期间
  async openPeriod(companyCode, year, month, accountType, userId) { ... }
  
  // 关闭期间
  async closePeriod(companyCode, year, month, accountType, userId) { ... }
}
```

### 3.8 审批工作流引擎 (Workflow Engine)

**SAP 对标**：SAP Business Workflow

```sql
-- 工作流定义（流程模板）
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_code VARCHAR(30) NOT NULL UNIQUE,  -- ORDER_APPROVAL / EXPENSE_APPROVAL 等
  workflow_name VARCHAR(100) NOT NULL,
  trigger_object_type VARCHAR(30) NOT NULL,   -- ORDER / EXPENSE / INVOICE 等
  trigger_condition JSONB,                    -- 触发条件（如 {"amount_gt": 5000}）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 工作流步骤
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
  step_number INTEGER NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_type VARCHAR(20) NOT NULL,             -- APPROVAL / NOTIFICATION / CONDITION
  -- 代理人确定规则
  agent_type VARCHAR(20) NOT NULL,            -- ROLE / USER / RULE
  agent_value VARCHAR(100),                   -- 角色名 / 用户ID / 规则代码
  -- 条件分支（step_type=CONDITION 时）
  condition_field VARCHAR(50),
  condition_operator VARCHAR(10),
  condition_value VARCHAR(100),
  true_step INTEGER,                          -- 条件为真时跳转到的步骤
  false_step INTEGER,                         -- 条件为假时跳转到的步骤
  -- 超时设置
  deadline_hours INTEGER,                     -- 超时小时数
  escalation_step INTEGER,                    -- 超时后升级到的步骤
  
  UNIQUE(workflow_id, step_number)
);

-- 工作流实例（运行中的流程）
CREATE TABLE workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id),
  object_type VARCHAR(30) NOT NULL,
  object_id UUID NOT NULL,
  current_step INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'IN_PROGRESS',   -- IN_PROGRESS / APPROVED / REJECTED / ESCALATED
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 审批工作项（待办事项）
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id),
  step_number INTEGER NOT NULL,
  assigned_to UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'PENDING',       -- PENDING / APPROVED / REJECTED / ESCALATED
  decision VARCHAR(20),                       -- APPROVE / REJECT
  decision_note TEXT,
  decided_at TIMESTAMP,
  deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.9 自动科目确定 (Account Determination)

**SAP 对标**：SAP 的 VKOA（销售科目确定）

```sql
-- 科目表（会计科目）
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(20) NOT NULL UNIQUE,   -- 科目代码
  account_name VARCHAR(100) NOT NULL,         -- 科目名称
  account_type VARCHAR(20) NOT NULL,          -- ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE
  parent_code VARCHAR(20),                    -- 上级科目
  is_reconciliation BOOLEAN DEFAULT false,    -- 是否为调节科目
  is_active BOOLEAN DEFAULT true
);

-- 科目确定规则
CREATE TABLE account_determination_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type VARCHAR(30) NOT NULL,      -- 业务交易类型
  business_type VARCHAR(20),                  -- CURTAIN_SIDE / CONTAINER / ALL
  debit_account VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(account_code),
  credit_account VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(account_code),
  description VARCHAR(200),
  
  UNIQUE(transaction_type, business_type)
);

-- 示例科目确定规则
-- 运输收入确认：借 应收账款(1200)，贷 运输收入(4000)
-- 运输成本确认：借 运输成本(5000)，贷 应付账款(2100)
-- 收到客户付款：借 银行(1000)，贷 应收账款(1200)
-- 支付运输公司：借 应付账款(2100)，贷 银行(1000)
```

```javascript
// server/core/account-determination.js

class AccountDetermination {
  
  // 根据业务交易类型自动确定会计科目
  async determineAccounts(transactionType, businessType) {
    // 1. 先按 businessType 精确查找
    // 2. 找不到则按 ALL 查找
    // 3. 返回 { debitAccount, creditAccount }
  }
  
  // 自动生成会计分录（业务操作触发）
  async createJournalEntry(tx, {
    transactionType,
    businessType,
    amount,
    currency,
    reference,
    postingDate,
    createdBy
  }) {
    // 1. 调用 determineAccounts 获取科目
    // 2. 调用 DocumentEngine 创建财务凭证
    // 3. 写入会计分录行（借方+贷方）
  }
}
```

### 3.10 总账与子账簿 (GL & Subledger)

**SAP 对标**：SAP FI 的 GL + AR + AP

```sql
-- 会计分录行（统一日记账，类似 S/4HANA 的 ACDOCA）
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),  -- 关联凭证
  line_number INTEGER NOT NULL,
  account_code VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(account_code),
  debit_credit VARCHAR(1) NOT NULL,           -- D(借) / C(贷)
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  local_amount NUMERIC(12,2),                 -- 本位币金额
  exchange_rate NUMERIC(10,6),                -- 汇率
  -- 子账簿维度
  subledger_type VARCHAR(20),                 -- CLIENT / CARRIER（空=总账直接过账）
  subledger_id UUID,                          -- 客户ID / 运输公司ID
  -- 分析维度
  cost_center VARCHAR(20),                    -- 成本中心
  profit_center VARCHAR(20),                  -- 利润中心
  order_id UUID,                              -- 关联订单
  business_type VARCHAR(20),                  -- 业务类型
  -- 过账控制
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
```

**三层架构工作方式**：

```
业务操作（创建应收发票）
    ↓ 自动科目确定
会计分录：
    借：应收账款(1200) / 子账簿=CLIENT/客户A     €3,000
    贷：运输收入(4000)                            €3,000
    ↓
客户子账簿：客户A 未清应收 +€3,000
    ↓ 调节科目自动汇总
总账：应收账款科目余额 +€3,000
```

---

## 四、组织架构设计

**SAP 对标**：SAP 的组织结构概念

```sql
-- 公司代码（法律实体）
CREATE TABLE company_codes (
  code VARCHAR(10) PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  country VARCHAR(10) NOT NULL,
  currency VARCHAR(3) NOT NULL,              -- 本位币
  language VARCHAR(5) DEFAULT 'zh',
  tax_number VARCHAR(50),                    -- 税号
  address TEXT,
  is_active BOOLEAN DEFAULT true
);

-- 业务区域（运营维度）
CREATE TABLE business_areas (
  code VARCHAR(10) PRIMARY KEY,
  area_name VARCHAR(100) NOT NULL,
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  description TEXT
);

-- 初始化数据
INSERT INTO company_codes VALUES
  ('DE01', 'Triple Delta GmbH', 'DE', 'EUR', 'zh', NULL, 'Germany', true);

INSERT INTO business_areas VALUES
  ('CS', '篷布车运输', 'DE01', '欧洲公路整车/拼车运输'),
  ('CT', '集装箱物流', 'DE01', '海运集装箱到港后陆运配送');
```

---

## 五、三方匹配设计

**SAP 对标**：SAP MM 的三方校验

```
TMS 三方匹配：

1. 运输订单 (Order)           → 约定：什么货、哪条路线、多少钱
2. 服务确认 (Service Confirm)  → 确认：实际运输完成、实际公里/重量
3. 承运商发票 (Carrier Invoice) → 账单：承运商实际收费金额

匹配规则：
├── 数量匹配：订单货量 ↔ 服务确认货量 ↔ 发票货量
├── 金额匹配：订单约定价 ↔ 发票金额
└── 容差控制：
    ├── 金额容差 ≤ 2% → 自动通过，差额入「价格差异」科目
    ├── 金额容差 > 2% 且 ≤ 5% → 预警，需主管审批
    └── 金额容差 > 5% → 阻止付款，必须财务审批
```

```sql
-- 三方匹配记录
CREATE TABLE three_way_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  service_doc_id UUID REFERENCES documents(id),    -- 服务确认凭证
  invoice_doc_id UUID REFERENCES documents(id),    -- 承运商发票凭证
  
  -- 订单数据
  order_amount NUMERIC(12,2),
  order_weight NUMERIC(10,2),
  
  -- 服务确认数据
  service_amount NUMERIC(12,2),
  service_weight NUMERIC(10,2),
  
  -- 发票数据
  invoice_amount NUMERIC(12,2),
  invoice_weight NUMERIC(10,2),
  
  -- 匹配结果
  amount_variance NUMERIC(12,2),              -- 金额差异
  amount_variance_pct NUMERIC(5,2),           -- 金额差异百分比
  match_result VARCHAR(20) NOT NULL,          -- MATCHED / WARNING / BLOCKED
  
  -- 审批（如需）
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  approval_note TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 容差配置表
CREATE TABLE tolerance_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type VARCHAR(30) NOT NULL,            -- AMOUNT / QUANTITY
  tolerance_pct_auto NUMERIC(5,2) DEFAULT 2,  -- 自动通过的容差百分比
  tolerance_pct_warn NUMERIC(5,2) DEFAULT 5,  -- 预警容差
  tolerance_abs_auto NUMERIC(12,2),           -- 绝对金额容差（自动）
  tolerance_abs_warn NUMERIC(12,2),           -- 绝对金额容差（预警）
  company_code VARCHAR(10) NOT NULL,
  is_active BOOLEAN DEFAULT true
);
```

---

## 六、业务模块数据表设计

在 ERP 内核引擎之上，构建业务模块的数据表。**关键区别**：每个业务表都关联凭证表 `documents`，业务操作通过凭证引擎执行。

### 6.1 数据库表完整清单（共 45 张表）

#### ERP 内核表（13 张）

| 表名 | 说明 |
|------|------|
| `documents` | 凭证主表 |
| `document_flow` | 单据流关系表 |
| `number_ranges` | 编号范围配置 |
| `change_documents` | 变更凭证抬头 |
| `change_document_items` | 变更凭证明细 |
| `pricing_procedures` | 定价过程 |
| `pricing_steps` | 定价步骤 |
| `condition_types` | 条件类型 |
| `access_sequences` | 存取顺序 |
| `access_sequence_steps` | 存取顺序步骤 |
| `condition_tables` | 条件表 |
| `condition_records` | 条件记录（价格数据） |
| `posting_periods` | 过账期间控制 |

#### 组织与权限表（7 张）

| 表名 | 说明 |
|------|------|
| `company_codes` | 公司代码 |
| `business_areas` | 业务区域 |
| `users` | 用户表（扩展组织维度） |
| `roles` | 角色表 |
| `permissions` | 权限表（改为授权对象模型） |
| `role_permissions` | 角色-权限关联 |
| `user_org_assignments` | 用户-组织分配 |

#### 会计表（5 张）

| 表名 | 说明 |
|------|------|
| `chart_of_accounts` | 科目表 |
| `account_determination_rules` | 科目确定规则 |
| `journal_entries` | 会计分录行 |
| `credit_check_logs` | 信用检查日志 |
| `three_way_match` | 三方匹配记录 |
| `tolerance_config` | 容差配置 |

#### 主数据表（4 张）

| 表名 | 说明 |
|------|------|
| `clients` | 客户档案（含信用管理字段） |
| `carriers` | 运输公司档案 |
| `carrier_vehicles` | 车队管理 |
| `carrier_routes` | 覆盖路线 |

#### 业务单据表（11 张）

| 表名 | 说明 |
|------|------|
| `orders` | 运输订单（关联 document_id） |
| `order_status_logs` | 订单状态日志 |
| `inquiries` | 询价单（关联 document_id） |
| `quotations` | 报价单（关联 document_id） |
| `quotation_pricing_items` | 报价定价明细行 |
| `cmr_documents` | CMR 单据（关联 document_id） |
| `gps_tracking` | GPS 追踪记录 |
| `shipping_releases` | 船司放单记录 |
| `customs_clearances` | 清关记录 |
| `customs_documents` | 清关文件 |
| `financial_records` | 应收/应付记录（关联 document_id） |

#### 模板与配置表（3 张）

| 表名 | 说明 |
|------|------|
| `invoice_templates` | 发票模板 |
| `auto_invoice_rules` | 自动开票规则 |
| `notification_preferences` | 通知偏好 |

#### 工作流表（3 张）

| 表名 | 说明 |
|------|------|
| `workflow_definitions` | 工作流定义 |
| `workflow_steps` | 工作流步骤 |
| `workflow_instances` | 工作流实例 |
| `work_items` | 审批工作项 |

#### 系统表（2 张）

| 表名 | 说明 |
|------|------|
| `notifications` | 通知记录 |
| `system_settings` | 系统配置 |

### 6.2 业务表关键修改

所有业务单据表新增 `document_id` 字段关联凭证主表：

```sql
-- orders 表新增字段
ALTER TABLE orders ADD COLUMN document_id UUID REFERENCES documents(id);
ALTER TABLE orders ADD COLUMN company_code VARCHAR(10) REFERENCES company_codes(code);
ALTER TABLE orders ADD COLUMN business_area VARCHAR(10) REFERENCES business_areas(code);

-- inquiries 表新增字段
ALTER TABLE inquiries ADD COLUMN document_id UUID REFERENCES documents(id);

-- quotations 表新增字段
ALTER TABLE quotations ADD COLUMN document_id UUID REFERENCES documents(id);

-- financial_records 表新增字段
ALTER TABLE financial_records ADD COLUMN document_id UUID REFERENCES documents(id);
ALTER TABLE financial_records ADD COLUMN journal_entry_doc_id UUID REFERENCES documents(id); -- 关联的会计凭证
```

---

## 七、业务流程设计（SAP 单据流标准）

### 7.1 完整业务流程（从询价到收款）

```
                           ┌─────────────┐
                           │  客户发起询价  │ INQ 凭证
                           └──────┬──────┘
                                  │ INQUIRY_TO_QUOTATION
                                  ▼
                           ┌─────────────┐
                           │  运营创建报价  │ QUO 凭证
                           │ （定价引擎计算）│ ← 条件定价引擎
                           └──────┬──────┘
                                  │ QUOTATION_TO_ORDER
                                  ▼
                           ┌─────────────┐
            ┌──────────────│  创建运输订单  │ ORD 凭证 ← 信用检查
            │              │ （信用检查）   │
            │              └──────┬──────┘
            │                     │
     ┌──────┴──────┐              │
     │ 集装箱物流    │      ┌──────┴──────┐
     │              │      │ 篷布车运输    │
     ▼              │      └──────┬──────┘
┌─────────┐        │             │
│ 船司放单  │ REL    │             │ ORDER_TO_SERVICE
└────┬────┘        │             ▼
     │              │      ┌─────────────┐
     ▼              │      │  派单/接单    │
┌─────────┐        │      └──────┬──────┘
│ 清关管理  │ CUS    │             │
└────┬────┘        │             │
     │              │             ▼
     └──────┬──────┘       ┌─────────────┐
            │              │  运输执行     │
            │              │  GPS 追踪     │ GPS
            │              └──────┬──────┘
            │                     │
            ▼                     ▼
     ┌─────────────┐      ┌─────────────┐
     │  CMR 上传    │ CMR  │  服务确认    │ SRV 凭证
     └──────┬──────┘      └──────┬──────┘
            │                     │
            └──────┬──────────────┘
                   │
      ┌────────────┴────────────┐
      ▼                         ▼
┌──────────┐              ┌──────────┐
│ 应收开票   │ FI_AR       │ 应付登记  │ FI_AP
│（发票模板） │              │（三方匹配）│ ← 三方匹配
│ 自动科目   │ ← 科目确定   │ 自动科目  │ ← 科目确定
│ 会计分录   │ ← 日记账     │ 会计分录  │ ← 日记账
└─────┬────┘              └─────┬────┘
      │                         │
      ▼                         ▼
┌──────────┐              ┌──────────┐
│ 客户收款   │ FI_REC      │ 付款给承运 │ FI_PAY
│ 会计分录   │              │ 会计分录  │
└──────────┘              └──────────┘
```

### 7.2 凭证引擎在业务中的调用方式

以「创建运输订单」为例：

```javascript
// server/modules/order/service.js

async createOrder(tx, orderData, userId) {
  const { documentEngine, numberRange, creditManager, 
          changeTracker, documentFlow } = require('../../core');
  
  // 步骤 1：信用检查
  const creditResult = await creditManager.checkCredit(
    tx, orderData.clientId, orderData.clientPrice, 'ORDER_CREATE'
  );
  if (creditResult.status === 'BLOCKED') {
    throw new Error(`信用检查未通过：客户信用敞口 ${creditResult.exposure} 
                     已超出信用额度 ${creditResult.limit}`);
  }
  
  // 步骤 2：通过凭证引擎创建凭证
  const doc = await documentEngine.createDocument(tx, {
    docType: 'ORD',
    companyCode: orderData.companyCode,
    postingDate: new Date(),
    documentDate: new Date(),
    reference: orderData.reference,
    headerText: `运输订单 - ${orderData.clientName}`,
    sourceDocType: orderData.quotationId ? 'QUO' : null,
    sourceDocId: orderData.quotationDocId || null,
    createdBy: userId
  });
  
  // 步骤 3：写入订单业务数据
  const order = await orderModel.create(tx, {
    ...orderData,
    orderNumber: doc.docNumber,    // 编号由凭证引擎生成
    documentId: doc.id,            // 关联凭证
    status: 'PENDING_REVIEW'
  });
  
  // 步骤 4：如果来源于报价，更新单据流
  if (orderData.quotationDocId) {
    await documentFlow.createFlowLink(tx, {
      precedingDocType: 'QUO',
      precedingDocId: orderData.quotationDocId,
      subsequentDocType: 'ORD',
      subsequentDocId: doc.id,
      flowType: 'QUOTATION_TO_ORDER',
      amount: orderData.clientPrice,
      currency: orderData.currency
    });
  }
  
  // 步骤 5：记录变更日志
  await changeTracker.trackChanges(tx, {
    objectType: 'ORDER',
    objectId: order.id,
    changeType: 'INSERT',
    transactionType: 'CREATE_ORDER',
    tableName: 'orders',
    newData: order,
    trackedFields: ORDER_TRACKED_FIELDS,
    changedBy: userId
  });
  
  // 步骤 6：更新客户信用敞口
  await creditManager.updateExposure(tx, orderData.clientId);
  
  return order;
}
```

### 7.3 凭证冲销示例（作废发票）

```javascript
// 作废发票 ≠ DELETE，而是产生冲销凭证

async voidInvoice(tx, invoiceId, reason, userId) {
  const { documentEngine, accountDetermination } = require('../../core');
  
  // 步骤 1：获取原发票凭证
  const invoice = await financeModel.getById(tx, invoiceId);
  
  // 步骤 2：检查是否可以冲销（已付款的不能直接冲销）
  if (invoice.paidAmount > 0) {
    throw new Error('已有付款记录的发票不能直接作废，请先回滚付款');
  }
  
  // 步骤 3：通过凭证引擎创建冲销凭证
  const reversalDoc = await documentEngine.reverseDocument(tx, {
    originalDocId: invoice.documentId,
    reversalReason: reason,
    postingDate: new Date(),
    createdBy: userId
  });
  
  // 步骤 4：生成反向会计分录
  await accountDetermination.createJournalEntry(tx, {
    transactionType: 'INVOICE_REVERSAL',
    businessType: invoice.businessType,
    amount: -invoice.amount,    // 金额取反
    currency: invoice.currency,
    reference: `冲销 ${invoice.recordNumber}`,
    postingDate: new Date(),
    createdBy: userId
  });
  
  // 步骤 5：更新发票状态
  await financeModel.updateStatus(tx, invoiceId, 'VOID');
  
  // 步骤 6：恢复客户信用额度
  await creditManager.updateExposure(tx, invoice.counterpartyId);
}
```

---

## 八、授权对象模型

**SAP 对标**：SAP 的授权对象 (Authorization Object)

```sql
-- 授权对象定义
CREATE TABLE auth_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_code VARCHAR(30) NOT NULL UNIQUE,    -- ORDER_MGMT / FINANCE_MGMT 等
  object_name VARCHAR(100) NOT NULL,
  description TEXT,
  fields JSONB NOT NULL                       -- 授权字段定义
);

-- 授权值分配（角色级别）
CREATE TABLE auth_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  auth_object_code VARCHAR(30) NOT NULL REFERENCES auth_objects(object_code),
  field_values JSONB NOT NULL,                -- 字段值（如 {"company_code":["DE01"],"activity":["CREATE","VIEW"]}）
  is_active BOOLEAN DEFAULT true
);

-- 用户组织分配（用户可访问的组织范围）
CREATE TABLE user_org_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  company_code VARCHAR(10) NOT NULL REFERENCES company_codes(code),
  business_area VARCHAR(10) REFERENCES business_areas(code),
  is_default BOOLEAN DEFAULT false
);
```

**授权对象设计**：

| 对象代码 | 授权字段 | 说明 |
|---------|---------|------|
| `ORDER_MGMT` | company_code, business_area, activity | 订单管理 |
| `QUOTATION_MGMT` | company_code, activity | 报价管理 |
| `FINANCE_AR` | company_code, activity | 应收管理 |
| `FINANCE_AP` | company_code, activity | 应付管理 |
| `FINANCE_POST` | company_code, account_type, activity | 过账权限 |
| `CLIENT_MGMT` | company_code, activity | 客户管理 |
| `CARRIER_MGMT` | company_code, activity | 承运商管理 |
| `SYSTEM_ADMIN` | activity | 系统管理 |
| `CREDIT_MGMT` | company_code, activity | 信用管理（含释放权限） |
| `PERIOD_MGMT` | company_code, activity | 期间管理 |
| `WORKFLOW_ADMIN` | activity | 工作流管理 |

**activity 可选值**：`CREATE` / `VIEW` / `EDIT` / `DELETE` / `APPROVE` / `POST` / `REVERSE` / `OVERRIDE`

```javascript
// 权限检查中间件
async function checkAuth(objectCode, requiredActivity) {
  return async (req, res, next) => {
    const userId = req.user.id;
    const companyCode = req.body.companyCode || req.query.companyCode;
    
    // 1. 获取用户的角色
    // 2. 获取角色的授权值
    // 3. 检查组织维度（company_code）
    // 4. 检查操作维度（activity）
    // 5. 全部满足才放行
  };
}

// 使用方式
router.post('/orders', 
  checkAuth('ORDER_MGMT', 'CREATE'),
  orderController.create
);
```

---

## 九、前端路由与页面（保持不变）

前端页面设计与 V1 方案一致（37 个页面），此处不再重复。新增的 ERP 内核功能主要影响后端架构，前端通过 API 调用即可。

**新增的前端页面**（因 ERP 内核引入）：

| 路由 | 页面 | 说明 |
|------|------|------|
| `/admin/document-flow/:docId` | `DocumentFlow.tsx` | 单据流查看（追溯完整链路） |
| `/admin/change-log/:objectType/:objectId` | `ChangeLog.tsx` | 变更日志查看（字段级） |
| `/admin/credit-check/:clientId` | `CreditCheck.tsx` | 信用管理（内嵌在客户详情） |
| `/admin/posting-periods` | `PostingPeriods.tsx` | 过账期间管理 |
| `/admin/pricing-config` | `PricingConfig.tsx` | 定价引擎配置 |
| `/admin/number-ranges` | `NumberRanges.tsx` | 编号范围管理 |
| `/admin/workflow-config` | `WorkflowConfig.tsx` | 工作流配置 |
| `/admin/chart-of-accounts` | `ChartOfAccounts.tsx` | 科目表维护 |
| `/admin/approvals` | `Approvals.tsx` | 我的待审批（工作流） |

**总页面数：约 46 个**

---

## 十、更新后的开发计划

### 与 V1 方案的主要区别

| 维度 | V1 方案 | V2 方案（SAP 标准） |
|------|--------|-------------------|
| 数据库表数 | 22 张 | 45 张（多 23 张 ERP 内核表） |
| 后端架构 | 业务模块直接操作数据库 | 业务模块 → ERP 内核引擎 → 数据库 |
| 凭证管理 | 无 | 统一凭证引擎，不可变凭证 |
| 财务集成 | 独立的应收/应付表 | 总账+子账簿+会计分录 |
| 定价逻辑 | 硬编码在代码里 | 可配置的条件定价引擎 |
| 权限模型 | 简单角色 RBAC | 授权对象（组织×操作维度） |
| 变更追踪 | 基础 audit_log | 字段级变更凭证 |
| 数据删除 | 部分支持 DELETE | 禁止 DELETE，只能冲销 |
| 开发周期 | 30-36 周 | 38-44 周（多 8 周 ERP 内核） |

### 总体时间线：约 38-44 周

---

### 阶段零：ERP 内核引擎（第 1-6 周）⚡ 新增阶段

**这是整个项目的地基，必须先建好再开发业务模块。**

#### 第 1-2 周：核心基础设施

| 任务 | 详细内容 | 输出物 |
|------|---------|--------|
| 数据库迁移 | 创建全部 45 张表 | `006_eu_tms_erp_schema.sql` |
| 组织架构初始化 | 公司代码、业务区域、科目表、编号范围初始数据 | `007_erp_seed_data.sql` |
| 凭证引擎 | DocumentEngine 类：创建/冲销/暂存/过账 | `core/document-engine.js` |
| 编号范围管理 | NumberRangeManager 类：编号生成、格式化 | `core/number-range.js` |
| 变更追踪 | ChangeTracker 类：字段级变更日志 | `core/change-tracker.js` |
| 单据流引擎 | DocumentFlowEngine 类：创建链路、查询链路 | `core/document-flow.js` |

#### 第 3-4 周：财务内核

| 任务 | 详细内容 | 输出物 |
|------|---------|--------|
| 科目表维护 | 科目 CRUD + 初始科目表数据 | `core/account-determination.js` |
| 自动科目确定 | 业务交易类型 → 自动借贷科目映射 | 科目确定规则 |
| 会计分录生成 | 日记账写入、借贷平衡校验 | `journal_entries` 相关逻辑 |
| 过账期间控制 | 期间开关 + 过账前校验 | `core/posting-period.js` |
| 信用管理 | 信用检查 + 敞口计算 + 人工释放 | `core/credit-manager.js` |

#### 第 5-6 周：高级引擎

| 任务 | 详细内容 | 输出物 |
|------|---------|--------|
| 条件定价引擎 | 定价过程配置 + 存取顺序 + 条件记录查找 | `core/pricing-engine.js` |
| 三方匹配 | 订单/服务确认/承运商发票匹配 + 容差控制 | 匹配逻辑 |
| 审批工作流 | 流程定义 + 步骤 + 实例 + 工作项 | `core/workflow-engine.js` |
| 授权对象 | 授权检查中间件 + 对象配置 | `middleware/auth-object.js` |
| 内核集成测试 | 全部内核引擎的端到端测试 | 测试用例 |

---

### 阶段一：核心订单管理（第 7-14 周）

与 V1 方案类似，但所有业务操作改为通过 ERP 内核引擎执行。

| 周次 | 任务 |
|------|------|
| 7-8 | 三端项目初始化 + 通用组件库 + 认证改造 |
| 9-12 | 订单管理（双业务线）：通过凭证引擎创建，定价引擎计算报价 |
| 13-14 | 客户/运输公司管理 + 运营仪表板 |

---

### 阶段二：CMR/GPS + 船司放单 + 清关（第 15-22 周）

与 V1 方案一致，每个模块的创建操作改为通过凭证引擎。

---

### 阶段三：财务管理 + 询价报价（第 23-32 周）

比 V1 方案多 2 周，因为加入了：
- 总账/子账簿/会计分录
- 自动科目确定
- 三方匹配
- 利润中心/成本中心报表

---

### 阶段四：三端完善 + 系统管理（第 33-38 周）

新增 ERP 管理页面：
- 单据流查看
- 变更日志查看
- 过账期间管理
- 定价引擎配置
- 编号范围管理
- 工作流配置
- 科目表维护
- 待审批工作台

---

### 阶段五：测试、优化与部署（第 39-44 周）

增加 ERP 专项测试：
- 凭证完整性测试（借贷平衡）
- 单据流一致性测试
- 信用管理压力测试
- 期间控制边界测试
- 三方匹配容差测试
- 并发编号生成测试

---

## 十一、ERP 架构对比总结

```
┌─────────────────────────────────────────────────────────────┐
│                    SAP vs 本系统 架构对比                      │
├─────────────────────┬─────────────────────┬─────────────────┤
│     SAP 概念         │    本系统实现         │    状态         │
├─────────────────────┼─────────────────────┼─────────────────┤
│ Belegprinzip        │ documents 表         │ ✅ 完整实现      │
│ Document Flow       │ document_flow 表     │ ✅ 完整实现      │
│ Number Range (SNRO) │ number_ranges 表     │ ✅ 完整实现      │
│ Change Doc (CDHDR)  │ change_documents 表  │ ✅ 完整实现      │
│ GL + Subledger      │ journal_entries 表   │ ✅ 完整实现      │
│ Account Determ.     │ account_determ_rules │ ✅ 完整实现      │
│ Posting Period      │ posting_periods 表   │ ✅ 完整实现      │
│ Credit Management   │ credit_check_logs    │ ✅ 完整实现      │
│ Pricing Procedure   │ pricing_* 表群       │ ✅ 完整实现      │
│ 3-Way Match         │ three_way_match 表   │ ✅ 完整实现      │
│ Workflow            │ workflow_* 表群      │ ✅ 完整实现      │
│ Auth Objects        │ auth_objects 表      │ ✅ 完整实现      │
│ Org Structure       │ company_codes 等     │ ✅ 简化实现      │
│ Tolerance Control   │ tolerance_config 表  │ ✅ 完整实现      │
├─────────────────────┼─────────────────────┼─────────────────┤
│ Material Master     │ 不适用（服务型业务）   │ N/A             │
│ Warehouse Mgmt      │ 不适用（无仓储）      │ N/A             │
│ Production Plan     │ 不适用（无生产）      │ N/A             │
│ i18n (多语言)       │ 预留，后续实现        │ 🔜 预留         │
│ 多租户              │ 预留，单租户起步      │ 🔜 预留         │
└─────────────────────┴─────────────────────┴─────────────────┘
```

---

*文档结束 — 本方案按 SAP S/4HANA ERP 核心设计原则构建*
*V2.0 | 2026-04-10*
