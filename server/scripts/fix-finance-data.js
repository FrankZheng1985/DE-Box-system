/**
 * 修复脚本：为已完成订单补录缺失的应收/应付记录
 */
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

import { documentEngine, accountDetermination } from '../core/index.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function main() {
  const client = await pool.connect()
  try {
    // 找到管理员用户ID
    const admin = await client.query("SELECT id FROM users WHERE username = 'admin'")
    const adminId = admin.rows[0].id

    // 找已完成订单
    const orders = await client.query(`
      SELECT o.id, o.order_number, o.client_id, o.carrier_id,
             o.client_price, o.carrier_cost, o.currency, o.business_type, o.document_id
      FROM orders o WHERE o.status = 'COMPLETED'
    `)
    console.log(`已完成订单: ${orders.rows.length} 个`)

    for (const order of orders.rows) {
      const clientPrice = parseFloat(order.client_price) || 0
      const carrierCost = parseFloat(order.carrier_cost) || 0
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

      // 检查是否已有应收
      const existingAR = await client.query(
        `SELECT id FROM financial_records WHERE order_id = $1 AND type = 'RECEIVABLE'`, [order.id]
      )
      if (existingAR.rows.length === 0 && clientPrice > 0 && order.client_id) {
        await client.query('BEGIN')
        const arDoc = await documentEngine.createDocument(client, {
          docType: 'FI_AR', companyCode: 'DE01', postingDate: new Date(),
          headerText: `应收补录 - ${order.order_number}`,
          sourceDocType: 'ORD', sourceDocId: order.document_id,
          createdBy: adminId
        })
        await accountDetermination.createJournalEntries(client, {
          documentId: arDoc.id, transactionType: 'AR_INVOICE',
          businessType: order.business_type, amount: clientPrice,
          currency: order.currency || 'EUR', postingDate: new Date(), companyCode: 'DE01',
          subledgerType: 'CLIENT', subledgerId: order.client_id, orderId: order.id
        })
        await client.query(
          `INSERT INTO financial_records
           (document_id, record_number, order_id, type, counterparty_type, counterparty_id,
            amount, currency, payment_status, due_date, company_code, auto_generated)
           VALUES ($1, $2, $3, 'RECEIVABLE', 'CLIENT', $4, $5, $6, 'UNPAID', $7, 'DE01', true)`,
          [arDoc.id, arDoc.docNumber, order.id, order.client_id, clientPrice, order.currency || 'EUR', dueDate]
        )
        await client.query('COMMIT')
        console.log(`  [补录应收] ${order.order_number} → €${clientPrice}`)
      }

      // 检查是否已有应付
      const existingAP = await client.query(
        `SELECT id FROM financial_records WHERE order_id = $1 AND type = 'PAYABLE'`, [order.id]
      )
      if (existingAP.rows.length === 0 && carrierCost > 0 && order.carrier_id) {
        await client.query('BEGIN')
        const apDoc = await documentEngine.createDocument(client, {
          docType: 'FI_AP', companyCode: 'DE01', postingDate: new Date(),
          headerText: `应付补录 - ${order.order_number}`,
          sourceDocType: 'ORD', sourceDocId: order.document_id,
          createdBy: adminId
        })
        await accountDetermination.createJournalEntries(client, {
          documentId: apDoc.id, transactionType: 'AP_INVOICE',
          businessType: order.business_type, amount: carrierCost,
          currency: order.currency || 'EUR', postingDate: new Date(), companyCode: 'DE01',
          subledgerType: 'CARRIER', subledgerId: order.carrier_id, orderId: order.id
        })
        await client.query(
          `INSERT INTO financial_records
           (document_id, record_number, order_id, type, counterparty_type, counterparty_id,
            amount, currency, payment_status, due_date, company_code, auto_generated)
           VALUES ($1, $2, $3, 'PAYABLE', 'CARRIER', $4, $5, $6, 'UNPAID', $7, 'DE01', true)`,
          [apDoc.id, apDoc.docNumber, order.id, order.carrier_id, carrierCost, order.currency || 'EUR', dueDate]
        )
        await client.query('COMMIT')
        console.log(`  [补录应付] ${order.order_number} → €${carrierCost}`)
      }
    }

    // 验证
    const all = await client.query(`SELECT type, COUNT(*) as cnt, SUM(amount) as total FROM financial_records GROUP BY type`)
    console.log('\n最终财务记录:')
    all.rows.forEach(r => console.log(`  ${r.type}: ${r.cnt} 条, 合计 €${r.total}`))

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('错误:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
