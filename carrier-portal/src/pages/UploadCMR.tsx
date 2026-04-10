import { useState, useEffect } from 'react'
import { FileText, Upload, CheckCircle } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

interface CMRRecord {
  id: string
  orderNo: string
  cmrNo: string
  signStatus: string
  hasDamage: boolean
  createdAt: string
}

export default function UploadCMR() {
  const { user } = useAuth()
  const [cmrList, setCmrList] = useState<CMRRecord[]>([])
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [orderId, setOrderId] = useState('')
  const [cmrNo, setCmrNo] = useState('')
  const [signStatus, setSignStatus] = useState('SIGNED')
  const [hasDamage, setHasDamage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchCMR()
  }, [])

  const fetchCMR = async () => {
    try {
      const params = user?.linkedEntityId ? `?carrierId=${user.linkedEntityId}` : ''
      const res = await api.get<ApiResponse<CMRRecord[]>>(`/cmr${params}`)
      if (res.code === 200) {
        setCmrList(Array.isArray(res.data) ? res.data : [])
      }
    } catch (error) {
      console.error('获取CMR列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId || !cmrNo.trim()) {
      setMessage('请填写完整信息')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      const res = await api.post<ApiResponse>('/cmr/upload', {
        orderId,
        cmrNo: cmrNo.trim(),
        signStatus,
        hasDamage,
      })
      if (res.code === 200) {
        setMessage('CMR 提交成功')
        setOrderId('')
        setCmrNo('')
        setSignStatus('SIGNED')
        setHasDamage(false)
        fetchCMR()
      }
    } catch (error) {
      console.error('提交CMR失败:', error)
      setMessage('提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const signStatusLabel: Record<string, string> = {
    SIGNED: '已签署',
    UNSIGNED: '未签署',
    PARTIAL: '部分签署',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">上传CMR</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左：提交表单 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Upload className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">提交 CMR 信息</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">订单ID</label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="输入关联的订单ID"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">CMR 编号</label>
              <input
                type="text"
                value={cmrNo}
                onChange={(e) => setCmrNo(e.target.value)}
                placeholder="输入CMR编号"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">签署状态</label>
              <select
                value={signStatus}
                onChange={(e) => setSignStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              >
                <option value="SIGNED">已签署</option>
                <option value="UNSIGNED">未签署</option>
                <option value="PARTIAL">部分签署</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasDamage"
                checked={hasDamage}
                onChange={(e) => setHasDamage(e.target.checked)}
                className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
              />
              <label htmlFor="hasDamage" className="text-sm text-slate-700">有货损</label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
            >
              {submitting ? '提交中...' : '提交 CMR'}
            </button>
          </form>
        </div>

        {/* 右：已上传列表 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <FileText className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">已上传 CMR</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : cmrList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">暂无CMR记录</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {cmrList.map((cmr) => (
                <div key={cmr.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{cmr.cmrNo}</p>
                    <p className="text-xs text-slate-500">订单: {cmr.orderNo || cmr.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cmr.hasDamage && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">货损</span>}
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {signStatusLabel[cmr.signStatus] || cmr.signStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
