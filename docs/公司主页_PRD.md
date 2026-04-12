# Box Cargo Service GmbH - 公司官网 PRD

> 版本：V1.0 | 日期：2026-04-10

---

## 1. 项目概述

### 1.1 目标
为 Box Cargo Service GmbH 建设一个专业的公司官方网站，作为品牌形象展示和系统入口。网站同时承载两个功能：
1. **品牌官网** — 展示公司介绍、服务范围、覆盖网络、联系方式
2. **系统入口** — 提供 EU-TMS 三端门户的统一入口

### 1.2 域名
- 主域名：**box-cargo.de**
- 系统入口：
  - /admin/ → 运营管理端
  - /customer/ → 客户门户
  - /carrier/ → 承运商门户

### 1.3 语言
- **德语（Deutsch）** — 主要语言（默认显示）
- **英语（English）** — 面向国际客户
- **中文（中文）** — 面向中国合作方

---

## 2. 页面结构

整个官网为 **单页设计（One Page）**，包含以下区块：

### 2.1 导航栏（Header / Navigation）
- 固定顶部，滚动时背景变为半透明毛玻璃
- 左侧：公司 Logo + "Box Cargo Service"
- 中间：导航锚点链接（Über uns / Leistungen / Netzwerk / Kontakt）
- 右侧：语言切换按钮（DE / EN / 中文）+ "Kundenportal" 登录按钮

### 2.2 首屏 Hero 区（Hero Section）
- 全宽背景：欧洲物流场景（卡车、集装箱、港口）的高质量图片/渐变
- 大标题（德语）："Ihre Logistiklösung für Europa"（您的欧洲物流解决方案）
- 副标题："Zuverlässige Transport- und Speditionsdienstleistungen in ganz Europa"
- 两个 CTA 按钮：
  - "Angebot anfordern"（获取报价）→ 滚动到联系表单
  - "Zum Kundenportal"（进入客户门户）→ /customer/

### 2.3 关于我们（Über uns / About Us）
- 简短公司介绍（3-4 句话）
- 三组数据展示：
  - "15+" 覆盖欧洲国家
  - "1000+" 年运输订单
  - "98%" 准时交付率
- 公司优势（4个图标卡片）：
  1. 全欧覆盖（Europaweite Abdeckung）
  2. 实时追踪（Echtzeit-Tracking）
  3. 灵活方案（Flexible Lösungen）
  4. 专业团队（Professionelles Team）

### 2.4 服务范围（Unsere Leistungen / Services）
- 两大核心服务卡片：

**篷布车运输（Planentransport / Curtain Side Transport）**
- 图标 + 标题
- 服务描述：整车运输（FTL）、拼车运输（LTL）
- 覆盖：德国、波兰、法国、意大利、西班牙等
- 特点：温控运输、ADR 危险品、超宽超重

**集装箱物流（Containerlogistik / Container Logistics）**
- 图标 + 标题
- 服务描述：海运集装箱到港后的陆运配送
- 柜型：20GP、40GP、40HQ、45HQ
- 服务：船司放单管理、清关协调、最后一公里配送

### 2.5 覆盖网络（Unser Netzwerk / Network）
- 欧洲地图示意图（简化版，标注主要覆盖国家）
- 覆盖国家列表（带国旗图标）：
  Deutschland, Frankreich, Polen, Italien, Spanien, Niederlande, Belgien, Tschechien, Österreich, Ungarn, Schweiz, Dänemark, Schweden, Großbritannien, Irland
- "Und weitere Länder auf Anfrage"（更多国家可咨询）

### 2.6 系统入口（EU-TMS Portal）
- 标题："Unser digitales Transportmanagement"（我们的数字化运输管理）
- 副标题：介绍 EU-TMS 系统的功能
- 三张入口卡片（大卡片，有悬浮动效）：

| 门户 | 标题 | 描述 | 链接 |
|------|------|------|------|
| 运营管理 | Verwaltung / Administration | 订单管理、派单、财务、报表 | /admin/ |
| 客户门户 | Kundenportal / Client Portal | 下单、追踪、账单、清关 | /customer/ |
| 承运商门户 | Spediteursportal / Carrier Portal | 接单、CMR上传、GPS、结算 | /carrier/ |

每张卡片：图标 + 标题 + 2-3 行描述 + "Einloggen"（登录）按钮

