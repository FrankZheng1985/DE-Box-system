const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, TableOfContents
} = require('docx');

// 通用样式
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const headerShading = { fill: "1F4E79", type: ShadingType.CLEAR };
const altShading = { fill: "F5F7FA", type: ShadingType.CLEAR };

// 辅助函数
function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: headerShading, margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.shaded ? altShading : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20, ...opts.run })] })]
  });
}

function heading1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 32, color: "1F4E79" })] });
}

function heading2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 26, color: "2E75B6" })] });
}

function heading3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 22, color: "4472C4" })] });
}

function para(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 20, ...opts })] });
}

function boldPara(text) {
  return para(text, { bold: true });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a,b) => a+b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, colWidths[i])) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((c, i) => cell(c, colWidths[i], { shaded: ri % 2 === 1 }))
      }))
    ]
  });
}

// ===== 构建文档内容 =====
const children = [];

// 封面
children.push(new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "欧洲运输管理系统", font: "Arial", size: 48, bold: true, color: "1F4E79" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "EU Transport Management System (EU-TMS)", font: "Arial", size: 28, color: "4472C4" })] }));
children.push(new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "产品需求文档 (PRD)", font: "Arial", size: 32, bold: true, color: "2E75B6" })] }));
children.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "版本：V1.1", font: "Arial", size: 24, color: "666666" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "日期：2026年4月1日", font: "Arial", size: 24, color: "666666" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "状态：修订稿", font: "Arial", size: 24, color: "666666" })] }));

children.push(new Paragraph({ children: [new PageBreak()] }));

