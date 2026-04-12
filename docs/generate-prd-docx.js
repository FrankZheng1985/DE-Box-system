const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');

// 颜色常量
const PRIMARY = '1A365D';
const ACCENT = '2B6CB0';
const ORANGE = 'F6AD55';
const LIGHT_BG = 'F7FAFC';
const BORDER_COLOR = 'CCCCCC';

// 通用边框
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

// 表格辅助函数
function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Arial', size: 20 })] })]
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: text || '', font: 'Arial', size: 20, bold: opts.bold, color: opts.color })] })]
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, colWidths[i])) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => dataCell(cell, colWidths[ci], { shading: ri % 2 === 1 ? LIGHT_BG : undefined }))
      }))
    ]
  });
}

// 段落辅助
function heading(text, level) {
  return new Paragraph({ heading: level, spacing: { before: 300, after: 150 }, children: [new TextRun({ text, font: 'Arial' })] });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 22, ...opts })]
  });
}

function boldPara(label, value) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: label, font: 'Arial', size: 22, bold: true }),
      new TextRun({ text: value, font: 'Arial', size: 22 })
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: PRIMARY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: ACCENT },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '333333' },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
      ]},
      { reference: 'numbers', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]}
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'Box Cargo Service GmbH', font: 'Arial', size: 18, color: '999999' }),
              new TextRun({ text: '  |  ', font: 'Arial', size: 18, color: 'CCCCCC' }),
              new TextRun({ text: '公司官网 PRD V1.0', font: 'Arial', size: 18, color: '999999' })
            ]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
            children: [
              new TextRun({ text: '第 ', font: 'Arial', size: 18, color: '999999' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '999999' }),
              new TextRun({ text: ' 页', font: 'Arial', size: 18, color: '999999' })
            ]
          })]
        })
      },
      children: [
        // ===== 封面 =====
        new Paragraph({ spacing: { before: 2400 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Box Cargo Service GmbH', font: 'Arial', size: 48, bold: true, color: PRIMARY })]
        }),
        new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '公司官网产品需求文档 (PRD)', font: 'Arial', size: 32, color: ACCENT })]
        }),
        new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '版本：V1.0  |  日期：2026-04-10', font: 'Arial', size: 22, color: '718096' })]
        }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '状态：初稿', font: 'Arial', size: 22, color: '718096' })]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== 1. 项目概述 =====
        heading('1. 项目概述', HeadingLevel.HEADING_1),

        heading('1.1 目标', HeadingLevel.HEADING_2),
        para('为 Box Cargo Service GmbH 建设一个专业的公司官方网站，作为品牌形象展示和系统入口。网站同时承载两个功能：'),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, spacing: { after: 80 },
          children: [new TextRun({ text: '品牌官网', bold: true, font: 'Arial', size: 22 }), new TextRun({ text: ' — 展示公司介绍、服务范围、覆盖网络、联系方式', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, spacing: { after: 120 },
          children: [new TextRun({ text: '系统入口', bold: true, font: 'Arial', size: 22 }), new TextRun({ text: ' — 提供 EU-TMS 三端门户的统一入口', font: 'Arial', size: 22 })] }),

        heading('1.2 域名与路径', HeadingLevel.HEADING_2),
        makeTable(['路径', '用途'], [
          ['box-cargo.de/', '公司主页（品牌官网）'],
          ['box-cargo.de/admin/', '运营管理端（EU-TMS）'],
          ['box-cargo.de/customer/', '客户门户'],
          ['box-cargo.de/carrier/', '承运商门户'],
        ], [4000, 5500]),

        heading('1.3 语言', HeadingLevel.HEADING_2),
        makeTable(['语言', '说明'], [
          ['德语 Deutsch', '主要语言，默认显示'],
          ['英语 English', '面向国际客户'],
          ['中文', '面向中国合作方'],
        ], [3000, 6500]),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== 2. 页面结构 =====
        heading('2. 页面结构', HeadingLevel.HEADING_1),
        para('整个官网为单页设计（One Page），包含以下 8 个区块：'),

        makeTable(['序号', '区块名称', '说明'], [
          ['1', '导航栏 Navigation', 'Logo + 导航链接 + 语言切换 + 登录按钮'],
          ['2', 'Hero 首屏', '大标题 + 副标题 + CTA 按钮'],
          ['3', '关于我们 Über uns', '公司介绍 + 数据统计 + 优势卡片'],
          ['4', '服务范围 Leistungen', '篷布车运输 + 集装箱物流'],
          ['5', '覆盖网络 Netzwerk', '15 个欧洲国家展示'],
          ['6', 'EU-TMS 门户入口', '3 张门户卡片'],
          ['7', '联系方式 Kontakt', '表单 + 公司信息'],
          ['8', '页脚 Footer', '版权 + 法律链接'],
        ], [1000, 3200, 5300]),

        heading('2.1 导航栏', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '固定顶部，滚动时背景变为半透明毛玻璃', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '左侧：公司 Logo + "Box Cargo Service"', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '中间：导航锚点链接（Über uns / Leistungen / Netzwerk / Kontakt）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '右侧：语言切换按钮（DE / EN / 中文）+ "Kundenportal" 登录按钮', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '移动端：汉堡菜单', font: 'Arial', size: 22 })] }),

        heading('2.2 首屏 Hero 区', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '全宽渐变背景（#1A365D → #2B6CB0）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '大标题："Ihre Logistiklösung für Europa"（您的欧洲物流解决方案）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '副标题："Zuverlässige Transport- und Speditionsdienstleistungen in ganz Europa"', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: 'CTA 按钮："Angebot anfordern"（获取报价）+ "Zum Kundenportal"（进入客户门户）', font: 'Arial', size: 22 })] }),

        heading('2.3 关于我们', HeadingLevel.HEADING_2),
        para('简短公司介绍（3-4 句话）+ 三组数据展示 + 四张优势卡片'),
        makeTable(['数据', '说明'], [
          ['15+', '覆盖欧洲国家'],
          ['1000+', '年运输订单'],
          ['98%', '准时交付率'],
        ], [2500, 7000]),
        para('四大优势：'),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun({ text: '全欧覆盖 Europaweite Abdeckung — 覆盖 15+ 欧洲国家', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun({ text: '实时追踪 Echtzeit-Tracking — GPS 全程追踪', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun({ text: '灵活方案 Flexible Lösungen — FTL/LTL/集装箱多种方式', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun({ text: '专业团队 Professionelles Team — 多语种团队，高效响应', font: 'Arial', size: 22 })] }),

        heading('2.4 服务范围', HeadingLevel.HEADING_2),
        heading('篷布车运输 Planentransport', HeadingLevel.HEADING_3),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '整车运输（FTL）、拼车运输（LTL）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '覆盖：德国、波兰、法国、意大利、西班牙等', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '特点：温控运输、ADR 危险品、超宽超重', font: 'Arial', size: 22 })] }),

        heading('集装箱物流 Containerlogistik', HeadingLevel.HEADING_3),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '海运集装箱到港后的陆运配送', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '柜型：20GP、40GP、40HQ、45HQ', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '服务：船司放单管理、清关协调、最后一公里配送', font: 'Arial', size: 22 })] }),

        heading('2.5 覆盖网络', HeadingLevel.HEADING_2),
        para('覆盖 15 个欧洲国家：Deutschland, Frankreich, Polen, Italien, Spanien, Niederlande, Belgien, Tschechien, Österreich, Ungarn, Schweiz, Dänemark, Schweden, Großbritannien, Irland'),
        para('Und weitere Länder auf Anfrage（更多国家可咨询）', { italics: true, color: '718096' }),

        heading('2.6 系统入口 EU-TMS Portal', HeadingLevel.HEADING_2),
        para('标题："Unser digitales Transportmanagement"（我们的数字化运输管理）'),
        makeTable(['门户', '标题', '描述', '链接'], [
          ['运营管理', 'Verwaltung', '订单管理、派单、财务、报表', '/admin/'],
          ['客户门户', 'Kundenportal', '下单、追踪、账单、清关', '/customer/'],
          ['承运商门户', 'Spediteursportal', '接单、CMR上传、GPS、结算', '/carrier/'],
        ], [1800, 2200, 3500, 2000]),

        heading('2.7 联系方式', HeadingLevel.HEADING_2),
        boldPara('左侧 — 联系表单：', 'Name / E-Mail / Telefon / Nachricht / Absenden 按钮'),
        boldPara('右侧 — 公司信息：', 'Box Cargo Service GmbH / 地址 / 电话 / info@box-cargo.de / Mo-Fr 08:00-18:00'),

        heading('2.8 页脚', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '公司名称 + 版权声明 © 2026', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '链接：Impressum | Datenschutz | AGB', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '社交媒体图标：LinkedIn、Xing', font: 'Arial', size: 22 })] }),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== 3. 设计规范 =====
        heading('3. 设计规范', HeadingLevel.HEADING_1),

        heading('3.1 品牌色彩', HeadingLevel.HEADING_2),
        makeTable(['用途', '颜色', '说明'], [
          ['主色', '#1A365D', '深海军蓝（专业、信任）'],
          ['强调色', '#2B6CB0', '中蓝色（按钮、链接）'],
          ['辅助色', '#F6AD55', '暖橙色（CTA 按钮、亮点）'],
          ['背景', '#F7FAFC', '浅灰白'],
          ['文字', '#1A202C', '深灰黑'],
          ['次要文字', '#718096', '灰色'],
        ], [2200, 2200, 5100]),

        heading('3.2 字体', HeadingLevel.HEADING_2),
        makeTable(['用途', '字体'], [
          ['标题', 'Inter / Poppins（现代无衬线）'],
          ['正文', 'Inter（清晰易读）'],
          ['中文回退', 'PingFang SC / Microsoft YaHei'],
        ], [3000, 6500]),

        heading('3.3 设计风格', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '现代、干净、专业，大量留白', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '圆角卡片（16px）+ 柔和阴影', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '微交互动画：滚动淡入、悬浮上浮、计数动画', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '响应式：桌面 / 平板 / 手机', font: 'Arial', size: 22 })] }),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== 4. 多语言 =====
        heading('4. 多语言内容', HeadingLevel.HEADING_1),

        heading('4.1 语言切换机制', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '右上角按钮：DE | EN | 中文', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '默认加载德语', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: 'JS 动态替换文本，页面不刷新', font: 'Arial', size: 22 })] }),

        heading('4.2 关键翻译对照', HeadingLevel.HEADING_2),
        makeTable(['德语', '英语', '中文'], [
          ['Über uns', 'About Us', '关于我们'],
          ['Leistungen', 'Services', '服务范围'],
          ['Netzwerk', 'Network', '覆盖网络'],
          ['Kontakt', 'Contact', '联系我们'],
          ['Kundenportal', 'Client Portal', '客户门户'],
          ['Spediteursportal', 'Carrier Portal', '承运商门户'],
          ['Verwaltung', 'Administration', '运营管理'],
          ['Angebot anfordern', 'Request a Quote', '获取报价'],
          ['Ihre Logistiklösung für Europa', 'Your Logistics Solution for Europe', '您的欧洲物流解决方案'],
        ], [3400, 3200, 2900]),

        new Paragraph({ children: [new PageBreak()] }),

        // ===== 5. 技术方案 =====
        heading('5. 技术方案', HeadingLevel.HEADING_1),

        heading('5.1 实现方式', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '纯静态 HTML + CSS + JS（不使用 React）', font: 'Arial', size: 22, bold: true })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '一个 index.html 文件 + 内联 CSS/JS', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '部署到 Nginx 根路径', font: 'Arial', size: 22 })] }),

        heading('5.2 SEO', HeadingLevel.HEADING_2),
        makeTable(['项目', '内容'], [
          ['Title', 'Box Cargo Service GmbH - Europäische Transportlösungen'],
          ['Meta Description', '德/英两个版本'],
          ['Open Graph', '标题、描述、图片'],
          ['Structured Data', 'Organization 类型'],
          ['Sitemap', 'sitemap.xml'],
        ], [3000, 6500]),

        // ===== 6. 页面交互 =====
        heading('6. 页面交互', HeadingLevel.HEADING_1),

        heading('6.1 滚动动画', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '各区块在滚动到可视区域时淡入显示（IntersectionObserver）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '数字统计使用计数动画（0 → 15+）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '服务卡片悬浮时上浮 + 阴影增强', font: 'Arial', size: 22 })] }),

        heading('6.2 导航交互', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '点击导航链接平滑滚动到对应区块', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '滚动时自动高亮当前区块对应的导航项', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '移动端：汉堡菜单展开/收起', font: 'Arial', size: 22 })] }),

        heading('6.3 联系表单', HeadingLevel.HEADING_2),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '前端表单验证（必填项、邮箱格式）', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '提交后显示感谢信息', font: 'Arial', size: 22 })] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: '后端暂不对接（后续可对接邮件服务）', font: 'Arial', size: 22 })] }),

        new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '— 文档结束 —', font: 'Arial', size: 20, color: '999999', italics: true })] }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  const outputPath = '/Users/fengzheng/德国Box系统/docs/公司主页_PRD.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('Word 文档已生成:', outputPath);
});
