/**
 * 变更凭证追踪 (Change Tracker)
 * SAP 对标: CDHDR/CDPOS (变更凭证表)
 *
 * 功能：
 * - 字段级变更追踪：谁、何时、改了什么字段、从什么值改成什么值
 * - 支持 INSERT / UPDATE / STATUS_CHANGE 三种变更类型
 * - 提供完整的对象变更历史查询
 */

export class ChangeTracker {

  /**
   * 记录变更
   * @param {object} client - 数据库事务客户端
   * @param {object} params
   * @param {string} params.objectType - 对象类型 (ORDER/CLIENT/CARRIER/INVOICE 等)
   * @param {string} params.objectId - 对象 ID
   * @param {string} params.changeType - 变更类型 (INSERT/UPDATE/STATUS_CHANGE)
   * @param {string} params.transactionType - 业务操作类型 (CREATE_ORDER/ASSIGN_CARRIER 等)
   * @param {string} params.tableName - 表名
   * @param {object} [params.oldData] - 旧数据对象 (UPDATE 时传入)
   * @param {object} params.newData - 新数据对象
   * @param {Array<{name: string, label: string}>} params.trackedFields - 需要追踪的字段
   * @param {string} params.changedBy - 操作人 ID
   * @param {string} [params.changeReason] - 变更原因
   * @returns {Promise<string>} 变更凭证 ID
   */
  async trackChanges(client, {
    objectType,
    objectId,
    changeType,
    transactionType,
    tableName,
    oldData,
    newData,
    trackedFields,
    changedBy,
    changeReason
  }) {
    // 创建变更凭证抬头
    const headerResult = await client.query(
      `INSERT INTO change_documents
       (object_type, object_id, change_type, transaction_type, changed_by, change_reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [objectType, objectId, changeType, transactionType, changedBy, changeReason]
    )
    const changeDocId = headerResult.rows[0].id

    // 记录字段级变更明细
    if (changeType === 'INSERT') {
      // 新建：记录所有字段的新值
      for (const field of trackedFields) {
        const newValue = newData[field.name]
        if (newValue !== undefined && newValue !== null) {
          await this._insertItem(client, changeDocId, tableName, field, null, newValue)
        }
      }
    } else if (changeType === 'UPDATE' || changeType === 'STATUS_CHANGE') {
      // 修改：对比新旧值，只记录有变化的字段
      for (const field of trackedFields) {
        const oldValue = oldData ? oldData[field.name] : null
        const newValue = newData[field.name]

        if (this._valueChanged(oldValue, newValue)) {
          await this._insertItem(client, changeDocId, tableName, field, oldValue, newValue)
        }
      }
    }

    return changeDocId
  }

  /**
   * 获取对象的完整变更历史
   */
  async getChangeHistory(client, objectType, objectId) {
    const result = await client.query(
      `SELECT cd.id, cd.change_type, cd.transaction_type, cd.changed_at, cd.change_reason,
              u.username AS changed_by_name, u.display_name AS changed_by_display,
              COALESCE(
                json_agg(
                  json_build_object(
                    'field_name', cdi.field_name,
                    'field_label', cdi.field_label,
                    'old_value', cdi.old_value,
                    'new_value', cdi.new_value
                  ) ORDER BY cdi.field_name
                ) FILTER (WHERE cdi.id IS NOT NULL),
                '[]'
              ) AS items
       FROM change_documents cd
       LEFT JOIN change_document_items cdi ON cdi.change_doc_id = cd.id
       LEFT JOIN users u ON u.id = cd.changed_by
       WHERE cd.object_type = $1 AND cd.object_id = $2
       GROUP BY cd.id, u.username, u.display_name
       ORDER BY cd.changed_at DESC`,
      [objectType, objectId]
    )
    return result.rows
  }

  // 写入变更明细行
  async _insertItem(client, changeDocId, tableName, field, oldValue, newValue) {
    await client.query(
      `INSERT INTO change_document_items
       (change_doc_id, table_name, field_name, field_label, old_value, new_value, value_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        changeDocId,
        tableName,
        field.name,
        field.label || field.name,
        oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
        newValue !== null && newValue !== undefined ? String(newValue) : null,
        this._detectValueType(newValue)
      ]
    )
  }

  // 判断值是否变化
  _valueChanged(oldVal, newVal) {
    if (oldVal === newVal) return false
    if (oldVal === null && newVal === undefined) return false
    if (oldVal === undefined && newVal === null) return false
    // JSON 对象比较
    if (typeof oldVal === 'object' && typeof newVal === 'object') {
      return JSON.stringify(oldVal) !== JSON.stringify(newVal)
    }
    return String(oldVal || '') !== String(newVal || '')
  }

  // 检测值类型
  _detectValueType(value) {
    if (value === null || value === undefined) return 'TEXT'
    if (typeof value === 'number') return 'NUMBER'
    if (value instanceof Date) return 'DATE'
    if (typeof value === 'object') return 'JSON'
    return 'TEXT'
  }
}

export default new ChangeTracker()