// 目录
children.push(heading1("目录"));
children.push(new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-3" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 1. 项目概述 =====
children.push(heading1("1. 项目概述"));

children.push(heading2("1.1 背景与目标"));
children.push(para("本系统旨在为欧洲运输中介/货代公司提供一套完整的运输订单管理平台。公司的核心业务模式是承接客户的欧洲运输订单，然后将运输任务指派给欧洲本土的运输公司执行。系统需要解决订单管理、运输跟踪、单据收集、客户通知和财务管理等全流程问题。"));

children.push(heading2("1.2 项目范围"));
children.push(para("本 PRD 覆盖以下核心模块："));
children.push(makeTable(
  ["模块", "描述"],
  [
    ["订单管理与派单", "客户下单、订单分配给运输公司、订单状态全生命周期跟踪。支持篷布车运输和集装箱物流两种业务类型"],
    ["询价与报价管理", "客户侧询价管理、运营侧报价管理（报价记录、版本管理、历史对比）"],
    ["CMR/GPS 追踪", "CMR 单据电子化管理、船司放单管理、GPS 实时位置追踪、运输状态自动通知"],
    ["财务管理", "应收应付管理、发票模板管理、自动开票、账单生成、对账、财务报表"],
    ["客户/供应商管理", "客户档案、运输公司档案、合同与价格管理"],
  ],
  [3000, 6360]
));

children.push(heading2("1.3 用户角色定义"));
children.push(para("系统包含三类核心用户角色，各自拥有独立的登录入口和功能权限："));
children.push(makeTable(
  ["角色", "描述", "主要功能"],
  [
    ["客户 (Client)", "货物发送方，通过系统下达运输订单", "下单、询价、查询运输状态、查看CMR、查看账单、清关操作"],
    ["运营人员 (Operator)", "公司内部运营团队，管理全部业务流程", "派单、报价管理、跟踪、审核、财务、报表"],
    ["运输公司 (Carrier)", "欧洲本土运输执行方", "接单、更新运输状态、上传CMR、提交GPS"],
  ],
  [2000, 3500, 3860]
));

children.push(heading2("1.4 术语定义"));
children.push(makeTable(
  ["术语", "全称", "说明"],
  [
    ["CMR", "Convention Relative au Contrat de Transport International de Marchandises par Route", "国际公路货物运输合同公约运单"],
    ["GPS", "Global Positioning System", "全球定位系统，用于运输车辆实时位置追踪"],
    ["TMS", "Transport Management System", "运输管理系统"],
    ["POD", "Proof of Delivery", "签收证明"],
    ["ETA", "Estimated Time of Arrival", "预计到达时间"],
    ["FTL", "Full Truck Load", "整车运输"],
    ["LTL", "Less Than Truck Load", "拼车运输"],
    ["CNEE", "Consignee", "收货人"],
    ["B/L", "Bill of Lading", "提单（船司签发的货物收据和运输合同）"],
  ],
  [1500, 4000, 3860]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 2. 订单管理与派单模块 =====
children.push(heading1("2. 订单管理与派单模块"));

children.push(heading2("2.1 功能概述"));
children.push(para("订单管理模块是系统的核心，负责订单的创建、分配、状态跟踪和全生命周期管理。客户通过系统提交运输需求，运营人员审核后将订单指派给合适的运输公司执行。"));
children.push(boldPara("【V1.1 新增】订单管理界面拆分为两个业务分类："));
children.push(para("1）篷布车运输：适用于欧洲公路整车/拼车运输，当前逻辑保持不变。"));
children.push(para("2）集装箱物流：适用于海运集装箱到港后的陆运配送，重点字段包括 ETA（预计到港时间）、船司（Shipping Line）、CNEE（收货人）、船司放行状态。"));

children.push(heading2("2.2 订单状态流转"));
children.push(para("【V1.1 更新】状态栏需支持筛选、排序及时间范围查询功能（创建时间/运输时间/完成时间）。"));

children.push(heading3("2.2.1 篷布车运输状态"));
children.push(para("篷布车运输订单在其生命周期内将经历以下状态转换："));
children.push(makeTable(
  ["状态", "英文标识", "说明", "触发角色"],
  [
    ["待审核", "PENDING_REVIEW", "客户提交订单，等待运营审核", "客户"],
    ["已确认", "CONFIRMED", "运营审核通过，订单生效", "运营"],
    ["待派单", "PENDING_ASSIGN", "订单确认后等待分配运输公司", "运营"],
    ["已派单", "ASSIGNED", "已指派运输公司，等待接单", "运营"],
    ["运输中", "IN_TRANSIT", "运输公司已提货，运输进行中", "运输公司"],
    ["已到达", "DELIVERED", "货物已送达目的地", "运输公司"],
    ["已完成", "COMPLETED", "单据齐全，财务结算完毕", "运营"],
    ["已取消", "CANCELLED", "订单被取消", "客户/运营"],
    ["异常", "EXCEPTION", "运输过程中出现异常情况", "运输公司/运营"],
  ],
  [1500, 2200, 3460, 2200]
));

children.push(heading3("2.2.2 集装箱物流派送状态（V1.1 新增）"));
children.push(para("集装箱物流的派送状态采用以下重构后的流程："));
children.push(makeTable(
  ["状态", "英文标识", "说明", "操作要求"],
  [
    ["等待安排", "WAITING_ARRANGE", "订单创建后等待安排派送", "需填写预计送仓时间，系统自动发送邮件通知客户"],
    ["车队已确认", "FLEET_CONFIRMED", "运输车队已确认接受运输任务", "运输公司在系统中确认接单"],
    ["运输中", "IN_TRANSIT", "货物已装车，运输进行中", "运输公司更新状态"],
    ["运输完成", "TRANSPORT_DONE", "货物已送达目的地", "运输公司确认送达"],
    ["异常", "EXCEPTION", "运输过程中出现异常", "异常需单独标记，线下沟通处理"],
  ],
  [1800, 2200, 2800, 2560]
));

children.push(heading2("2.3 订单创建数据字段"));
children.push(heading3("2.3.1 通用字段（篷布车 + 集装箱共用）"));
children.push(makeTable(
  ["字段", "类型", "必填", "说明"],
  [
    ["订单编号", "自动生成", "是", "系统自动生成，格式：EU-YYYYMMDD-XXXX"],
    ["客户名称", "下拉选择", "是", "从已注册客户列表中选择"],
    ["业务类型", "下拉选择", "是", "篷布车运输 / 集装箱物流"],
    ["货物描述", "文本", "是", "货物名称、类型、包装方式"],
    ["货物重量 (kg)", "数字", "是", "货物总重量"],
    ["货物体积 (m\u00B3)", "数字", "否", "货物总体积"],
    ["货物数量", "数字", "是", "件数/托盘数"],
    ["装货地址", "地址", "是", "含国家、城市、邮编、详细地址"],
    ["卸货地址", "地址", "是", "含国家、城市、邮编、详细地址"],
    ["装货日期", "日期", "是", "期望装货日期"],
    ["到达日期", "日期", "是", "期望送达日期"],
    ["运输类型", "下拉选择", "是", "FTL（整车）/ LTL（拼车）"],
    ["特殊要求", "文本", "否", "温控、危险品、ADR等特殊要求"],
    ["备注", "文本", "否", "其他需要说明的信息"],
  ],
  [2000, 1800, 1000, 4560]
));

children.push(heading3("2.3.2 集装箱物流专属字段（V1.1 新增）"));
children.push(makeTable(
  ["字段", "类型", "必填", "说明"],
  [
    ["ETA（预计到港时间）", "日期时间", "是", "船舶预计到达港口的时间"],
    ["船司 (Shipping Line)", "下拉选择", "是", "承运船公司名称，如 MSC、Maersk、CMA CGM 等"],
    ["CNEE（收货人）", "文本", "是", "收货人名称及联系方式"],
    ["柜号 (Container No.)", "文本", "是", "集装箱编号"],
    ["提单号 (B/L No.)", "文本", "是", "提单编号"],
    ["是否需要放单", "自动判断", "是", "系统根据船司和业务类型自动判断是否需要船司放单"],
  ],
  [2800, 1800, 1000, 3760]
));

children.push(heading2("2.4 派单功能"));
children.push(para("运营人员在订单确认后，可以根据以下条件筛选并指派运输公司："));
children.push(makeTable(
  ["筛选条件", "说明"],
  [
    ["运输路线覆盖", "运输公司是否覆盖装货地-卸货地路线"],
    ["车辆类型", "是否有匹配的车型（平板、冷藏、危化品等）"],
    ["运力可用性", "指定时间段内是否有可用运力"],
    ["历史评价", "运输公司的历史服务评分"],
    ["价格匹配", "根据合同价格或报价进行匹配"],
  ],
  [3000, 6360]
));
children.push(para("派单后，系统将自动通知运输公司（通过邮件和系统消息），运输公司需在规定时间内确认接单或拒绝。"));
children.push(boldPara("【V1.1 新增】服务商报价对比功能："));
children.push(para("派单时系统自动展示多个运输公司的报价对比面板，包含各运输公司的报价金额、历史评分、预计时效等信息，帮助运营人员做出最优选择。支持按价格、评分、时效等维度排序。"));

children.push(heading2("2.5 询价与报价管理（V1.1 新增）"));
children.push(heading3("2.5.1 客户侧询价管理"));
children.push(para("客户可通过系统提交运输询价请求，系统支持以下功能："));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["在线询价", "客户填写运输需求（路线、货物、时间等），提交询价请求"],
    ["询价历史", "查看历史询价记录及报价结果"],
    ["报价接受", "客户查看运营回复的报价，可接受或拒绝"],
    ["一键下单", "接受报价后可直接转为正式订单"],
  ],
  [2500, 6860]
));

