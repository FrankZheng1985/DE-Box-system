/**
 * 审批工作流引擎 (Workflow Engine)
 * SAP 对标: SAP Business Workflow
 *
 * 功能：
 * - 可配置的审批流程定义
 * - 自动代理人确定（按角色/用户/规则）
 * - 条件分支支持
 * - 超时自动升级
 */

export class WorkflowEngine {

  /**
   * 触发工作流（检查是否需要审批）
   * @param {object} client - 数据库事务客户端
   * @param {string} objectType - 对象类型 (ORDER/EXPENSE/INVOICE)
   * @param {string} objectId - 对象 ID
   * @param {object} objectData - 对象数据（用于条件判断）
   * @param {string} startedBy - 发起人 ID
   * @returns {Promise<{triggered: boolean, instanceId?: string}>}
   */
  async triggerWorkflow(client, objectType, objectId, objectData, startedBy) {
    // 查找匹配的工作流定义
    const definitions = await client.query(
      `SELECT * FROM workflow_definitions
       WHERE trigger_object_type = $1 AND is_active = true`,
      [objectType]
    )

    for (const def of definitions.rows) {
      // 检查触发条件
      if (!this._checkTriggerCondition(def.trigger_condition, objectData)) {
        continue
      }

      // 创建工作流实例
      const instance = await client.query(
        `INSERT INTO workflow_instances
         (workflow_id, object_type, object_id, current_step, status, started_by)
         VALUES ($1, $2, $3, 1, 'IN_PROGRESS', $4)
         RETURNING id`,
        [def.id, objectType, objectId, startedBy]
      )
      const instanceId = instance.rows[0].id

      // 创建第一步的工作项
      await this._createWorkItem(client, instanceId, def.id, 1)

      return { triggered: true, instanceId }
    }

    return { triggered: false }
  }

  /**
   * 处理审批决策
   * @param {string} workItemId - 工作项 ID
   * @param {string} decision - 决策 (APPROVE/REJECT)
   * @param {string} decisionNote - 审批意见
   * @param {string} decidedBy - 审批人 ID
   */
  async processDecision(client, workItemId, decision, decisionNote, decidedBy) {
    // 获取工作项
    const itemResult = await client.query(
      `SELECT wi.*, wf.workflow_id, wf.object_type, wf.object_id
       FROM work_items wi
       JOIN workflow_instances wf ON wf.id = wi.workflow_instance_id
       WHERE wi.id = $1 AND wi.status = 'PENDING'`,
      [workItemId]
    )

    if (itemResult.rows.length === 0) {
      throw new Error('工作项不存在或已处理')
    }

    const item = itemResult.rows[0]

    // 验证审批权限
    if (item.assigned_to !== decidedBy) {
      throw new Error('无权审批此工作项')
    }

    // 更新工作项
    await client.query(
      `UPDATE work_items
       SET status = $1, decision = $2, decision_note = $3, decided_at = NOW()
       WHERE id = $4`,
      [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decision, decisionNote, workItemId]
    )

    if (decision === 'REJECT') {
      // 拒绝：结束流程
      await client.query(
        `UPDATE workflow_instances SET status = 'REJECTED', completed_at = NOW()
         WHERE id = $1`,
        [item.workflow_instance_id]
      )
      return { status: 'REJECTED', objectType: item.object_type, objectId: item.object_id }
    }

    // 批准：检查是否有下一步
    const nextStep = item.step_number + 1
    const stepDef = await client.query(
      `SELECT * FROM workflow_steps
       WHERE workflow_id = $1 AND step_number = $2`,
      [item.workflow_id, nextStep]
    )

    if (stepDef.rows.length === 0) {
      // 没有下一步，流程完成
      await client.query(
        `UPDATE workflow_instances SET status = 'APPROVED', completed_at = NOW(), current_step = $1
         WHERE id = $2`,
        [item.step_number, item.workflow_instance_id]
      )
      return { status: 'APPROVED', objectType: item.object_type, objectId: item.object_id }
    }

    // 创建下一步工作项
    await client.query(
      `UPDATE workflow_instances SET current_step = $1 WHERE id = $2`,
      [nextStep, item.workflow_instance_id]
    )
    await this._createWorkItem(client, item.workflow_instance_id, item.workflow_id, nextStep)

    return { status: 'IN_PROGRESS', nextStep, objectType: item.object_type, objectId: item.object_id }
  }

