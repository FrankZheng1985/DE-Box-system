/**
 * 凭证引擎 (Document Engine)
 * SAP 对标: Belegprinzip (凭证原则)
 *
 * 这是整个 ERP 系统的核心引擎。
 *
 * 核心规则：
 * 1. 每笔业务操作产生一个不可变的凭证
 * 2. 凭证一旦过账，只能通过「冲销」纠正，禁止 UPDATE/DELETE
 * 3. 每个凭证由「凭证类型 + 凭证编号 + 会计年度 + 公司代码」唯一标识
 *
 * 凭证类型对照：
 *   ORD    - 运输订单        INQ    - 询价单
 *   QUO    - 报价单          SRV    - 服务确认
 *   CMR    - CMR 单据        FI_AR  - 应收发票
 *   FI_AP  - 应付发票        FI_PAY - 付款凭证
 *   FI_REC - 收款凭证        FI_REV - 冲销凭证
 *   REL    - 放单记录        CUS    - 清关记录
 */

import numberRange from './number-range.js'
import postingPeriod from './posting-period.js'
import changeTracker from './change-tracker.js'
import documentFlow from './document-flow.js'

export class DocumentEngine {

  /**
   * 创建凭证（核心方法，所有业务操作必须通过此方法）
   * @param {object} client - 数据库事务客户端（必须在事务中）
   * @param {object} params
   * @param {string} params.docType - 凭证类型
   * @param {string} params.companyCode - 公司代码
   * @param {Date|string} params.postingDate - 过账日期
   * @param {Date|string} [params.documentDate] - 凭证日期（默认=过账日期）
   * @param {string} [params.reference] - 外部参考号
   * @param {string} [params.headerText] - 凭证说明
   * @param {string} [params.sourceDocType] - 来源凭证类型
   * @param {string} [params.sourceDocId] - 来源凭证 ID
   * @param {number} [params.flowAmount] - 本次流转涉及的金额（写进自动建的单据流，仅在有来源凭证时生效）
   * @param {string} [params.flowCurrency] - 本次流转涉及的币种（同上）
   * @param {string} params.createdBy - 操作人 ID
   * @param {boolean} [params.parked=false] - 是否暂存（不过账）
   * @returns {Promise<{id: string, docNumber: string, status: string}>}
   */
  async createDocument(client, {
    docType,
    companyCode,
    postingDate,
    documentDate,
    reference,
    headerText,
    sourceDocType,
    sourceDocId,
    flowAmount,
    flowCurrency,
    createdBy,
    parked = false
  }) {
    const pDate = new Date(postingDate)
    const dDate = documentDate ? new Date(documentDate) : pDate
    const fiscalYear = pDate.getFullYear()

    // 步骤 1：过账期间检查（暂存凭证不检查期间）
    if (!parked) {
      // 根据凭证类型确定科目类型
      const accountType = this._getAccountTypeForDocType(docType)
      await postingPeriod.assertPeriodOpen(client, companyCode, pDate, accountType)
    }

    // 步骤 2：生成凭证编号
    const { docNumber } = await numberRange.getNextNumber(client, docType, companyCode, fiscalYear)

    // 步骤 3：写入凭证主表
    const status = parked ? 'PARKED' : 'POSTED'
    const result = await client.query(
      `INSERT INTO documents
       (doc_number, doc_type, fiscal_year, posting_date, document_date,
        company_code, reference, header_text,
        source_doc_type, source_doc_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [docNumber, docType, fiscalYear, pDate, dDate,
       companyCode, reference, headerText,
       sourceDocType, sourceDocId, status, createdBy]
    )
    const docId = result.rows[0].id

    // 步骤 4：如果有来源凭证，更新单据流
    // 这里是单据流的【第一个】写入方，金额必须在这一步就带上：
    // 业务层事后再调 createFlowLink 补金额会撞唯一约束，历史上被 DO NOTHING 整条丢弃（踩坑 017）
    if (sourceDocType && sourceDocId) {
      const flowType = `${sourceDocType}_TO_${docType}`
      await documentFlow.createFlowLink(client, {
        precedingDocType: sourceDocType,
        precedingDocId: sourceDocId,
        subsequentDocType: docType,
        subsequentDocId: docId,
        flowType,
        amount: flowAmount,
        currency: flowCurrency
      })
    }

    // 步骤 5：记录变更日志
    await changeTracker.trackChanges(client, {
      objectType: 'DOCUMENT',
      objectId: docId,
      changeType: 'INSERT',
      transactionType: `CREATE_${docType}`,
      tableName: 'documents',
      newData: { doc_number: docNumber, doc_type: docType, status, company_code: companyCode },
      trackedFields: [
        { name: 'doc_number', label: '凭证编号' },
        { name: 'doc_type', label: '凭证类型' },
        { name: 'status', label: '状态' },
        { name: 'company_code', label: '公司代码' }
      ],
      changedBy: createdBy
    })

    return { id: docId, docNumber, status }
  }

  /**
   * 冲销凭证（不是删除，是产生反向凭证）
   * @param {object} client - 数据库事务客户端
   * @param {object} params
   * @param {string} params.originalDocId - 被冲销的凭证 ID
   * @param {string} params.reversalReason - 冲销原因（必填）
   * @param {Date|string} params.postingDate - 冲销过账日期
   * @param {string} params.createdBy - 操作人 ID
   * @returns {Promise<{id: string, docNumber: string}>}
   */
  async reverseDocument(client, {
    originalDocId,
    reversalReason,
    postingDate,
    createdBy
  }) {
    if (!reversalReason) {
      throw new Error('冲销原因不能为空')
    }

    // 步骤 1：获取原凭证
    const origResult = await client.query(
      `SELECT * FROM documents WHERE id = $1`, [originalDocId]
    )
    if (origResult.rows.length === 0) {
      throw new Error(`凭证不存在: ${originalDocId}`)
    }
    const original = origResult.rows[0]

    // 步骤 2：检查原凭证状态
    if (original.status === 'REVERSED') {
      throw new Error(`凭证已被冲销: ${original.doc_number}`)
    }
    if (original.status === 'PARKED') {
      throw new Error(`暂存凭证不能冲销，请直接删除`)
    }

    // 步骤 3：创建冲销凭证
    const reversal = await this.createDocument(client, {
      docType: 'FI_REV',
      companyCode: original.company_code,
      postingDate,
      documentDate: new Date(),
      reference: `冲销 ${original.doc_number}`,
      headerText: `冲销: ${reversalReason}`,
      sourceDocType: original.doc_type,
      sourceDocId: originalDocId,
      createdBy
    })

    // 步骤 4：更新冲销凭证的冲销关系字段
    await client.query(
      `UPDATE documents SET is_reversal = true, reversed_doc_id = $1, reversal_reason = $2
       WHERE id = $3`,
      [originalDocId, reversalReason, reversal.id]
    )

    // 步骤 5：标记原凭证为已冲销
    await client.query(
      `UPDATE documents SET status = 'REVERSED' WHERE id = $1`,
      [originalDocId]
    )

    // 步骤 6：记录变更
    await changeTracker.trackChanges(client, {
      objectType: 'DOCUMENT',
      objectId: originalDocId,
      changeType: 'STATUS_CHANGE',
      transactionType: 'REVERSE_DOCUMENT',
      tableName: 'documents',
      oldData: { status: 'POSTED' },
      newData: { status: 'REVERSED' },
      trackedFields: [{ name: 'status', label: '状态' }],
      changedBy: createdBy,
      changeReason: reversalReason
    })

    return { id: reversal.id, docNumber: reversal.docNumber }
  }

  /**
   * 过账暂存凭证
   */
  async postParkedDocument(client, docId, createdBy) {
    const result = await client.query(
      `SELECT * FROM documents WHERE id = $1`, [docId]
    )
    if (result.rows.length === 0) throw new Error(`凭证不存在: ${docId}`)
    if (result.rows[0].status !== 'PARKED') throw new Error('只有暂存凭证可以过账')

    // 过账期间检查
    const doc = result.rows[0]
    const accountType = this._getAccountTypeForDocType(doc.doc_type)
    await postingPeriod.assertPeriodOpen(client, doc.company_code, doc.posting_date, accountType)

    // 更新状态
    await client.query(`UPDATE documents SET status = 'POSTED' WHERE id = $1`, [docId])

    await changeTracker.trackChanges(client, {
      objectType: 'DOCUMENT',
      objectId: docId,
      changeType: 'STATUS_CHANGE',
      transactionType: 'POST_DOCUMENT',
      tableName: 'documents',
      oldData: { status: 'PARKED' },
      newData: { status: 'POSTED' },
      trackedFields: [{ name: 'status', label: '状态' }],
      changedBy: createdBy
    })
  }

  /**
   * 获取凭证详情
   */
  async getDocument(client, docId) {
    const result = await client.query(
      `SELECT d.*, u.display_name as created_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.id = $1`,
      [docId]
    )
    return result.rows[0] || null
  }

  /**
   * 获取凭证的完整单据流
   */
  async getDocumentFlow(client, docId) {
    return documentFlow.getFullDocumentFlow(client, docId)
  }

  // 根据凭证类型确定会计科目类型（用于过账期间检查）
  _getAccountTypeForDocType(docType) {
    const mapping = {
      'FI_AR': 'RECEIVABLE',
      'FI_REC': 'RECEIVABLE',
      'FI_AP': 'PAYABLE',
      'FI_PAY': 'PAYABLE',
      'FI_REV': 'ALL'
    }
    return mapping[docType] || 'ALL'
  }
}

export default new DocumentEngine()
