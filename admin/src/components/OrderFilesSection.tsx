/**
 * 订单文件区块（订单详情页用，需求 3 订单文件中心）
 *
 * - 统一展示 order_files + cmr_documents（CMR 的签署状态来自 cmr_documents）
 * - 按订单当前状态给出上传引导，缺件黄色提醒
 * - CMR 类别走 /cmr/upload（保留签署状态跟踪），其余走 /orders/:id/files
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  Upload,
  Download,
  Trash2,
  Camera,
  FileText,
  ClipboardCheck,
  File,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { type ApiResponse, getAuthHeaders } from '../utils/api'
import { downloadFile, fileDownloadEndpoint } from '../utils/fileDownload'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../utils/format'
import { BUSINESS_TYPES } from '../constants/businessTypes'

// ==================== 类型定义 ====================

type FileCategory = 'LOADING_PHOTO' | 'CMR' | 'POD_PROOF' | 'OTHER'

interface OrderFileItem {
  id: string
  file_category: FileCategory
  file_name: string
  file_url: string
  file_type: string
  file_size_bytes: string | number | null
  remarks: string | null
  uploaded_at: string
  uploaded_by_name: string | null
  sign_status?: string
  has_damage_note?: boolean
  source: 'ORDER_FILE' | 'CMR_DOC'
}

interface OrderFilesSectionProps {
  orderId: string
  businessType: string
  status: string
  deliveryStatus: string | null
  /** 是否允许上传/删除（运营端 true；只读场景 false） */
  canManage?: boolean
  onToast: (message: string, type: 'success' | 'error') => void
}

// ==================== 类别配置 ====================

const CATEGORY_CONFIG: Record<FileCategory, { labelKey: string; icon: React.ElementType; badge: string }> = {
  LOADING_PHOTO: {
    labelKey: 'orderFiles.categoryLoadingPhoto',
    icon: Camera,
    badge: 'bg-blue-100 text-blue-700',
  },
  CMR: {
    labelKey: 'orderFiles.categoryCmr',
    icon: FileText,
    badge: 'bg-purple-100 text-purple-700',
  },
  POD_PROOF: {
    labelKey: 'orderFiles.categoryPodProof',
    icon: ClipboardCheck,
    badge: 'bg-green-100 text-green-700',
  },
  OTHER: {
    labelKey: 'orderFiles.categoryOther',
    icon: File,
    badge: 'bg-gray-100 text-gray-600',
  },
}

/**
 * 按订单当前状态算出应该有哪些文件
 * 运输中 → 装车图 + CMR；已送达/已完成 → 再加签收凭证
 */
function getRequiredCategories(businessType: string, status: string, deliveryStatus: string | null): FileCategory[] {
  const s = (status || '').toUpperCase()
  // FTL 的运输节奏看派送子状态，其余看主状态
  const transitReached = businessType === BUSINESS_TYPES.TRUCK_FTL
    ? ['IN_TRANSIT', 'TRANSPORT_DONE'].includes((deliveryStatus || '').toUpperCase()) || ['COMPLETED'].includes(s)
    : ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(s)
  const deliveredReached = businessType === BUSINESS_TYPES.TRUCK_FTL
    ? (deliveryStatus || '').toUpperCase() === 'TRANSPORT_DONE' || s === 'COMPLETED'
    : ['DELIVERED', 'COMPLETED'].includes(s)

  const required: FileCategory[] = []
  if (transitReached) required.push('LOADING_PHOTO', 'CMR')
  if (deliveredReached) required.push('POD_PROOF')
  return required
}

