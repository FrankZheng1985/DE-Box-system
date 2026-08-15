/**
 * 客户门户 · 询价批量导入弹窗
 *
 * 流程固定三步：选文件 → 后端解析出预览（不写库）→ 确认导入。
 * 预览和导入调的是同一套后端解析逻辑，所以「预览看到几张单，导进去就是几张」。
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import i18n from '../i18n'
import { getAuthHeaders } from '../utils/api'
import { BUSINESS_TYPES, type BusinessType } from '../constants/businessTypes'

// ==================== 类型定义 ====================

interface ImportIssue {
  row: number | null
  column: string | null
  message: string
}

interface ImportPreviewInquiry {
  customerRef: string
  businessType: string | null
  routeFrom: { country?: string; city?: string }
  routeTo: { country?: string; city?: string }
  itemCount: number
  totalQuantity: number
  totalWeightKg: number
  totalLdm: number
  rows: number[]
  duplicateOfExisting: boolean
}

/** 本地派送预览里每个柜带的一票派送 */
interface ImportPreviewDrop {
  subRef: string
  deliveryAddress: { companyName?: string; country?: string; city?: string }
  itemCount: number
  totalQuantity: number
  totalWeightKg: number
}

interface ImportPreview {
  /** 只有本地派送会带这个字段，用它决定预览表格用哪一套列 */
  businessType?: string
  totalRows: number
  inquiryCount: number
  itemCount: number
  inquiries: (ImportPreviewInquiry & {
    containerNo?: string
    orderCount?: number
    deliveryOrders?: ImportPreviewDrop[]
  })[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

interface Props {
  onClose: () => void
  /** 导入成功后回调，参数是成功导入的询价单张数 */
  onImported: (count: number) => void
}

/**
 * 导入前必须先选服务类型（开发意见 #7）
 *
 * 三种服务要填的内容差得远，本地派送更是「柜 → 子订单 → 件」三层，
 * 用同一份模板必然填错。选了类型再下模板，模板和解析都按类型走。
 */
const IMPORT_BUSINESS_TYPES = [
  BUSINESS_TYPES.TRUCK_LTL,
  BUSINESS_TYPES.TRUCK_FTL,
  BUSINESS_TYPES.LOCAL_DELIVERY,
] as const

// ==================== 工具 ====================

/**
 * 上传文件必须走原生 fetch
 *
 * api 客户端固定带 Content-Type: application/json，用它传 FormData 会让
 * multer 认不出 multipart 边界，后端永远收不到文件（踩坑 016 的同类：
 * 前端以为传了，后端其实什么都没收到）。
 */
async function postFile(endpoint: string, file: File, extra: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(extra)) form.append(key, value)

  const res = await fetch(`/api/v1${endpoint}`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Accept-Language': i18n.language || 'zh',
    },
    body: form,
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

function routeText(addr: { country?: string; city?: string } | null): string {
  if (!addr) return '-'
  return [addr.country, addr.city].filter(Boolean).join(' ') || '-'
}

const MAX_FILE_SIZE = 5 * 1024 * 1024

// ==================== 主组件 ====================

export default function InquiryImportModal({ onClose, onImported }: Props) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [businessType, setBusinessType] = useState<BusinessType>(BUSINESS_TYPES.TRUCK_LTL)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleDownloadTemplate = async () => {
    setError('')
    try {
      const res = await fetch(`/api/v1/inquiries/import-template?businessType=${businessType}`, {
        headers: { ...getAuthHeaders(), 'Accept-Language': i18n.language || 'zh' },
      })
      if (!res.ok) throw new Error(t('inquiryImport.templateFailed'))

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t('inquiryImport.templateFileName')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('下载导入模板失败:', err)
      setError(err instanceof Error ? err.message : t('inquiryImport.templateFailed'))
    }
  }

  const handleSelectFile = async (selected: File | null) => {
    if (!selected) return
    setPreview(null)
    setError('')

    if (!/\.xlsx?$/i.test(selected.name)) {
      setError(t('inquiryImport.errWrongType'))
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(t('inquiryImport.errTooLarge'))
      return
    }

    setFile(selected)
    setParsing(true)
    try {
      const { body } = await postFile('/inquiries/import/preview', selected, { businessType })
      // 400 也可能带着完整的错误清单回来，有 data 就照常显示，让客户知道错在哪一行
      if (body?.data) {
        setPreview(body.data as ImportPreview)
        if (!body.data.inquiries?.length && body.data.errors?.length) setError('')
      } else {
        setError(body?.message || t('inquiryImport.parseFailed'))
      }
    } catch (err) {
      console.error('解析导入文件失败:', err)
      setError(t('inquiryImport.parseFailed'))
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    if (!file || !preview || preview.errors.length > 0 || preview.inquiryCount === 0) return
    setImporting(true)
    setError('')
    try {
      const { body } = await postFile('/inquiries/import', file, { businessType })
      if (body?.code === 200) {
        onImported(body.data?.count ?? preview.inquiryCount)
      } else {
        // 必须显示后端 message，否则失败会被伪装成成功（踩坑 011）
        if (body?.data) setPreview(body.data as ImportPreview)
        setError(body?.message || t('inquiryImport.importFailed'))
      }
    } catch (err) {
      console.error('批量导入失败:', err)
      setError(t('inquiryImport.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const canImport = !!preview && preview.errors.length === 0 && preview.inquiryCount > 0 && !importing
  /** 认后端回的 businessType，不认前端选的——万一两者不一致，以实际解析出来的为准 */
  const isLocalDeliveryPreview = preview?.businessType === BUSINESS_TYPES.LOCAL_DELIVERY

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-900">{t('inquiryImport.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 第一步：选服务类型（开发意见 #7）——模板和解析都跟着它走 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">
              {t('inquiryImport.chooseService')} {t('common.required')}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {IMPORT_BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt}
                  type="button"
                  onClick={() => {
                    if (bt === businessType) return
                    // 换了服务类型，已选的文件和预览就作废了——它们是按上一种类型解析的，
                    // 留着会让客户以为那份预览还算数
                    setBusinessType(bt)
                    setFile(null)
                    setPreview(null)
                    setError('')
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className={`h-8 px-3 text-xs rounded-lg border transition-all duration-200 ease-in-out ${
                    businessType === bt
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                      : 'border-gray-200 bg-white text-slate-600 hover:bg-gray-50'
                  }`}
                >
                  {t(`businessType.${bt}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 说明 + 下载模板 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-[11px] text-blue-800 leading-relaxed">
              {businessType === BUSINESS_TYPES.LOCAL_DELIVERY
                ? t('inquiryImport.hintLocalDelivery')
                : t('inquiryImport.hint')}
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="h-8 px-3 text-xs text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-in-out"
            >
              <Download className="w-3.5 h-3.5" />
              {t('inquiryImport.downloadTemplate')}
            </button>
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
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
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
                <FileSpreadsheet className="w-6 h-6 text-primary-500" />
                <p className="text-xs text-slate-700">{file.name}</p>
                <p className="text-[11px] text-slate-400">{t('inquiryImport.reselect')}</p>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-slate-300" />
                <p className="text-xs text-slate-600">{t('inquiryImport.chooseFile')}</p>
                <p className="text-[11px] text-slate-400">{t('inquiryImport.fileHint')}</p>
              </>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{error}</div>
          )}

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('inquiryImport.parsing')}
            </div>
          )}

          {preview && !parsing && (
            <div className="space-y-4">
              {/* 汇总 */}
              <div className="flex flex-wrap items-center gap-4 px-3 py-2.5 bg-gray-50 rounded-xl text-[11px] text-slate-600">
                <span>{t('inquiryImport.statRows')} <b className="text-slate-900">{preview.totalRows}</b></span>
                <span>{t('inquiryImport.statInquiries')} <b className="text-slate-900">{preview.inquiryCount}</b></span>
                <span>{t('inquiryImport.statItems')} <b className="text-slate-900">{preview.itemCount}</b></span>
              </div>

              {/* 错误：有一条就整批不导 */}
              {preview.errors.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-xl overflow-hidden">
                  <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-800 border-b border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('inquiryImport.errorsTitle', { count: preview.errors.length })}
                  </p>
                  <ul className="max-h-40 overflow-y-auto px-3 py-2 space-y-1">
                    {preview.errors.map((issue, i) => (
                      <li key={i} className="text-[11px] text-red-700">
                        {issue.row ? `${t('inquiryImport.rowLabel', { row: issue.row })} ` : ''}
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
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('inquiryImport.warningsTitle', { count: preview.warnings.length })}
                  </p>
                  <ul className="max-h-32 overflow-y-auto px-3 py-2 space-y-1">
                    {preview.warnings.map((issue, i) => (
                      <li key={i} className="text-[11px] text-amber-700">
                        {issue.row ? `${t('inquiryImport.rowLabel', { row: issue.row })} ` : ''}
                        {issue.column ? `${issue.column}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 将要生成的询价单 —— 本地派送是「一个柜一张单」，列的口径不一样，单独一套 */}
              {preview.inquiries.length > 0 && isLocalDeliveryPreview && (
                <div className="space-y-3">
                  {preview.inquiries.map((item, i) => (
                    <div key={`${item.containerNo}-${i}`} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs font-medium text-slate-900">{item.containerNo || '-'}</span>
                        {item.customerRef && (
                          <span className="text-[11px] text-slate-500">{item.customerRef}</span>
                        )}
                        {item.duplicateOfExisting && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full">
                            {t('inquiryImport.duplicateBadge')}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-slate-500">
                          {t('inquiryImport.ldSummary', {
                            drops: item.orderCount ?? item.deliveryOrders?.length ?? 0,
                            qty: item.totalQuantity,
                            weight: item.totalWeightKg.toFixed(2),
                          })}
                        </span>
                      </div>
                      <table className="w-full table-fixed">
                        <colgroup>
                          <col className="w-[22%]" />
                          <col className="w-[46%]" />
                          <col className="w-[10%]" />
                          <col className="w-[10%]" />
                          <col className="w-[12%]" />
                        </colgroup>
                        <thead>
                          <tr className="text-[11px] text-slate-500 border-b border-gray-100">
                            <th className="text-left px-2 py-1.5 font-medium">{t('inquiryImport.colSubRef')}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t('inquiryImport.colDropTo')}</th>
                            <th className="text-right px-2 py-1.5 font-medium">{t('inquiryImport.colLines')}</th>
                            <th className="text-right px-2 py-1.5 font-medium">{t('inquiryImport.colQty')}</th>
                            <th className="text-right px-2 py-1.5 font-medium">{t('inquiryImport.colWeight')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(item.deliveryOrders || []).map((drop, j) => (
                            <tr key={`${drop.subRef}-${j}`} className="border-b border-gray-50 last:border-0">
                              <td className="text-left px-2 py-1.5 text-xs text-slate-900 truncate">{drop.subRef || '-'}</td>
                              <td className="text-left px-2 py-1.5 text-xs text-slate-600 truncate">
                                {[drop.deliveryAddress?.companyName, routeText(drop.deliveryAddress)]
                                  .filter(Boolean).join(' · ')}
                              </td>
                              <td className="text-right px-2 py-1.5 text-xs text-slate-600">{drop.itemCount}</td>
                              <td className="text-right px-2 py-1.5 text-xs text-slate-600">{drop.totalQuantity}</td>
                              <td className="text-right px-2 py-1.5 text-xs text-slate-600">{drop.totalWeightKg.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {preview.inquiries.length > 0 && !isLocalDeliveryPreview && (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[760px]">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[24%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-[11px] text-slate-500 border-b border-gray-100">
                        <th className="text-left px-2 py-2 font-medium">{t('inquiryImport.colRef')}</th>
                        <th className="text-left px-2 py-2 font-medium">{t('inquiryImport.colService')}</th>
                        <th className="text-left px-2 py-2 font-medium">{t('inquiryImport.colRoute')}</th>
                        <th className="text-right px-2 py-2 font-medium">{t('inquiryImport.colLines')}</th>
                        <th className="text-right px-2 py-2 font-medium">{t('inquiryImport.colQty')}</th>
                        <th className="text-right px-2 py-2 font-medium">{t('inquiryImport.colWeight')}</th>
                        <th className="text-right px-2 py-2 font-medium">LDM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.inquiries.map((item, i) => (
                        <tr key={`${item.customerRef}-${i}`} className="border-b border-gray-50">
                          <td className="text-left px-2 py-2">
                            <span className="text-xs text-slate-900 block truncate">{item.customerRef}</span>
                            {item.duplicateOfExisting && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full">
                                {t('inquiryImport.duplicateBadge')}
                              </span>
                            )}
                          </td>
                          <td className="text-left px-2 py-2 text-xs text-slate-600 truncate">
                            {item.businessType
                              ? t(`businessType.${item.businessType}`, { defaultValue: item.businessType })
                              : '-'}
                          </td>
                          <td className="text-left px-2 py-2 text-xs text-slate-600 truncate">
                            {routeText(item.routeFrom)} → {routeText(item.routeTo)}
                          </td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{item.itemCount}</td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{item.totalQuantity}</td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{item.totalWeightKg.toFixed(2)}</td>
                          <td className="text-right px-2 py-2 text-xs text-slate-600">{item.totalLdm.toFixed(2)}</td>
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
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <p className="text-[11px] text-slate-400">
            {preview && preview.errors.length > 0 ? t('inquiryImport.mustFixErrors') : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200 ease-in-out"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="h-8 px-3 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {importing
                ? t('inquiryImport.importing')
                : t('inquiryImport.confirm', { count: preview?.inquiryCount ?? 0 })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