children.push(heading3("2.5.2 运营侧报价管理"));
children.push(para("运营人员管理所有报价流程，系统支持以下功能："));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["报价创建", "针对客户询价或主动为客户创建报价单"],
    ["报价记录", "完整记录所有报价信息，支持搜索和筛选"],
    ["版本管理", "同一询价的多次报价自动生成版本号，支持版本对比"],
    ["历史对比", "对比同一客户/路线的历史报价，分析价格趋势"],
    ["报价模板", "常用路线可保存为报价模板，快速生成报价"],
    ["报价审批", "大额或特殊报价需经审批后方可发送给客户"],
  ],
  [2500, 6860]
));

children.push(heading2("2.6 用户故事"));
children.push(makeTable(
  ["编号", "角色", "用户故事", "验收标准"],
  [
    ["US-001", "客户", "作为客户，我要能通过系统快速创建运输订单，填写装卸货地址和货物信息", "订单提交后获得唯一编号，状态为待审核"],
    ["US-002", "客户", "作为客户，我要能实时查看我的订单运输状态和当前位置", "订单列表显示实时状态，可查看地图位置"],
    ["US-003", "运营", "作为运营，我要能审核客户订单并快速派单给合适的运输公司", "可筛选运输公司，一键派单，自动发送通知"],
    ["US-004", "运营", "作为运营，我要能在仪表板查看所有订单的实时状态概览", "仪表板展示各状态订单数量统计"],
    ["US-005", "运输公司", "作为运输公司，我要能接收和确认派给我的运输任务", "收到通知后可一键接单或拒绝，并填写原因"],
    ["US-006", "运输公司", "作为运输公司，我要能更新运输状态（提货、在途、到达）", "运输公司可更新状态，客户和运营实时看到变更"],
    ["US-018", "客户", "作为客户，我要能提交运输询价并查看报价结果", "填写路线和货物信息后提交，收到报价通知"],
    ["US-019", "运营", "作为运营，我要能管理报价版本并对比历史报价", "支持多版本管理，可查看价格趋势"],
    ["US-020", "运营", "作为运营，派单时我要能对比多家运输公司的报价", "展示报价对比面板，支持多维度排序"],
  ],
  [1200, 1200, 3560, 3400]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 3. CMR/GPS 追踪模块 =====
children.push(heading1("3. CMR/GPS 追踪模块"));

children.push(heading2("3.1 CMR 单据管理"));
children.push(para("CMR（国际公路货物运输合同公约运单）是欧洲公路运输的法定必备单据。系统需支持 CMR 单据的全电子化管理："));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["CMR 上传", "运输公司可拍照或扫描上传 CMR 单据（支持 PDF、图片格式）"],
    ["CMR 关联", "每份 CMR 自动关联到对应的运输订单"],
    ["CMR 状态", "记录 CMR 的签署状态：未签署 / 发货方已签 / 收货方已签 / 完成"],
    ["CMR 查看", "客户和运营可在线查看和下载 CMR 副本"],
    ["CMR 异常标记", "如CMR上有货损注备，系统可标记异常并通知运营"],
    ["e-CMR 集成", "预留与 e-CMR 平台（如 TransFollow、Pionira）的 API 对接接口"],
  ],
  [2500, 6860]
));

children.push(heading3("3.1.1 船司放单管理（V1.1 新增）"));
children.push(para("针对集装箱物流业务，新增船司放单状态管理功能。系统根据业务类型自动判断是否需要船司放单，并跟踪放单全流程："));
children.push(makeTable(
  ["状态", "英文标识", "说明", "操作要求"],
  [
    ["无需放单", "NOT_REQUIRED", "系统判断该订单不需要船司放单", "显示\"否\"，无需操作"],
    ["正本待邮寄", "ORIGINAL_PENDING", "需要寄送正本提单给船司", "运营标记状态"],
    ["正本已邮寄", "ORIGINAL_SENT", "正本提单已寄出", "需填写快递服务商名称及寄送地址"],
    ["待放行", "PENDING_RELEASE", "正本已到，等待船司审核放行", "需客户在系统中授权确认"],
    ["船司放行", "RELEASED", "船司已完成放行", "需填写放行有效期"],
  ],
  [1800, 2200, 2800, 2560]
));

children.push(heading2("3.2 GPS 实时追踪"));
children.push(para("系统通过 GPS 数据接口实现运输车辆的实时位置追踪："));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["实时位置展示", "在地图上展示运输车辆当前位置（基于 Google Maps / OpenStreetMap）"],
    ["GPS 数据接入", "支持多种方式：运输公司 API 对接、第三方 GPS 平台集成、手动填写位置"],
    ["ETA 自动计算", "根据当前位置和目的地自动计算预计到达时间"],
    ["路线回放", "可查看完整运输路线轨迹回放"],
    ["地理围栏 (Geofence)", "设置装卸货地的地理围栏，车辆进入/离开时自动触发通知"],
    ["异常检测", "长时间停留、偏离路线等异常情况自动预警"],
  ],
  [2500, 6860]
));

