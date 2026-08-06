/**
 * 运营端 · 订单批量导入弹窗
 *
 * 流程：选客户 + 选运输产品 → 下载该产品的模板 → 选文件（后端解析出预览，不写库）→ 确认导入。
 * 预览和导入调的是同一套后端解析逻辑，所以「预览看到几张单，导进去就是几张」。
 *
 * ⚠️ 换产品必须清掉已选文件和预览：模板列跟着产品走，
 *    拿 LTL 的表按集装箱去解析，结果只会是一堆看不懂的报错。
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import i18n from '../i18n'
import api, { type ApiResponse, getApiBaseUrl, getAuthHeaders } from '../utils/api'
import { BUSINESS_TYPES, BUSINESS_TYPE_LIST, businessTypeLabelKey, type BusinessType } from '../constants/businessTypes'

// ==================== 类型定义 ====================

interface ClientOption {
  id: string
  company_name: string
  client_code?: string
}

interface ImportIssue {
  row: number | null
  column: string | null
  message: string
}

interface AddressPart {
  country?: string
  city?: string
  zipCode?: string
  address?: string
}

/** 预览行 = 后端解析出来的 createOrder payload + 行号 */
interface ImportPreviewOrder {
  rowNumber: number
  businessType: string
  customerRef?: string | null
  pickupAddress?: AddressPart | null
  deliveryAddress?: AddressPart | null
  cargoQuantity?: number | null
  cargoWeightKg?: number | null
  pickupDate?: string | null
  blNumber?: string
  containerNo?: string
  pod?: string
  finalDestination?: string
}

