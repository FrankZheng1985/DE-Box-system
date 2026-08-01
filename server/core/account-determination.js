/**
 * 自动科目确定 (Account Determination)
 * SAP 对标: VKOA (销售收入科目确定)
 *
 * 功能：
 * - 根据业务交易类型自动确定借贷科目
 * - 搜索策略：先按具体 businessType 查找，再按 ALL 查找
 * - 自动生成会计分录（日记账行项目）
 */

export class AccountDetermination {

  /**
   * 根据业务交易类型确定会计科目
   * @param {object} client - 数据库客户端
   * @param {string} transactionType - 交易类型 (AR_INVOICE/AP_INVOICE/AR_PAYMENT 等)
   * @param {string} [businessType='ALL'] - 业务类型 (TRUCK_LTL/TRUCK_FTL/LOCAL_DELIVERY/ALL)
   * @returns {Promise<{debitAccount: string, creditAccount: string, description: string}>}
   */
  async determineAccounts(client, transactionType, businessType = 'ALL') {
    // 先按具体 businessType 查找
    let result = await client.query(
      `SELECT debit_account, credit_account, description
       FROM account_determination_rules
       WHERE transaction_type = $1 AND business_type = $2`,
      [transactionType, businessType]
    )

    // 找不到则按 ALL 查找
    if (result.rows.length === 0 && businessType !== 'ALL') {
      result = await client.query(
        `SELECT debit_account, credit_account, description
         FROM account_determination_rules
         WHERE transaction_type = $1 AND business_type = 'ALL'`,
        [transactionType]
      )
    }

    if (result.rows.length === 0) {
      throw new Error(`科目确定规则未配置: ${transactionType}/${businessType}`)
    }

    return {
      debitAccount: result.rows[0].debit_account,
      creditAccount: result.rows[0].credit_account,
      description: result.rows[0].description
    }
  }

  /**
   * 写入会计分录（日记账行项目）
   * 每笔分录至少有借贷两行，借贷必须平衡
   * @param {object} client - 数据库事务客户端
   * @param {object} params
   * @param {string} params.documentId - 关联的凭证 ID
   * @param {string} params.transactionType - 交易类型
   * @param {string} params.businessType - 业务类型
   * @param {number} params.amount - 金额（正数）
   * @param {string} params.currency - 币种
   * @param {Date|string} params.postingDate - 过账日期
   * @param {string} params.companyCode - 公司代码
   * @param {string} [params.subledgerType] - 子账簿类型 (CLIENT/CARRIER)
   * @param {string} [params.subledgerId] - 子账簿 ID (客户ID/承运商ID)
   * @param {string} [params.orderId] - 关联订单 ID
   */
  async createJournalEntries(client, {
    documentId,
    transactionType,
    businessType,
    amount,
    currency,
    postingDate,
    companyCode,
    subledgerType,
    subledgerId,
    orderId
  }) {
    // 自动确定科目
    const accounts = await this.determineAccounts(client, transactionType, businessType)
    const date = new Date(postingDate)
    const fiscalYear = date.getFullYear()
    const periodMonth = date.getMonth() + 1

    // 借方行 (Line 1)
    await client.query(
      `INSERT INTO journal_entries
       (document_id, line_number, account_code, debit_credit, amount, currency,
        local_amount, subledger_type, subledger_id, order_id, business_type,
        posting_date, fiscal_year, period_month, company_code)
       VALUES ($1, 1, $2, 'D', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [documentId, accounts.debitAccount, Math.abs(amount), currency, Math.abs(amount),
       subledgerType, subledgerId, orderId, businessType,
       postingDate, fiscalYear, periodMonth, companyCode]
    )

    // 贷方行 (Line 2)
    await client.query(
      `INSERT INTO journal_entries
       (document_id, line_number, account_code, debit_credit, amount, currency,
        local_amount, subledger_type, subledger_id, order_id, business_type,
        posting_date, fiscal_year, period_month, company_code)
       VALUES ($1, 2, $2, 'C', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [documentId, accounts.creditAccount, Math.abs(amount), currency, Math.abs(amount),
       subledgerType, subledgerId, orderId, businessType,
       postingDate, fiscalYear, periodMonth, companyCode]
    )

    return accounts
  }

  /**
   * 获取科目余额（子账簿级别）
   */
  async getSubledgerBalance(client, subledgerType, subledgerId) {
    const result = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN debit_credit = 'D' THEN amount ELSE 0 END), 0) as total_debit,
         COALESCE(SUM(CASE WHEN debit_credit = 'C' THEN amount ELSE 0 END), 0) as total_credit
       FROM journal_entries
       WHERE subledger_type = $1 AND subledger_id = $2`,
      [subledgerType, subledgerId]
    )
    const row = result.rows[0]
    return {
      totalDebit: parseFloat(row.total_debit),
      totalCredit: parseFloat(row.total_credit),
      balance: parseFloat(row.total_debit) - parseFloat(row.total_credit)
    }
  }

  /**
   * 获取科目余额（总账级别）
   */
  async getAccountBalance(client, accountCode, companyCode, fiscalYear, periodMonth) {
    let sql = `
      SELECT
        COALESCE(SUM(CASE WHEN debit_credit = 'D' THEN amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN debit_credit = 'C' THEN amount ELSE 0 END), 0) as total_credit
      FROM journal_entries
      WHERE account_code = $1 AND company_code = $2`
    const params = [accountCode, companyCode]

    if (fiscalYear) {
      sql += ` AND fiscal_year = $${params.length + 1}`
      params.push(fiscalYear)
    }
    if (periodMonth) {
      sql += ` AND period_month = $${params.length + 1}`
      params.push(periodMonth)
    }

    const result = await client.query(sql, params)
    const row = result.rows[0]
    return {
      totalDebit: parseFloat(row.total_debit),
      totalCredit: parseFloat(row.total_credit),
      balance: parseFloat(row.total_debit) - parseFloat(row.total_credit)
    }
  }
}

export default new AccountDetermination()
