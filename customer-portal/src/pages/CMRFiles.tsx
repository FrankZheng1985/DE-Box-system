import { useState, useEffect } from 'react'
import { FileText, Download, Eye, RefreshCw } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface CMRDocument {
  id: string
  cmrNo: string
  orderNo: string
  origin: string
  destination: string
  status: string
  fileUrl: string
  createdAt: string
}

const statusMap: Record<string, { label: string; style: string }> = {
  draft: { label: '草稿', style: 'bg-gray-100 text-gray-600' },
  issued: { label: '已签发', style: 'bg-blue-100 text-blue-700' },
  in_transit: { label: '运输中', style: 'bg-amber-100 text-amber-700' },
  delivered: { label: '已交付', style: 'bg-green-100 text-green-700' },
  completed: { label: '已完成', style: 'bg-green-100 text-green-700' },
}

export default function CMRFiles() {
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
        <span className="text-xs text-slate-500">共 {documents.length} 份CMR文件</span>
        <button onClick={loadCMR} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
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
                <th className="text-left px-3 py-2.5 font-medium">CMR编号</th>
                <th className="text-left px-3 py-2.5 font-medium">订单号</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-center px-3 py-2.5 font-medium">日期</th>
                <th className="text-center px-3 py-2.5 font-medium">操作</th>
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
                    <p className="text-sm text-slate-400">暂无CMR文件</p>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const st = statusMap[doc.status] || { label: doc.status, style: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">{doc.cmrNo}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{doc.orderNo}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {doc.origin} → {doc.destination}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${st.style}`}>{st.label}</span>
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          {doc.fileUrl && (
                            <>
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-primary-600 hover:bg-primary-50 rounded transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                查看
                              </a>
                              <a
                                href={doc.fileUrl}
                                download
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-slate-600 hover:bg-gray-100 rounded transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                下载
                              </a>
                            </>
                          )}
                          {!doc.fileUrl && (
                            <span className="text-[10px] text-slate-400">暂无文件</span>
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
