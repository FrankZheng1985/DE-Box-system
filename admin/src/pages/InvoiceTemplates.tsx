/**
 * 发票模板管理页面
 * 模板卡片展示 + 自动开票规则配置
 */

import { useState, useEffect } from 'react'
import { FileText, Eye, Pencil, Receipt, Clock, Zap } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface InvoiceTemplate {
  id: string
  name: string
  clientType: string
  currency: string
  taxRate: string
  triggerRule: string
  lastUsedAt: string | null
}

// 默认模板数据（后端为空时展示）
const defaultTemplates: InvoiceTemplate[] = [
  {
    id: '1',
    name: '标准运输发票',
    clientType: '通用',
    currency: 'EUR',
    taxRate: '19%',
    triggerRule: '订单完成后自动生成',
    lastUsedAt: '2026-04-08 14:30',
  },
  {
    id: '2',
    name: 'DHL 专属模板',
    clientType: '专属',
    currency: 'EUR',
    taxRate: '19%',
    triggerRule: 'CMR 上传后自动生成',
    lastUsedAt: '2026-04-05 09:15',
  },
  {
    id: '3',
    name: '清关服务发票',
    clientType: '通用',
    currency: 'USD',
    taxRate: '0%',
    triggerRule: '手动触发',
    lastUsedAt: null,
  },
]

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(defaultTemplates)
  const [triggerCondition, setTriggerCondition] = useState('order_complete')
  const [defaultTemplate, setDefaultTemplate] = useState('1')
  const [sendMethod, setSendMethod] = useState('email')
  const [autoSendEmail, setAutoSendEmail] = useState(true)
  const [autoReminder, setAutoReminder] = useState(false)
  const [mergeClient, setMergeClient] = useState(false)

  // 尝试从后端加载模板
  useEffect(() => {
    api.get<ApiResponse<InvoiceTemplate[]>>('/invoice-templates')
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setTemplates(res.data)
        }
      })
      .catch(() => {
        // 后端未实现或返回空，使用默认数据
      })
  }, [])

  const handleAction = (action: string) => {
    alert(`功能完善中：${action}`)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">发票模板管理</h1>
        <p className="text-sm text-slate-500 mt-1">管理发票模板和自动开票规则</p>
      </div>

      {/* 模板卡片区域 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-200 ease-in-out"
          >
            {/* 头部：图标 + 名称 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{tpl.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      tpl.clientType === '专属'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {tpl.clientType}
                  </span>
                </div>
              </div>
            </div>

            {/* 信息区域 */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">币种</span>
                <span className="text-slate-700 font-medium">{tpl.currency}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">税率</span>
                <span className="text-slate-700 font-medium">{tpl.taxRate}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">触发规则</span>
                <span className="text-slate-700 font-medium">{tpl.triggerRule}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">最后使用</span>
                <span className="text-slate-500">
                  {tpl.lastUsedAt ? (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {tpl.lastUsedAt}
                    </span>
                  ) : (
                    '暂未使用'
                  )}
                </span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => handleAction('预览模板')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all duration-200"
              >
                <Eye className="w-3.5 h-3.5" />
                预览
              </button>
              <button
                onClick={() => handleAction('编辑模板')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all duration-200"
              >
                <Pencil className="w-3.5 h-3.5" />
                编辑
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 自动开票规则配置 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-900">自动开票规则配置</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 触发条件 */}
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">触发条件</label>
            <select
              value={triggerCondition}
              onChange={(e) => setTriggerCondition(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="order_complete">订单完成后</option>
              <option value="cmr_uploaded">CMR 上传后</option>
              <option value="manual">手动触发</option>
            </select>
          </div>

          {/* 默认模板 */}
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">默认模板</label>
            <select
              value={defaultTemplate}
              onChange={(e) => setDefaultTemplate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>

          {/* 自动发送方式 */}
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">自动发送方式</label>
            <select
              value={sendMethod}
              onChange={(e) => setSendMethod(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
            >
              <option value="email">邮件发送</option>
              <option value="system">系统通知</option>
              <option value="both">邮件 + 系统通知</option>
            </select>
          </div>
        </div>

        {/* 勾选项 */}
        <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSendEmail}
              onChange={(e) => setAutoSendEmail(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
            />
            <span className="text-sm text-slate-700">自动发送邮件</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReminder}
              onChange={(e) => setAutoReminder(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
            />
            <span className="text-sm text-slate-700">逾期自动催款</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mergeClient}
              onChange={(e) => setMergeClient(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
            />
            <span className="text-sm text-slate-700">批量合并同客户</span>
          </label>
        </div>
      </div>
    </div>
  )
}
