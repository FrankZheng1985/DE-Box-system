import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Download, Eye, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatDate } from '../utils/format'

interface CMRDocument {
  id: string
  cmr_number: string
  order_number: string
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

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{t('cmrFiles.count', { count: documents.length })}</span>
        <button onClick={loadCMR} aria-label={t('common.refresh')} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[600px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[25%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('cmrFiles.cmrNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('common.orderNo')}</th>
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
                  <td colSpan={6} className="text-center py-8">
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
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-primary-600 hover:bg-primary-50 rounded transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                {t('common.view')}
                              </a>
                              <a
                                href={doc.file_url}
                                download
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-slate-600 hover:bg-gray-100 rounded transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                {t('common.download')}
                              </a>
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
