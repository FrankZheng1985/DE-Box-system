/**
 * PDF 发票生成工具
 * 使用 pdfkit 生成简洁专业的发票 PDF
 */

import PDFDocument from 'pdfkit'

/**
 * 生成发票 PDF
 * @param {Object} invoiceData - 发票数据
 * @param {string} invoiceData.invoiceNumber - 发票号
 * @param {string} invoiceData.date - 开票日期
 * @param {string} invoiceData.dueDate - 付款截止日期
 * @param {string} invoiceData.clientName - 客户名称
 * @param {string} invoiceData.clientAddress - 客户地址
 * @param {Array} invoiceData.items - 明细项 [{description, quantity, unitPrice, amount}]
 * @param {number} invoiceData.subtotal - 小计
 * @param {number} invoiceData.taxRate - 税率 (如 0.19)
 * @param {number} invoiceData.taxAmount - 税额
 * @param {number} invoiceData.total - 总计
 * @param {string} invoiceData.currency - 币种
 * @param {string} invoiceData.notes - 备注
 * @returns {Promise<Buffer>} PDF 文件的 Buffer
 */
export async function generateInvoicePDF(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const { invoiceNumber, date, dueDate, clientName, clientAddress,
              items = [], subtotal, taxRate, taxAmount, total,
              currency = 'EUR', notes } = invoiceData

      const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency
      const fmt = (num) => `${currencySymbol} ${Number(num || 0).toFixed(2)}`

      // ========== 页眉 ==========
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#1a365d').text('EU-TMS', 50, 50)
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text('European Transport Management System', 50, 78)

      doc.fontSize(28).font('Helvetica-Bold').fillColor('#334155')
        .text('INVOICE', 350, 50, { align: 'right' })

      // 分隔线
      doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#cbd5e1').lineWidth(1).stroke()

      // ========== 发票信息 ==========
      let y = 130
      doc.fontSize(10).font('Helvetica').fillColor('#475569')
      doc.text(`Invoice No:`, 350, y)
      doc.font('Helvetica-Bold').text(invoiceNumber || '-', 430, y)
      y += 18
      doc.font('Helvetica').text(`Date:`, 350, y)
      doc.font('Helvetica-Bold').text(date || '-', 430, y)
      y += 18
      doc.font('Helvetica').text(`Due Date:`, 350, y)
      doc.font('Helvetica-Bold').text(dueDate || '-', 430, y)

      // ========== 客户信息 ==========
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Bill To:', 50, 130)
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(clientName || '-', 50, 148)
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text(clientAddress || '', 50, 165, { width: 250 })

      // ========== 明细表格 ==========
      const tableTop = 220
      const colX = { desc: 50, qty: 320, price: 390, amount: 475 }

      // 表头背景
      doc.rect(50, tableTop, 495, 22).fill('#f1f5f9')
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155')
      doc.text('Description', colX.desc + 8, tableTop + 6)
      doc.text('Qty', colX.qty, tableTop + 6, { width: 50, align: 'center' })
      doc.text('Unit Price', colX.price, tableTop + 6, { width: 70, align: 'right' })
      doc.text('Amount', colX.amount, tableTop + 6, { width: 70, align: 'right' })

      // 表格行
      let rowY = tableTop + 28
      doc.font('Helvetica').fontSize(9).fillColor('#475569')

      for (const item of items) {
        if (rowY > 680) {
          doc.addPage()
          rowY = 50
        }
        doc.text(item.description || '', colX.desc + 8, rowY, { width: 260 })
        doc.text(String(item.quantity || 0), colX.qty, rowY, { width: 50, align: 'center' })
        doc.text(fmt(item.unitPrice), colX.price, rowY, { width: 70, align: 'right' })
        doc.text(fmt(item.amount), colX.amount, rowY, { width: 70, align: 'right' })
        rowY += 20
        // 行分隔线
        doc.moveTo(50, rowY - 4).lineTo(545, rowY - 4).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
      }

      // ========== 汇总 ==========
      rowY += 10
      doc.moveTo(350, rowY).lineTo(545, rowY).strokeColor('#cbd5e1').lineWidth(1).stroke()
      rowY += 10

      doc.font('Helvetica').fontSize(10).fillColor('#475569')
      doc.text('Subtotal:', 370, rowY, { width: 95, align: 'right' })
      doc.text(fmt(subtotal), colX.amount, rowY, { width: 70, align: 'right' })
      rowY += 20

      if (taxRate) {
        doc.text(`Tax (${(taxRate * 100).toFixed(0)}%):`, 370, rowY, { width: 95, align: 'right' })
        doc.text(fmt(taxAmount), colX.amount, rowY, { width: 70, align: 'right' })
        rowY += 20
      }

      // 总计
      doc.rect(350, rowY, 195, 24).fill('#1e293b')
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
      doc.text('Total:', 370, rowY + 5, { width: 95, align: 'right' })
      doc.text(fmt(total), colX.amount, rowY + 5, { width: 70, align: 'right' })

      // ========== 页脚 ==========
      rowY += 50
      if (notes) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text('Notes:', 50, rowY)
        rowY += 14
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(notes, 50, rowY, { width: 400 })
        rowY += 30
      }

      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text('Payment Terms: Net 30 days. Please include invoice number in payment reference.', 50, rowY, { width: 400 })

      // 底部分隔线
      doc.moveTo(50, 770).lineTo(545, 770).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
      doc.fontSize(8).fillColor('#94a3b8')
        .text('Generated by EU-TMS | European Transport Management System', 50, 778, { align: 'center', width: 495 })

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

export default { generateInvoicePDF }
