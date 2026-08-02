/**
 * 开放 API 对接管理（P8）
 *
 * 壳页面：只管 tab 切换、共享的密钥列表数据和 toast，
 * 三个视图各自收在 components/openapi/ 下（密钥管理 / 请求日志 / Webhook 投递）。
 * 页面权限：open_api:manage（路由守卫由 MENU_PERMISSIONS 配置生效）。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plug, Plus, KeyRound } from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'
import { type ApiKeyRow } from '../types/openApi'
import ApiKeysPanel from '../components/openapi/ApiKeysPanel'
import ApiLogsPanel from '../components/openapi/ApiLogsPanel'
import WebhookDeliveriesPanel from '../components/openapi/WebhookDeliveriesPanel'

type TabKey = 'keys' | 'logs' | 'webhooks'

const TABS: Array<[TabKey, string]> = [
  ['keys', '密钥管理'],
  ['logs', '请求日志'],
  ['webhooks', 'Webhook 投递'],
]

export default function OpenApiManagement() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('keys')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  // 密钥列表放在壳里：密钥面板要展示它，日志面板的合作方下拉也要用，拉一次共用
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [keysLoading, setKeysLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ApiKeyRow[]>>('/open-api/keys')
      if (res.code === 200) setKeys(res.data || [])
    } catch (err) {
      console.error('[OpenApi] 获取密钥列表失败:', err)
    } finally {
      setKeysLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  // 「签发新密钥」按钮在壳的 tab 行上，但弹窗归密钥面板管，用 ref 接一下它的入口
  const createHandlerRef = useRef<(() => void) | null>(null)
  const registerCreateHandler = useCallback((fn: () => void) => {
    createHandlerRef.current = fn
  }, [])

  if (keysLoading) {
    return (
      <div className="p-4 lg:p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-7 w-44 bg-slate-200 rounded-lg" />
        </div>
        <div className="bg-white/80 rounded-2xl p-6 h-96" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="p-2 bg-cyan-50 rounded-xl">
          <Plug className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">开放 API 对接管理</h1>
          <p className="text-xs text-slate-500 mt-0.5">合作方密钥签发与请求日志（易抵达 / 傲翼 / 翼能等系统直推单据）</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-2 mb-4">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === key ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
        {activeTab === 'keys' && (
          <button
            onClick={() => createHandlerRef.current?.()}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            签发新密钥
          </button>
        )}
      </div>

      {/* 密钥面板常驻挂载：它持有弹窗状态，切走再切回不该丢；非当前 tab 时隐藏即可 */}
      <div className={activeTab === 'keys' ? '' : 'hidden'}>
        <ApiKeysPanel
          keys={keys}
          onRefresh={fetchKeys}
          showToast={showToast}
          registerCreateHandler={registerCreateHandler}
        />
      </div>
      {activeTab === 'logs' && <ApiLogsPanel keys={keys} />}
      {activeTab === 'webhooks' && <WebhookDeliveriesPanel />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50 animate-slide-in">
          <KeyRound className="w-5 h-5 text-cyan-400" />
          {toast}
        </div>
      )}
    </div>
  )
}
