/**
 * 客户信用风控面板（P7 需求 6）
 *
 * 放在客户详情页的「信用风控」Tab 里，做三件事：
 *   1. 展示额度 / 敞口 / 可用额度 / 风险类别，冻结状态一眼可见
 *   2. 列出这个客户的信用检查日志（含被拦截的订单）
 *   3. 被拦的记录可以人工释放；也可以直接手动冻结/解冻
 *
 * 权限：整块内容只对有 client:credit 的角色显示，由父组件控制 Tab 是否出现。
 */

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, ShieldAlert, Wallet, TrendingUp, Lock, Unlock,
  CheckCircle, AlertCircle, KeyRound,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import StatCard from './StatCard'
import ConfirmDialog from './ConfirmDialog'

// ==================== 类型定义 ====================

interface CreditCheckLog {
  id: string
  check_point: string
  order_id: string | null
  order_number: string | null
  // NUMERIC 列 pg 驱动返回字符串，用之前必须 Number()（踩坑 002）
  credit_limit: string | number | null
  credit_exposure: string | number | null
  order_amount: string | number | null
  check_result: string
  override_reason: string | null
  override_by_name: string | null
  checked_at: string
}

interface ClientCreditPanelProps {
  clientId: string
  companyName: string
  creditLimit: string | number | null
  creditExposure: string | number | null
  riskCategory: string
  creditBlocked: boolean
  /** 释放/冻结成功后通知父组件重新拉客户详情 */
  onChanged: () => void
}

// ==================== 常量 ====================

const CHECK_POINT_LABELS: Record<string, string> = {
  ORDER_CREATE: '订单创建',
  ORDER_CONFIRM: '订单确认',
  DELIVERY: '交付',
  MANUAL: '人工操作',
}

const RESULT_STYLES: Record<string, string> = {
  PASSED: 'bg-green-100 text-green-700',
  WARNING: 'bg-amber-100 text-amber-700',
  BLOCKED: 'bg-red-100 text-red-700',
}

const RESULT_LABELS: Record<string, string> = {
  PASSED: '通过',
  WARNING: '预警',
  BLOCKED: '已拦截',
}

const RISK_LABELS: Record<string, string> = {
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
}

// ==================== 工具函数 ====================

function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount) || 0
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ==================== 组件 ====================

