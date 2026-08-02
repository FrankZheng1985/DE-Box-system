/**
 * 开放 API · 密钥管理面板（P8）
 *
 * 合作方密钥的签发/编辑/停用/换钥匙，以及 Webhook 接收地址配置与联调自测。
 * 密钥明文只在签发/换钥匙的响应里出现一次，弹窗提示复制后即丢弃。
 */
import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Power, RefreshCcw, Copy, CheckCircle, AlertTriangle,
  Send, XCircle, Loader2,
} from 'lucide-react'
import api, { type ApiResponse } from '../../utils/api'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import {
  type ApiKeyRow, type ClientOption, type KeyFormData,
  EMPTY_KEY_FORM, formatTime,
} from '../../types/openApi'

interface ApiKeysPanelProps {
  keys: ApiKeyRow[]
  /** 建单/改档后让壳重新拉列表（日志页的合作方下拉也用同一份数据） */
  onRefresh: () => void
  showToast: (msg: string) => void
  /** 壳把「签发新密钥」按钮放在 tab 行右侧，通过这个回调触发本面板的弹窗 */
  registerCreateHandler: (fn: () => void) => void
}

export default function ApiKeysPanel({ keys, onRefresh, showToast, registerCreateHandler }: ApiKeysPanelProps) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKeyRow | null>(null)
  const [form, setForm] = useState<KeyFormData>(EMPTY_KEY_FORM)
  const [saving, setSaving] = useState(false)
  // 明文只出现一次的展示弹窗
  const [plainKey, setPlainKey] = useState<{ partner: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)
  // 停用/启用/换钥匙确认
  const [confirmAction, setConfirmAction] = useState<{ type: 'disable' | 'enable' | 'rotate'; row: ApiKeyRow } | null>(null)
  // 联调自测
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // 建钥匙表单要挂靠客户下拉（拿前 200 个够用，客户总量远小于这个数）
  useEffect(() => {
    api.get<ApiResponse<ClientOption[]>>('/clients?pageSize=200')
      .then((res) => { if (res.code === 200) setClients(res.data || []) })
      .catch((err) => console.error('[OpenApi] 获取客户列表失败:', err))
  }, [])

  const openCreate = () => {
    setEditingKey(null)
    setForm(EMPTY_KEY_FORM)
    setTestResult(null)
    setFormOpen(true)
  }

  // 把「签发」入口交给壳的顶部按钮
  useEffect(() => { registerCreateHandler(openCreate) }, [registerCreateHandler])

  const openEdit = (row: ApiKeyRow) => {
    setEditingKey(row)
    setForm({
      partnerCode: row.partner_code,
      partnerName: row.partner_name,
      clientId: row.client_id,
      rateLimitPerMin: String(row.rate_limit_per_min),
      ipWhitelist: (row.ip_whitelist || []).join('\n'),
      remarks: row.remarks || '',
      webhookUrl: row.webhook_url || '',
    })
    setTestResult(null)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const ips = form.ipWhitelist.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      if (editingKey) {
        const res = await api.put<ApiResponse<null>>(`/open-api/keys/${editingKey.id}`, {
          partnerName: form.partnerName,
          rateLimitPerMin: Number(form.rateLimitPerMin) || 60,
          ipWhitelist: ips,
          remarks: form.remarks,
          webhookUrl: form.webhookUrl.trim(),
        })
        if (res.code !== 200) throw new Error(res.message)
        showToast('已保存')
      } else {
        const res = await api.post<ApiResponse<{ plainKey: string }>>('/open-api/keys', {
          partnerCode: form.partnerCode,
          partnerName: form.partnerName,
          clientId: form.clientId,
          rateLimitPerMin: Number(form.rateLimitPerMin) || 60,
          ipWhitelist: ips,
          remarks: form.remarks,
        })
        if (res.code !== 200) throw new Error(res.message)
        setCopied(false)
        setPlainKey({ partner: `${form.partnerCode}（${form.partnerName}）`, key: res.data.plainKey })
      }
      setFormOpen(false)
      onRefresh()
    } catch (err: any) {
      showToast(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const { type, row } = confirmAction
    try {
      const res = await api.post<ApiResponse<{ plainKey?: string }>>(`/open-api/keys/${row.id}/${type}`)
      if (res.code !== 200) throw new Error(res.message)
      if (type === 'rotate' && res.data?.plainKey) {
        setCopied(false)
        setPlainKey({ partner: `${row.partner_code}（${row.partner_name}）`, key: res.data.plainKey })
      } else {
        showToast(res.message)
      }
      onRefresh()
    } catch (err: any) {
      showToast(err.message || '操作失败')
    } finally {
      setConfirmAction(null)
    }
  }

  const sendWebhookTest = async (row: ApiKeyRow) => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post<ApiResponse<{ ok: boolean }>>(`/open-api/keys/${row.id}/webhook-test`)
      setTestResult({ ok: res.data?.ok === true, message: res.message })
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || '测试请求失败' })
    } finally {
      setTesting(false)
    }
  }

  const rotateWebhookSecret = async (row: ApiKeyRow) => {
    try {
      const res = await api.post<ApiResponse<{ webhookSecret: string }>>(
        `/open-api/keys/${row.id}/webhook-secret/rotate`
      )
      if (res.code !== 200) throw new Error(res.message)
      // 弹窗里展示的是 editingKey 上的旧值，就地更新一下免得看着像没换
      setEditingKey({ ...row, webhook_secret: res.data.webhookSecret })
      showToast('签名密钥已更换，请同步告知合作方')
      onRefresh()
    } catch (err: any) {
      showToast(err.message || '换签名密钥失败')
    }
  }

  const copyPlainKey = async () => {
    if (!plainKey) return
    try {
      await navigator.clipboard.writeText(plainKey.key)
      setCopied(true)
      showToast('已复制到剪贴板')
    } catch {
      showToast('复制失败，请手动选中复制')
    }
  }

  return (
    <>
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[960px]">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">合作方</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">挂靠客户</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">密钥前缀</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">状态</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-right">限速/分</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">IP 白名单</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">最近使用</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    还没有签发过密钥，点右上角「签发新密钥」开始
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{k.partner_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{k.partner_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700 truncate" title={k.client_name}>{k.client_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{k.client_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded font-mono">{k.key_prefix}…</code>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      k.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {k.status === 'ACTIVE' ? '启用中' : '已停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">{k.rate_limit_per_min}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-500 truncate" title={(k.ip_whitelist || []).join(', ')}>
                      {(k.ip_whitelist || []).length > 0 ? k.ip_whitelist.join(', ') : '不限'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">{formatTime(k.last_used_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(k)}
                        title="编辑"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: k.status === 'ACTIVE' ? 'disable' : 'enable', row: k })}
                        title={k.status === 'ACTIVE' ? '停用' : '启用'}
                        className={`p-1.5 rounded-lg transition-all duration-200 ${
                          k.status === 'ACTIVE'
                            ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                            : 'text-slate-500 hover:text-green-600 hover:bg-green-50'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'rotate', row: k })}
                        title="换钥匙（旧钥匙即刻失效）"
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200"
                      >
                        <RefreshCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">共 {keys.length} 个合作方</span>
        </div>
      </div>

    {/* ==================== 签发/编辑弹窗 ==================== */}
    <Modal
      isOpen={formOpen}
      onClose={() => setFormOpen(false)}
      title={editingKey ? `编辑密钥档案 · ${editingKey.partner_code}` : '签发新密钥'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setFormOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!editingKey && (!form.partnerCode || !form.partnerName || !form.clientId))}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {saving ? '保存中…' : editingKey ? '保存' : '签发'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editingKey && (
          <>
            <div>
              <label className="block text-sm text-slate-700 mb-1">合作方代码 *</label>
              <input
                value={form.partnerCode}
                onChange={(e) => setForm((f) => ({ ...f, partnerCode: e.target.value.toUpperCase() }))}
                placeholder="如 YIDIDA（大写字母/数字/下划线）"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="text-xs text-slate-400 mt-1">签发后不可修改（是幂等去重键的一部分）</p>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">挂靠客户 *</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">请选择客户</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}（{c.client_code}）</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">该合作方推送的询价/订单都会挂在这个客户名下，签发后不可改</p>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm text-slate-700 mb-1">合作方名称 *</label>
          <input
            value={form.partnerName}
            onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
            placeholder="如 易抵达"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">限速（次/分钟）</label>
          <input
            type="number"
            min={1}
            value={form.rateLimitPerMin}
            onChange={(e) => setForm((f) => ({ ...f, rateLimitPerMin: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">IP 白名单（每行一个，留空 = 不限）</label>
          <textarea
            value={form.ipWhitelist}
            onChange={(e) => setForm((f) => ({ ...f, ipWhitelist: e.target.value }))}
            rows={3}
            placeholder={'1.2.3.4\n5.6.7.*'}
            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">备注</label>
          <input
            value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            placeholder="对接人 / 用途等"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        {/* Webhook 配置：签发时先不填，等对方给了接收地址再回来编辑 */}
        {editingKey && (
          <div className="pt-4 border-t border-slate-100">
            <label className="block text-sm text-slate-700 mb-1">Webhook 接收地址（留空 = 不推送）</label>
            <input
              value={form.webhookUrl}
              onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
              placeholder="https://合作方域名/eutms/webhook"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <p className="text-xs text-slate-400 mt-1">
              订单状态变更、询价已报价、报价决策会主动 POST 到这个地址，失败按 1 分钟 / 5 分钟 / 30 分钟 / 2 小时 / 6 小时重试
            </p>

            {/* 联调自测：测的是库里已保存的地址，所以改了地址要先保存再测 */}
            {editingKey.webhook_url && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sendWebhookTest(editingKey)}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {testing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                    {testing ? '发送中…' : '发送测试事件'}
                  </button>
                  <span className="text-xs text-slate-400">
                    {form.webhookUrl.trim() !== (editingKey.webhook_url || '')
                      ? '地址已改动，先「保存」再测试'
                      : '向对方接收端发一条 WEBHOOK_TEST，验证连通与验签'}
                  </span>
                </div>

                {testResult && (
                  <div className={`flex items-start gap-2 mt-2 p-3 rounded-xl ${
                    testResult.ok ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    {testResult.ok
                      ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                    <div className={`text-xs ${testResult.ok ? 'text-green-800' : 'text-red-800'}`}>
                      <p>{testResult.message}</p>
                      {!testResult.ok && (
                        <p className="mt-1 text-red-700/80">
                          排查方向：接收地址是否可从公网访问、是否要求了额外鉴权、
                          是否对未知事件类型直接报错（测试事件的 event 是 WEBHOOK_TEST）
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {editingKey.webhook_secret && (
              <div className="mt-3">
                <label className="block text-sm text-slate-700 mb-1">签名密钥（交给合作方验签用）</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 text-slate-700 rounded-xl break-all select-all">
                    {editingKey.webhook_secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => rotateWebhookSecret(editingKey)}
                    title="换签名密钥"
                    className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all duration-200"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  与 API Key 不同，签名密钥可以随时查看；换密钥后合作方必须同步更新，否则验签会全部失败
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>

    {/* ==================== 明文密钥弹窗（只出现一次） ==================== */}
    <Modal
      isOpen={plainKey !== null}
      onClose={() => setPlainKey(null)}
      title="密钥明文 · 只显示这一次"
      size="md"
      footer={
        <div className="flex justify-end">
          <button
            onClick={() => setPlainKey(null)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
          >
            我已复制，关闭
          </button>
        </div>
      }
    >
      {plainKey && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {plainKey.partner} 的密钥。系统只存哈希，<b>关闭后无法再查看</b>，
              请立即复制并通过安全渠道（勿用邮件明文）交给合作方。丢失只能换钥匙。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-3 text-sm font-mono bg-slate-900 text-green-400 rounded-xl break-all select-all">
              {plainKey.key}
            </code>
            <button
              onClick={copyPlainKey}
              className={`p-3 rounded-xl transition-all duration-200 ${
                copied ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="复制"
            >
              {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </Modal>

    {/* ==================== 停用/启用/换钥匙确认 ==================== */}
    <ConfirmDialog
      isOpen={confirmAction !== null}
      onClose={() => setConfirmAction(null)}
      onConfirm={handleConfirmAction}
      title={
        confirmAction?.type === 'rotate' ? '换钥匙'
          : confirmAction?.type === 'disable' ? '停用密钥' : '启用密钥'
      }
      message={
        confirmAction?.type === 'rotate'
          ? `确定给 ${confirmAction.row.partner_name}（${confirmAction.row.partner_code}）换新钥匙？旧钥匙即刻失效，对方系统必须同步更换，否则推送会全部 401。`
          : confirmAction?.type === 'disable'
            ? `确定停用 ${confirmAction?.row.partner_name}（${confirmAction?.row.partner_code}）？停用后该合作方的所有推送立即被拒绝（403）。`
            : `确定启用 ${confirmAction?.row.partner_name}（${confirmAction?.row.partner_code}）？启用后对方即可恢复推送。`
      }
    />
    </>
  )
}
