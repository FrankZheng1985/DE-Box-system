# EU-TMS 开放 API 对接文档 v1.0（契约草案）

> 适用对象：易抵达 / 傲翼 / 翼能 等合作方系统的开发团队
> 发布方：Kaluna Sped（EU-TMS 欧洲运输管理系统）
> 状态：**契约草案** —— 字段清单请贵方确认，如需增减字段请书面反馈，双方确认后冻结为 v1.0 正式版
> 更新日期：2026-08-02

---

## 1. 概述

EU-TMS 提供两类推送端点，**按用途区分，不要混用**：

| 端点 | 用途 | 维度 | 后续流程 |
|------|------|------|----------|
| `POST /inquiries` | 推送**询价单** | 按订单号 | 我方运营报价 → 贵方/客户确认 → 转订单 |
| `POST /orders` | 直接**下单** | 按柜号 | 固定价合作客户跳过询价，直接进入审核派单流程 |
| `GET /inquiries/{单号}` | **回查询价进展** | 按贵方单号 | 已报价时附报价金额与有效期，已转订单时附订单号 |
| `GET /orders/{单号}` | **回查订单状态** | 按贵方单号 | 含状态、跟踪号、柜号、计划日期 |

此外可选启用 **Webhook 主动推送**（第 8 节）：订单状态变更、报价发出、报价决策时我方主动通知贵方，
省去轮询。回查与推送可任选或并用。

- 所有接口仅支持 **HTTPS + JSON**（`Content-Type: application/json`）
- 请求和响应编码均为 UTF-8

### 接入地址

```
https://kalunasped.com/api/open/v1
```

> 域名使用正式 TLS 证书，请保持 HTTP 客户端的证书校验开启（无需任何特殊配置）。

---

## 2. 认证

每个合作方由我方运营签发一把 API Key（形如 `eutms_xxxx…`，54 字符）。

- 每次请求都在请求头携带：`X-API-Key: <你的密钥>`
- 密钥绑定贵方在我方系统中的客户档案，推送的单据自动挂在该客户名下，**请求体中不需要也不允许指定客户**
- 密钥遗失或疑似泄露，请立即联系我方运营换发（旧钥匙即刻失效）

连通性自检（对接第一步）：

```
GET /api/open/v1/ping
→ 200 { "code": 200, "message": "success", "data": { "partnerCode": "...", "partnerName": "...", "serverTime": "..." } }
```

---

## 3. 通用响应格式与错误码

所有响应均为：

```json
{ "code": <HTTP状态码>, "message": "<人类可读信息>", "data": { ... } }
```

失败时 `data.errorCode` 供程序判断：

| HTTP | errorCode | 含义 | 建议处理 |
|------|-----------|------|----------|
| 400 | `VALIDATION_ERROR` | 字段校验不通过，`message` 列出全部问题 | 修正后重发，**不要原样重试** |
| 401 | `AUTH_ERROR` | 缺少或无效的 X-API-Key | 检查密钥 |
| 403 | `FORBIDDEN` | 密钥已停用 / 来源 IP 不在白名单 | 联系我方运营 |
| 404 | `NOT_FOUND` | 回查的单号不存在（或不属于贵方） | 检查单号是否推送成功 |
| 422 | `BUSINESS_ERROR` | 业务规则拦截（如信用额度冻结） | 联系我方运营，**不要原样重试** |
| 429 | `RATE_LIMITED` | 超出限速（默认 60 次/分钟，可调） | 退避后重试 |
| 500 | `SERVER_ERROR` | 我方系统异常 | 稍后重试，仍失败请联系我方 |

---

## 4. 幂等与重试（重要）

- 每次推送必须携带贵方系统的唯一单号 `externalOrderNo`
- **同一单号重复推送不会重复建单**：返回第一次创建的单据，HTTP 200，`data.duplicated = true`
- 因此网络超时、5xx 等情况**放心原样重试**，推荐策略：间隔 30s / 2min / 10min 各一次，仍失败转人工
- 注意：重复推送**不会更新**已有单据内容。推错了需要改，请联系我方运营处理

---

## 5. 推送询价单 `POST /inquiries`