interface ImportPreview {
  businessType: string
  totalRows: number
  orderCount: number
  orders: ImportPreviewOrder[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

interface Props {
  onClose: () => void
  /** 导入成功后回调，参数是成功导入的订单张数 */
  onImported: (count: number) => void
}

// ==================== 工具 ====================

/**
 * 上传文件必须走原生 fetch
 *
 * api 客户端固定带 Content-Type: application/json，用它传 FormData 会让
 * multer 认不出 multipart 边界，后端永远收不到文件。
 */
async function postFile(endpoint: string, file: File, extra: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(extra)) form.append(key, value)

  const res = await fetch(`${getApiBaseUrl()}/api/v1${endpoint}`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Accept-Language': i18n.language || 'zh' },
    body: form,
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

function cityText(addr?: AddressPart | null): string {
  if (!addr) return '-'
  return [addr.country, addr.city].filter(Boolean).join(' ') || '-'
}

function num(value?: number | null): string {
  return value === null || value === undefined ? '-' : String(value)
}

const MAX_FILE_SIZE = 5 * 1024 * 1024

// ==================== 主组件 ====================

export default function OrderImportModal({ onClose, onImported }: Props) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>(BUSINESS_TYPES.TRUCK_LTL)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const isContainer = businessType === BUSINESS_TYPES.TRUCK_FTL

  useEffect(() => {
    const loadClients = async () => {
      try {
        const res = await api.get<ApiResponse<ClientOption[]>>('/clients?pageSize=500')
        if (res.code === 200) setClients(res.data || [])
      } catch (err) {
        console.error('加载客户列表失败:', err)
      }
    }
    loadClients()
  }, [])

  function switchProduct(next: BusinessType) {
    if (next === businessType) return
    setBusinessType(next)
    // 模板列跟着产品走，旧文件对不上新产品，一律清掉重来
    setFile(null)
    setPreview(null)
    setError('')
  }

  const handleDownloadTemplate = async () => {
    setError('')
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders/import-template?businessType=${businessType}`, {
        headers: { ...getAuthHeaders(), 'Accept-Language': i18n.language || 'zh' },
      })
      if (!res.ok) throw new Error(t('orderImport.templateFailed'))

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t('orderImport.templateFileName')}_${businessType}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('下载订单导入模板失败:', err)
      setError(err instanceof Error ? err.message : t('orderImport.templateFailed'))
    }
  }

  const handleSelectFile = async (selected: File | null) => {
    if (!selected) return
    setPreview(null)
    setError('')

    if (!clientId) {
      setError(t('orderImport.clientRequired'))
      return
    }
    if (!/\.xlsx?$/i.test(selected.name)) {
      setError(t('orderImport.errWrongType'))
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(t('orderImport.errTooLarge'))
      return
    }

    setFile(selected)
    setParsing(true)
    try {
      const { body } = await postFile('/orders/import/preview', selected, { clientId, businessType })
      // 400 也可能带着完整的错误清单回来，有 data 就照常显示，让人知道错在哪一行
      if (body?.data) {
        setPreview(body.data as ImportPreview)
      } else {
        setError(body?.message || t('orderImport.parseFailed'))
      }
    } catch (err) {
      console.error('解析导入文件失败:', err)
      setError(t('orderImport.parseFailed'))
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    if (!file || !clientId || !preview || preview.errors.length > 0 || preview.orderCount === 0) return
    setImporting(true)
    setError('')
    try {
      const { body } = await postFile('/orders/import', file, { clientId, businessType })
      if (body?.code === 200) {
        onImported(body.data?.count ?? preview.orderCount)
      } else {
        // 必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        if (body?.data) setPreview(body.data as ImportPreview)
        setError(body?.message || t('orderImport.importFailed'))
      }
    } catch (err) {
      console.error('批量导入订单失败:', err)
      setError(t('orderImport.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const canImport = !!preview && !!clientId && preview.errors.length === 0 && preview.orderCount > 0 && !importing

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{t('orderImport.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 说明 + 下载模板 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-800 leading-relaxed">{t('orderImport.hint')}</p>
            <button
              onClick={handleDownloadTemplate}
              className="h-8 px-3 text-xs text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-in-out"
            >
              <Download className="w-4 h-4" />
              {t('orderImport.downloadTemplate')}
            </button>
          </div>

          {/* 导入到哪个客户 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t('orderImport.selectClient')} <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setPreview(null); setError('') }}
              className="w-full sm:min-w-[320px] sm:w-auto h-9 px-3 pr-8 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out"
            >
              <option value="">{t('orderImport.clientPlaceholder')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.client_code ? `${c.client_code} · ${c.company_name}` : c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* 选运输产品 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t('orderImport.stepProduct')} <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPE_LIST.map((bt) => (
                <button
                  key={bt}
                  type="button"
                  onClick={() => switchProduct(bt)}
                  className={`h-9 px-3 text-sm rounded-xl border transition-all duration-200 ease-in-out ${
                    businessType === bt
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  {t(businessTypeLabelKey(bt))}
                </button>
              ))}
            </div>
          </div>

          {/* 选文件 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleSelectFile(e.dataTransfer.files?.[0] || null)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ease-in-out ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { handleSelectFile(e.target.files?.[0] || null); e.target.value = '' }}
            />
            {file ? (
              <>
                <FileSpreadsheet className="w-6 h-6 text-blue-500" />
                <p className="text-sm text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400">{t('orderImport.reselect')}</p>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-slate-300" />
                <p className="text-sm text-slate-600">{t('orderImport.chooseFile')}</p>
                <p className="text-xs text-slate-400">{t('orderImport.fileHint')}</p>
              </>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{error}</div>
          )}

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('orderImport.parsing')}
            </div>
          )}

          {preview && !parsing && (
            <div className="space-y-4">
              {/* 汇总 */}
              <div className="flex flex-wrap items-center gap-4 px-3 py-2.5 bg-slate-50 rounded-xl text-xs text-slate-600">
                <span>{t('orderImport.statRows')} <b className="text-slate-900">{preview.totalRows}</b></span>
                <span>{t('orderImport.statOrders')} <b className="text-slate-900">{preview.orderCount}</b></span>
                <span>
                  {t('orderImport.statProduct')}{' '}
                  <b className="text-slate-900">
                    {t(businessTypeLabelKey(preview.businessType), { defaultValue: preview.businessType })}
                  </b>
                </span>
              </div>

              {/* 错误：有一条就整批不导 */}
              {preview.errors.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-xl overflow-hidden">
                  <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-800 border-b border-red-200">
                    <AlertTriangle className="w-4 h-4" />
                    {t('orderImport.errorsTitle', { count: preview.errors.length })}
                  </p>
                  <ul className="max-h-40 overflow-y-auto px-3 py-2 space-y-1">
                    {preview.errors.map((issue, i) => (
                      <li key={i} className="text-xs text-red-700">
                        {issue.row ? `${t('orderImport.rowLabel', { row: issue.row })} ` : ''}
                        {issue.column ? `${issue.column}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 警告：不阻断，但要看得见 */}
              {preview.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
                  <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 border-b border-amber-200">
                    <AlertTriangle className="w-4 h-4" />
                    {t('orderImport.warningsTitle', { count: preview.warnings.length })}
                  </p>
                  <ul className="max-h-32 overflow-y-auto px-3 py-2 space-y-1">
                    {preview.warnings.map((issue, i) => (
                      <li key={i} className="text-xs text-amber-700">
                        {issue.row ? `${t('orderImport.rowLabel', { row: issue.row })} ` : ''}
                        {issue.column ? `${issue.column}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 将要生成的订单 */}
              {preview.orders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[820px]">
                    <colgroup>
                      <col className="w-[8%]" />
                      <col className="w-[16%]" />
                      <col className="w-[20%]" />
                      <col className="w-[24%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[11%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-center px-2 py-2 font-medium">{t('orderImport.colRow')}</th>
                        <th className="text-left px-2 py-2 font-medium">{t('orderImport.colCustomerRef')}</th>
                        <th className="text-left px-2 py-2 font-medium">
                          {isContainer ? t('orderImport.colBlNumber') : t('orderImport.colPickup')}
                        </th>
                        <th className="text-left px-2 py-2 font-medium">
                          {isContainer ? t('orderImport.colContainerRoute') : t('orderImport.colDelivery')}
                        </th>
                        <th className="text-right px-2 py-2 font-medium">{t('orderImport.colQty')}</th>
                        <th className="text-right px-2 py-2 font-medium">{t('orderImport.colWeight')}</th>
                        <th className="text-center px-2 py-2 font-medium">
                          {isContainer ? t('orderImport.colContainerNo') : t('orderImport.colPickupDate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.orders.map((item) => (
                        <tr key={item.rowNumber} className="border-b border-slate-50">
                          <td className="text-center px-2 py-2 text-xs text-slate-400">{item.rowNumber}</td>
                          <td className="text-left px-2 py-2 text-xs text-slate-600 truncate" title={item.customerRef || undefined}>
                            {item.customerRef || '-'}
                          </td>
                          <td className="text-left px-2 py-2 text-xs text-slate-900 truncate">
                            {isContainer ? (item.blNumber || '-') : cityText(item.pickupAddress)}
                          </td>
                          <td className="text-left px-2 py-2 text-xs text-slate-600 truncate">
                            {isContainer
                              ? `${item.pod || '-'} → ${item.finalDestination || '-'}`
                              : cityText(item.deliveryAddress)}
                          </td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{num(item.cargoQuantity)}</td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{num(item.cargoWeightKg)}</td>
                          <td className="text-center px-2 py-2 text-xs text-slate-600 truncate">
                            {isContainer ? (item.containerNo || '-') : (item.pickupDate || '-')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            {preview && preview.errors.length > 0 ? t('orderImport.mustFixErrors') : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 ease-in-out"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="h-9 px-4 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {importing
                ? t('orderImport.importing')
                : t('orderImport.confirm', { count: preview?.orderCount ?? 0 })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
