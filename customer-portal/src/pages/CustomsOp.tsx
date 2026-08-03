import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, RefreshCw, ShieldCheck, FileText } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatDate } from '../utils/format'

/**
 * 字段名与后端 GET /customs 返回一致（snake_case，项目规范第 4 条）。
 *
 * 原来写的是 orderNo / declarationNo / customsType / origin / documents[] /
 * createdAt —— 除 status 外全部命中不到，整表空白（踩坑 033）。
 * 其中三个字段后端**根本不存在**，本次按实际数据模型调整了列：
 *   - 报关单号 declarationNo → 表里没有，改显示报关行 customs_broker
 *   - 清关类型 customsType   → 数据模型里没有这个概念，去掉该列
 *   - 起运地 origin          → 后端只给了 destination，路线列改为「目的地」
 *   - 文件 documents[]       → 后端给的是数量 doc_count
 *   - 创建时间 createdAt     → 表里只有 updated_at
 */
interface CustomsItem {
  id: string
  order_number: string | null
  status: string
  customs_broker: string | null
  destination: string | null
  doc_count: number | string | null
  updated_at: string | null
}

// 只留样式，文案走 clearanceStatus.* 语言包。
// ⚠️ key 必须是大写——数据库存的是 PENDING / IN_PROGRESS / CLEARED / EXCEPTION，
//    原来这里写的是小写 pending / declaring / inspection，一个都匹配不上（踩坑 004）
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  CLEARED: 'bg-green-100 text-green-700',
  EXCEPTION: 'bg-red-100 text-red-700',
}

export default function CustomsOp() {
  const { t } = useTranslation()
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
        setItems(Array.isArray(res.data) ? res.data : [])
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
        <span className="text-xs text-slate-500">{t('customs.title')}</span>
        <button
          onClick={loadCustoms}
          aria-label={t('common.refresh')}
          className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[700px]">
            {/* 列宽按最长的德语文案分配 */}
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-xs text-slate-500 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium">{t('common.orderNo')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('customs.broker')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.status')}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t('customs.destination')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('customs.files')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.updatedAt')}</th>
                <th className="text-center px-3 py-2.5 font-medium">{t('common.actions')}</th>
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
                    <p className="text-sm text-slate-400">{t('customs.empty')}</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const docCount = Number(item.doc_count) || 0
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="text-left px-3 py-2.5 text-xs font-medium text-slate-900 truncate">
                        {item.order_number || t('common.empty')}
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {item.customs_broker || t('common.empty')}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap ${
                          STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {t(`clearanceStatus.${item.status}`, { defaultValue: item.status })}
                        </span>
                      </td>
                      <td className="text-left px-3 py-2.5 text-xs text-slate-600 truncate">
                        {item.destination || t('common.empty')}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {docCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary-600">
                            <FileText className="w-3 h-3" />
                            {t('customs.fileCount', { count: docCount })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{t('customs.noFile')}</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(item.updated_at)}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <button
                          onClick={() => handleUpload(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          {t('customs.upload')}
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