children.push(heading2("3.3 客户通知机制"));
children.push(para("系统将运输过程中的关键信息及时传达给客户："));
children.push(makeTable(
  ["通知事件", "通知方式", "通知内容"],
  [
    ["订单确认", "邮件 + 系统通知", "订单已确认，附订单详情"],
    ["运输公司已接单", "邮件 + 系统通知", "承运方信息、预计提货时间"],
    ["已提货", "邮件 + 系统通知", "提货确认、车辆信息、预计到达时间"],
    ["运输状态更新", "系统通知", "实时位置、ETA 更新"],
    ["到达通知", "邮件 + 系统通知", "已到达确认、POD 信息"],
    ["CMR 已上传", "系统通知", "CMR 单据可查看下载"],
    ["异常预警", "邮件 + 系统通知 + 短信", "异常描述、影响评估、处理方案"],
    ["清关放行（V1.1新增）", "邮件 + 系统通知", "客户操作清关完成后，系统自动更新为已放行状态"],
    ["船司放单状态变更（V1.1新增）", "邮件 + 系统通知", "船司放单各环节状态变更通知"],
  ],
  [3000, 2500, 3860]
));

children.push(heading3("3.3.1 清关放行管理（V1.1 新增）"));
children.push(para("针对需要清关的集装箱订单，新增清关放行状态管理："));
children.push(para("1. 客户在系统中操作清关完成后，系统自动将订单清关状态更新为\"已放行\"。"));
children.push(para("2. 清关放行状态变更后，系统自动通知运营人员，运营人员可安排后续派送。"));
children.push(para("3. 清关异常时，客户可在系统中标记异常并填写原因，系统通知运营跟进。"));

children.push(heading2("3.4 用户故事"));
children.push(makeTable(
  ["编号", "角色", "用户故事", "验收标准"],
  [
    ["US-007", "运输公司", "作为运输公司，我要能方便地拍照上传 CMR 单据", "支持手机拍照上传，自动关联订单"],
    ["US-008", "客户", "作为客户，我要能在地图上实时查看我的货物位置", "地图显示实时位置，ETA 自动更新"],
    ["US-009", "运营", "作为运营，我要能收到运输异常的即时预警", "异常发生后 5 分钟内收到通知"],
    ["US-010", "客户", "作为客户，我要能下载已签署的 CMR 副本", "CMR 可在线预览和下载为 PDF"],
    ["US-021", "运营", "作为运营，我要能跟踪船司放单的全流程状态", "船司放单各状态可视化展示"],
    ["US-022", "客户", "作为客户，我要能在系统中操作清关放行", "清关完成后状态自动更新为已放行"],
  ],
  [1200, 1200, 3560, 3400]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 4. 财务管理模块 =====
children.push(heading1("4. 财务管理模块"));

children.push(heading2("4.1 功能概述"));
children.push(para("财务模块负责管理全部的应收应付数据，自动生成账单，并提供多维度的财务报表。"));
children.push(boldPara("【V1.1 新增】财务模块增强功能："));
children.push(para("1. 发票模板管理：支持创建和管理多种发票模板，适配不同客户和业务场景。"));
children.push(para("2. 自动开票规则：支持配置\"固定客户 + 固定路线 + 固定价格\"的自动开票规则，选择路线后系统自动生成发票。"));
children.push(para("3. 自动发送：发票生成后自动发送至客户的发票接收邮箱。"));

children.push(heading2("4.2 应收账款（客户端）"));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["账单生成", "根据订单和客户合同价格自动生成应收账单"],
    ["账单审核", "运营人员审核账单后发送给客户"],
    ["付款跟踪", "记录客户付款状态：未付款 / 部分付款 / 已付款"],
    ["账期管理", "设置付款期限，超期自动提醒"],
    ["币种支持", "支持欧元 (EUR)、英镑 (GBP)、波兰兹罗提 (PLN) 等多币种"],
  ],
  [2500, 6860]
));

children.push(heading2("4.3 应付账款（运输公司端）"));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["运输公司账单登记", "录入运输公司提交的费用账单"],
    ["账单核对", "将运输公司账单与合同价格、订单信息进行核对"],
    ["付款记录", "记录已付款金额、付款日期、付款方式"],
    ["差异处理", "当实际费用与合同价格不符时，标记差异并触发审批"],
  ],
  [2500, 6860]
));

children.push(heading2("4.4 发票模板管理（V1.1 新增）"));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["模板创建", "创建自定义发票模板，设置表头、字段、公司信息、税率等"],
    ["模板分类", "按客户类型或业务类型分类管理模板"],
    ["自动开票规则", "配置\"固定客户 + 固定路线 + 固定价格\"的自动开票规则"],
    ["自动发送", "发票生成后自动发送至客户的发票接收邮箱"],
    ["发票预览", "发票生成前可预览效果"],
    ["批量开票", "支持批量选择订单生成发票"],
  ],
  [2500, 6860]
));

children.push(heading2("4.5 利润核算"));
children.push(makeTable(
  ["指标", "计算方式", "说明"],
  [
    ["订单毛利", "客户应收 - 运输公司应付", "单笔订单的毛利润"],
    ["毛利率", "毛利 / 客户应收 \u00D7 100%", "单笔订单的利润率"],
    ["客户毛利汇总", "按客户汇总所有订单毛利", "客户维度的盈利分析"],
    ["运输公司成本汇总", "按运输公司汇总所有应付", "供应商维度的成本分析"],
  ],
  [2500, 3500, 3360]
));

children.push(heading2("4.6 财务报表"));
children.push(makeTable(
  ["报表名称", "维度", "周期", "主要内容"],
  [
    ["运营收入报表", "客户/时间", "月/季/年", "应收总额、已收、未收、账龄分布"],
    ["运输成本报表", "运输公司/时间", "月/季/年", "应付总额、已付、未付、按公司分布"],
    ["利润分析报表", "客户/路线/时间", "月/季/年", "毛利、毛利率、趋势分析"],
    ["账龄分析报表", "客户/运输公司", "实时", "0-30天、30-60天、60-90天、90+天的未结款项"],
    ["订单统计报表", "状态/客户/路线", "月/季/年", "订单量、完成率、平均时效、异常率"],
  ],
  [2200, 2200, 1500, 3460]
));