### 请求体字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| externalOrderNo | string ≤100 | ✅ | 贵方系统单号（幂等键） |
| businessType | string | ✅ | `TRUCK_LTL` 卡车派送 / `TRUCK_FTL` 卡车运输 / `LOCAL_DELIVERY` 本地派送 |
| customerRef | string ≤100 | | 终端客户参考号（与 externalOrderNo 不同时提供） |
| containerNo | string ≤30 | ✅ | 柜号。三种服务类型都必填 |
| expectedArrivalDate | string | ✅ | 预计到仓日期，格式 `YYYY-MM-DD`（只到日期，不带时分秒）。车队据此排车 |
| routeFrom | object | ✅ | 起运地 `{ country*, city, zipCode, address }` |
| routeTo | object | ✅ | 目的地，同上结构，country 必填 |
| contactName | string ≤100 | | 联系人姓名 |
| contactPhone | string ≤50 | | 联系人电话 |
| contactEmail | string ≤100 | | 联系人邮箱（报价通知发往此邮箱） |
| cargoItems | array | ▲ | 按件货物明细，**强烈建议提供**（见下） |
| cargoQuantity | int | ▲ | 无明细时的汇总件数 |
| cargoWeightKg | number | ▲ | 无明细时的汇总实重 kg |
| cargoVolumeM3 | number | ▲ | 无明细时的汇总体积 m³ |
| ldm | number | ▲ | 无明细时的汇总装载米 |
| cargoDescription | string | | 货物描述 |
| specialRequirements | string | | 特殊要求 |
| pod | string ≤100 | | 卸港（海运相关时） |
| containerType | string ≤10 | | 柜型（如 40HQ） |
| remarks | string | | 备注 |

▲：`cargoItems` 至少一行，或四个汇总字段至少提供一个，否则 400。

### cargoItems 明细行

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| referenceNo | string ≤100 | | 该件的贵方单号/件号 |
| description | string ≤255 | | 品名 |
| quantity | int ≥1 | ✅ | 件数 |
| lengthCm / widthCm / heightCm | number | | 单件长/宽/高（**厘米**） |
| unitWeightKg | number | | 单件实重 kg |
| ldm | number | | 该行装载米；不传则由我方按 `长m×宽m÷2.4×件数` 自动计算 |
| stackable | boolean | | 是否可堆叠，默认 true |

传了明细时，表头的件数/实重/体积/LDM 由我方按明细自动汇总，无需重复传。

### 示例

```bash
curl -X POST https://kalunasped.com/api/open/v1/inquiries \
  -H "Content-Type: application/json" \
  -H "X-API-Key: eutms_你的密钥" \
  -d '{
    "externalOrderNo": "YDD-2026-0001",
    "businessType": "TRUCK_LTL",
    "routeFrom": { "country": "德国", "city": "Hamburg", "zipCode": "20095", "address": "Hafenstr. 1" },
    "routeTo":   { "country": "法国", "city": "Paris", "zipCode": "75001", "address": "Rue de Rivoli 2" },
    "contactName": "张三", "contactPhone": "+49 151 00000000", "contactEmail": "ops@partner.com",
    "cargoItems": [
      { "referenceNo": "PKG-1", "quantity": 2, "lengthCm": 120, "widthCm": 80, "heightCm": 100, "unitWeightKg": 200 }
    ]
  }'
```

成功响应：

```json
{
  "code": 200,
  "message": "询价单创建成功",
  "data": {
    "duplicated": false,
    "inquiryId": "…uuid…",
    "inquiryNumber": "INQ2026080001",
    "status": "PENDING_QUOTE",
    "createdAt": "2026-08-02T09:00:00.000Z"
  }
}
```

---

## 6. 直接下单 `POST /orders`

> 仅限与我方签订固定价协议的合作方使用。订单落库后进入我方审核派单流程。

