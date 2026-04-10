/**
 * 过账期间控制 (Posting Period Manager)
 * SAP 对标: OB52 (过账期间维护)
 *
 * 功能：
 * - 控制哪些会计期间对过账开放/关闭
 * - 防止对已结账月份的误操作
 * - 支持按科目类型差异化控制
 */

export class PostingPeriodManager {

  /**
   * 检查过账期间是否开放
   * @param {object} client - 数据库客户端
   * @param {string} companyCode - 公司代码
   * @param {Date|string} postingDate - 过账日期
   * @param {string} [accountType='ALL'] - 科目类型
   * @returns {Promise<{isOpen: boolean, message: string}>}
   */
  async checkPeriod(client, companyCode, postingDate, accountType = 'ALL') {
    const date = new Date(postingDate)
    const fiscalYear = date.getFullYear()
    const periodMonth = date.getMonth() + 1

    // 先查具体科目类型的期间
    let result = await client.query(
      `SELECT is_open FROM posting_periods
       WHERE company_code = $1 AND fiscal_year = $2
             AND period_month = $3 AND account_type = $4`,
      [companyCode, fiscalYear, periodMonth, accountType]
    )

    // 找不到具体类型，查 ALL
    if (result.rows.length === 0 && accountType !== 'ALL') {
      result = await client.query(
        `SELECT is_open FROM posting_periods
         WHERE company_code = $1 AND fiscal_year = $2
               AND period_month = $3 AND account_type = 'ALL'`,
        [companyCode, fiscalYear, periodMonth]
      )
    }

    if (result.rows.length === 0) {
      return {
        isOpen: false,
        message: `过账期间未配置: ${companyCode}/${fiscalYear}/${periodMonth}`
      }
    }

    if (!result.rows[0].is_open) {
      return {
        isOpen: false,
        message: `过账期间已关闭: ${fiscalYear}年${periodMonth}月 (${companyCode})`
      }
    }

    return { isOpen: true, message: '' }
  }

  /**
   * 过账期间检查（直接抛异常版本，用于凭证引擎）
   */
  async assertPeriodOpen(client, companyCode, postingDate, accountType = 'ALL') {
    const check = await this.checkPeriod(client, companyCode, postingDate, accountType)
    if (!check.isOpen) {
      throw new Error(check.message)
    }
  }

  /**
   * 开放期间
   */
  async openPeriod(client, companyCode, fiscalYear, periodMonth, accountType, userId) {
    await client.query(
      `UPDATE posting_periods
       SET is_open = true, opened_by = $1, opened_at = NOW(), closed_by = NULL, closed_at = NULL
       WHERE company_code = $2 AND fiscal_year = $3
             AND period_month = $4 AND account_type = $5`,
      [userId, companyCode, fiscalYear, periodMonth, accountType]
    )
  }

  /**
   * 关闭期间
   */
  async closePeriod(client, companyCode, fiscalYear, periodMonth, accountType, userId) {
    await client.query(
      `UPDATE posting_periods
       SET is_open = false, closed_by = $1, closed_at = NOW()
       WHERE company_code = $2 AND fiscal_year = $3
             AND period_month = $4 AND account_type = $5`,
      [userId, companyCode, fiscalYear, periodMonth, accountType]
    )
  }

  /**
   * 获取所有期间状态
   */
  async getAllPeriods(client, companyCode, fiscalYear) {
    const result = await client.query(
      `SELECT fiscal_year, period_month, account_type, is_open,
              opened_by, opened_at, closed_by, closed_at
       FROM posting_periods
       WHERE company_code = $1 AND fiscal_year = $2
       ORDER BY period_month, account_type`,
      [companyCode, fiscalYear]
    )
    return result.rows
  }
}

export default new PostingPeriodManager()
