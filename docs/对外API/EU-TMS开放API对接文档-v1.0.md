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

- 所有接口仅支持 **HTTPS + JSON**（`Content-Type: application/json`）
- 请求和响应编码均为 UTF-8

### 接入地址

```
https://47.83.241.117/api/open/v1
```

> ⚠️ 过渡期说明：当前按 IP 访问，服务器使用自签名证书，贵方 HTTP 客户端需临时关闭证书校验（仅限对接测试期）。正式域名启用后会另行通知，届时请切回严格校验。

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
curl -X POST https://47.83.241.117/api/open/v1/inquiries \
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

## 7. 限制与约定

- 限速默认 **60 次/分钟**（按密钥计），可按贵方业务量调整
- 请求体上限 50 MB，但建议单次一单，不支持批量数组（如需批量请逐单调用）
- 我方对每次请求（含被拒绝的）留有完整日志，对账时可按 `externalOrderNo` 互查
- 后续版本计划：单据状态回查接口、状态变更 Webhook 推送（v1.1 讨论范围）

## 8. 需要贵方确认的事项

1. 上述字段清单是否覆盖贵方推送数据？需增删哪些字段？
2. 推送方向由贵方主动 POST 至我方，贵方是否还需要**状态回传**（Webhook 或轮询接口）？
3. 贵方出口 IP 清单（可选，用于 IP 白名单加固）
4. 联调时间窗口与双方技术对接人

---

*附：修订记录*

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 草案 | 2026-08-02 | 首版，待合作方确认字段清单 |
