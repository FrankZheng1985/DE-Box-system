/**
 * ERP 内核引擎 - 统一入口
 *
 * 所有业务模块必须通过此入口使用内核引擎，
 * 禁止直接导入单个引擎文件（确保一致性）。
 *
 * 使用方式：
 *   import { documentEngine, numberRange, creditManager } from '../core/index.js'
 */

export { default as documentEngine } from './document-engine.js'
export { default as documentFlow } from './document-flow.js'
export { default as numberRange } from './number-range.js'
export { default as changeTracker } from './change-tracker.js'
export { default as postingPeriod } from './posting-period.js'
export { default as accountDetermination } from './account-determination.js'
export { default as creditManager } from './credit-manager.js'
export { default as pricingEngine } from './pricing-engine.js'
export { default as notificationEngine, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from './notification-engine.js'
export { default as workflowEngine } from './workflow-engine.js'

// 导出类（用于需要自定义实例的场景）
export { DocumentEngine } from './document-engine.js'
export { DocumentFlowEngine } from './document-flow.js'
export { NumberRangeManager } from './number-range.js'
export { ChangeTracker } from './change-tracker.js'
export { PostingPeriodManager } from './posting-period.js'
export { AccountDetermination } from './account-determination.js'
export { CreditManager } from './credit-manager.js'
export { PricingEngine } from './pricing-engine.js'
export { NotificationEngine } from './notification-engine.js'
export { WorkflowEngine } from './workflow-engine.js'