function formatFileSize(bytes: string | number | null): string {
  const n = Number(bytes)
  if (!n || Number.isNaN(n)) return '-'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ==================== 组件 ====================

export default function OrderFilesSection({
  orderId,
  businessType,
  status,
  deliveryStatus,
  canManage = true,
  onToast,
}: OrderFilesSectionProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<OrderFileItem[]>([])
  const [loading, setLoading] = useState(true)

  // 上传表单
  const [showUpload, setShowUpload] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('LOADING_PHOTO')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadRemarks, setUploadRemarks] = useState('')
  const [uploading, setUploading] = useState(false)

  // 正在下载的那份文件（source-id），用来转菊花防止重复点
  const [downloadingKey, setDownloadingKey] = useState('')

  const handleDownload = async (file: OrderFileItem) => {
    const key = `${file.source}-${file.id}`
    setDownloadingKey(key)
    try {
      await downloadFile(fileDownloadEndpoint(file.source, file.id), file.file_name)
    } catch (err) {
      console.error('[OrderFiles] 下载失败:', err)
      onToast(err instanceof Error ? err.message : t('common.downloadFailed'), 'error')
    } finally {
      setDownloadingKey('')
    }
  }

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<OrderFileItem[]>>(`/orders/${orderId}/files`)
      setFiles(res.data || [])
    } catch (err) {
      console.error('[OrderFiles] 获取文件列表失败:', err)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // 缺件提醒
  const required = getRequiredCategories(businessType, status, deliveryStatus)
  const existingCategories = new Set(files.map((f) => f.file_category))
  const missing = required.filter((c) => !existingCategories.has(c))

  // ---------- 上传 ----------
  const handleUpload = async () => {
    if (!uploadFile) {
      onToast(t('orderFiles.pickFileFirst'), 'error')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)

      // CMR 走专用接口（签署状态跟踪在 cmr_documents），其余走订单文件接口
      const endpoint = uploadCategory === 'CMR'
        ? '/api/v1/cmr/upload'
        : `/api/v1/orders/${orderId}/files`
      if (uploadCategory === 'CMR') {
        formData.append('orderId', orderId)
      } else {
        formData.append('fileCategory', uploadCategory)
        if (uploadRemarks.trim()) formData.append('remarks', uploadRemarks.trim())
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      const res = await response.json()
      if (res.code === 200) {
        onToast(t('orderFiles.uploadSuccess'), 'success')
        setShowUpload(false)
        setUploadFile(null)
        setUploadRemarks('')
        fetchFiles()
      } else {
        onToast(res.message || t('orderFiles.uploadFailed'), 'error')
      }
    } catch (err) {
      console.error('[OrderFiles] 上传失败:', err)
      onToast(t('orderFiles.uploadFailedRetry'), 'error')
    } finally {
      setUploading(false)
    }
  }

  // ---------- 删除 ----------
  const handleDelete = async (file: OrderFileItem) => {
    if (!window.confirm(t('orderFiles.deleteConfirm', { name: file.file_name }))) return
    try {
      await api.delete<ApiResponse<null>>(`/orders/files/${file.id}`)
      onToast(t('orderFiles.deleted'), 'success')
      fetchFiles()
    } catch (err) {
      console.error('[OrderFiles] 删除失败:', err)
      onToast(err instanceof Error ? err.message : t('orderFiles.deleteFailed'), 'error')
    }
  }

  // ==================== 渲染 ====================

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-blue-600" />
          {t('orderFiles.title')}
          <span className="text-xs font-normal text-slate-400">({files.length})</span>
        </h2>
        {canManage && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200"
          >
            <Upload className="w-4 h-4" />
            {t('orderFiles.uploadButton')}
          </button>
        )}
      </div>

      {/* 缺件黄色提醒 */}
      {missing.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-700">
            <span className="font-medium">{t('orderFiles.missingTitle')}</span>
            {missing.map((c) => t(CATEGORY_CONFIG[c].labelKey)).join(t('orderFiles.listSeparator'))}
            {missing.includes('LOADING_PHOTO') && (
              <span className="block text-xs text-amber-600 mt-0.5">{t('orderFiles.loadingPhotoHint')}</span>
            )}
          </div>
        </div>
      )}

      {/* 上传表单 */}
      {showUpload && canManage && (
        <div className="mb-4 p-4 rounded-xl border border-blue-100 bg-blue-50/40 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as FileCategory)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {(Object.keys(CATEGORY_CONFIG) as FileCategory[]).map((c) => (
                <option key={c} value={c}>{t(CATEGORY_CONFIG[c].labelKey)}</option>
              ))}
            </select>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white file:text-blue-600 file:text-xs file:font-medium file:cursor-pointer"
            />
          </div>
          {uploadCategory === 'LOADING_PHOTO' && (
            <p className="text-xs text-slate-500">{t('orderFiles.loadingPhotoTip')}</p>
          )}
          {uploadCategory !== 'CMR' && (
            <input
              type="text"
              value={uploadRemarks}
              onChange={(e) => setUploadRemarks(e.target.value)}
              placeholder={t('orderFiles.remarksPlaceholder')}
              className="w-full min-w-[280px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? t('orderFiles.uploading') : t('orderFiles.confirmUpload')}
            </button>
            <button
              onClick={() => setShowUpload(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-slate-600 hover:bg-gray-50 transition-all duration-200"
            >
              {t('common.cancel')}
            </button>
            <span className="text-xs text-slate-400">{t('orderFiles.acceptHint')}</span>
          </div>
        </div>
      )}

      {/* 文件列表 */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          <File className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">{t('orderFiles.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const cfg = CATEGORY_CONFIG[file.file_category] || CATEGORY_CONFIG.OTHER
            const Icon = cfg.icon
            return (
              <div
                key={`${file.source}-${file.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition-colors duration-150"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 truncate" title={file.file_name}>
                      {file.file_name}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
                      {t(cfg.labelKey)}
                    </span>
                    {file.source === 'CMR_DOC' && file.sign_status && (
                      <StatusBadge status={file.sign_status} type="cmr" />
                    )}
                    {file.has_damage_note && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{t('orderFiles.damaged')}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {formatFileSize(file.file_size_bytes)} · {file.uploaded_by_name || '-'} ·{' '}
                    {formatDateTime(file.uploaded_at)}
                    {file.remarks && ` · ${file.remarks}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownload(file)}
                    disabled={downloadingKey === `${file.source}-${file.id}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50"
                    title={t('orderFiles.downloadOrView')}
                    aria-label={t('orderFiles.downloadOrView')}
                  >
                    {downloadingKey === `${file.source}-${file.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  {canManage && file.source === 'ORDER_FILE' && (
                    <button
                      onClick={() => handleDelete(file)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
