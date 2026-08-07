import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Download, Eye, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatDate } from '../utils/format'
import { downloadFile, openFileInNewTab } from '../utils/fileDownload'

interface CMRDocument {
  id: string
  cmr_number: string
  order_number: string
  customer_ref: string | null
  from_city: string
  to_city: string
  // ⚠️ cmr_documents 表里没有 status 列，只有 sign_status
  sign_status: string
  file_url: string
  uploaded_at: string
  created_at: string
}

// 只留样式，文案走 signStatus.* 语言包。
// ⚠️ key 必须是 cmr_documents.sign_status 的真实取值（大写）：
//    UNSIGNED / SENDER_SIGNED / RECEIVER_SIGNED / COMPLETED
//    原来写的是 draft / issued / in_transit / delivered，只有 completed 侥幸对上，
//    其余三个状态一直显示原始英文（踩坑 004 + 033）
const STATUS_STYLES: Record<string, string> = {
  UNSIGNED: 'bg-gray-100 text-gray-600',
  SENDER_SIGNED: 'bg-amber-100 text-amber-700',
  RECEIVER_SIGNED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
}

export default function CMRFiles() {
  const { t } = useTranslation()
  const [documents, setDocuments] = useState<CMRDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 正在下载/预览的那一行 id，用来禁用按钮防止重复点
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    loadCMR()
  }, [])

  const loadCMR = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<CMRDocument[]>>('/cmr')
      if (res.code === 200) {
        setDocuments(res.data || [])
      }
    } catch (err) {
      console.error('加载CMR文件失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (doc: CMRDocument) => {
    setError('')
    setBusyId(doc.id)
    try {
      await downloadFile(`/cmr/${doc.id}/download`, doc.cmr_number || 'CMR')
    } catch (err) {
      console.error('下载CMR失败:', err)
      setError(err instanceof Error ? err.message : t('common.downloadFailed'))
    } finally {
      setBusyId('')
    }
  }

  const handlePreview = async (doc: CMRDocument) => {
    setError('')
    setBusyId(doc.id)
    try {
      await openFileInNewTab(`/cmr/${doc.id}/download`)
    } catch (err) {
      console.error('预览CMR失败:', err)
      setError(err instanceof Error ? err.message : t('common.downloadFailed'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{t('cmrFiles.count', { count: documents.length })}</span>
        <button onClick={loadCMR} aria-label={t('common.refresh')} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[600px]">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[21%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('cmrFiles.cmrNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.orderNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('cmrFiles.customerRef')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.route')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.date')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">{t('cmrFiles.empty')}</p>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const statusKey = (doc.sign_status || '').toUpperCase()
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">{doc.cmr_number || t('common.empty')}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{doc.order_number || t('common.empty')}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate" title={doc.customer_ref || undefined}>
                        {doc.customer_ref || t('common.empty')}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {doc.from_city || t('common.empty')} → {doc.to_city || t('common.empty')}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap ${
                          STATUS_STYLES[statusKey] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(`signStatus.${statusKey}`, { defaultValue: doc.sign_status || t('common.empty') })}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(doc.uploaded_at || doc.created_at)}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          {doc.file_url && (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePreview(doc)}
                                disabled={busyId === doc.id}
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                              >
                                <Eye className="w-3 h-3" />
                                {t('common.view')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownload(doc)}
                                disabled={busyId === doc.id}
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-slate-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                              >
                                <Download className="w-3 h-3" />
                                {busyId === doc.id ? t('common.downloading') : t('common.download')}
                              </button>
                            </>
                          )}
                          {!doc.file_url && (
                            <span className="text-[10px] text-slate-400">{t('cmrFiles.noFile')}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
