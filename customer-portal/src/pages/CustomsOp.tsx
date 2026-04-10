import { useState, useEffect } from 'react'
import { Upload, RefreshCw, ShieldCheck, FileText } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface CustomsItem {
  id: string
  orderNo: string
  declarationNo: string
  status: string
  customsType: string
  origin: string
  destination: string
  documents: { name: string; url: string }[]
  createdAt: string
}

const statusMap: Record<string, { label: string; style: string }> = {
  pending: { label: '待申报', style: 'bg-gray-100 text-gray-600' },
  declaring: { label: '申报中', style: 'bg-amber-100 text-amber-700' },
  inspection: { label: '查验中', style: 'bg-blue-100 text-blue-700' },
  cleared: { label: '已放行', style: 'bg-green-100 text-green-700' },
  rejected: { label: '被退回', style: 'bg-red-100 text-red-700' },
}

export default function CustomsOp() {
  const [items, setItems] = useState<CustomsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCustoms()
  }, [])

  const loadCustoms = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<CustomsItem[]>>('/customs')
      if (res.code === 200) {
        setItems(res.data || [])
      }
    } catch (err) {
      console.error('加载清关数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = (itemId: string) => {
    // 上传文件功能占位 - 后续实现文件上传
    console.warn('文件上传功能待实现, itemId:', itemId)
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">清关操作</span>
        <button onClick={loadCustoms} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[700px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">订单号</th>
                <th className="text-left px-3 py-2.5 font-medium">报关单号</th>
                <th className="text-center px-3 py-2.5 font-medium">状态</th>
                <th className="text-left px-3 py-2.5 font-medium">路线</th>
                <th className="text-center px-3 py-2.5 font-medium">文件</th>
                <th className="text-center px-3 py-2.5 font-medium">日期</th>
                <th className="text-center px-3 py-2.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">暂无清关记录</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const st = statusMap[item.status] || { label: item.status, style: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900">{item.orderNo}</td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600">{item.declarationNo || '-'}</td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${st.style}`}>{st.label}</span>
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {item.origin} → {item.destination}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {item.documents && item.documents.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary-600">
                            <FileText className="w-3 h-3" />
                            {item.documents.length} 份
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">无</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <button
                          onClick={() => handleUpload(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          上传文件
                        </button>
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