### 请求体字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| externalOrderNo | string ≤100 | ✅ | 贵方系统单号（幂等键） |
| businessType | string | ✅ | 同询价；柜号直推场景一般为 `TRUCK_FTL` |
| containerNo | string ≤30 | FTL 必填 | 柜号 |
| containerType | string ≤10 | | 柜型（40HQ / 20GP…） |
| sealNo | string ≤30 | | 铅封号 |
| blNumber | string ≤50 | | 提单号 |
| shippingLine | string ≤100 | | 船司 |
| eta | ISO 时间 | | 预计到港时间 |
| pod | string ≤100 | | 卸港 |
| cnee | string ≤200 | | 收货人 |
| pickupAddress | object | | 提货地址 `{ country, city, zipCode, address }` |
| deliveryAddress | object | ✅ | 派送地址，country 必填 |
| pickupDate / deliveryDate / expectedDeliveryDate | `YYYY-MM-DD` | | 计划日期 |
| cargoDescription | string | | 货物描述 |
| cargoWeightKg / cargoVolumeM3 | number | | 实重 / 体积 |
| cargoQuantity | int | | 件数 |
| specialRequirements | string ≤50 | | 特殊要求（**最多 50 字符**） |
| needsClearance | boolean | | 是否需要清关（FTL 时自动带出清关任务） |
| needsRelease | boolean | | 是否需要船司放单 |
| releaseMethod | string | | `TELEX` 电放 / `ORIGINAL` 正本 |
| clientPrice | number | | 协议价（币种见 currency）；传了会走我方信用检查 |
| currency | string(3) | | 默认 EUR |
| finalDestination / finalDestAddress | string | | 最终目的地说明 |
| remarks | string | | 备注 |

### 成功响应

```json
{
  "code": 200,
  "message": "订单创建成功，已进入审核流程",
  "data": {
    "duplicated": false,
    "orderId": "…uuid…",
    "orderNumber": "ORD2026080001",
    "status": "PENDING_REVIEW",
    "createdAt": "2026-08-02T09:00:00.000Z"
  }
}
```

422 示例（信用拦截）：

```json
{ "code": 422, "message": "信用检查未通过: …", "data": { "errorCode": "BUSINESS_ERROR" } }
```

---

## 7. 状态回查 `GET /inquiries/{单号}` 与 `GET /orders/{单号}`

用贵方推送时的 `externalOrderNo` 查询进展，随时可查（受同一限速约束）。

```bash
curl https://kalunasped.com/api/open/v1/inquiries/YDD-2026-0001 -H "X-API-Key: eutms_你的密钥"
```

询价回查响应示例（已报价、已转订单时 quotation / order 才有值，否则为 null）：

```json
{
  "code": 200, "message": "success",
  "data": {
    "externalOrderNo": "YDD-2026-0001",
    "inquiryNumber": "INQ2026080001",
    "status": "QUOTED", "statusLabel": "已报价",
    "businessType": "TRUCK_LTL",
    "quotation": {
      "quotationNumber": "QUO2026080001",
      "status": "SENT", "statusLabel": "已报价待确认",
      "totalPrice": 1234.5, "currency": "EUR", "validUntil": "2026-08-31"
    },
    "order": null,
    "createdAt": "2026-08-02T09:00:00.000Z", "updatedAt": "2026-08-02T10:00:00.000Z"
  }
}
```

订单回查响应字段：`orderNumber`、`status` / `statusLabel`（如 PENDING_REVIEW 待审核 →
IN_TRANSIT 运输中 → COMPLETED 已完成）、`deliveryStatus`（FTL 派送子状态）、
`trackingNumber`（本地派送跟踪号）、`containerNo`、`pickupDate` / `deliveryDate` /
`expectedDeliveryDate`、`createdAt` / `updatedAt`。

- 查不到（含单号不属于贵方）一律 `404 NOT_FOUND`
- 状态枚举以本节与第 5/6 节为准；建议贵方按 `status` 编程、`statusLabel` 仅用于展示

## 8. 状态变更推送（Webhook，可选）

除了主动回查（第 7 节），我方也可以在状态变化时**主动 POST 通知**贵方。
启用只需提供一个接收端点，我方配置后即刻生效——**不需要贵方改动推送侧任何代码**。

### 事件类型

| event | 触发时机 |
|-------|----------|
| `ORDER_STATUS_CHANGED` | 贵方推送的订单状态发生变更（含 API 直推单和询价转来的订单） |
| `INQUIRY_QUOTED` | 贵方推送的询价单已报价并发送给客户 |
| `QUOTATION_DECISION` | 该报价被接受（已转订单）或被拒绝 |
| `WEBHOOK_TEST` | **联调测试事件**，由我方运营手动触发，不对应任何真实业务 |

> 💡 **联调建议**：贵方接收端上线后告诉我们，我方运营点一下就能发一条 `WEBHOOK_TEST` 过去，
> 立刻知道地址通不通、验签对不对，不用等真实业务事件发生。
> 请让接收端**对未知事件类型返回 2xx 而不是报错**（至少要能处理 `WEBHOOK_TEST`），
> 否则测试会显示失败。该事件的 `deliveryId` 固定为 `"test"`，贵方可据此跳过业务处理。

