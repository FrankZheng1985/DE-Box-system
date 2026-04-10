/**
 * 编号范围管理 (Number Range Manager)
 * SAP 对标: SNRO (编号范围管理事务)
 *
 * 功能：
 * - 为所有业务对象生成唯一、有序的编号
 * - 支持按年度/公司代码隔离编号序列
 * - 支持自定义前缀和格式模板
 * - 并发安全（SELECT ... FOR UPDATE 行锁）
 */

export class NumberRangeManager {

  /**
   * 获取下一个编号（带行锁，并发安全）
   * @param {object} client - 数据库事务客户端（必须在事务中调用）
   * @param {string} objectType - 对象类型 (ORD/INQ/QUO/FI_AR 等)
   * @param {string} companyCode - 公司代码
   * @param {number} [fiscalYear] - 会计年度，默认当前年
   * @returns {Promise<{docNumber: string, sequence: number}>}
   */
  async getNextNumber(client, objectType, companyCode, fiscalYear) {
    const year = fiscalYear || new Date().getFullYear()

    // 行锁获取当前编号
    const result = await client.query(
      `SELECT id, prefix, current_number, range_end, number_format
       FROM number_ranges
       WHERE object_type = $1 AND company_code = $2 AND fiscal_year = $3
       FOR UPDATE`,
      [objectType, companyCode, year]
    )

    if (result.rows.length === 0) {
      throw new Error(`编号范围未配置: ${objectType}/${companyCode}/${year}`)
    }

    const range = result.rows[0]
    const nextNumber = parseInt(range.current_number, 10) + 1

    // 检查是否超出范围
    if (nextNumber > parseInt(range.range_end, 10)) {
      throw new Error(`编号范围已用尽: ${objectType}/${companyCode}/${year} (最大 ${range.range_end})`)
    }

    // 更新当前号码
    await client.query(
      `UPDATE number_ranges SET current_number = $1 WHERE id = $2`,
      [nextNumber, range.id]
    )

    // 格式化编号
    const docNumber = this.formatNumber(range.number_format, {
      prefix: range.prefix || '',
      year: year,
      yearMonth: this._getYearMonth(),
      yearMonthDay: this._getYearMonthDay(),
      seq: nextNumber
    })

    return { docNumber, sequence: nextNumber }
  }

  /**
   * 编号格式化
   * 支持的占位符:
   *   {PREFIX}      - 前缀
   *   {YEAR}        - 4位年份
   *   {YYYYMM}      - 年月
   *   {YYYYMMDD}    - 年月日
   *   {SEQ:N}       - 序号（N位补零）
   */
  formatNumber(format, data) {
    if (!format) {
      return `${data.prefix}${data.year}-${String(data.seq).padStart(6, '0')}`
    }

    let result = format
    result = result.replace('{PREFIX}', data.prefix || '')
    result = result.replace('{YEAR}', String(data.year))
    result = result.replace('{YYYYMM}', data.yearMonth)
    result = result.replace('{YYYYMMDD}', data.yearMonthDay)

    // 处理 {SEQ:N} 格式
    const seqMatch = result.match(/\{SEQ:(\d+)\}/)
    if (seqMatch) {
      const padLength = parseInt(seqMatch[1])
      result = result.replace(seqMatch[0], String(data.seq).padStart(padLength, '0'))
    }

    return result
  }

  /**
   * 查看当前编号状态（不修改）
   */
  async getCurrentStatus(client, objectType, companyCode, fiscalYear) {
    const year = fiscalYear || new Date().getFullYear()
    const result = await client.query(
      `SELECT object_type, company_code, fiscal_year, prefix,
              current_number, range_start, range_end, number_format
       FROM number_ranges
       WHERE object_type = $1 AND company_code = $2 AND fiscal_year = $3`,
      [objectType, companyCode, year]
    )
    return result.rows[0] || null
  }

  /**
   * 重置编号范围（危险操作，仅限管理员）
   */
  async resetRange(client, objectType, companyCode, fiscalYear, newStart = 0) {
    const year = fiscalYear || new Date().getFullYear()
    await client.query(
      `UPDATE number_ranges SET current_number = $1
       WHERE object_type = $2 AND company_code = $3 AND fiscal_year = $4`,
      [newStart, objectType, companyCode, year]
    )
  }

  // 私有方法
  _getYearMonth() {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  _getYearMonthDay() {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }
}

export default new NumberRangeManager()
