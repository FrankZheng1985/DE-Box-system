/**
 * 条件定价引擎 (Pricing Engine)
 * SAP 对标: Condition Technique + Pricing Procedure
 *
 * 功能：
 * - 可配置的定价过程（步骤链式计算）
 * - 存取顺序按优先级查找条件记录
 * - 支持固定金额、百分比、公式三种计算方式
 * - 价格数据维护在条件记录表中，不硬编码
 */

export class PricingEngine {

  /**
   * 执行定价计算
   * @param {object} client - 数据库客户端
   * @param {string} procedureCode - 定价过程代码 (CURTAIN_SIDE/CONTAINER)
   * @param {object} inputData - 输入数据（用于匹配条件记录）
   *   例如: { client_id, credit_level, route_from, route_to, container_type, country }
   * @returns {Promise<{items: Array, subtotal: number, total: number}>}
   */
  async calculatePrice(client, procedureCode, inputData) {
    // 加载定价过程和步骤
    const steps = await client.query(
      `SELECT ps.step_number, ps.description, ps.calc_type, ps.is_subtotal,
              ps.is_mandatory, ps.from_step,
              ct.type_code, ct.type_name, ct.category, ct.plus_minus, ct.is_manual
       FROM pricing_steps ps
       JOIN condition_types ct ON ct.id = ps.condition_type_id
       JOIN pricing_procedures pp ON pp.id = ps.procedure_id
       WHERE pp.procedure_code = $1 AND pp.is_active = true
       ORDER BY ps.sort_order`,
      [procedureCode]
    )

    if (steps.rows.length === 0) {
      throw new Error(`定价过程未配置或已停用: ${procedureCode}`)
    }

    const items = []
    let runningTotal = 0
    const today = new Date().toISOString().split('T')[0]

    for (const step of steps.rows) {
      // 小计行
      if (step.is_subtotal) {
        items.push({
          stepNumber: step.step_number,
          typeCode: 'SUBTOTAL',
          description: step.description || '小计',
          category: 'SUBTOTAL',
          amount: runningTotal,
          currency: inputData.currency || 'EUR'
        })
        continue
      }

      // 手动输入的条件类型，跳过自动查找（由前端传入）
      if (step.is_manual) {
        const manualAmount = inputData[`manual_${step.type_code}`] || 0
        if (manualAmount !== 0) {
          const adjustedAmount = step.plus_minus === '-' ? -Math.abs(manualAmount) : Math.abs(manualAmount)
          runningTotal += adjustedAmount
          items.push({
            stepNumber: step.step_number,
            typeCode: step.type_code,
            description: step.description || step.type_name,
            category: step.category,
            amount: adjustedAmount,
            currency: inputData.currency || 'EUR',
            source: 'MANUAL'
          })
        }
        continue
      }

      // 自动查找条件记录
      const conditionAmount = await this._findConditionRecord(client, step.type_code, inputData, today)

      if (conditionAmount === null) {
        if (step.is_mandatory) {
          throw new Error(`必填定价条件未找到匹配记录: ${step.type_code} (${step.description})`)
        }
        continue
      }

      // 计算金额
      let amount = 0
      if (step.calc_type === 'FIXED') {
        amount = conditionAmount
      } else if (step.calc_type === 'PERCENT') {
        // 百分比基于 from_step 或当前 runningTotal
        const base = step.from_step
          ? (items.find(i => i.stepNumber === step.from_step)?.amount || runningTotal)
          : runningTotal
        amount = base * conditionAmount / 100
      }

      // 应用加减号
      const adjustedAmount = step.plus_minus === '-' ? -Math.abs(amount) : Math.abs(amount)
      runningTotal += adjustedAmount

      items.push({
        stepNumber: step.step_number,
        typeCode: step.type_code,
        description: step.description || step.type_name,
        category: step.category,
        amount: adjustedAmount,
        conditionValue: conditionAmount,
        calcType: step.calc_type,
        currency: inputData.currency || 'EUR',
        source: 'AUTO'
      })
    }

    return {
      procedureCode,
      items,
      subtotal: items.filter(i => i.category !== 'TAX' && i.typeCode !== 'SUBTOTAL')
        .reduce((sum, i) => sum + i.amount, 0),
      taxAmount: items.filter(i => i.category === 'TAX')
        .reduce((sum, i) => sum + i.amount, 0),
      total: runningTotal
    }
  }

  /**
   * 按存取顺序查找条件记录
   * 找到第一个匹配的就停止（Exclusive 模式）
   */
  async _findConditionRecord(client, typeCode, inputData, today) {
    // 获取条件类型关联的所有条件表（按优先级排序，通过条件记录的条件表来推断）
    // 简化实现：直接查所有匹配的条件记录，按 key_fields 数量从多到少排（越精确越优先）
    const records = await client.query(
      `SELECT cr.amount, cr.per_unit, ct.key_fields, cr.key_values
       FROM condition_records cr
       JOIN condition_types ctype ON ctype.id = cr.condition_type_id
       JOIN condition_tables ct ON ct.id = cr.condition_table_id
       WHERE ctype.type_code = $1
             AND cr.is_active = true
             AND cr.valid_from <= $2::date
             AND cr.valid_to >= $2::date
       ORDER BY jsonb_array_length(ct.key_fields) DESC`,
      [typeCode, today]
    )

    // 逐条匹配
    for (const record of records.rows) {
      const keyValues = record.key_values
      let matched = true

      for (const [key, value] of Object.entries(keyValues)) {
        if (inputData[key] === undefined || String(inputData[key]) !== String(value)) {
          matched = false
          break
        }
      }

      if (matched) {
        return parseFloat(record.amount)
      }
    }

    return null
  }

  /**
   * 获取定价过程配置（用于前端展示）
   */
  async getProcedureConfig(client, procedureCode) {
    const procedure = await client.query(
      `SELECT * FROM pricing_procedures WHERE procedure_code = $1`, [procedureCode]
    )
    const steps = await client.query(
      `SELECT ps.*, ct.type_code, ct.type_name, ct.category, ct.plus_minus, ct.is_manual
       FROM pricing_steps ps
       JOIN condition_types ct ON ct.id = ps.condition_type_id
       WHERE ps.procedure_id = $1
       ORDER BY ps.sort_order`,
      [procedure.rows[0]?.id]
    )
    return {
      procedure: procedure.rows[0],
      steps: steps.rows
    }
  }
}

export default new PricingEngine()
