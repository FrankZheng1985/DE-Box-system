/**
 * 承运商上传 CMR
 *
 * 旧版用 JSON 提交、传不了文件（P2 修复为 FormData 真实上传）。
 * 签署状态/货损由运营在管理端维护，这里只负责传文件。
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Upload, CheckCircle, Download } from 'lucide-react'
import api, { ApiResponse, getAuthHeaders } from '../utils/api'
import { downloadFile } from '../utils/fileDownload'
import { useAuth } from '../contexts/AuthContext'

// 与后端 /cmr 列表返回一致（snake_case）
interface CMRRecord {
  id: string
  order_number: string | null
  cmr_number: string
  file_url: string | null
  sign_status: string
  has_damage_note: boolean
  uploaded_at: string
}

// 承运商名下的订单（下拉选择用）
interface CarrierOrder {
  id: string
  order_number: string
  pickup_city: string | null
  delivery_city: string | null
}

export default function UploadCMR() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [cmrList, setCmrList] = useState<CMRRecord[]>([])
  const [orders, setOrders] = useState<CarrierOrder[]>([])
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [orderId, setOrderId] = useState('')
  const [cmrNo, setCmrNo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 提示语原来靠 message.includes('成功') 判断成败来上色，
  // 换成英/德文案后这个判断必然失效，所以把成败单独存成布尔值（P9）
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  // 正在下载的那条 CMR，用来禁用按钮防止重复点
  const [downloadingId, setDownloadingId] = useState('')

  const handleDownload = async (cmr: CMRRecord) => {
    setDownloadingId(cmr.id)
    try {
      await downloadFile(`/cmr/${cmr.id}/download`, cmr.cmr_number || 'CMR')
    } catch (err) {
      console.error('下载CMR失败:', err)
      setMessage({ text: err instanceof Error ? err.message : t('common.downloadFailed'), ok: false })
    } finally {
      setDownloadingId('')
    }
  }

  useEffect(() => {
    fetchCMR()
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCMR = async () => {
    try {
      // 后端已按登录身份过滤，只返回本承运商订单的 CMR
      const res = await api.get<ApiResponse<CMRRecord[]>>('/cmr?pageSize=50')
      if (res.code === 200) {
        setCmrList(Array.isArray(res.data) ? res.data : [])
      }
    } catch (error) {
      console.error('获取CMR列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrders = async () => {
    if (!user?.linkedEntityId) return
    try {
      const res = await api.get<ApiResponse<CarrierOrder[]>>(
        `/orders?carrierId=${user.linkedEntityId}&pageSize=100`
      )
      if (res.code === 200) {
        setOrders(Array.isArray(res.data) ? res.data : [])
      }
    } catch (error) {
      console.error('获取订单列表失败:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) {
      setMessage({ text: t('cmr.errorNoOrder'), ok: false })
      return
    }
    if (!file) {
      setMessage({ text: t('cmr.errorNoFile'), ok: false })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('orderId', orderId)
      if (cmrNo.trim()) formData.append('cmrNumber', cmrNo.trim())
      formData.append('file', file)

      const response = await fetch('/api/v1/cmr/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      const res = await response.json()
      if (res.code === 200) {
        setMessage({ text: t('cmr.success'), ok: true })
        setOrderId('')
        setCmrNo('')
        setFile(null)
        fetchCMR()
      } else {
        setMessage({ text: res.message || t('cmr.errorFailed'), ok: false })
      }
    } catch (error) {
      console.error('提交CMR失败:', error)
      setMessage({ text: t('cmr.errorFailed'), ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('cmr.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左：提交表单 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Upload className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('cmr.formTitle')}</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${message.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {message.text}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.orderLabel')} {t('common.required')}</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              >
                <option value="">{t('cmr.orderPlaceholder')}</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number}（{o.pickup_city || t('common.empty')} → {o.delivery_city || t('common.empty')}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('cmr.cmrNoLabel')}</label>
              <input
                type="text"
                value={cmrNo}
                onChange={(e) => setCmrNo(e.target.value)}
                placeholder={t('cmr.cmrNoPlaceholder')}
                className="w-full min-w-[280px] px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('cmr.fileLabel')} {t('common.required')} <span className="text-slate-400 font-normal">{t('cmr.fileHint')}</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-600 hover:file:bg-green-100 transition-all duration-200 cursor-pointer"
              />
              {file && (
                <p className="mt-1.5 text-xs text-green-600">
                  {t('cmr.fileSelected', { name: file.name, size: (file.size / 1024).toFixed(0) })}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
            >
              {submitting ? t('cmr.submitting') : t('cmr.submit')}
            </button>
          </form>
        </div>

        {/* 右：已上传列表 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <FileText className="w-5 h-5 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('cmr.listTitle')}</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : cmrList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t('cmr.listEmpty')}</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {cmrList.map((cmr) => (
                <div key={cmr.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{cmr.cmr_number}</p>
                    <p className="text-xs text-slate-500 truncate">{t('cmr.orderPrefix')} {cmr.order_number || t('common.empty')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cmr.has_damage_note && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">{t('cmr.damage')}</span>}
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {t(`signStatus.${cmr.sign_status}`, { defaultValue: cmr.sign_status })}
                    </span>
                    {cmr.file_url && (
                      <button
                        type="button"
                        onClick={() => handleDownload(cmr)}
                        disabled={downloadingId === cmr.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all duration-200 disabled:opacity-50"
                        title={t('cmr.viewFile')}
                        aria-label={t('cmr.viewFile')}
                      >
                        <Download className={`w-4 h-4 ${downloadingId === cmr.id ? 'animate-pulse' : ''}`} />
                      </button>
                    )}
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
