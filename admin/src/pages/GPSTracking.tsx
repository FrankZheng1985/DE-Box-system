import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapPin,
  Truck,
  AlertTriangle,
  Clock,
  Navigation,
  RefreshCw,
  Signal,
  SignalZero,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface ActiveVehicle {
  order_id: string
  order_number: string
  from_city: string
  to_city: string
  carrier_name: string
  latitude: number | null
  longitude: number | null
  city: string
  country: string
  recorded_at: string
}

interface GpsAlert {
  order_id: string
  order_number: string
  from_city: string
  to_city: string
  carrier_name: string
  last_city: string
  last_update: string
  hours_since_update: number
}

// Leaflet 全局类型（通过 CDN 加载）
declare global {
  interface Window {
    L: any
  }
}

// ==================== 组件 ====================

export default function GPSTracking() {
  const [vehicles, setVehicles] = useState<ActiveVehicle[]>([])
  const [alerts, setAlerts] = useState<GpsAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)

  // 地图相关引用
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // ==================== 数据加载 ====================

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [vehiclesRes, alertsRes] = await Promise.all([
        api.get<ApiResponse<ActiveVehicle[]>>('/gps/active'),
        api.get<ApiResponse<GpsAlert[]>>('/gps/alerts'),
      ])
      if (vehiclesRes.code === 200) setVehicles(vehiclesRes.data || [])
      if (alertsRes.code === 200) setAlerts(alertsRes.data || [])
    } catch (err) {
      console.error('[GPSTracking] 加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ==================== Leaflet CDN 加载 ====================

  useEffect(() => {
    // 如果 Leaflet 已加载，直接标记就绪
    if (window.L) {
      setMapReady(true)
      return
    }

    // 添加 Leaflet CSS
    const linkEl = document.createElement('link')
    linkEl.rel = 'stylesheet'
    linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    linkEl.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
    linkEl.crossOrigin = ''
    document.head.appendChild(linkEl)

    // 添加 Leaflet JS
    const scriptEl = document.createElement('script')
    scriptEl.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    scriptEl.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    scriptEl.crossOrigin = ''
    scriptEl.onload = () => {
      setMapReady(true)
    }
    scriptEl.onerror = () => {
      console.error('[GPSTracking] Leaflet CDN 加载失败')
    }
    document.head.appendChild(scriptEl)

    return () => {
      // 清理 DOM 元素
      try {
        document.head.removeChild(linkEl)
        document.head.removeChild(scriptEl)
      } catch {
        // 元素可能已被移除
      }
    }
  }, [])

  // ==================== 地图初始化 ====================

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return
    // 避免重复初始化
    if (mapRef.current) return

    const L = window.L
    if (!L) return

    // 初始化地图，中心设在欧洲中部
    const map = L.map(mapContainerRef.current, {
      center: [50.1, 10.5],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    })

    // 添加 OpenStreetMap 瓦片图层
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    mapRef.current = map

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markersRef.current.clear()
    }
  }, [mapReady])

  // ==================== 标记点更新 ====================

  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    const L = window.L
    if (!L) return

    const map = mapRef.current

    // 清除旧标记
    markersRef.current.forEach((marker) => {
      map.removeLayer(marker)
    })
    markersRef.current.clear()

    // 为每辆有坐标的车辆添加标记
    const validVehicles = vehicles.filter(
      (v) => v.latitude != null && v.longitude != null
    )

    validVehicles.forEach((v) => {
      // 蓝色圆形标记
      const circleMarker = L.circleMarker([v.latitude, v.longitude], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#1d4ed8',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map)

      // 弹出窗口内容
      const popupContent = `
        <div style="min-width: 180px; font-family: system-ui, sans-serif;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #1e293b;">
            ${v.order_number}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">
            ${v.carrier_name}
          </div>
          <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">
            ${v.from_city} → ${v.to_city}
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 2px;">
            ${v.city || '未知'}, ${v.country || ''}
          </div>
          <div style="font-size: 11px; color: #94a3b8;">
            更新: ${v.recorded_at ? formatDateTime(v.recorded_at) : '未知'}
          </div>
        </div>
      `
      circleMarker.bindPopup(popupContent)

      markersRef.current.set(v.order_id, circleMarker)
    })

    // 如果有多辆车，自动调整视图范围
    if (validVehicles.length > 1) {
      const bounds = L.latLngBounds(
        validVehicles.map((v) => [v.latitude, v.longitude])
      )
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 })
    } else if (validVehicles.length === 1) {
      map.setView(
        [validVehicles[0].latitude, validVehicles[0].longitude],
        8
      )
    }
  }, [vehicles, mapReady])

  // ==================== 车辆选中 → 地图联动 ====================

  const handleSelectVehicle = useCallback(
    (vehicle: ActiveVehicle) => {
      const isAlreadySelected = selectedVehicleId === vehicle.order_id
      const nextId = isAlreadySelected ? null : vehicle.order_id
      setSelectedVehicleId(nextId)

      if (!isAlreadySelected && vehicle.latitude != null && vehicle.longitude != null && mapRef.current) {
        // 飞到该车辆位置
        mapRef.current.flyTo([vehicle.latitude, vehicle.longitude], 10, {
          duration: 1.2,
        })

        // 打开弹出窗口
        const marker = markersRef.current.get(vehicle.order_id)
        if (marker) {
          marker.openPopup()
        }
      }
    },
    [selectedVehicleId]
  )

  // ==================== 工具函数 ====================

  // 格式化时间差
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '未知'
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} 分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前`
    return `${Math.floor(hours / 24)} 天前`
  }

  // 搜索过滤
  const filteredVehicles = vehicles.filter((v) => {
    if (!searchKeyword) return true
    const kw = searchKeyword.toLowerCase()
    return (
      v.order_number.toLowerCase().includes(kw) ||
      v.carrier_name.toLowerCase().includes(kw) ||
      (v.city || '').toLowerCase().includes(kw)
    )
  })

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-red-50 rounded-xl">
            <MapPin className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">GPS 追踪</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              在途车辆 {vehicles.length} 辆 / 异常预警 {alerts.length} 条
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 transition-all duration-200 ease-in-out"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 地图区域 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mb-4 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">实时地图</span>
          </div>
          <span className="text-xs text-slate-400">
            {vehicles.filter((v) => v.latitude != null).length} 辆车有定位
          </span>
        </div>
        <div className="relative" style={{ height: '55vh' }}>
          {/* Leaflet 地图容器 */}
          <div
            ref={mapContainerRef}
            className="w-full h-full"
            style={{ zIndex: 0 }}
          />
          {/* 地图加载中遮罩 */}
          {!mapReady && (
            <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center gap-3 z-10">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500">地图加载中...</p>
            </div>
          )}
        </div>
      </div>

      {/* 下方面板：在途车辆 + 异常预警 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* 左：在途车辆列表 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-slate-900">在途车辆</span>
              </div>
              <span className="text-xs text-slate-400">{filteredVehicles.length} 辆</span>
            </div>
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索订单号/承运商/城市..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-1/2 mb-1" />
                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Truck className="w-8 h-8 mb-2" />
                <p className="text-xs">暂无在途车辆</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVehicles.map((vehicle) => {
                  const isSelected = vehicle.order_id === selectedVehicleId
                  const hasLocation = vehicle.latitude != null && vehicle.longitude != null
                  return (
                    <button
                      key={vehicle.order_id}
                      onClick={() => handleSelectVehicle(vehicle)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-all duration-200 ease-in-out ${
                        isSelected ? 'bg-blue-50/80 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      {/* 订单号 + 定位状态 */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-900">
                          {vehicle.order_number}
                        </span>
                        {hasLocation ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            <Signal className="w-2.5 h-2.5" />
                            有信号
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                            <SignalZero className="w-2.5 h-2.5" />
                            无信号
                          </span>
                        )}
                      </div>

                      {/* 路线 */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Navigation className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-600 truncate">
                          {vehicle.from_city}
                        </span>
                        <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        <span className="text-xs text-slate-600 truncate">
                          {vehicle.to_city}
                        </span>
                      </div>

                      {/* 承运商 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] text-slate-500">
                          {vehicle.carrier_name}
                        </span>
                      </div>

                      {/* 最新位置 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-blue-500" />
                          <span className="text-[10px] text-slate-500">
                            {vehicle.city || '未知'}{vehicle.country ? `, ${vehicle.country}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] text-slate-400">
                            {formatTimeAgo(vehicle.recorded_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右：异常预警 */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-red-50 bg-red-50/30 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">异常预警</span>
              </div>
              <span className="text-xs text-red-400">{alerts.length} 条</span>
            </div>
            <p className="text-[10px] text-red-400 mt-0.5">
              GPS 信号超过 6 小时未更新的车辆
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-red-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-red-50 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <AlertTriangle className="w-6 h-6 mb-2" />
                <p className="text-xs">暂无异常预警</p>
              </div>
            ) : (
              <div className="divide-y divide-red-50">
                {alerts.map((alert) => (
                  <div
                    key={alert.order_id}
                    className="px-4 py-3 hover:bg-red-50/30 transition-all duration-200 ease-in-out"
                  >
                    {/* 订单号 + 超时时长 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-900">
                        {alert.order_number}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                        {alert.hours_since_update}h 未更新
                      </span>
                    </div>

                    {/* 路线 */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Navigation className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-600 truncate">
                        {alert.from_city}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="text-xs text-slate-600 truncate">
                        {alert.to_city}
                      </span>
                    </div>

                    {/* 承运商 */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-slate-500">
                        {alert.carrier_name}
                      </span>
                    </div>

                    {/* 最后位置 + 时间 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <SignalZero className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] text-slate-500">
                          {alert.last_city || '未知'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] text-red-500">
                          {formatTimeAgo(alert.last_update)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== 辅助函数 ====================

// 格式化日期时间（用于弹出窗口）
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '未知'
  try {
    const d = new Date(dateStr)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  } catch {
    return '未知'
  }
}
