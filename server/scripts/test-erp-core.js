/**
 * ERP 内核引擎集成测试
 * 测试凭证引擎、编号范围、单据流、变更追踪等核心功能
 *
 * 运行方式: node scripts/test-erp-core.js
 */

import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env') })

import {
  documentEngine, documentFlow, numberRange,
  changeTracker, postingPeriod, accountDetermination,
  creditManager, pricingEngine
} from '../core/index.js'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

let passed = 0
let failed = 0

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`)
    passed++
  } else {
    console.log(`  ✗ ${testName}`)
    failed++
  }
}

async function runTests() {
  const client = await pool.connect()

  try {
    console.log('========================================')
    console.log('  ERP 内核引擎集成测试')
    console.log('========================================\n')

    // 获取 admin 用户 ID
    const adminResult = await client.query("SELECT id FROM users WHERE username = 'admin'")
    const adminId = adminResult.rows[0].id

    // ================ 测试 1: 编号范围 ================
    console.log('📋 测试 1: 编号范围管理')
    await client.query('BEGIN')
    try {
      const num1 = await numberRange.getNextNumber(client, 'ORD', 'DE01')
      assert(num1.docNumber.startsWith('EU-'), `生成订单编号: ${num1.docNumber}`)
      assert(num1.sequence > 0, `序号正确: ${num1.sequence}`)

      const num2 = await numberRange.getNextNumber(client, 'ORD', 'DE01')
      assert(num2.sequence === num1.sequence + 1, `连续递增: ${num1.sequence} → ${num2.sequence}`)

      const num3 = await numberRange.getNextNumber(client, 'FI_AR', 'DE01')
      assert(num3.docNumber.startsWith('INV-'), `生成发票编号: ${num3.docNumber}`)

      await client.query('ROLLBACK') // 不影响实际数据
    } catch (err) {
      await client.query('ROLLBACK')
      console.log(`  ✗ 编号范围测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 2: 过账期间 ================
    console.log('\n📋 测试 2: 过账期间控制')
    try {
      // 当前月（4月）应该是开放的
      const check1 = await postingPeriod.checkPeriod(client, 'DE01', new Date(), 'ALL')
      assert(check1.isOpen === true, `当前月(4月)期间开放: ${check1.isOpen}`)

      // 1月应该是关闭的
      const check2 = await postingPeriod.checkPeriod(client, 'DE01', '2026-01-15', 'ALL')
      assert(check2.isOpen === false, `1月期间关闭: ${check2.isOpen}`)
      assert(check2.message.includes('已关闭'), `关闭消息正确`)
    } catch (err) {
      console.log(`  ✗ 过账期间测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 3: 凭证引擎 ================
    console.log('\n📋 测试 3: 凭证引擎')
    await client.query('BEGIN')
    try {
      // 创建凭证
      const doc = await documentEngine.createDocument(client, {
        docType: 'ORD',
        companyCode: 'DE01',
        postingDate: new Date(),
        headerText: '测试运输订单',
        createdBy: adminId
      })
      assert(doc.id !== null, `凭证创建成功: ${doc.docNumber}`)
      assert(doc.status === 'POSTED', `凭证状态: ${doc.status}`)

      // 查询凭证
      const fetched = await documentEngine.getDocument(client, doc.id)
      assert(fetched !== null, `凭证查询成功`)
      assert(fetched.doc_type === 'ORD', `凭证类型: ${fetched.doc_type}`)

      // 冲销凭证
      const reversal = await documentEngine.reverseDocument(client, {
        originalDocId: doc.id,
        reversalReason: '测试冲销',
        postingDate: new Date(),
        createdBy: adminId
      })
      assert(reversal.docNumber.startsWith('REV-'), `冲销凭证: ${reversal.docNumber}`)

      // 验证原凭证状态
      const orig = await documentEngine.getDocument(client, doc.id)
      assert(orig.status === 'REVERSED', `原凭证已标记冲销: ${orig.status}`)

      // 验证不能重复冲销
      try {
        await documentEngine.reverseDocument(client, {
          originalDocId: doc.id,
          reversalReason: '重复冲销',
          postingDate: new Date(),
          createdBy: adminId
        })
        assert(false, '重复冲销应该报错')
      } catch (e) {
        assert(e.message.includes('已被冲销'), `重复冲销被拒绝: ${e.message}`)
      }

      await client.query('ROLLBACK')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log(`  ✗ 凭证引擎测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 4: 单据流 ================
    console.log('\n📋 测试 4: 单据流引擎')
    await client.query('BEGIN')
    try {
      // 创建两个关联凭证（报价→订单）
      const quo = await documentEngine.createDocument(client, {
        docType: 'QUO',
        companyCode: 'DE01',
        postingDate: new Date(),
        headerText: '测试报价',
        createdBy: adminId
      })

      const ord = await documentEngine.createDocument(client, {
        docType: 'ORD',
        companyCode: 'DE01',
        postingDate: new Date(),
        headerText: '测试订单',
        sourceDocType: 'QUO',
        sourceDocId: quo.id,
        createdBy: adminId
      })

      // 查询单据流
      const flow = await documentFlow.getFullDocumentFlow(client, ord.id)
      assert(flow.preceding.length > 0, `向前追溯找到报价: ${flow.preceding.length} 条`)
      assert(flow.preceding[0].preceding_doc_type === 'QUO', `前序类型: QUO`)

      const flow2 = await documentFlow.getFullDocumentFlow(client, quo.id)
      assert(flow2.subsequent.length > 0, `向后追溯找到订单: ${flow2.subsequent.length} 条`)

      await client.query('ROLLBACK')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log(`  ✗ 单据流测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 5: 变更追踪 ================
    console.log('\n📋 测试 5: 变更凭证追踪')
    await client.query('BEGIN')
    try {
      const changeId = await changeTracker.trackChanges(client, {
        objectType: 'ORDER',
        objectId: 'test-order-001',
        changeType: 'UPDATE',
        transactionType: 'UPDATE_ORDER',
        tableName: 'orders',
        oldData: { status: 'PENDING_REVIEW', carrier_id: null },
        newData: { status: 'ASSIGNED', carrier_id: 'carrier-001' },
        trackedFields: [
          { name: 'status', label: '订单状态' },
          { name: 'carrier_id', label: '承运商' }
        ],
        changedBy: adminId
      })
      assert(changeId !== null, `变更凭证创建: ${changeId}`)

      const history = await changeTracker.getChangeHistory(client, 'ORDER', 'test-order-001')
      assert(history.length > 0, `变更历史查询: ${history.length} 条`)
      assert(history[0].items.length === 2, `字段级变更: ${history[0].items.length} 个字段`)

      await client.query('ROLLBACK')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log(`  ✗ 变更追踪测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 6: 科目确定 ================
    console.log('\n📋 测试 6: 自动科目确定')
    try {
      const accounts1 = await accountDetermination.determineAccounts(client, 'AR_INVOICE', 'CURTAIN_SIDE')
      assert(accounts1.debitAccount === '1210', `篷布车应收借方: ${accounts1.debitAccount}`)
      assert(accounts1.creditAccount === '4100', `篷布车应收贷方: ${accounts1.creditAccount}`)

      const accounts2 = await accountDetermination.determineAccounts(client, 'AP_INVOICE', 'CONTAINER')
      assert(accounts2.debitAccount === '5200', `集装箱应付借方: ${accounts2.debitAccount}`)
      assert(accounts2.creditAccount === '2100', `集装箱应付贷方: ${accounts2.creditAccount}`)

      const accounts3 = await accountDetermination.determineAccounts(client, 'AR_PAYMENT', 'ALL')
      assert(accounts3.debitAccount === '1100', `收款借方(银行): ${accounts3.debitAccount}`)
    } catch (err) {
      console.log(`  ✗ 科目确定测试失败: ${err.message}`)
      failed++
    }

    // ================ 测试 7: 定价引擎配置 ================
    console.log('\n📋 测试 7: 定价引擎')
    try {
      const config = await pricingEngine.getProcedureConfig(client, 'CURTAIN_SIDE')
      assert(config.procedure !== null, `篷布车定价过程: ${config.procedure.procedure_name}`)
      assert(config.steps.length > 0, `定价步骤: ${config.steps.length} 个`)

      const config2 = await pricingEngine.getProcedureConfig(client, 'CONTAINER')
      assert(config2.steps.length > 0, `集装箱定价步骤: ${config2.steps.length} 个`)
    } catch (err) {
      console.log(`  ✗ 定价引擎测试失败: ${err.message}`)
      failed++
    }

    // ================ 汇总 ================
    console.log('\n========================================')
    console.log(`  测试完成: ${passed} 通过, ${failed} 失败`)
    console.log('========================================')

  } catch (err) {
    console.error('测试执行错误:', err)
  } finally {
    client.release()
    await pool.end()
    process.exit(failed > 0 ? 1 : 0)
  }
}

runTests()
