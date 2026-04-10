/**
 * 信用管理 (Credit Manager)
 * SAP 对标: FSCM Credit Management
 *
 * 功能：
 * - 客户信用额度检查（静态/动态/严格三种策略）
 * - 信用敞口自动计算
 * - 人工信用释放（主管审批）
 * - 信用检查日志记录
 */

export class CreditManager {

  /**
   * 信用检查
   * @param {object} client - 数据库事务客户端
   * @param {string} clientId - 客户 ID
   * @param {number} orderAmount - 本次订单金额
   * @param {string} checkPoint - 检查节点 (ORDER_CREATE/ORDER_CONFIRM/DELIVERY)
   * @param {string} [orderId] - 关联订单 ID
   * @returns {Promise<{status: string, exposure: number, limit: number, message: string}>}
   */
  async checkCredit(client, clientId, orderAmount, checkPoint, orderId) {
    // 获取客户信用数据
    const clientResult = await client.query(
      `SELECT id, company_name, credit_limit, credit_exposure,
              risk_category, credit_blocked
       FROM clients WHERE id = $1`,
      [clientId]
    )

    if (clientResult.rows.length === 0) {
      throw new Error(`客户不存在: ${clientId}`)
    }

    const clientData = clientResult.rows[0]

    // 如果信用额度为 0，表示不限制
    if (clientData.credit_limit <= 0) {
      return await this._logAndReturn(client, clientId, checkPoint, orderId,
        clientData.credit_limit, clientData.credit_exposure, orderAmount, 'PASSED',
        '信用额度未设置，不检查')
    }

    // 如果客户被冻结
    if (clientData.credit_blocked) {
      return await this._logAndReturn(client, clientId, checkPoint, orderId,
        clientData.credit_limit, clientData.credit_exposure, orderAmount, 'BLOCKED',
        `客户 ${clientData.company_name} 信用已冻结`)
    }

    // 计算信用敞口
    const exposure = await this._calculateExposure(client, clientId, clientData.risk_category)
    const totalExposure = exposure + orderAmount

    // 检查
    if (totalExposure <= clientData.credit_limit) {
      return await this._logAndReturn(client, clientId, checkPoint, orderId,
        clientData.credit_limit, totalExposure, orderAmount, 'PASSED', '')
    }

    // 超额：根据超额比例决定 WARNING 还是 BLOCKED
    const overPct = ((totalExposure - clientData.credit_limit) / clientData.credit_limit * 100).toFixed(1)

    if (parseFloat(overPct) <= 10) {
      return await this._logAndReturn(client, clientId, checkPoint, orderId,
        clientData.credit_limit, totalExposure, orderAmount, 'WARNING',
        `信用敞口 €${totalExposure.toFixed(2)} 超出额度 €${clientData.credit_limit.toFixed(2)} (${overPct}%)，建议主管审批`)
    }

    return await this._logAndReturn(client, clientId, checkPoint, orderId,
      clientData.credit_limit, totalExposure, orderAmount, 'BLOCKED',
      `信用敞口 €${totalExposure.toFixed(2)} 严重超出额度 €${clientData.credit_limit.toFixed(2)} (${overPct}%)，订单被阻止`)
  }

  /**
   * 计算信用敞口
   * LOW:  仅未清应收
   * MEDIUM: 未清应收 + 在途订单
   * HIGH: 未清应收 + 在途订单 + 未确认订单
   */
  async _calculateExposure(client, clientId, riskCategory) {
    // 未清应收
    const arResult = await client.query(
      `SELECT COALESCE(SUM(amount - paid_amount), 0) as outstanding
       FROM financial_records
       WHERE counterparty_type = 'CLIENT' AND counterparty_id = $1
             AND type = 'RECEIVABLE' AND payment_status IN ('UNPAID', 'PARTIAL', 'OVERDUE')`,
      [clientId]
    )
    const outstanding = parseFloat(arResult.rows[0].outstanding)

    if (riskCategory === 'LOW') {
      return outstanding
    }

    // 在途订单金额
    const inTransitResult = await client.query(
      `SELECT COALESCE(SUM(client_price), 0) as in_transit
       FROM orders
       WHERE client_id = $1 AND status IN ('ASSIGNED', 'IN_TRANSIT')`,
      [clientId]
    )
    const inTransit = parseFloat(inTransitResult.rows[0].in_transit)

    if (riskCategory === 'MEDIUM') {
      return outstanding + inTransit
    }

    // 未确认订单金额（HIGH 风险）
    const pendingResult = await client.query(
      `SELECT COALESCE(SUM(client_price), 0) as pending
       FROM orders
       WHERE client_id = $1 AND status IN ('PENDING_REVIEW', 'CONFIRMED', 'PENDING_ASSIGN')`,
      [clientId]
    )
    const pending = parseFloat(pendingResult.rows[0].pending)

    return outstanding + inTransit + pending
  }

  /**
   * 更新客户信用敞口（订单创建/完成/付款时调用）
   */
  async updateExposure(client, clientId) {
    const clientData = await client.query(
      `SELECT risk_category FROM clients WHERE id = $1`, [clientId]
    )
    if (clientData.rows.length === 0) return

    const exposure = await this._calculateExposure(
      client, clientId, clientData.rows[0].risk_category
    )

    await client.query(
      `UPDATE clients SET credit_exposure = $1, last_credit_check = NOW() WHERE id = $2`,
      [exposure, clientId]
    )
  }

  /**
   * 人工信用释放
   */
  async overrideBlock(client, clientId, checkLogId, overrideBy, reason) {
    // 更新检查日志
    await client.query(
      `UPDATE credit_check_logs
       SET check_result = 'PASSED', override_by = $1, override_reason = $2
       WHERE id = $3`,
      [overrideBy, reason, checkLogId]
    )

    // 临时解除客户信用冻结
    await client.query(
      `UPDATE clients SET credit_blocked = false WHERE id = $1`,
      [clientId]
    )
  }

  // 记录日志并返回结果
  async _logAndReturn(client, clientId, checkPoint, orderId, limit, exposure, amount, result, message) {
    await client.query(
      `INSERT INTO credit_check_logs
       (client_id, check_point, order_id, credit_limit, credit_exposure, order_amount, check_result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clientId, checkPoint, orderId, limit, exposure, amount, result]
    )

    return { status: result, exposure, limit, message }
  }
}

export default new CreditManager()