children.push(heading2("4.7 用户故事"));
children.push(makeTable(
  ["编号", "角色", "用户故事", "验收标准"],
  [
    ["US-011", "运营", "作为运营，我要能根据订单自动生成客户账单", "选择订单后一键生成账单，金额自动计算"],
    ["US-012", "运营", "作为运营，我要能查看客户和运输公司的应收应付总览", "仪表板显示应收应付总额、账龄分布"],
    ["US-013", "运营", "作为运营，我要能导出财务报表为 Excel 格式", "支持导出为 .xlsx，含筛选条件和时间范围"],
    ["US-014", "客户", "作为客户，我要能查看和下载我的账单", "客户端显示账单列表，可下载 PDF"],
    ["US-023", "运营", "作为运营，我要能管理发票模板并配置自动开票规则", "支持模板创建、规则配置和自动发送"],
  ],
  [1200, 1200, 3560, 3400]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 5. 客户/供应商管理模块 =====
children.push(heading1("5. 客户/供应商管理模块"));

children.push(heading2("5.1 客户管理"));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["客户档案", "包括公司名称、税号 (VAT)、联系人、地址、常用装卸货点"],
    ["合同管理", "上传和管理与客户的运输合同文件"],
    ["价格体系", "配置客户的报价表：按路线、按车型、按重量段等定价规则"],
    ["客户账号", "客户自助注册或运营手动创建，支持多联系人"],
    ["客户评级", "根据订单量、付款信用等分类客户等级"],
    ["发票邮箱（V1.1新增）", "客户的发票接收邮箱，用于自动发送发票"],
  ],
  [2500, 6860]
));

children.push(heading2("5.2 运输公司管理"));
children.push(makeTable(
  ["功能", "说明"],
  [
    ["公司档案", "包括公司名称、税号、运输许可证、保险信息、联系方式"],
    ["车队信息", "车辆列表、车型、载重、特殊资质（冷藏、ADR等）"],
    ["路线覆盖", "配置运输公司可服务的国家和路线"],
    ["价格协议", "与运输公司的合同价格、报价历史"],
    ["绩效评价", "准时率、货损率、客户投诉率、综合评分"],
    ["资质到期提醒", "运输许可证、保险等资质到期前自动提醒"],
  ],
  [2500, 6860]
));

children.push(heading2("5.3 用户故事"));
children.push(makeTable(
  ["编号", "角色", "用户故事", "验收标准"],
  [
    ["US-015", "运营", "作为运营，我要能快速添加新的客户和运输公司", "填写基本信息即可创建，必填项有明确提示"],
    ["US-016", "运营", "作为运营，我要能为客户配置不同路线的报价", "支持按路线、车型、重量段设置价格"],
    ["US-017", "运营", "作为运营，我要能查看运输公司的综合绩效评分", "显示准时率、货损率、投诉率综合评分"],
  ],
  [1200, 1200, 3560, 3400]
));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 6-11 其余章节（保持原有，加新增数据模型字段） =====
children.push(heading1("6. 数据模型设计"));
children.push(heading2("6.1 核心实体关系"));
children.push(para("以下是系统核心实体及其主要字段定义。V1.1 版本新增了集装箱物流相关字段和船司放单相关实体。"));

children.push(heading3("6.1.1 客户 (Client)"));
children.push(makeTable(
  ["字段", "类型", "说明"],
  [
    ["id", "UUID", "主键"],
    ["company_name", "VARCHAR(200)", "公司名称"],
    ["vat_number", "VARCHAR(50)", "税号"],
    ["country", "VARCHAR(10)", "国家代码 (ISO 3166)"],
    ["address", "TEXT", "详细地址"],
    ["contact_name", "VARCHAR(100)", "主联系人姓名"],
    ["contact_email", "VARCHAR(100)", "联系邮箱"],
    ["contact_phone", "VARCHAR(30)", "联系电话"],
    ["invoice_email", "VARCHAR(100)", "发票接收邮箱（V1.1新增）"],
    ["credit_level", "ENUM", "信用等级: A/B/C/D"],
    ["payment_terms", "INT", "账期天数 (如 30/60/90)"],
    ["status", "ENUM", "状态: ACTIVE / INACTIVE"],
    ["created_at", "TIMESTAMP", "创建时间"],
  ],
  [2500, 2500, 4360]
));

children.push(heading3("6.1.2 运输公司 (Carrier)"));
children.push(makeTable(
  ["字段", "类型", "说明"],
  [
    ["id", "UUID", "主键"],
    ["company_name", "VARCHAR(200)", "公司名称"],
    ["vat_number", "VARCHAR(50)", "税号"],
    ["transport_license", "VARCHAR(100)", "运输许可证号"],
    ["license_expiry", "DATE", "许可证到期日"],
    ["insurance_number", "VARCHAR(100)", "保险编号"],
    ["insurance_expiry", "DATE", "保险到期日"],
    ["service_countries", "JSON", "服务覆盖国家列表"],
    ["vehicle_types", "JSON", "可用车型列表"],
    ["performance_score", "DECIMAL(3,1)", "综合评分 (0-10)"],
    ["status", "ENUM", "状态: ACTIVE / INACTIVE / SUSPENDED"],
  ],
  [2500, 2500, 4360]
));

