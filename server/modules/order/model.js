/**
 * 订单数据模型
 * 纯数据库操作，不包含业务逻辑（业务逻辑在 service.js）
 */

// 订单变更追踪的字段定义
export const ORDER_TRACKED_FIELDS = [
  { name: 'status', label: '订单状态' },
  { name: 'delivery_status', label: '派送状态' },
  { name: 'carrier_id', label: '承运商' },
  { name: 'client_price', label: '客户报价' },
  { name: 'carrier_cost', label: '承运商成本' },
  { name: 'cargo_weight_kg', label: '货物重量' },
  { name: 'cargo_volume_m3', label: '货物体积' },
  { name: 'cargo_quantity', label: '货物数量' },
  { name: 'pickup_date', label: '装货日期' },
  { name: 'delivery_date', label: '到达日期' },
  { name: 'special_requirements', label: '特殊要求' },
  { name: 'shipping_line', label: '船司' },
  { name: 'container_no', label: '柜号' },
  { name: 'bl_number', label: '提单号' },
  { name: 'eta', label: 'ETA' },
  { name: 'release_status', label: '放单状态' },
  { name: 'clearance_status', label: '清关状态' },
  { name: 'tracking_number', label: '跟踪号' },
  { name: 'customer_ref', label: '客户单号' }
]

