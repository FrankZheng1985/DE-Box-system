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
    const ids = Array.isArray(userIds) ? userIds : [userIds]

    for (const userId of ids) {
      // 确定通知渠道
      let actualChannel = channel
      if (channel === 'AUTO') {
        actualChannel = await this._resolveChannel(client, userId, type)
      }

      // 创建系统通知
      if (actualChannel === 'SYSTEM' || actualChannel === 'BOTH') {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, related_order_id, channel)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, type, title, message, relatedOrderId, actualChannel]
        )
      }

      // 邮件通知（记录到待发送队列，实际发送由定时任务处理）
      if (actualChannel === 'EMAIL' || actualChannel === 'BOTH') {
        await this._queueEmail(client, userId, type, title, message)
      }
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

  // 根据用户偏好确定通知渠道
  async _resolveChannel(client, userId, eventType) {
    const pref = await client.query(
      `SELECT channel_email, channel_system FROM notification_preferences
       WHERE user_id = $1 AND event_type = $2`,
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

  // 邮件发送队列（简化实现：直接记录到通知表，实际发送在单独服务中处理）
  async _queueEmail(client, userId, type, title, message) {
    // 获取用户邮箱
    const user = await client.query(
      `SELECT email FROM users WHERE id = $1`, [userId]
    )
    if (!user.rows[0]?.email) return

    // 邮件发送逻辑由外部邮件服务处理
    // 此处仅做记录，实际发送通过 node-cron 定时任务轮询
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, channel, is_read)
       VALUES ($1, $2, $3, $4, 'EMAIL', false)`,
      [userId, `EMAIL_${type}`, `[邮件] ${title}`, message]
    )
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
  INVOICE_DUE: 'INVOICE_DUE'
}

export default new NotificationEngine()
