import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Search, Package, MapPin, Clock, CheckCircle } from 'lucide-react'

export default function Tracking() {
  const { trackingNo } = useParams()
  const [searchQuery, setSearchQuery] = useState(trackingNo || '')
  const [trackingResult, setTrackingResult] = useState<null | 'not_found' | 'found'>(null)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    
    // TODO: 调用API查询物流
    setTrackingResult('not_found')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">物流查询</h1>
        <p className="text-gray-500 mt-1">输入订单号或运单号查询物流状态</p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="请输入订单号或运单号"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            查询
          </button>
        </form>
      </div>

      {/* Results */}
      {trackingResult === 'not_found' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-600">未找到物流信息</p>
          <p className="text-sm text-gray-500 mt-1">
            请检查单号是否正确，或稍后再试
          </p>
        </div>
      )}

      {trackingResult === 'found' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {/* Tracking Timeline */}
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">物流轨迹</h3>
            <div className="space-y-4">
              {/* Example timeline items */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                </div>
                <div className="pb-6">
                  <p className="font-medium text-gray-900">已签收</p>
                  <p className="text-sm text-gray-500">2024-01-15 14:30</p>
                  <p className="text-sm text-gray-600 mt-1">包裹已由本人签收</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                </div>
                <div className="pb-6">
                  <p className="font-medium text-gray-900">派送中</p>
                  <p className="text-sm text-gray-500">2024-01-15 09:00</p>
                  <p className="text-sm text-gray-600 mt-1">快递员正在派送</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div>
                  <p className="font-medium text-gray-900">已发货</p>
                  <p className="text-sm text-gray-500">2024-01-10 16:00</p>
                  <p className="text-sm text-gray-600 mt-1">包裹已从仓库发出</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      {!trackingResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-medium text-blue-800 mb-2">温馨提示</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• 物流信息可能存在延迟，请耐心等待</li>
            <li>• 如有疑问，请联系客服处理</li>
            <li>• 支持查询订单号或物流运单号</li>
          </ul>
        </div>
      )}
    </div>
  )
}
