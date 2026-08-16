/**
 * 单据流引擎 (Document Flow Engine)
 * SAP 对标: VBFA (单据流表)
 *
 * 功能：
 * - 记录凭证之间的引用关系（前序→后续）
 * - 支持完整链路追溯（向前+向后）
 * - 支持部分处理（一个订单拆多个提单）
 */

/**
 * 单据流查询的公共补充字段。
 *
 * document_flow 里只有凭证 UUID，没有单号也没有业务主键，前端拿到
 * 一串 UUID 什么也显示不出来。这里统一把「对端凭证」补齐：
 *   - doc_number / doc_type / doc_status 来自 documents 表（用 LEFT JOIN，
 *     上游凭证被删过会留下悬空引用，内连接会让整行凭空消失，见踩坑 061）
 *   - entity_id 是对应业务单据的主键（订单/报价/询价/财务记录），
 *     前端跳详情页只能用它，不能用凭证 id
 *
 * @param {'preceding'|'subsequent'} side - 对端在 document_flow 里的哪一侧
 */
function farSideColumns(side) {
  return `
    f.flow_id, f.flow_type, f.amount, f.currency, f.depth,
    f.preceding_doc_type, f.preceding_doc_id,
    f.subsequent_doc_type, f.subsequent_doc_id,
    f.${side}_doc_id AS doc_id,
    COALESCE(d.doc_type, f.${side}_doc_type) AS doc_type,
    d.doc_number,
    d.status AS doc_status,
    CASE d.doc_type
      WHEN 'ORD'   THEN (SELECT o.id  FROM orders o             WHERE o.document_id  = d.id LIMIT 1)
      WHEN 'QUO'   THEN (SELECT q.id  FROM quotations q         WHERE q.document_id  = d.id LIMIT 1)
      WHEN 'INQ'   THEN (SELECT i.id  FROM inquiries i          WHERE i.document_id  = d.id LIMIT 1)
      WHEN 'CMR'   THEN (SELECT c.id  FROM cmr_documents c      WHERE c.document_id  = d.id LIMIT 1)
      WHEN 'FI_AR' THEN (SELECT fr.id FROM financial_records fr WHERE fr.document_id = d.id LIMIT 1)
      WHEN 'FI_AP' THEN (SELECT fr.id FROM financial_records fr WHERE fr.document_id = d.id LIMIT 1)
      ELSE NULL
    END AS entity_id
  `
}

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
   *
   * 每行除了 document_flow 原有字段，还带上「对端凭证」的展示信息：
   * doc_id / doc_type / doc_number / doc_status / entity_id（见 farSideColumns）。
   *
   * @param {object} client - 数据库客户端
   * @param {string} docId - 任意凭证 ID
   * @returns {Promise<{preceding: Array, subsequent: Array}>}
   */
  async getFullDocumentFlow(client, docId) {
    // 向前追溯（查找所有前序凭证）
    const preceding = await client.query(
      `WITH RECURSIVE flow AS (
         SELECT df.id AS flow_id,
                df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, 1 as depth
         FROM document_flow df
         WHERE df.subsequent_doc_id = $1
         UNION ALL
         SELECT df.id AS flow_id,
                df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, f.depth + 1
         FROM document_flow df
         JOIN flow f ON df.subsequent_doc_id = f.preceding_doc_id
         WHERE f.depth < 10
       )
       SELECT ${farSideColumns('preceding')}
       FROM flow f
       LEFT JOIN documents d ON d.id = f.preceding_doc_id
       ORDER BY f.depth DESC`,
      [docId]
    )

    // 向后追溯（查找所有后续凭证）
    const subsequent = await client.query(
      `WITH RECURSIVE flow AS (
         SELECT df.id AS flow_id,
                df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, 1 as depth
         FROM document_flow df
         WHERE df.preceding_doc_id = $1
         UNION ALL
         SELECT df.id AS flow_id,
                df.preceding_doc_type, df.preceding_doc_id,
                df.subsequent_doc_type, df.subsequent_doc_id,
                df.flow_type, df.amount, df.currency, f.depth + 1
         FROM document_flow df
         JOIN flow f ON df.preceding_doc_id = f.subsequent_doc_id
         WHERE f.depth < 10
       )
       SELECT ${farSideColumns('subsequent')}
       FROM flow f
       LEFT JOIN documents d ON d.id = f.subsequent_doc_id
       ORDER BY f.depth ASC`,
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