export default function ClientCreditPanel({
  clientId,
  companyName,
  creditLimit,
  creditExposure,
  riskCategory,
  creditBlocked,
  onChanged,
}: ClientCreditPanelProps) {
  const [logs, setLogs] = useState<CreditCheckLog[]>([])
  const [loading, setLoading] = useState(true)
  const [resultFilter, setResultFilter] = useState<'all' | 'WARNING' | 'BLOCKED'>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 要释放的那条日志
  const [releaseTarget, setReleaseTarget] = useState<CreditCheckLog | null>(null)
  // 冻结/解冻确认
  const [blockConfirm, setBlockConfirm] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ pageSize: '50' })
      if (resultFilter !== 'all') params.set('result', resultFilter)
      const res = await api.get<ApiResponse<CreditCheckLog[]>>(
        `/clients/${clientId}/credit-logs?${params.toString()}`
      )
      if (res.code === 200) setLogs(res.data || [])
    } catch (err) {
      console.error('[信用风控] 获取检查日志失败:', err)
    } finally {
      setLoading(false)
    }
  }, [clientId, resultFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  // 人工释放
  const handleRelease = async (reason?: string) => {
    if (!releaseTarget) return
    const res = await api.post<ApiResponse<null>>(`/clients/${clientId}/credit-release`, {
      logId: releaseTarget.id,
      reason,
    })
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message || '信用已释放' })
      setReleaseTarget(null)
      fetchLogs()
      onChanged()
    } else {
      throw new Error(res.message || '释放失败')
    }
  }

  // 冻结 / 解冻
  const handleToggleBlock = async (reason?: string) => {
    const res = await api.put<ApiResponse<null>>(`/clients/${clientId}/credit-block`, {
      blocked: !creditBlocked,
      reason,
    })
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message || '操作成功' })
      setBlockConfirm(false)
      fetchLogs()
      onChanged()
    } else {
      throw new Error(res.message || '操作失败')
    }
  }

  const limit = Number(creditLimit) || 0
  const exposure = Number(creditExposure) || 0
  const available = limit - exposure
  // 额度为 0 在 credit-manager 里表示"不限额"，这里也要照这个口径显示
  const noLimit = limit <= 0

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* 冻结横幅 */}
      {creditBlocked && (
        <div className="flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-2xl">
          <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">该客户信用已冻结</p>
            <p className="text-xs text-red-600 mt-0.5">
              冻结期间无法为其创建新订单，需要先解冻或对具体的拦截记录做人工释放
            </p>
          </div>
        </div>
      )}

      {/* 额度概览 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="信用额度"
          value={noLimit ? '不限额' : formatCurrency(limit)}
          icon={Wallet}
          color="blue"
        />
        <StatCard
          title="当前敞口"
          value={formatCurrency(exposure)}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title="可用额度"
          value={noLimit ? '不限额' : formatCurrency(available)}
          icon={ShieldCheck}
          color={available < 0 ? 'red' : 'green'}
        />
        <StatCard
          title="风险类别"
          value={RISK_LABELS[riskCategory] || riskCategory || '-'}
          subtitle={riskCategory === 'HIGH' ? '敞口含未确认订单' : riskCategory === 'LOW' ? '仅算未清应收' : '含在途订单'}
          icon={ShieldAlert}
          color={riskCategory === 'HIGH' ? 'red' : riskCategory === 'LOW' ? 'green' : 'yellow'}
        />
      </div>

      {/* 操作区 + 筛选 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">信用检查记录</h3>
          <select
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">全部结果</option>
            <option value="WARNING">仅预警</option>
            <option value="BLOCKED">仅拦截</option>
          </select>
        </div>
        <button
          onClick={() => setBlockConfirm(true)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
            creditBlocked
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'
          }`}
        >
          {creditBlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {creditBlocked ? '解除信用冻结' : '冻结客户信用'}
        </button>
      </div>

      {/* 日志表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[17%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">检查时间</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">检查节点</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">关联订单</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">订单金额</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">当时敞口</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">结果</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">释放记录</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <ShieldCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">暂无信用检查记录</p>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatDateTime(log.checked_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-center">
                      {CHECK_POINT_LABELS[log.check_point] || log.check_point}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate">{log.order_number || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 font-medium text-right">
                      {log.order_amount === null ? '-' : formatCurrency(log.order_amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-right">
                      {log.credit_exposure === null ? '-' : formatCurrency(log.credit_exposure)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                        RESULT_STYLES[log.check_result] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {RESULT_LABELS[log.check_result] || log.check_result}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate" title={log.override_reason || ''}>
                      {log.override_reason
                        ? `${log.override_by_name || '未知'}：${log.override_reason}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {/* 只有还没释放过的拦截/预警记录才给释放入口 */}
                      {log.check_result !== 'PASSED' && !log.override_reason ? (
                        <button
                          onClick={() => setReleaseTarget(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all duration-200"
                          title="人工释放"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          释放
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 人工释放确认 */}
      <ConfirmDialog
        isOpen={releaseTarget !== null}
        onClose={() => setReleaseTarget(null)}
        onConfirm={handleRelease}
        title="人工释放信用"
        message="释放后这条拦截记录会标记为已通过，同时解除该客户的信用冻结标记。释放动作会记名留痕。"
        targetLabel={companyName}
        requireReason
        reasonPlaceholder="请填写释放原因，例如：客户已承诺本周回款、总经理特批等"
        variant="primary"
        confirmText="确认释放"
        warningText="如果这次拦截是敞口超额造成的，只释放解决不了下一单——要长期放行请同时到「编辑客户」里调高信用额度"
      />

      {/* 冻结 / 解冻确认 */}
      <ConfirmDialog
        isOpen={blockConfirm}
        onClose={() => setBlockConfirm(false)}
        onConfirm={handleToggleBlock}
        title={creditBlocked ? '解除信用冻结' : '冻结客户信用'}
        message={creditBlocked
          ? '解冻后该客户可以正常下单，信用检查会恢复按额度和敞口判断。'
          : '冻结后该客户的任何新订单都会被信用检查直接拦下，直到解冻或做人工释放。'}
        targetLabel={companyName}
        requireReason={!creditBlocked}
        reasonPlaceholder="请填写冻结原因，例如：长期逾期未回款、合作纠纷等"
        variant={creditBlocked ? 'primary' : 'danger'}
        confirmText={creditBlocked ? '确认解冻' : '确认冻结'}
      />
    </div>
  )
}
