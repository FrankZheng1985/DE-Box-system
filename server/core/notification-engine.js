/**
 * 通知引擎 (Notification Engine)
 *
 * 功能：
 * - 创建系统内通知
 * - 发送邮件通知（通过 nodemailer）
 * - 根据用户通知偏好决定通知渠道
 * - 支持 9 种业务通知事件
 */

export class NotificationEngine {

  /**
   * 发送通知
   * @param {object} client - 数据库客户端
   * @param {object} params
   * @param {string|string[]} params.userIds - 目标用户 ID（支持数组批量发送）
   * @param {string} params.type - 通知类型
   * @param {string} params.title - 通知标题
   * @param {string} [params.message] - 通知内容
   * @param {string} [params.relatedOrderId] - 关联订单 ID
   * @param {string} [params.channel='AUTO'] - 通知渠道 (SYSTEM/EMAIL/BOTH/AUTO)
   */
  async notify(client, {
    userIds,
    type,
    title,
    message,
    relatedOrderId,
    channel = 'AUTO'
  }) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))]

    for (const userId of ids) {
      // 确定通知渠道
      let actualChannel = channel
      if (channel === 'AUTO') {
        actualChannel = await this._resolveChannel(client, userId, type)
      }

      const needsEmail = actualChannel === 'EMAIL' || actualChannel === 'BOTH'

      // 需要发邮件时，先取用户邮箱做快照；取不到就退回纯站内信
      let emailTo = null
      if (needsEmail) {
        const user = await client.query(`SELECT email FROM users WHERE id = $1`, [userId])
        emailTo = user.rows[0]?.email || null
        if (!emailTo) {
          console.warn(`[通知引擎] 用户 ${userId} 没有邮箱，${type} 通知改为仅站内信`)
          actualChannel = 'SYSTEM'
        }
      }

      // 一条通知只写一行：channel 决定要不要发邮件，
      // email_status = PENDING 的行由 utils/email-queue.js 轮询发送
      await client.query(
        `INSERT INTO notifications
           (user_id, type, title, message, related_order_id, channel, email_to, email_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId, type, title, message, relatedOrderId, actualChannel,
          emailTo,
          emailTo ? 'PENDING' : null
        ]
      )
    }
  }

  /**
   * 获取用户未读通知列表
   */
  async getUnreadNotifications(client, userId, limit = 20) {
    const result = await client.query(
      `SELECT id, type, title, message, related_order_id, channel, created_at
       FROM notifications
       WHERE user_id = $1 AND is_read = false
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    )
    return result.rows
  }

  /**
   * 获取未读数量
   */
  async getUnreadCount(client, userId) {
    const result = await client.query(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    )
    return parseInt(result.rows[0].cnt)
  }

  /**
   * 标记已读
   */
  async markRead(client, notificationId) {
    await client.query(
      `UPDATE notifications SET is_read = true WHERE id = $1`, [notificationId]
    )
  }

  /**
   * 全部已读
   */
  async markAllRead(client, userId) {
    await client.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId]
    )
  }

  /**
   * 根据偏好确定通知渠道
   *
   * 三级回退（需求 8，迁移 108 起）：
   *   1. 这个人自己的偏好
   *   2. 他所属客户公司的默认偏好（client_admin 给全公司设的）
   *   3. 系统默认：仅站内信
   *
   * 公司级偏好只对 user_type = 'CLIENT' 的账号生效 ——
   * 运营和承运商账号的 linked_entity_id 指向的不是 clients 表。
   */
  async _resolveChannel(client, userId, eventType) {
    const pref = await client.query(
      `SELECT p.channel_email, p.channel_system,
              -- 个人偏好排在前面，取第一行即可
              CASE WHEN p.user_id IS NOT NULL THEN 0 ELSE 1 END AS priority
       FROM notification_preferences p
       WHERE p.event_type = $2
         AND (
           p.user_id = $1
           OR p.client_id = (
             SELECT u.linked_entity_id FROM users u
             WHERE u.id = $1 AND u.user_type = 'CLIENT'
           )
         )
       ORDER BY priority
       LIMIT 1`,
      [userId, eventType]
    )

    if (pref.rows.length === 0) {
      return 'SYSTEM' // 默认系统通知
    }

    const { channel_email, channel_system } = pref.rows[0]
    if (channel_email && channel_system) return 'BOTH'
    if (channel_email) return 'EMAIL'
    if (channel_system) return 'SYSTEM'
    return 'SYSTEM'
  }

  /**
   * 按角色代码查用户 ID（定时任务给"财务岗""管理员"群发时用）
   * @param {object} client - 数据库客户端
   * @param {string[]} roleCodes - 角色代码，如 ['finance', 'sys_admin']
   * @returns {Promise<string[]>} 用户 ID 数组
   */
  async getUserIdsByRoles(client, roleCodes) {
    const result = await client.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.role_code = ANY($1) AND u.is_active = true`,
      [roleCodes]
    )
    return result.rows.map(row => row.id)
  }
}

/**
 * 通知事件类型常量
 */
export const NOTIFICATION_TYPES = {
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  CARRIER_ACCEPTED: 'CARRIER_ACCEPTED',
  PICKED_UP: 'PICKED_UP',
  STATUS_UPDATE: 'STATUS_UPDATE',
  DELIVERED: 'DELIVERED',
  CMR_UPLOADED: 'CMR_UPLOADED',
  EXCEPTION: 'EXCEPTION',
  CLEARANCE_RELEASED: 'CLEARANCE_RELEASED',
  RELEASE_STATUS_CHANGED: 'RELEASE_STATUS_CHANGED',
  QUALIFICATION_EXPIRING: 'QUALIFICATION_EXPIRING',
  INVOICE_DUE: 'INVOICE_DUE',
  CREDIT_ALERT: 'CREDIT_ALERT'
}

/**
 * 通知事件的中文名称
 * 唯一来源：前端设置页、邮件标题都从这里取，不要在别处再抄一份
 */
export const NOTIFICATION_TYPE_LABELS = {
  ORDER_CONFIRMED: '订单已确认',
  CARRIER_ACCEPTED: '承运商接单',
  PICKED_UP: '货物已提货',
  STATUS_UPDATE: '订单状态变更',
  DELIVERED: '货物已送达',
  CMR_UPLOADED: 'CMR 单据上传',
  EXCEPTION: '订单异常预警',
  CLEARANCE_RELEASED: '清关放行',
  RELEASE_STATUS_CHANGED: '船司放单状态变更',
  QUALIFICATION_EXPIRING: '承运商资质到期',
  INVOICE_DUE: '账单到期 / 逾期',
  // ⚠️ 只发给内部（财务岗/经理/管理员），不推给客户 —— 2026-08-02 Frank 定：
  //    「你的信用被冻结了」这种话直接推给客户，商务上容易出事，让业务员自己去谈
  CREDIT_ALERT: '客户信用超额预警'
}

export default new NotificationEngine()