### 2.7 联系方式（Kontakt / Contact）
- 左侧：联系表单
  - Name（姓名）
  - E-Mail（邮箱）
  - Telefon（电话，可选）
  - Nachricht（留言）
  - "Absenden"（发送）按钮
- 右侧：公司信息
  - Box Cargo Service GmbH
  - 地址（德国地址）
  - 电话
  - 邮箱：info@box-cargo.de
  - 营业时间：Mo-Fr 08:00-18:00

### 2.8 页脚（Footer）
- 公司名称 + 版权声明
- 链接：Impressum（法律声明）| Datenschutz（隐私政策）| AGB（条款）
- 社交媒体图标（LinkedIn、Xing 预留）

---

## 3. 设计规范

### 3.1 品牌色彩
| 用途 | 颜色 | 说明 |
|------|------|------|
| 主色 | #1A365D | 深海军蓝（专业、信任） |
| 强调色 | #2B6CB0 | 中蓝色（按钮、链接） |
| 辅助色 | #F6AD55 | 暖橙色（CTA 按钮、亮点） |
| 背景 | #F7FAFC | 浅灰白 |
| 文字 | #1A202C | 深灰黑 |
| 次要文字 | #718096 | 灰色 |

### 3.2 字体
- 标题：Inter 或 Poppins（现代无衬线）
- 正文：Inter（清晰易读）
- 中文回退：PingFang SC / Microsoft YaHei

### 3.3 设计风格
- 现代、干净、专业
- 大量留白
- 圆角卡片（16px）
- 柔和阴影
- 微交互动画（滚动淡入、悬浮上浮）
- 响应式：桌面 / 平板 / 手机

### 3.4 图片风格
- 物流行业高质量图片
- 蓝色调滤镜统一色调
- 可使用 Unsplash/Pexels 免费图片

---

## 4. 多语言内容

### 4.1 语言切换
- 右上角语言按钮：DE | EN | 中文
- 默认加载德语
- 切换时页面不刷新（JS 动态替换文本）
- URL 不变（不使用 /de/ /en/ /zh/ 路径）

### 4.2 关键翻译对照

| 德语 | 英语 | 中文 |
|------|------|------|
| Über uns | About Us | 关于我们 |
| Leistungen | Services | 服务范围 |
| Netzwerk | Network | 覆盖网络 |
| Kontakt | Contact | 联系我们 |
| Kundenportal | Client Portal | 客户门户 |
| Spediteursportal | Carrier Portal | 承运商门户 |
| Verwaltung | Administration | 运营管理 |
| Angebot anfordern | Request a Quote | 获取报价 |
| Ihre Logistiklösung für Europa | Your Logistics Solution for Europe | 您的欧洲物流解决方案 |

---

## 5. 技术方案

### 5.1 实现方式
- **纯静态 HTML + CSS + JS**（不使用 React）
- 一个 `index.html` 文件 + 内联或外联 CSS/JS
- 部署到 Nginx 的根路径
- 系统入口通过 `/admin/`、`/customer/`、`/carrier/` 子路径访问

### 5.2 Nginx 配置调整
```nginx
# 主页（静态 HTML）
location = / {
    root /var/www/germany-box-system/homepage;
    index index.html;
}
location /assets/homepage/ {
    root /var/www/germany-box-system/homepage;
}

# 三端门户保持不变
location /admin { ... }
location /customer { ... }
location /carrier { ... }
```

### 5.3 SEO
- 页面 title：Box Cargo Service GmbH - Europäische Transportlösungen
- Meta description：德/英两个版本
- Open Graph 标签
- Structured Data（Organization）
- Sitemap.xml

---

## 6. 页面交互

### 6.1 滚动动画
- 各区块内容在滚动到可视区域时淡入显示
- 数字统计使用计数动画（0 → 15+）
- 服务卡片悬浮时轻微上浮 + 阴影增强

### 6.2 导航
- 点击导航链接平滑滚动到对应区块
- 滚动时自动高亮当前区块对应的导航项
- 移动端：汉堡菜单

### 6.3 联系表单
- 前端表单验证
- 提交后显示"感谢您的咨询，我们会尽快回复"
- 后端暂不对接（表单数据暂不发送，后续可对接邮件）

---

*文档结束*
