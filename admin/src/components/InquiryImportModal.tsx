/**
 * 运营端 · 询价批量导入弹窗
 *
 * 和客户门户同一套后端解析逻辑，区别只有一处：**运营必须先选客户**。
 * 客户门户的归属由 JWT 决定，运营端猜错客户比导入失败严重得多，所以不给默认值。
 *
 * 流程：选客户 → 选文件 → 后端解析出预览（不写库）→ 确认导入。
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import i18n from '../i18n'
import api, { type ApiResponse, getApiBaseUrl, getAuthHeaders } from '../utils/api'

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

interface ImportPreview {
  totalRows: number
  inquiryCount: number
  itemCount: number
  inquiries: ImportPreviewInquiry[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

interface ClientOption {
  id: string
  client_code: string | null
  company_name: string
}

interface Props {
  onClose: () => void
  /** 导入成功后回调，参数是成功导入的询价单张数 */
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

  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

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

  const handleDownloadTemplate = async () => {
    setError('')
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inquiries/import-template`, {
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

    if (!clientId) {
      setError(t('inquiryImport.clientRequired'))
      return
    }
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
      const { body } = await postFile('/inquiries/import/preview', selected, { clientId })
      // 400 也可能带着完整的错误清单回来，有 data 就照常显示，让运营知道错在哪一行
      if (body?.data) {
        setPreview(body.data as ImportPreview)
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
    if (!file || !clientId || !preview || preview.errors.length > 0 || preview.inquiryCount === 0) return
    setImporting(true)
    setError('')
    try {
      const { body } = await postFile('/inquiries/import', file, { clientId })
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

  const canImport = !!preview && !!clientId && preview.errors.length === 0 && preview.inquiryCount > 0 && !importing

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">{t('inquiryImport.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 说明 + 下载模板 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-800 leading-relaxed">{t('inquiryImport.hint')}</p>
            <button
              onClick={handleDownloadTemplate}
              className="h-9 px-3 text-sm text-blue-700 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-in-out"
            >
              <Download className="w-4 h-4" />
              {t('inquiryImport.downloadTemplate')}
            </button>
          </div>

          {/* 导入到哪个客户 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t('inquiryImport.selectClient')} <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setPreview(null); setError('') }}
              className="w-full sm:min-w-[320px] sm:w-auto h-9 px-3 pr-8 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ease-in-out"
            >
              <option value="">{t('inquiryImport.clientPlaceholder')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.client_code ? `${c.client_code} · ${c.company_name}` : c.company_name}
                </option>
              ))}
            </select>
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
            className={`flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ease-in-out ${
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
                <FileSpreadsheet className="w-7 h-7 text-blue-500" />
                <p className="text-sm text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400">{t('inquiryImport.reselect')}</p>
              </>
            ) : (
              <>
                <Upload className="w-7 h-7 text-slate-300" />
                <p className="text-sm text-slate-600">{t('inquiryImport.chooseFile')}</p>
                <p className="text-xs text-slate-400">{t('inquiryImport.fileHint')}</p>
              </>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>
          )}

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('inquiryImport.parsing')}
            </div>
          )}

          {preview && !parsing && (
            <div className="space-y-4">
              {/* 汇总 */}
              <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-slate-50 rounded-xl text-xs text-slate-600">
                <span>{t('inquiryImport.statRows')} <b className="text-slate-900">{preview.totalRows}</b></span>
                <span>{t('inquiryImport.statInquiries')} <b className="text-slate-900">{preview.inquiryCount}</b></span>
                <span>{t('inquiryImport.statItems')} <b className="text-slate-900">{preview.itemCount}</b></span>
              </div>

              {/* 错误：有一条就整批不导 */}
              {preview.errors.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-xl overflow-hidden">
                  <p className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-800 border-b border-red-200">
                    <AlertTriangle className="w-4 h-4" />
                    {t('inquiryImport.errorsTitle', { count: preview.errors.length })}
                  </p>
                  <ul className="max-h-44 overflow-y-auto px-4 py-2 space-y-1">
                    {preview.errors.map((issue, i) => (
                      <li key={i} className="text-xs text-red-700">
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
                  <p className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-amber-800 border-b border-amber-200">
                    <AlertTriangle className="w-4 h-4" />
                    {t('inquiryImport.warningsTitle', { count: preview.warnings.length })}
                  </p>
                  <ul className="max-h-36 overflow-y-auto px-4 py-2 space-y-1">
                    {preview.warnings.map((issue, i) => (
                      <li key={i} className="text-xs text-amber-700">
                        {issue.row ? `${t('inquiryImport.rowLabel', { row: issue.row })} ` : ''}
                        {issue.column ? `${issue.column}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 将要生成的询价单 */}
              {preview.inquiries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[820px]">
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
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-left px-3 py-2.5 font-medium">{t('inquiryImport.colRef')}</th>
                        <th className="text-left px-3 py-2.5 font-medium">{t('inquiryImport.colService')}</th>
                        <th className="text-left px-3 py-2.5 font-medium">{t('inquiryImport.colRoute')}</th>
                        <th className="text-right px-3 py-2.5 font-medium">{t('inquiryImport.colLines')}</th>
                        <th className="text-right px-3 py-2.5 font-medium">{t('inquiryImport.colQty')}</th>
                        <th className="text-right px-3 py-2.5 font-medium">{t('inquiryImport.colWeight')}</th>
                        <th className="text-right px-3 py-2.5 font-medium">LDM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.inquiries.map((item, i) => (
                        <tr key={`${item.customerRef}-${i}`} className="border-b border-slate-50">
                          <td className="text-left px-3 py-2.5">
                            <span className="text-sm text-slate-900 block truncate">{item.customerRef}</span>
                            {item.duplicateOfExisting && (
                              <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full">
                                {t('inquiryImport.duplicateBadge')}
                              </span>
                            )}
                          </td>
                          <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                            {item.businessType
                              ? t(`businessType.${item.businessType}`, { defaultValue: item.businessType })
                              : '-'}
                          </td>
                          <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                            {routeText(item.routeFrom)} → {routeText(item.routeTo)}
                          </td>
                          <td className="text-right px-3 py-2.5 text-xs text-slate-600">{item.itemCount}</td>
                          <td className="text-right px-3 py-2.5 text-xs text-slate-600">{item.totalQuantity}</td>
                          <td className="text-right px-3 py-2.5 text-xs text-slate-600">{item.totalWeightKg.toFixed(2)}</td>
                          <td className="text-right px-3 py-2.5 text-xs text-slate-600">{item.totalLdm.toFixed(2)}</td>
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
            {preview && preview.errors.length > 0 ? t('inquiryImport.mustFixErrors') : ''}
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
                ? t('inquiryImport.importing')
                : t('inquiryImport.confirm', { count: preview?.inquiryCount ?? 0 })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
