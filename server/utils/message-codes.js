/**
 * 后端响应文案 → 消息码（P9）
 *
 * 为什么是「查表补码」而不是「改 300 个调用点」：
 *   全仓库有 300 处 `res.json({ code, message: '中文', data })`，去重后 229 条文案。
 *   逐个手改风险高（改错一处就是线上 500），而且以后新增消息还会漏。
 *   改成在响应中间件里按 message 查这张表、查到就 additive 地补 messageCode，
 *   业务代码一行不用动，老前端拿到的 message 也一个字没变。
 *
 * 前端拿到 messageCode 后查自己的语言包 `apiMessage.<CODE>`，
 * 查不到就退回后端给的 message —— 所以这张表漏一条只是那条不翻译，不会出错。
 *
 * ⚠️ 加新消息时：业务代码照常写中文 message，把「中文 → 码」加到这里，
 *    再往三端语言包加 `apiMessage.<CODE>`。跑 `npm run check:i18n` 会告诉你缺哪个。
 *
 * ⚠️ 码一旦发出去就不要改名 —— 前端语言包按码查，改名等于那条消息突然不翻译了。
 */

/** 中文文案 → 消息码 */
export const MESSAGE_CODES = {
  // ── 通用 ──────────────────────────────────────────────────────────────
  '服务器内部错误': 'SERVER_ERROR',
  '操作失败': 'OPERATION_FAILED',
  '提交失败，请稍后重试': 'SUBMIT_FAILED_RETRY',
  '已保存': 'SAVED',
  '导出失败': 'EXPORT_FAILED',
  '没有可更新的字段': 'NO_FIELDS_TO_UPDATE',
  '参数错误：没有可更新的字段': 'NO_FIELDS_TO_UPDATE',

  // ── 认证与权限 ────────────────────────────────────────────────────────
  // ⚠️ 下面 5 条走的是 { errCode, msg } 的老响应格式（认证/限流中间件），
  //    不是标准的 { code, message }。中间件对两种字段名都查表。
  '未提供认证令牌': 'NO_TOKEN',
  '认证令牌已过期，请重新登录': 'TOKEN_EXPIRED',
  '无效的认证令牌': 'INVALID_TOKEN',
  '请求过于频繁，请稍后再试': 'RATE_LIMITED',
  '访问被拒绝': 'ACCESS_DENIED',
  '请先登录': 'LOGIN_REQUIRED',
  '登录成功': 'LOGIN_SUCCESS',
  '用户名和密码不能为空': 'MISSING_CREDENTIALS',
  '用户名或密码错误': 'INVALID_CREDENTIALS',
  '账号已停用，请联系管理员': 'ACCOUNT_DISABLED',
  '登录失败，请稍后重试': 'LOGIN_ERROR',
  '账号未关联公司，请联系管理员完成绑定后再使用': 'ACCOUNT_NOT_BOUND',
  '账号绑定的公司不存在，请联系管理员重新绑定': 'BOUND_COMPANY_MISSING',
  '当前账号未关联客户公司': 'ACCOUNT_NO_CLIENT',
  '需要系统管理员权限': 'SYS_ADMIN_REQUIRED',
  '没有权限执行此操作': 'NO_PERMISSION',
  '没有权限查看应收账款': 'NO_PERMISSION_RECEIVABLES',
  '没有权限查看应付账款': 'NO_PERMISSION_PAYABLES',
  '没有权限修改客户资料': 'NO_PERMISSION_EDIT_CLIENT',
  '没有权限修改信用额度、信用等级、风险类别或账期': 'NO_PERMISSION_EDIT_CREDIT',
  '没有权限设置公司级通知偏好': 'NO_PERMISSION_COMPANY_NOTIFY',
  '只有客户管理员可以设置公司级通知偏好': 'CLIENT_ADMIN_ONLY_NOTIFY',
  '仅客户账号可管理本公司成员': 'CLIENT_ACCOUNT_ONLY_MEMBERS',

  // ── 密码 ──────────────────────────────────────────────────────────────
  '旧密码错误': 'OLD_PASSWORD_WRONG',
  '旧密码和新密码不能为空': 'PASSWORDS_REQUIRED',
  '新密码长度不能少于6位': 'PASSWORD_TOO_SHORT',
  '参数错误：密码长度至少 6 位': 'PASSWORD_TOO_SHORT',
  '参数错误：密码不能少于 6 位': 'PASSWORD_TOO_SHORT',
  '密码修改成功': 'PASSWORD_CHANGED',
  '密码重置成功': 'PASSWORD_RESET',
  '密码已重置': 'PASSWORD_RESET',
  '修改密码失败': 'PASSWORD_CHANGE_FAILED',
  '重置密码失败': 'PASSWORD_RESET_FAILED',

  // ── 用户 / 成员 / 角色 ────────────────────────────────────────────────
  '用户不存在': 'USER_NOT_FOUND',
  '用户创建成功': 'USER_CREATED',
  '用户更新成功': 'USER_UPDATED',
  '不能停用自己的账号': 'CANNOT_DISABLE_SELF',
  '不能修改自己的角色': 'CANNOT_CHANGE_OWN_ROLE',
  '参数错误：用户名已存在': 'USERNAME_TAKEN',
  '参数错误：用户名已被占用': 'USERNAME_TAKEN',
  '参数错误：无效的用户类型': 'INVALID_USER_TYPE',
  '参数错误：用户名、密码、显示名称为必填项': 'USER_FIELDS_REQUIRED',
  '参数错误：用户名、密码、姓名为必填项': 'USER_FIELDS_REQUIRED',
  '参数错误：必须为账号指定角色': 'ROLE_REQUIRED',
  '参数错误：角色不存在或已停用': 'ROLE_INVALID',
  '参数错误：请选择有效的成员角色': 'MEMBER_ROLE_INVALID',
  '成员不存在': 'MEMBER_NOT_FOUND',
  '成员创建成功': 'MEMBER_CREATED',
  '成员信息已更新': 'MEMBER_UPDATED',
  '创建成员失败': 'MEMBER_CREATE_FAILED',
  '更新成员失败': 'MEMBER_UPDATE_FAILED',
  '获取账号列表失败': 'ACCOUNTS_LOAD_FAILED',
  '角色不存在': 'ROLE_NOT_FOUND',
  '获取角色列表失败': 'ROLES_LOAD_FAILED',
  '获取角色权限失败': 'ROLE_PERMISSIONS_LOAD_FAILED',
  '保存角色权限失败': 'ROLE_PERMISSIONS_SAVE_FAILED',
  '权限保存成功': 'PERMISSIONS_SAVED',
  '系统管理员角色拥有全部权限，不可修改': 'SYS_ADMIN_ROLE_LOCKED',
  '获取权限字典失败': 'PERMISSION_DICT_LOAD_FAILED',
  '获取权限失败': 'PERMISSIONS_LOAD_FAILED',
  '参数错误：permissions 必须是数组': 'PERMISSIONS_MUST_BE_ARRAY',
  '参数错误：scope 只能是 USER 或 CLIENT': 'INVALID_SCOPE',
  '获取用户信息失败': 'USER_INFO_LOAD_FAILED',

  // ── 订单 ──────────────────────────────────────────────────────────────
  '订单不存在': 'ORDER_NOT_FOUND',
  '订单创建成功': 'ORDER_CREATED',
  '订单更新成功': 'ORDER_UPDATED',
  '订单已取消': 'ORDER_CANCELLED',
  '无权访问该订单的文件': 'NO_ACCESS_ORDER_FILES',
  '获取订单列表失败': 'ORDERS_LOAD_FAILED',
  '获取订单详情失败': 'ORDER_DETAIL_LOAD_FAILED',
  '获取订单文件失败': 'ORDER_FILES_LOAD_FAILED',
  '获取订单历史失败': 'ORDER_HISTORY_LOAD_FAILED',
  '获取时间线失败': 'TIMELINE_LOAD_FAILED',
  '获取变更历史失败': 'CHANGE_HISTORY_LOAD_FAILED',
  '跟踪号已保存': 'TRACKING_SAVED',
  '派单成功': 'ORDER_ASSIGNED',
  '接单成功': 'ORDER_ACCEPTED',
  '拒单已记录': 'ORDER_DECLINED',
  '状态更新成功': 'STATUS_UPDATED',
  '派送状态更新成功': 'DELIVERY_STATUS_UPDATED',
  '异常已标记': 'EXCEPTION_MARKED',
  'orderId 不能为空': 'ORDER_ID_REQUIRED',

  // ── 询价 ──────────────────────────────────────────────────────────────
  '询价不存在': 'INQUIRY_NOT_FOUND',
  '询价单不存在': 'INQUIRY_NOT_FOUND',
  '无权访问该询价单': 'NO_ACCESS_INQUIRY',
  '询价创建成功': 'INQUIRY_CREATED',
  '询价更新成功': 'INQUIRY_UPDATED',
  '询价已删除': 'INQUIRY_DELETED',
  '仅待报价状态的询价可以编辑': 'INQUIRY_EDIT_ONLY_PENDING',
  '仅待报价状态的询价可以删除': 'INQUIRY_DELETE_ONLY_PENDING',
  '获取询价列表失败': 'INQUIRIES_LOAD_FAILED',
  '获取询价详情失败': 'INQUIRY_DETAIL_LOAD_FAILED',
  '获取询价统计失败': 'INQUIRY_STATS_LOAD_FAILED',
  '生成询价摘要失败': 'INQUIRY_SUMMARY_FAILED',
  '没有可复制的询价单': 'NO_INQUIRY_TO_COPY',
  '请先勾选询价单': 'SELECT_INQUIRY_FIRST',
  '缺少询价单 inquiryId': 'INQUIRY_ID_REQUIRED',

  // ── 报价 ──────────────────────────────────────────────────────────────
  '报价不存在': 'QUOTATION_NOT_FOUND',
  '无权访问该报价单': 'NO_ACCESS_QUOTATION',
  '报价创建成功': 'QUOTATION_CREATED',
  '报价更新成功': 'QUOTATION_UPDATED',
  '报价已拒绝': 'QUOTATION_REJECTED',
  '报价已作废': 'QUOTATION_VOIDED',
  '已标记为待定': 'QUOTATION_PENDING_DECISION',
  '请填写作废原因': 'VOID_REASON_REQUIRED',
  '获取报价列表失败': 'QUOTATIONS_LOAD_FAILED',
  '获取报价详情失败': 'QUOTATION_DETAIL_LOAD_FAILED',
  '获取版本列表失败': 'VERSIONS_LOAD_FAILED',
  '定价计算成功': 'PRICING_CALCULATED',
  '请稍后重试，或登录客户门户「我的报价」完成确认。': 'QUOTE_CONFIRM_RETRY',
  '请回到邮件重新点击「同意 / 待定 / 拒绝」按钮。': 'QUOTE_CONFIRM_USE_EMAIL_LINK',

  // ── 服务商询价 ────────────────────────────────────────────────────────
  '服务商询价不存在': 'CARRIER_INQUIRY_NOT_FOUND',
  '服务商询价已取消': 'CARRIER_INQUIRY_CANCELLED',
  '服务商询价已删除': 'CARRIER_INQUIRY_DELETED',
  '服务商报价已记录': 'CARRIER_QUOTE_SAVED',
  '已选用该服务商': 'CARRIER_SELECTED',
  '已标记为不报价': 'CARRIER_MARKED_DECLINED',
  '已选用的服务商询价不能取消，请先改选其他家': 'SELECTED_CARRIER_CANNOT_CANCEL',
  '已选用的服务商不能标记为不报价，请先改选其他家': 'SELECTED_CARRIER_CANNOT_DECLINE',
  '已取消的询价不能回填报价': 'CANCELLED_INQUIRY_NO_QUOTE',
  '只有待回价或已取消的记录可以删除': 'CARRIER_INQUIRY_DELETE_LIMITED',
  '请至少选择一家服务商': 'SELECT_AT_LEAST_ONE_CARRIER',
  '获取服务商询价列表失败': 'CARRIER_INQUIRIES_LOAD_FAILED',
  '获取服务商询价详情失败': 'CARRIER_INQUIRY_DETAIL_LOAD_FAILED',

  // ── 客户 / 承运商 ─────────────────────────────────────────────────────
  '客户不存在': 'CLIENT_NOT_FOUND',
  '客户创建成功': 'CLIENT_CREATED',
  '客户更新成功': 'CLIENT_UPDATED',
  '获取客户列表失败': 'CLIENTS_LOAD_FAILED',
  '获取客户详情失败': 'CLIENT_DETAIL_LOAD_FAILED',
  '缺少客户 clientId': 'CLIENT_ID_REQUIRED',
  '参数错误：运营代设公司偏好时必须传 clientId': 'CLIENT_ID_REQUIRED_FOR_OPERATOR',
  '承运商不存在': 'CARRIER_NOT_FOUND',
  '承运商创建成功': 'CARRIER_CREATED',
  '承运商更新成功': 'CARRIER_UPDATED',
  '获取承运商列表失败': 'CARRIERS_LOAD_FAILED',
  '获取承运商详情失败': 'CARRIER_DETAIL_LOAD_FAILED',
  '匹配承运商失败': 'CARRIER_MATCH_FAILED',
  '车辆添加成功': 'VEHICLE_ADDED',
  '获取车队信息失败': 'FLEET_LOAD_FAILED',

  // ── 信用 ──────────────────────────────────────────────────────────────
  '信用检查记录不存在': 'CREDIT_LOG_NOT_FOUND',
  '信用已释放': 'CREDIT_RELEASED',
  '这条记录本来就是通过的，无需释放': 'CREDIT_ALREADY_PASSED',
  '获取信用检查日志失败': 'CREDIT_LOGS_LOAD_FAILED',
  '参数错误：缺少信用检查日志 ID': 'CREDIT_LOG_ID_REQUIRED',
  '参数错误：该检查记录不属于此客户': 'CREDIT_LOG_CLIENT_MISMATCH',
  '参数错误：请填写释放原因': 'RELEASE_REASON_REQUIRED',
  '参数错误：冻结必须填写原因': 'BLOCK_REASON_REQUIRED',
  '参数错误：blocked 必须是 true 或 false': 'BLOCKED_MUST_BE_BOOLEAN',

  // ── CMR ───────────────────────────────────────────────────────────────
  'CMR不存在': 'CMR_NOT_FOUND',
  'CMR上传成功': 'CMR_UPLOADED',
  'CMR 请通过 /cmr/upload 上传（需要跟踪签署状态）': 'CMR_USE_DEDICATED_UPLOAD',
  '签署状态更新成功': 'SIGN_STATUS_UPDATED',
  '无效的签署状态': 'INVALID_SIGN_STATUS',
  '货损标记成功': 'DAMAGE_MARKED',
  '获取CMR列表失败': 'CMRS_LOAD_FAILED',
  '获取CMR详情失败': 'CMR_DETAIL_LOAD_FAILED',

  // ── 清关 / 放单 ───────────────────────────────────────────────────────
  '清关记录不存在': 'CLEARANCE_NOT_FOUND',
  '清关状态更新成功': 'CLEARANCE_STATUS_UPDATED',
  '无效的清关状态': 'INVALID_CLEARANCE_STATUS',
  '获取清关列表失败': 'CLEARANCES_LOAD_FAILED',
  '获取清关详情失败': 'CLEARANCE_DETAIL_LOAD_FAILED',
  '放单记录不存在': 'RELEASE_NOT_FOUND',
  '放单状态更新成功': 'RELEASE_STATUS_UPDATED',
  '无效的放单状态': 'INVALID_RELEASE_STATUS',
  '授权放行成功': 'RELEASE_AUTHORIZED',
  '获取放单列表失败': 'RELEASES_LOAD_FAILED',
  '获取放单详情失败': 'RELEASE_DETAIL_LOAD_FAILED',

  // ── GPS ───────────────────────────────────────────────────────────────
  'GPS位置上报成功': 'GPS_REPORTED',
  '获取GPS位置失败': 'GPS_POSITION_LOAD_FAILED',
  '获取GPS历史失败': 'GPS_HISTORY_LOAD_FAILED',
  '获取在途车辆失败': 'ACTIVE_VEHICLES_LOAD_FAILED',
  '获取异常预警失败': 'GPS_ALERTS_LOAD_FAILED',
  '无权查看该订单的轨迹': 'NO_ACCESS_ORDER_TRACK',
  '无权查看该订单的位置': 'NO_ACCESS_ORDER_POSITION',
  '无权上报该订单的位置': 'NO_ACCESS_REPORT_POSITION',

  // ── 财务 / 发票 ───────────────────────────────────────────────────────
  '财务记录创建成功': 'FINANCE_RECORD_CREATED',
  '付款记录成功': 'PAYMENT_RECORDED',
  '发票已作废': 'INVOICE_VOIDED',
  '获取应收列表失败': 'RECEIVABLES_LOAD_FAILED',
  '获取应付列表失败': 'PAYABLES_LOAD_FAILED',
  '获取财务概览失败': 'FINANCE_OVERVIEW_LOAD_FAILED',
  '获取财务摘要失败': 'FINANCE_SUMMARY_LOAD_FAILED',
  '获取利润分析失败': 'PROFIT_ANALYSIS_LOAD_FAILED',
  '获取账龄分析失败': 'AGING_ANALYSIS_LOAD_FAILED',
  '模板不存在': 'TEMPLATE_NOT_FOUND',
  '模板创建成功': 'TEMPLATE_CREATED',
  '获取模板详情失败': 'TEMPLATE_DETAIL_LOAD_FAILED',
  '获取发票模板失败': 'TEMPLATES_LOAD_FAILED',

  // ── 系统设置 / 基础数据 / 会计 ────────────────────────────────────────
  '系统配置更新成功': 'SETTINGS_UPDATED',
  '获取系统配置失败': 'SETTINGS_LOAD_FAILED',
  '账户设置更新成功': 'ACCOUNT_SETTINGS_UPDATED',
  '获取账户设置失败': 'ACCOUNT_SETTINGS_LOAD_FAILED',
  '无效的基础数据类型': 'INVALID_MASTER_DATA_TYPE',
  '获取基础数据列表失败': 'MASTER_DATA_LOAD_FAILED',
  '获取选项数据失败': 'OPTIONS_LOAD_FAILED',
  '代码和中文名称为必填项': 'CODE_AND_NAME_REQUIRED',
  '代码已存在，请使用不同的代码': 'CODE_ALREADY_EXISTS',
  '过账期间不存在': 'POSTING_PERIOD_NOT_FOUND',
  '获取过账期间失败': 'POSTING_PERIODS_LOAD_FAILED',
  '获取科目表失败': 'CHART_OF_ACCOUNTS_LOAD_FAILED',
  '获取编号范围失败': 'NUMBER_RANGES_LOAD_FAILED',
  '获取规则失败': 'RULES_LOAD_FAILED',
  '缺少 procedureCode 或 inputData': 'PROCEDURE_INPUT_REQUIRED',

  // ── 通知 ──────────────────────────────────────────────────────────────
  '获取通知失败': 'NOTIFICATIONS_LOAD_FAILED',
  '获取未读数量失败': 'UNREAD_COUNT_LOAD_FAILED',
  '已标记已读': 'MARKED_READ',
  '全部已读': 'ALL_MARKED_READ',
  '通知偏好更新成功': 'NOTIFY_PREFS_UPDATED',
  '获取通知偏好失败': 'NOTIFY_PREFS_LOAD_FAILED',

  // ── 文件 ──────────────────────────────────────────────────────────────
  '文件上传成功': 'FILE_UPLOADED',
  '文件已删除': 'FILE_DELETED',
  '文件不存在': 'FILE_NOT_FOUND',
  '获取文件列表失败': 'FILES_LOAD_FAILED',
  '未选择文件或文件类型不支持（仅 PDF/JPG/PNG/WebP，20MB 以内）': 'FILE_TYPE_NOT_SUPPORTED',

  // ── 客户咨询 ──────────────────────────────────────────────────────────
  '姓名、邮箱和留言不能为空': 'CONTACT_FIELDS_REQUIRED',
  '咨询已提交，我们会尽快回复您': 'CONTACT_SUBMITTED',
  '获取咨询列表失败': 'CONTACTS_LOAD_FAILED',

  // ── 开放 API ──────────────────────────────────────────────────────────
  '密钥不存在': 'API_KEY_NOT_FOUND',
  '密钥已签发，明文只显示这一次，请立即复制并通过安全渠道交给合作方': 'API_KEY_ISSUED',
  '合作方代码、名称、挂靠客户都是必填': 'PARTNER_FIELDS_REQUIRED',
  '合作方代码只能是 2-50 位大写字母/数字/下划线': 'PARTNER_CODE_FORMAT',
  '合作方名称不能为空': 'PARTNER_NAME_REQUIRED',
  '挂靠客户不存在': 'PARTNER_CLIENT_NOT_FOUND',
  'Webhook 地址必须是 http(s) URL 且不超过 500 字符': 'WEBHOOK_URL_INVALID',
  '该合作方还没有配置 Webhook 接收地址': 'WEBHOOK_URL_NOT_SET',
  '这是一条来自 EU-TMS 的联调测试事件，收到即说明接收端与验签配置正确': 'WEBHOOK_TEST_EVENT',

  // ── 门户「公司设置」页 ────────────────────────────────────────────────
  '当前账号未关联公司': 'COMPANY_NOT_LINKED',
  '关联的公司记录不存在，请联系管理员': 'COMPANY_RECORD_MISSING',
  '公司资料已保存': 'COMPANY_PROFILE_SAVED',
  '获取公司资料失败': 'COMPANY_PROFILE_LOAD_FAILED',
  '保存公司资料失败': 'COMPANY_PROFILE_SAVE_FAILED',

  // ── 仪表板 / 统计 ─────────────────────────────────────────────────────
  '获取仪表板数据失败': 'DASHBOARD_LOAD_FAILED',
  '获取统计失败': 'STATS_LOAD_FAILED',
}

/**
 * 按文案查码
 * @param {string} message
 * @returns {string|undefined} 查不到返回 undefined（前端会退回用 message）
 */
export function codeForMessage(message) {
  if (typeof message !== 'string') return undefined
  return MESSAGE_CODES[message]
}

export default { MESSAGE_CODES, codeForMessage }