### 请求格式

```
POST <贵方接收地址>
Content-Type: application/json
X-EUTMS-Event: ORDER_STATUS_CHANGED
X-EUTMS-Delivery-Id: 12345
X-EUTMS-Signature: t=1754130000,v1=3a7f…（见下方验签）
```

```json
{
  "event": "ORDER_STATUS_CHANGED",
  "deliveryId": "12345",
  "partnerCode": "YIDIDA",
  "occurredAt": "2026-08-03T09:15:00.000Z",
  "data": {
    "externalOrderNo": "AOYI-C-8801",
    "orderNumber": "EU-20260803-0031",
    "fromStatus": "PENDING_REVIEW", "toStatus": "CONFIRMED",
    "statusLabel": "已确认",
    "trackingNumber": null,
    "occurredAt": "2026-08-03T09:15:00.000Z"
  }
}
```

报价类事件的 `data` 字段同第 7 节询价回查里的 `quotation` 结构
（`inquiryNumber` / `quotationNumber` / `status` / `totalPrice` / `currency` / `validUntil` / `orderNumber`）。

### 验签（务必实现）

我方在配置时生成一个签名密钥交给贵方。签名头格式 `t=<unix秒>,v1=<hex>`，
其中 `v1 = HMAC-SHA256(密钥, "<t>.<原始请求体>")`。**必须用原始请求体字节计算**，
不要先反序列化再重新序列化。Node.js 示例：

```js
const crypto = require('crypto')
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map(kv => kv.split('=')))
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  // 建议再校验 t 与当前时间相差不超过 5 分钟，防重放
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}
```

### 应答与重试

- 贵方返回 **任意 2xx** 即视为成功；其他状态码或超时（10 秒）视为失败
- 失败按 **1 分钟 / 5 分钟 / 30 分钟 / 2 小时 / 6 小时** 重试，共 5 次；仍失败则停止并在我方后台标记
- **请做幂等处理**：网络抖动可能导致同一 `deliveryId` 送达多次，按它去重即可
- 建议接收端先落库再返回 2xx，不要在请求里做耗时处理

## 9. 限制与约定

- 限速默认 **60 次/分钟**（按密钥计），可按贵方业务量调整
- 请求体上限 50 MB，但建议单次一单，不支持批量数组（如需批量请逐单调用）
- 我方对每次请求（含被拒绝的）留有完整日志，对账时可按 `externalOrderNo` 互查
- 状态同步两种方式任选或并用：主动回查（第 7 节，随时可用）、Webhook 推送（第 8 节，提供接收地址即可启用）

## 10. 需要贵方确认的事项

1. 上述字段清单是否覆盖贵方推送数据？需增删哪些字段？
2. 是否启用 Webhook 推送（第 8 节）？如启用请提供**接收端点 URL**，我方配置后会把签名密钥交给贵方
3. 贵方出口 IP 清单（可选，用于 IP 白名单加固）
4. 联调时间窗口与双方技术对接人

---

*附：修订记录*

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 草案 | 2026-08-02 | 首版，待合作方确认字段清单 |
| v1.1 草案 | 2026-09-05 | 询价推送新增两个**必填**字段：`containerNo`（柜号）、`expectedArrivalDate`（预计到仓日期 `YYYY-MM-DD`）。与人工建单、批量导入口径一致。此时尚无合作方接入，故直接并入契约而非做兼容期 |
| v1.0 草案修订 | 2026-08-02 | 接入地址由过渡期 IP 改为正式域名 kalunasped.com（正式 TLS 证书，证书校验保持开启） |
| v1.0 草案修订2 | 2026-08-02 | 新增状态回查接口（第 7 节）：GET /inquiries/{单号}、GET /orders/{单号}；错误码表补 404 NOT_FOUND |
| v1.0 草案修订3 | 2026-08-03 | 新增状态变更 Webhook 推送（第 8 节）：三类事件、HMAC-SHA256 验签、重试策略；原 8/9 节顺延为 9/10 |
| v1.0 草案修订4 | 2026-08-03 | Webhook 增加 `WEBHOOK_TEST` 联调测试事件（我方可手动触发验证贵方接收端） |
