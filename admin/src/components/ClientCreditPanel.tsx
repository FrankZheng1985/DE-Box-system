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
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse } from '../utils/api'
import { formatDateTime, formatMoney } from '../utils/format'
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

const CHECK_POINT_LABEL_KEYS: Record<string, string> = {
  ORDER_CREATE: 'creditStage.ORDER_CREATE',
  ORDER_CONFIRM: 'creditStage.ORDER_CONFIRM',
  DELIVERY: 'creditStage.DELIVERY',
  MANUAL: 'creditStage.MANUAL',
}

const RESULT_STYLES: Record<string, string> = {
  PASSED: 'bg-green-100 text-green-700',
  WARNING: 'bg-amber-100 text-amber-700',
  BLOCKED: 'bg-red-100 text-red-700',
}

const RESULT_LABEL_KEYS: Record<string, string> = {
  PASSED: 'creditResult.PASSED',
  WARNING: 'creditResult.WARNING',
  BLOCKED: 'creditResult.BLOCKED',
}

const RISK_LABEL_KEYS: Record<string, string> = {
  LOW: 'riskCategoryShort.LOW',
  MEDIUM: 'riskCategoryShort.MEDIUM',
  HIGH: 'riskCategoryShort.HIGH',
}

// ==================== 工具函数 ====================

function formatCurrency(amount: string | number | null | undefined): string {
  return formatMoney(Number(amount) || 0)
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
  const { t } = useTranslation()
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
      setToast({ type: 'success', message: res.message || t('credit.released') })
      setReleaseTarget(null)
      fetchLogs()
      onChanged()
    } else {
      throw new Error(res.message || t('credit.releaseFailed'))
    }
  }

  // 冻结 / 解冻
  const handleToggleBlock = async (reason?: string) => {
    const res = await api.put<ApiResponse<null>>(`/clients/${clientId}/credit-block`, {
      blocked: !creditBlocked,
      reason,
    })
    if (res.code === 200) {
      setToast({ type: 'success', message: res.message || t('common.operateSuccess') })
      setBlockConfirm(false)
      fetchLogs()
      onChanged()
    } else {
      throw new Error(res.message || t('common.operateFailed'))
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
            <p className="text-sm font-medium text-red-700">{t('credit.blockedTitle')}</p>
            <p className="text-xs text-red-600 mt-0.5">
              {t('credit.blockedHint')}
            </p>
          </div>
        </div>
      )}

      {/* 额度概览 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('credit.limit')}
          value={noLimit ? t('credit.unlimited') : formatCurrency(limit)}
          icon={Wallet}
          color="blue"
        />
        <StatCard
          title={t('credit.exposure')}
          value={formatCurrency(exposure)}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title={t('credit.available')}
          value={noLimit ? t('credit.unlimited') : formatCurrency(available)}
          icon={ShieldCheck}
          color={available < 0 ? 'red' : 'green'}
        />
        <StatCard
          title={t('client.riskCategory')}
          value={riskCategory ? t(RISK_LABEL_KEYS[riskCategory] || '', { defaultValue: riskCategory }) : '-'}
          subtitle={riskCategory === 'HIGH' ? t('credit.riskHintHigh') : riskCategory === 'LOW' ? t('credit.riskHintLow') : t('credit.riskHintMedium')}
          icon={ShieldAlert}
          color={riskCategory === 'HIGH' ? 'red' : riskCategory === 'LOW' ? 'green' : 'yellow'}
        />
      </div>

      {/* 操作区 + 筛选 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{t('credit.checkLog')}</h3>
          <select
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          >
            <option value="all">{t('credit.allResults')}</option>
            <option value="WARNING">{t('credit.onlyWarning')}</option>
            <option value="BLOCKED">{t('credit.onlyBlocked')}</option>
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
          {creditBlocked ? t('credit.unblock') : t('credit.block')}
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
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colCheckedAt')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colStage')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colOrder')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colOrderAmount')}</th>
                <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colExposureThen')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colResult')}</th>
                <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">{t('credit.colOverride')}</th>
                <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">{t('common.actions')}</th>
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
                    <p className="text-sm text-slate-500">{t('credit.empty')}</p>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                    <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatDateTime(log.checked_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 text-center">
                      {t(CHECK_POINT_LABEL_KEYS[log.check_point] || '', { defaultValue: log.check_point })}
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
                        {t(RESULT_LABEL_KEYS[log.check_result] || '', { defaultValue: log.check_result })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate" title={log.override_reason || ''}>
                      {log.override_reason
                        ? `${log.override_by_name || t('credit.unknown')}：${log.override_reason}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {/* 只有还没释放过的拦截/预警记录才给释放入口 */}
                      {log.check_result !== 'PASSED' && !log.override_reason ? (
                        <button
                          onClick={() => setReleaseTarget(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all duration-200"
                          title={t('credit.overrideTitle')}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {t('credit.override')}
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
        title={t('credit.overrideModalTitle')}
        message={t('credit.overrideMessage')}
        targetLabel={companyName}
        requireReason
        reasonPlaceholder={t('credit.overrideReasonPlaceholder')}
        variant="primary"
        confirmText={t('credit.confirmOverride')}
        warningText={t('credit.overrideWarning')}
      />

      {/* 冻结 / 解冻确认 */}
      <ConfirmDialog
        isOpen={blockConfirm}
        onClose={() => setBlockConfirm(false)}
        onConfirm={handleToggleBlock}
        title={creditBlocked ? t('credit.unblock') : t('credit.block')}
        message={creditBlocked
          ? t('credit.unblockMessage')
          : t('credit.blockMessage')}
        targetLabel={companyName}
        requireReason={!creditBlocked}
        reasonPlaceholder={t('credit.blockReasonPlaceholder')}
        variant={creditBlocked ? 'primary' : 'danger'}
        confirmText={creditBlocked ? t('credit.confirmUnblock') : t('credit.confirmBlock')}
      />
    </div>
  )
}