  /**
   * 获取用户待审批工作项
   */
  async getPendingWorkItems(client, userId) {
    const result = await client.query(
      `SELECT wi.id, wi.step_number, wi.deadline, wi.created_at,
              wf.object_type, wf.object_id, wf.status as workflow_status,
              wd.workflow_name,
              ws.step_name
       FROM work_items wi
       JOIN workflow_instances wf ON wf.id = wi.workflow_instance_id
       JOIN workflow_definitions wd ON wd.id = wf.workflow_id
       LEFT JOIN workflow_steps ws ON ws.workflow_id = wf.workflow_id AND ws.step_number = wi.step_number
       WHERE wi.assigned_to = $1 AND wi.status = 'PENDING'
       ORDER BY wi.created_at DESC`,
      [userId]
    )
    return result.rows
  }

  /**
   * 获取对象的审批状态
   */
  async getApprovalStatus(client, objectType, objectId) {
    const result = await client.query(
      `SELECT wi.status as workflow_status, wi.current_step,
              wd.workflow_name
       FROM workflow_instances wi
       JOIN workflow_definitions wd ON wd.id = wi.workflow_id
       WHERE wi.object_type = $1 AND wi.object_id = $2
       ORDER BY wi.started_at DESC LIMIT 1`,
      [objectType, objectId]
    )
    return result.rows[0] || null
  }

  // 检查触发条件
  _checkTriggerCondition(condition, data) {
    if (!condition) return true

    for (const [key, rule] of Object.entries(condition)) {
      const value = data[key]
      if (typeof rule === 'object') {
        if (rule.gt !== undefined && !(value > rule.gt)) return false
        if (rule.lt !== undefined && !(value < rule.lt)) return false
        if (rule.gte !== undefined && !(value >= rule.gte)) return false
        if (rule.eq !== undefined && value !== rule.eq) return false
        if (rule.in !== undefined && !rule.in.includes(value)) return false
      } else {
        if (value !== rule) return false
      }
    }
    return true
  }

  // 创建工作项
  async _createWorkItem(client, instanceId, workflowId, stepNumber) {
    const step = await client.query(
      `SELECT * FROM workflow_steps WHERE workflow_id = $1 AND step_number = $2`,
      [workflowId, stepNumber]
    )

    if (step.rows.length === 0) return

    const stepDef = step.rows[0]
    const assignee = await this._determineAgent(client, stepDef)
    const deadline = stepDef.deadline_hours
      ? new Date(Date.now() + stepDef.deadline_hours * 3600000)
      : null

    await client.query(
      `INSERT INTO work_items (workflow_instance_id, step_number, assigned_to, deadline)
       VALUES ($1, $2, $3, $4)`,
      [instanceId, stepNumber, assignee, deadline]
    )
  }

  // 确定代理人
  async _determineAgent(client, stepDef) {
    if (stepDef.agent_type === 'USER') {
      return stepDef.agent_value
    }

    if (stepDef.agent_type === 'ROLE') {
      // 按角色查找第一个匹配用户
      const result = await client.query(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.role_code = $1 AND u.is_active = true
         LIMIT 1`,
        [stepDef.agent_value]
      )
      if (result.rows.length === 0) {
        throw new Error(`找不到角色 ${stepDef.agent_value} 的用户`)
      }
      return result.rows[0].id
    }

    throw new Error(`不支持的代理人类型: ${stepDef.agent_type}`)
  }
}

export default new WorkflowEngine()