children.push(heading3("6.1.3 订单 (Order) - V1.1 更新"));
children.push(makeTable(
  ["字段", "类型", "说明"],
  [
    ["id", "UUID", "主键"],
    ["order_number", "VARCHAR(20)", "订单编号 (EU-YYYYMMDD-XXXX)"],
    ["client_id", "UUID (FK)", "关联客户"],
    ["carrier_id", "UUID (FK)", "关联运输公司（派单后）"],
    ["business_type", "ENUM", "业务类型: CURTAIN_SIDE / CONTAINER（V1.1新增）"],
    ["status", "ENUM", "订单状态"],
    ["delivery_status", "ENUM", "派送状态（V1.1新增，集装箱物流专用）"],
    ["transport_type", "ENUM", "FTL / LTL"],
    ["cargo_description", "TEXT", "货物描述"],
    ["cargo_weight_kg", "DECIMAL(10,2)", "货物重量"],
    ["cargo_volume_m3", "DECIMAL(10,2)", "货物体积"],
    ["cargo_quantity", "INT", "货物数量"],
    ["pickup_address", "JSON", "装货地址"],
    ["delivery_address", "JSON", "卸货地址"],
    ["pickup_date", "DATE", "装货日期"],
    ["delivery_date", "DATE", "送达日期"],
    ["eta", "TIMESTAMP", "预计到港时间（V1.1新增，集装箱专用）"],
    ["shipping_line", "VARCHAR(100)", "船司名称（V1.1新增）"],
    ["cnee", "VARCHAR(200)", "收货人（V1.1新增）"],
    ["container_no", "VARCHAR(50)", "柜号（V1.1新增）"],
    ["bl_number", "VARCHAR(50)", "提单号（V1.1新增）"],
    ["needs_release", "BOOLEAN", "是否需要放单（V1.1新增）"],
    ["release_status", "ENUM", "放单状态（V1.1新增）"],
    ["clearance_status", "ENUM", "清关状态（V1.1新增）"],
    ["special_requirements", "TEXT", "特殊要求"],
    ["client_price", "DECIMAL(10,2)", "客户报价"],
    ["carrier_cost", "DECIMAL(10,2)", "运输公司成本"],
    ["currency", "VARCHAR(3)", "币种"],
    ["created_at", "TIMESTAMP", "创建时间"],
    ["updated_at", "TIMESTAMP", "更新时间"],
  ],
  [2500, 2500, 4360]
));

children.push(heading3("6.1.4 报价记录 (Quotation) - V1.1 新增"));
children.push(makeTable(
  ["字段", "类型", "说明"],
  [
    ["id", "UUID", "主键"],
    ["inquiry_id", "UUID (FK)", "关联询价记录"],
    ["client_id", "UUID (FK)", "关联客户"],
    ["version", "INT", "报价版本号"],
    ["route_from", "VARCHAR(200)", "起始地"],
    ["route_to", "VARCHAR(200)", "目的地"],
    ["price", "DECIMAL(10,2)", "报价金额"],
    ["currency", "VARCHAR(3)", "币种"],
    ["valid_until", "DATE", "报价有效期"],
    ["status", "ENUM", "DRAFT / SENT / ACCEPTED / REJECTED / EXPIRED"],
    ["created_by", "UUID (FK)", "创建人"],
    ["created_at", "TIMESTAMP", "创建时间"],
  ],
  [2500, 2500, 4360]
));

children.push(heading3("6.1.5 船司放单记录 (Shipping Release) - V1.1 新增"));
children.push(makeTable(
  ["字段", "类型", "说明"],
  [
    ["id", "UUID", "主键"],
    ["order_id", "UUID (FK)", "关联订单"],
    ["release_status", "ENUM", "NOT_REQUIRED / ORIGINAL_PENDING / ORIGINAL_SENT / PENDING_RELEASE / RELEASED"],
    ["courier_service", "VARCHAR(100)", "快递服务商（正本已邮寄时填写）"],
    ["courier_address", "TEXT", "寄送地址（正本已邮寄时填写）"],
    ["release_valid_until", "DATE", "放行有效期（船司放行时填写）"],
    ["authorized_by", "UUID (FK)", "客户授权人"],
    ["authorized_at", "TIMESTAMP", "授权时间"],
    ["updated_at", "TIMESTAMP", "更新时间"],
  ],
  [2500, 2500, 4360]
));

// 保留其余数据模型（CMR、GPS、财务记录）
children.push(heading3("6.1.6 CMR 单据 (CMR Document)"));
children.push(makeTable(["字段", "类型", "说明"],
  [["id","UUID","主键"],["order_id","UUID (FK)","关联订单"],["cmr_number","VARCHAR(50)","CMR 编号"],
   ["file_url","VARCHAR(500)","文件存储地址"],["file_type","ENUM","PDF / IMAGE"],
   ["sign_status","ENUM","UNSIGNED / SENDER_SIGNED / RECEIVER_SIGNED / COMPLETED"],
   ["has_damage_note","BOOLEAN","是否有货损备注"],["damage_note","TEXT","货损备注内容"],
   ["uploaded_by","UUID (FK)","上传人"],["uploaded_at","TIMESTAMP","上传时间"]],
  [2500,2500,4360]));

children.push(heading3("6.1.7 GPS 追踪记录 (GPS Tracking)"));
children.push(makeTable(["字段","类型","说明"],
  [["id","UUID","主键"],["order_id","UUID (FK)","关联订单"],["latitude","DECIMAL(10,7)","纬度"],
   ["longitude","DECIMAL(10,7)","经度"],["speed_kmh","DECIMAL(5,1)","速度 (km/h)"],
   ["recorded_at","TIMESTAMP","记录时间"],["source","ENUM","API / MANUAL / PLATFORM"]],
  [2500,2500,4360]));

