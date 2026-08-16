/**
 * 单据流引擎 (Document Flow Engine)
 * SAP 对标: VBFA (单据流表)
 *
 * 功能：
 * - 记录凭证之间的引用关系（前序→后续）
 * - 支持完整链路追溯（向前+向后）
 * - 支持部分处理（一个订单拆多个提单）
 */

export class DocumentFlowEngine {

  /**
   * 创建单据流关系
   * @param {object} client - 数据库事务客户端
   * @param {object} params
   * @param {string} params.precedingDocType - 前序凭证类型
   * @param {string} params.precedingDocId - 前序凭证 ID
   * @param {string} params.subsequentDocType - 后续凭证类型
   * @param {string} params.subsequentDocId - 后续凭证 ID
   * @param {string} params.flowType - 关系类型
   * @param {number} [params.quantity] - 涉及数量
   * @param {number} [params.amount] - 涉及金额
   * @param {string} [params.currency] - 币种
   */
  async createFlowLink(client, {
    precedingDocType,
    precedingDocId,
    subsequentDocType,
    subsequentDocId,
    flowType,
    quantity,
    amount,
    currency
  }) {
    // 同一对凭证的连线可能被写两次（凭证引擎自动建一条 + 业务层再补一条）。
    // 原来是 DO NOTHING，第二次连同它带来的 amount/currency 一起被静默丢弃，
    // 结果所有 QUO→ORD 连线的金额长期是 NULL（踩坑 017）。
    // 改成只补空值：已有值不动，NULL 才用新值填上。
    // flow_type 刻意不覆盖 —— 两个写入方用的名字不一样（QUO_TO_ORD / QUOTATION_TO_ORDER），
    // 覆盖会让库里的取值在两者之间反复横跳，按字面值 WHERE 的迁移和查询会再次落空。
    await client.query(
      `INSERT INTO document_flow
       (preceding_doc_type, preceding_doc_id, subsequent_doc_type, subsequent_doc_id,
        flow_type, quantity, amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (preceding_doc_id, subsequent_doc_id) DO UPDATE SET
         quantity = COALESCE(document_flow.quantity, EXCLUDED.quantity),
         amount   = COALESCE(document_flow.amount,   EXCLUDED.amount),
         currency = COALESCE(document_flow.currency, EXCLUDED.currency)`,
      [precedingDocType, precedingDocId, subsequentDocType, subsequentDocId,
       flowType, quantity, amount, currency]
    )
  }

  /**
   * 获取完整单据流（从任意节点出发，向前+向后递归）
   * @param {object} client - 数据库客户端
   * @param {string} docId - 任意凭证 ID
   * @returns {Promise<{preceding: Array, subsequent: Array}>}
   */
  async getFullDocumentFlow(client, docId) {
    // 向前追溯（查找所有前序凭证）
    const preceding = await client.query(
      `WITH RECURSIVE flow AS (
         SELECT df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, 1 as depth
         FROM document_flow df
         WHERE df.subsequent_doc_id = $1
         UNION ALL
         SELECT df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, f.depth + 1
         FROM document_flow df
         JOIN flow f ON df.subsequent_doc_id = f.preceding_doc_id
         WHERE f.depth < 10
       )
       SELECT * FROM flow ORDER BY depth DESC`,
      [docId]
    )

    // 向后追溯（查找所有后续凭证）
    const subsequent = await client.query(
      `WITH RECURSIVE flow AS (
         SELECT df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, 1 as depth
         FROM document_flow df
         WHERE df.preceding_doc_id = $1
         UNION ALL
         SELECT df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, f.depth + 1
         FROM document_flow df
         JOIN flow f ON df.preceding_doc_id = f.subsequent_doc_id
         WHERE f.depth < 10
       )
       SELECT * FROM flow ORDER BY depth ASC`,
      [docId]
    )

    return {
      preceding: preceding.rows,
      subsequent: subsequent.rows
    }
  }

  /**
   * 获取直接关联的后续凭证（不递归）
   */
  async getDirectSubsequent(client, docId, docType) {
    const params = [docId]
    let sql = `SELECT * FROM document_flow WHERE preceding_doc_id = $1`
    if (docType) {
      sql += ` AND subsequent_doc_type = $2`
      params.push(docType)
    }
    const result = await client.query(sql, params)
    return result.rows
  }

  /**
   * 获取直接关联的前序凭证（不递归）
   */
  async getDirectPreceding(client, docId, docType) {
    const params = [docId]
    let sql = `SELECT * FROM document_flow WHERE subsequent_doc_id = $1`
    if (docType) {
      sql += ` AND preceding_doc_type = $2`
      params.push(docType)
    }
    const result = await client.query(sql, params)
    return result.rows
  }
}

export default new DocumentFlowEngine()