export const orderModel = {

  /**
   * 创建订单
   */
  async create(client, data) {
    const result = await client.query(
      `INSERT INTO orders
       (document_id, order_number, customer_ref, client_id, company_code, business_area,
        business_type, status, delivery_status, transport_type,
        cargo_description, cargo_weight_kg, cargo_volume_m3, cargo_quantity,
        pickup_address, delivery_address, pickup_date, delivery_date,
        special_requirements, remarks,
        eta, shipping_line, cnee, container_no, container_type, seal_no,
        bl_number, pod, final_destination, final_dest_address,
        expected_delivery_date, release_method, needs_clearance, needs_release,
        client_price, carrier_cost, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
       RETURNING *`,
      [
        data.documentId, data.orderNumber, data.customerRef || null,
        data.clientId, data.companyCode, data.businessArea,
        data.businessType, data.status || 'PENDING_REVIEW',
        // 只有 TRUCK_FTL（原集装箱）走派送子状态机
        data.businessType === 'TRUCK_FTL' ? 'WAITING_ARRANGE' : null,
        data.transportType,
        data.cargoDescription, data.cargoWeightKg, data.cargoVolumeM3, data.cargoQuantity,
        JSON.stringify(data.pickupAddress), JSON.stringify(data.deliveryAddress),
        data.pickupDate, data.deliveryDate,
        data.specialRequirements, data.remarks,
        data.eta, data.shippingLine, data.cnee, data.containerNo, data.containerType,
        data.sealNo, data.blNumber, data.pod, data.finalDestination,
        data.finalDestAddress, data.expectedDeliveryDate, data.releaseMethod,
        data.needsClearance || false, data.needsRelease || false,
        data.clientPrice, data.carrierCost, data.currency || 'EUR'
      ]
    )
    return result.rows[0]
  },

  /**
   * 根据 ID 获取订单
   */
  async getById(client, id) {
    const result = await client.query(
      `SELECT o.*,
              c.company_name as client_name, c.credit_level,
              cr.company_name as carrier_name, cr.performance_score as carrier_score,
              d.doc_number, d.status as doc_status
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN carriers cr ON cr.id = o.carrier_id
       LEFT JOIN documents d ON d.id = o.document_id
       WHERE o.id = $1`,
      [id]
    )
    return result.rows[0] || null
  },

  /**
   * 订单列表（分页 + 筛选）
   */
  async list(client, { businessType, status, deliveryStatus, clientId, carrierId,
                       search, dateFrom, dateTo, page = 1, pageSize = 20 }) {
    let sql = `
      SELECT o.id, o.order_number, o.business_type, o.status, o.delivery_status,
             o.transport_type, o.cargo_weight_kg, o.container_no, o.bl_number,
             o.shipping_line, o.eta, o.pod, o.final_destination,
             o.client_price, o.carrier_cost, o.currency,
             o.pickup_date, o.delivery_date, o.release_status, o.clearance_status,
             o.tracking_number, o.customer_ref, o.created_at,
             c.company_name as client_name,
             cr.company_name as carrier_name,
             o.pickup_address->>'city' as pickup_city,
             o.delivery_address->>'city' as delivery_city
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN carriers cr ON cr.id = o.carrier_id
      WHERE 1=1`
    const params = []
    let paramIdx = 0

    if (businessType) {
      params.push(businessType)
      sql += ` AND o.business_type = $${++paramIdx}`
    }
    if (status) {
      params.push(status)
      sql += ` AND o.status = $${++paramIdx}`
    }
    if (deliveryStatus) {
      params.push(deliveryStatus)
      sql += ` AND o.delivery_status = $${++paramIdx}`
    }
    if (clientId) {
      params.push(clientId)
      sql += ` AND o.client_id = $${++paramIdx}`
    }
    if (carrierId) {
      params.push(carrierId)
      sql += ` AND o.carrier_id = $${++paramIdx}`
    }
    if (search) {
      params.push(`%${search}%`)
      // 客户打电话报的往往是他们自己的单号，所以 customer_ref 也要能搜；
      // 客户名此前搜不到，但三个搜索框的提示语一直写着「搜索…客户…」，一并补上
      sql += ` AND (o.order_number ILIKE $${++paramIdx} OR o.container_no ILIKE $${paramIdx} OR o.bl_number ILIKE $${paramIdx} OR o.tracking_number ILIKE $${paramIdx} OR o.customer_ref ILIKE $${paramIdx} OR c.company_name ILIKE $${paramIdx} OR o.pickup_address->>'reference' ILIKE $${paramIdx})`
    }
    if (dateFrom) {
      params.push(dateFrom)
      sql += ` AND o.created_at >= $${++paramIdx}`
    }
    if (dateTo) {
      params.push(dateTo)
      sql += ` AND o.created_at <= $${++paramIdx}`
    }

    // 总数
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM (${sql}) t`, params
    )
    const total = parseInt(countResult.rows[0].total)

    // 分页
    sql += ` ORDER BY o.created_at DESC`
    params.push(pageSize)
    sql += ` LIMIT $${++paramIdx}`
    params.push((page - 1) * pageSize)
    sql += ` OFFSET $${++paramIdx}`

    const result = await client.query(sql, params)

    return {
      data: result.rows,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
    }
  },

  /**
   * 更新订单字段
   */
  async update(client, id, fields) {
    const setClauses = []
    const params = []
    let idx = 0

    for (const [key, value] of Object.entries(fields)) {
      params.push(value)
      setClauses.push(`${key} = $${++idx}`)
    }

    params.push(id)
    setClauses.push(`updated_at = NOW()`)

    await client.query(
      `UPDATE orders SET ${setClauses.join(', ')} WHERE id = $${++idx}`,
      params
    )
  },

  /**
   * 记录状态变更日志
   */
  async logStatusChange(client, orderId, fromStatus, toStatus, changedBy, remarks) {
    await client.query(
      `INSERT INTO order_status_logs (order_id, from_status, to_status, changed_by, remarks)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, fromStatus, toStatus, changedBy, remarks]
    )
  },

  /**
   * 获取订单统计
   */
  async getStats(client, companyCode) {
    const result = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_new,
         COUNT(*) FILTER (WHERE status = 'IN_TRANSIT') as in_transit,
         COUNT(*) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)) as month_completed,
         COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
         COALESCE(SUM(client_price) FILTER (WHERE status = 'COMPLETED' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as month_revenue
       FROM orders
       WHERE company_code = $1 OR $1 IS NULL`,
      [companyCode]
    )
    return result.rows[0]
  }
}

export default orderModel
