import { useState, useEffect } from 'react'
import { MapPin, Truck, RefreshCw, Clock } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'

interface TrackingItem {
  id: string
  orderNo: string
  vehiclePlate: string
  driverName: string
  origin: string
  destination: string
  currentLocation: string
  lastUpdate: string
  status: string
  progress: number
}

export default function Tracking() {
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
        setItems(res.data || [])
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
        <span className="text-xs text-slate-500">共 {items.length} 个运输中的订单</span>
        <button onClick={loadTracking} className="h-8 px-2 text-slate-500 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">暂无运输中的订单</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-semibold text-slate-900">{item.orderNo}</span>
                  <span className="ml-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700">
                    运输中
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Clock className="w-3 h-3" />
                  {item.lastUpdate ? new Date(item.lastUpdate).toLocaleString('zh-CN') : '-'}
                </div>
              </div>

              {/* 路线 */}
              <div className="flex items-center gap-2 text-xs text-slate-600 mb-3">
                <MapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span>{item.origin}</span>
                <span className="text-slate-300">→</span>
                <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span>{item.destination}</span>
              </div>

              {/* 进度条 */}
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                <div
                  className="bg-primary-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${item.progress || 0}%` }}
                />
              </div>

              {/* 当前位置和车辆信息 */}
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>当前位置: {item.currentLocation || '未知'}</span>
                <span>
                  {item.vehiclePlate && `车牌: ${item.vehiclePlate}`}
                  {item.driverName && ` | 司机: ${item.driverName}`}
                </span>
              </div>

              {/* 地图占位区 */}
              <div className="mt-3 bg-gray-50 rounded-lg h-32 flex items-center justify-center border border-gray-100">
                <div className="text-center">
                  <MapPin className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-400">地图功能开发中</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
