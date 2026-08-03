import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Truck, RefreshCw, Clock, Gauge } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { formatDateTime, formatNumber } from '../utils/format'

/**
 * 字段名与后端 GET /gps/active 返回一致（snake_case，项目规范第 4 条）。
 *
 * 原来这里写的是 orderNo / vehiclePlate / driverName / origin / destination /
 * currentLocation / lastUpdate / progress —— 九个字段后端一个都没有，
 * 整页卡片全是空的（踩坑 033）。其中车牌、司机、进度百分比后端**根本没有数据源**：
 *   - 车牌 / 司机在 carrier_vehicles 表里，/gps/active 没有 JOIN
 *   - 进度百分比没有任何地方计算过
 * 所以本次把这三项去掉，改为显示后端确实有的承运商和车速。
 */
interface TrackingItem {
  order_id: string
  order_number: string
  business_type: string
  from_city: string | null
  to_city: string | null
  carrier_name: string | null
  city: string | null
  country: string | null
  speed_kmh: number | string | null
  gps_status: string | null
  recorded_at: string | null
}

export default function Tracking() {
  const { t } = useTranslation()
  const [items, setItems] = useState<TrackingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTracking()
  }, [])

  const loadTracking = async () => {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<TrackingItem[]>>('/gps/active')
      if (res.code === 200) {
        setItems(Array.isArray(res.data) ? res.data : [])
      }
    } catch (err) {
      console.error('加载追踪数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-48 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-36" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{t('tracking.count', { count: items.length })}</span>
        <button
          onClick={loadTracking}
          aria-label={t('common.refresh')}
          className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{t('tracking.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.order_id} className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-900">{item.order_number || t('common.empty')}</span>
                  <span className="ml-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                    {item.gps_status
                      ? t(`gpsStatus.${item.gps_status}`, { defaultValue: item.gps_status })
                      : t('gpsStatus.IN_TRANSIT')}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(item.recorded_at)}
                </div>
              </div>

              {/* 路线 */}
              <div className="flex items-center gap-2 text-xs text-slate-600 mb-3">
                <MapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span>{item.from_city || t('common.empty')}</span>
                <span className="text-slate-300">→</span>
                <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span>{item.to_city || t('common.empty')}</span>
              </div>

              {/* 当前位置 / 承运商 / 车速 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                <span>
                  {t('tracking.currentLocation')}:{' '}
                  {[item.city, item.country].filter(Boolean).join(', ') || t('tracking.unknownLocation')}
                </span>
                {item.carrier_name && (
                  <span>{t('tracking.carrier')}: {item.carrier_name}</span>
                )}
                {item.speed_kmh !== null && item.speed_kmh !== undefined && (
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="w-3 h-3" />
                    {formatNumber(item.speed_kmh)} km/h
                  </span>
                )}
              </div>

              {/* 地图占位区 */}
              <div className="mt-3 bg-gray-50 rounded-lg h-32 flex items-center justify-center border border-gray-100">
                <div className="text-center">
                  <MapPin className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-400">{t('tracking.mapPlaceholder')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