children.push(heading3("6.1.8 财务记录 (Financial Record)"));
children.push(makeTable(["字段","类型","说明"],
  [["id","UUID","主键"],["order_id","UUID (FK)","关联订单"],
   ["type","ENUM","RECEIVABLE (应收) / PAYABLE (应付)"],
   ["counterparty_type","ENUM","CLIENT / CARRIER"],["counterparty_id","UUID (FK)","对方 ID"],
   ["invoice_number","VARCHAR(50)","账单编号"],["amount","DECIMAL(10,2)","金额"],
   ["currency","VARCHAR(3)","币种"],["payment_status","ENUM","UNPAID / PARTIAL / PAID"],
   ["due_date","DATE","到期日"],["paid_date","DATE","实际付款日"],
   ["paid_amount","DECIMAL(10,2)","已付金额"],
   ["invoice_template_id","UUID (FK)","发票模板ID（V1.1新增）"],
   ["auto_generated","BOOLEAN","是否自动生成（V1.1新增）"]],
  [2500,2500,4360]));

children.push(heading3("6.1.9 发票模板 (Invoice Template) - V1.1 新增"));
children.push(makeTable(["字段","类型","说明"],
  [["id","UUID","主键"],["template_name","VARCHAR(100)","模板名称"],
   ["client_id","UUID (FK)","适用客户（可为空表示通用）"],
   ["route_pattern","JSON","适用路线规则"],["default_price","DECIMAL(10,2)","默认价格"],
   ["currency","VARCHAR(3)","币种"],["tax_rate","DECIMAL(5,2)","税率"],
   ["header_info","JSON","发票表头信息"],["footer_info","TEXT","发票页脚信息"],
   ["is_active","BOOLEAN","是否启用"],["created_at","TIMESTAMP","创建时间"]],
  [2500,2500,4360]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 7. 接口设计 =====
children.push(heading1("7. 接口设计概要"));
children.push(heading2("7.1 API 设计原则"));
children.push(para("系统采用 RESTful API 设计，基于 HTTPS 协议，使用 JSON 格式传输数据。所有 API 需要通过 JWT Token 进行身份验证，并根据用户角色进行权限控制。"));

children.push(heading2("7.2 核心 API 端点"));
children.push(heading3("7.2.1 订单 API"));
children.push(makeTable(["方法","端点","说明","权限"],
  [["POST","/api/v1/orders","创建新订单","客户/运营"],
   ["GET","/api/v1/orders","查询订单列表（支持筛选和分页）","全部角色"],
   ["GET","/api/v1/orders/:id","获取订单详情","全部角色"],
   ["PUT","/api/v1/orders/:id","更新订单信息","运营"],
   ["POST","/api/v1/orders/:id/assign","派单给运输公司","运营"],
   ["POST","/api/v1/orders/:id/accept","运输公司接单","运输公司"],
   ["POST","/api/v1/orders/:id/reject","运输公司拒单","运输公司"],
   ["PUT","/api/v1/orders/:id/status","更新运输状态","运输公司/运营"],
   ["POST","/api/v1/orders/:id/cancel","取消订单","客户/运营"]],
  [1000,3200,3360,1800]));

children.push(heading3("7.2.2 询价/报价 API（V1.1 新增）"));
children.push(makeTable(["方法","端点","说明","权限"],
  [["POST","/api/v1/inquiries","提交询价","客户"],
   ["GET","/api/v1/inquiries","查询询价列表","客户/运营"],
   ["POST","/api/v1/quotations","创建报价","运营"],
   ["GET","/api/v1/quotations","查询报价列表","客户/运营"],
   ["PUT","/api/v1/quotations/:id","更新报价","运营"],
   ["POST","/api/v1/quotations/:id/accept","接受报价","客户"],
   ["GET","/api/v1/quotations/:id/versions","查看报价版本历史","运营"]],
  [1000,3200,3360,1800]));

children.push(heading3("7.2.3 船司放单 API（V1.1 新增）"));
children.push(makeTable(["方法","端点","说明","权限"],
  [["GET","/api/v1/orders/:id/release","获取放单状态","全部角色"],
   ["PUT","/api/v1/orders/:id/release","更新放单状态","运营"],
   ["POST","/api/v1/orders/:id/release/authorize","客户授权放单","客户"],
   ["PUT","/api/v1/orders/:id/clearance","更新清关状态","客户/运营"]],
  [1000,3200,3360,1800]));

children.push(heading3("7.2.4 CMR/GPS API"));
children.push(makeTable(["方法","端点","说明","权限"],
  [["POST","/api/v1/orders/:id/cmr","上传 CMR 单据","运输公司"],
   ["GET","/api/v1/orders/:id/cmr","获取订单的 CMR 信息","全部角色"],
   ["POST","/api/v1/orders/:id/gps","上报 GPS 位置数据","运输公司"],
   ["GET","/api/v1/orders/:id/gps/latest","获取最新 GPS 位置","客户/运营"],
   ["GET","/api/v1/orders/:id/gps/history","获取 GPS 历史轨迹","运营"]],
  [1000,3200,3360,1800]));

children.push(heading3("7.2.5 财务 API"));
children.push(makeTable(["方法","端点","说明","权限"],
  [["POST","/api/v1/invoices","创建账单","运营"],
   ["GET","/api/v1/invoices","查询账单列表","全部角色"],
   ["PUT","/api/v1/invoices/:id/payment","记录付款","运营"],
   ["GET","/api/v1/reports/revenue","收入报表","运营"],
   ["GET","/api/v1/reports/profit","利润报表","运营"],
   ["GET","/api/v1/reports/aging","账龄分析报表","运营"],
   ["POST","/api/v1/invoice-templates","创建发票模板（V1.1新增）","运营"],
   ["GET","/api/v1/invoice-templates","获取发票模板列表（V1.1新增）","运营"],
   ["POST","/api/v1/invoices/auto-generate","自动生成发票（V1.1新增）","运营"]],
  [1000,3200,3360,1800]));

children.push(heading2("7.3 第三方集成接口"));
children.push(makeTable(["集成对象","接口方式","用途"],
  [["地图服务 (Google Maps / OSM)","REST API","地址解析、路线规划、ETA 计算"],
   ["GPS 平台","REST API / Webhook","接收运输公司的车辆 GPS 数据"],
   ["e-CMR 平台 (TransFollow 等)","REST API","电子 CMR 单据交换"],
   ["邮件服务 (SMTP / SendGrid)","SMTP / REST API","订单通知、账单发送、发票自动发送"],
   ["短信服务 (Twilio 等)","REST API","紧急通知、异常预警"]],
  [3000,2500,3860]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 8-11 =====
children.push(heading1("8. 非功能性需求"));
children.push(makeTable(["类别","需求","指标"],
  [["性能","页面加载时间","≤ 2 秒（普通页面），≤ 5 秒（报表页面）"],
   ["性能","API 响应时间","≤ 500ms（95% 分位）"],
   ["性能","并发用户支持","≥ 200 并发用户"],
   ["可用性","系统可用率","≥ 99.5%（年度）"],
   ["可用性","计划停机时间","≤ 4 小时/月（非业务时段）"],
   ["安全性","身份认证","JWT Token + RBAC 角色权限控制"],
   ["安全性","数据传输加密","全站 HTTPS / TLS 1.2+"],
   ["安全性","数据存储合规","符合 GDPR 数据保护要求"],
   ["可扩展性","架构设计","微服务架构，支持水平扩展"],
   ["国际化","多语言支持","中文、英语、德语、波兰语（可扩展）"],
   ["国际化","时区支持","自动识别用户时区，统一 UTC 存储"],
   ["兼容性","浏览器支持","Chrome、Firefox、Safari、Edge 最新2个版本"],
   ["兼容性","移动端支持","响应式设计，支持 iOS/Android 移动端浏览器"]],
  [2000,2500,4860]));

children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(heading1("9. 技术架构建议"));
children.push(makeTable(["层次","技术选型","说明"],
  [["前端","React / Vue.js + TypeScript","现代 SPA 架构，适合复杂交互"],
   ["移动端","React Native / Flutter","运输公司端需要移动 App"],
   ["后端","Node.js / Java Spring Boot","微服务架构，REST API"],
   ["数据库","PostgreSQL","关系型数据库，支持 JSON 字段和地理数据"],
   ["缓存","Redis","会话管理、热点数据缓存"],
   ["消息队列","RabbitMQ / Kafka","异步通知、GPS 数据流处理"],
   ["文件存储","AWS S3 / MinIO","CMR 单据、合同文件存储"],
   ["地图服务","Google Maps API / Mapbox","实时位置展示、路线规划"],
   ["部署","Docker + Kubernetes","容器化部署，支持自动扩缩容"],
   ["CI/CD","GitLab CI / GitHub Actions","自动化构建和部署"]],
  [2000,3000,4360]));

children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(heading1("10. 项目里程碑建议"));
children.push(makeTable(["阶段","周期","交付物","说明"],
  [["第一阶段: MVP","8-10 周","订单管理 + 派单核心流程","实现篷布车和集装箱两种业务类型的下单、审核、派单、状态跟踪"],
   ["第二阶段","6-8 周","CMR 管理 + GPS 追踪 + 船司放单","集成 CMR 上传、GPS 实时位置、船司放单管理、清关放行"],
   ["第三阶段","6-8 周","财务管理 + 询价报价","应收应付、发票模板、自动开票、报价管理"],
   ["第四阶段","4-6 周","客户/供应商管理 + 优化","完善 CRM 功能、绩效评价、系统优化"],
   ["第五阶段","持续","e-CMR 集成 + 移动 App","对接 e-CMR 平台、开发运输公司移动 App"]],
  [2000,1500,3000,2860]));

children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(heading1("11. 附录"));
children.push(heading2("11.1 版本历史"));
children.push(makeTable(["版本","日期","作者","变更说明"],
  [["V1.0","2026-03-29","Frank","初始版本，完成全部功能模块 PRD"],
   ["V1.1","2026-04-01","Frank","新增集装箱物流模块、询价报价管理、船司放单、清关放行、财务自动开票等功能"]],
  [1200,1800,1200,5160]));

children.push(heading2("11.2 参考文档"));
children.push(makeTable(["名称","说明"],
  [["CMR Convention (1956)","国际公路货物运输合同公约，规定了国际公路运输的法律框架"],
   ["EU GDPR (2018)","欧盟通用数据保护条例，系统需符合数据保护要求"],
   ["e-CMR Protocol (2008)","CMR 电子化附加议定书，规定电子 CMR 的法律效力"],
   ["ADR 协议","欧洲危险货物国际公路运输协议"]],
  [3000,6360]));

// ===== 创建文档 =====
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "EU-TMS PRD V1.1", font: "Arial", size: 16, color: "999999" })]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "第 ", font: "Arial", size: 16, color: "999999" }),
                   new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" }),
                   new TextRun({ text: " 页", font: "Arial", size: 16, color: "999999" })]
      })] })
    },
    children
  }]
});

// 输出
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/fengzheng/德国Box系统/欧洲运输管理系统_PRD_V1.1.docx', buffer);
  console.log('PRD V1.1 文档生成成功！');
});
