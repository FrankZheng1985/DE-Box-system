import { useState, useEffect, useCallback } from 'react'
import { FileText, Eye, Pencil, Clock, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api, { ApiResponse } from '../utils/api'
import Modal from '../components/Modal'
import { formatDate } from '../utils/format'

/**
 * 对应 GET /invoice-templates 返回行，字段名与 invoice_templates 表一致。
 *
 * 这里此前是一套 camelCase 的臆造字段（name / clientType / taxRate /
 * triggerRule / lastUsedAt），除 id 和 currency 外没有一个对得上后端，
 * 而且 lastUsedAt 库里根本没有这一列。空表时页面显示的是前端硬编码的
 * 演示卡片，所以一直没暴露 —— 第一条真实模板入库就会全线空白，
 * 编辑/预览还会在 undefined 上调 .replace() 直接崩（踩坑 033）。
 */
interface InvoiceTemplate {
  id: string
  template_name: string
  client_id: string | null
  client_type: string | null
  currency: string
  /** NUMERIC，经 pg 驱动是字符串（踩坑 002） */
  tax_rate: string | number
  auto_trigger: string | null
  /** jsonb 列：存纯文本时驱动解回来就是 string，历史数据也可能是对象 */
  header_info: string | Record<string, unknown> | null
  footer_info: string | null
  is_active?: boolean
  created_at?: string
}

/** 税率统一显示成 "19%"；库里存的是数字 */
function taxRateText(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-'
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : `${n}%`
}


export default function InvoiceTemplates() {
  const { t } = useTranslation()
  // 不再用演示假数据打底：空表时显示假卡片，会让人以为模板已经配好了
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [triggerCondition, setTriggerCondition] = useState('order_complete')
  const [defaultTemplate, setDefaultTemplate] = useState('')
  const [sendMethod, setSendMethod] = useState('email')
  const [autoSendEmail, setAutoSendEmail] = useState(true)
  const [autoReminder, setAutoReminder] = useState(false)
  const [mergeClient, setMergeClient] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.get<ApiResponse<InvoiceTemplate[]>>('/invoice-templates')
      setTemplates(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      console.error('获取发票模板失败:', err)
      setLoadError(err?.message || t('invoiceTemplate.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplate | null>(null)

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    clientType: t('invoiceTemplate.typeGeneral'),
    currency: 'EUR',
    taxRate: '19',
    triggerRule: 'order_complete',
    headerInfo: '',
    footerInfo: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const handlePreview = (tpl: InvoiceTemplate) => {
    setPreviewTemplate(tpl)
    setPreviewOpen(true)
  }

  const handleEdit = (tpl: InvoiceTemplate) => {
    setEditForm({
      id: tpl.id,
      name: tpl.template_name || '',
      clientType: tpl.client_type || '',
      currency: tpl.currency || 'EUR',
      taxRate: String(tpl.tax_rate ?? ''),
      triggerRule: tpl.auto_trigger || 'manual',
      // jsonb 列可能解回字符串，也可能是对象（历史数据）
      headerInfo: typeof tpl.header_info === 'string'
        ? tpl.header_info
        : tpl.header_info ? JSON.stringify(tpl.header_info, null, 2) : '',
      footerInfo: tpl.footer_info || '',
    })
    setEditError('')
    setEditOpen(true)
  }

  const triggerLabelMap: Record<string, string> = {
    order_complete: t('invoiceTemplate.triggerOrderCompleted'), cmr_uploaded: t('invoiceTemplate.triggerCmrUploaded'), manual: t('invoiceTemplate.triggerManual'),
  }
  const triggerText = (code: string | null | undefined) =>
    code ? (triggerLabelMap[code] || code) : t('invoiceTemplate.triggerManual')

  const handleEditSave = async () => {
    setEditSaving(true)
    setEditError('')
    try {
      // 字段名按后端契约传（templateName / taxRate / autoTrigger…），
      // 之前传的是 name / trigger_rule 这套，加上后端根本没有 PUT，
      // 404 被空 catch 吞掉后界面照样"保存成功"，刷新即丢
      const res = await api.put<ApiResponse<InvoiceTemplate>>(`/invoice-templates/${editForm.id}`, {
        templateName: editForm.name,
        currency: editForm.currency,
        taxRate: editForm.taxRate === '' ? undefined : Number(editForm.taxRate),
        autoTrigger: editForm.triggerRule,
        headerInfo: editForm.headerInfo,
        footerInfo: editForm.footerInfo,
      })
      if (res.code !== 200) {
        setEditError(res.message || t('invoiceTemplate.saveFailed'))
        return
      }
      // 用后端回写的那条覆盖本地，保证看到的就是真正存下去的
      setTemplates(prev => prev.map(tpl => (tpl.id === editForm.id && res.data ? res.data : tpl)))
      setEditOpen(false)
    } catch (err: any) {
      console.error('保存发票模板失败:', err)
      setEditError(err?.message || t('invoiceTemplate.saveFailed'))
    } finally {
      setEditSaving(false)
    }
  }

  const previewSubtotal = 2800
  const previewTaxRate = previewTemplate ? Number(previewTemplate.tax_rate) || 0 : 19
  const previewTax = Number((previewSubtotal * previewTaxRate / 100).toFixed(2))
  const previewTotal = Number((previewSubtotal + previewTax).toFixed(2))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('invoiceTemplate.pageTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('invoiceTemplate.pageSubtitle')}</p>
      </div>
      {loadError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-5 animate-pulse">
              <div className="h-10 w-10 bg-slate-200 rounded-xl mb-4" />
              <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-full bg-slate-100 rounded mb-2" />
              <div className="h-3 w-2/3 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-16 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{t('invoiceTemplate.empty')}</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-200 ease-in-out"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{tpl.template_name || '-'}</h3>
                  {tpl.client_id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      {t('invoiceTemplate.typeDedicated')}
                    </span>
                  )}
                  {!tpl.client_id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {t('invoiceTemplate.typeGeneral')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {([
                [t('common.currency'), tpl.currency || '-'],
                [t('invoiceTemplate.taxRate'), taxRateText(tpl.tax_rate)],
                [t('invoiceTemplate.triggerRule'), triggerText(tpl.auto_trigger)],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-700 font-medium">{val}</span>
                </div>
              ))}
              {tpl.created_at && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('common.createdAt')}</span>
                  <span className="text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatDate(tpl.created_at)}
                  </span>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => handlePreview(tpl)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all duration-200"
              >
                <Eye className="w-3.5 h-3.5" />
                {t('invoiceTemplate.preview')}
              </button>
              <button
                onClick={() => handleEdit(tpl)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all duration-200"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('common.edit')}
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-900">{t('invoiceTemplate.autoRules')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.triggerCondition')}</label>
            <select value={triggerCondition} onChange={(e) => setTriggerCondition(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="order_complete">{t('invoiceTemplate.onOrderComplete')}</option>
              <option value="cmr_uploaded">{t('invoiceTemplate.onCmrUploaded')}</option>
              <option value="manual">{t('invoiceTemplate.triggerManual')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.defaultTemplate')}</label>
            <select value={defaultTemplate} onChange={(e) => setDefaultTemplate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.template_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.sendMethod')}</label>
            <select value={sendMethod} onChange={(e) => setSendMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="email">{t('invoiceTemplate.sendEmail')}</option>
              <option value="system">{t('invoiceTemplate.sendSystem')}</option>
              <option value="both">{t('invoiceTemplate.sendBoth')}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-slate-100">
          {[
            { checked: autoSendEmail, set: setAutoSendEmail, label: t('invoiceTemplate.autoSendEmail') },
            { checked: autoReminder, set: setAutoReminder, label: t('invoiceTemplate.autoReminder') },
            { checked: mergeClient, set: setMergeClient, label: t('invoiceTemplate.mergeClient') },
          ].map(item => (
            <label key={item.label} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={item.checked} onChange={(e) => item.set(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
              <span className="text-sm text-slate-700">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title={`${t('invoiceTemplate.previewTitle')} - ${previewTemplate?.template_name || ''}`} size="lg">
        {previewTemplate && (
          <div className="space-y-5 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kaluna UG (haftungsbeschränkt)</h3>
                <p className="text-xs text-slate-500 mt-1">Niederbeckstraße 35, 40472 Düsseldorf, Germany</p>
                <p className="text-xs text-slate-500">Tel: +49 30 12345678</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">{t('invoiceTemplate.invoiceNo')}</p>
                <p className="text-base font-bold text-blue-600">INV-2026-PREVIEW</p>
                <p className="text-xs text-slate-400 mt-2">{t('invoiceTemplate.invoiceDate')}</p>
                <p className="text-sm text-slate-700">2026-04-10</p>
              </div>
            </div>
            <hr className="border-slate-200" />
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{t('invoiceTemplate.clientInfo')}</p>
              <p className="text-sm font-medium text-slate-900">{t('invoiceTemplate.sampleClient')}</p>
              <p className="text-xs text-slate-500">Beispielstraße 10, 80331 München</p>
              <p className="text-xs text-slate-500">USt-IdNr: DE123456789</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[5%]" /><col className="w-[45%]" />
                  <col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[20%]" />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    {['#', t('invoiceTemplate.lineDescription')].map(h => <th key={h} className="text-left py-2 text-xs text-slate-500">{h}</th>)}
                    {[t('field.quantity'), t('invoiceTemplate.unitPrice'), t('common.amount')].map(h => <th key={h} className="text-right py-2 text-xs text-slate-500">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { no: 1, desc: t('invoiceTemplate.sampleLineFreight'), amount: '2,500.00' },
                    { no: 2, desc: t('invoiceTemplate.sampleLineSurcharge'), amount: '200.00' },
                    { no: 3, desc: t('quotationDetail.insuranceFee'), amount: '100.00' },
                  ].map(item => (
                    <tr key={item.no} className="border-b border-slate-100">
                      <td className="py-2.5 text-xs text-slate-700">{item.no}</td>
                      <td className="py-2.5 text-xs text-slate-900">{item.desc}</td>
                      <td className="py-2.5 text-xs text-right text-slate-700">1</td>
                      <td className="py-2.5 text-xs text-right text-slate-700">{previewTemplate.currency} {item.amount}</td>
                      <td className="py-2.5 text-xs text-right font-medium text-slate-900">{previewTemplate.currency} {item.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                {[
                  [t('invoiceTemplate.subtotal'), Number(previewSubtotal).toFixed(2)],
                  [t('invoiceTemplate.taxLine', { rate: taxRateText(previewTemplate.tax_rate) }), Number(previewTax).toFixed(2)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-900 font-medium">{previewTemplate.currency} {val}</span>
                  </div>
                ))}
                <hr className="border-slate-200" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-slate-900">{t('quotationDetail.total')}</span>
                  <span className="text-blue-600">{previewTemplate.currency} {Number(previewTotal).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">{t('invoiceTemplate.paymentTerms')}</p>
              <p>{t('invoiceTemplate.paymentTermsText')}</p>
              <p>{t('invoiceTemplate.bankLine')}</p>
              <p>BIC: COBADEFFXXX</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={t('invoiceTemplate.editTitle')} size="lg" footer={
        <div className="flex justify-end gap-3">
          <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all duration-200">{t('common.cancel')}</button>
          <button onClick={handleEditSave} disabled={editSaving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all duration-200">
            {editSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      }>
        <div className="space-y-4">
          {editError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{editError}</p>
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.templateName')}</label>
            <input type="text" value={editForm.name} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.appliesTo')}</label>
              <select value={editForm.clientType} onChange={(e) => setEditForm(prev => ({ ...prev, clientType: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                <option value={t('invoiceTemplate.typeGeneral')}>{t('invoiceTemplate.typeGeneral')}</option>
                <option value={t('invoiceTemplate.typeDedicated')}>{t('invoiceTemplate.typeDedicated')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">{t('common.currency')}</label>
              <select value={editForm.currency} onChange={(e) => setEditForm(prev => ({ ...prev, currency: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                <option value="EUR">{t('currencyName.EUR')}</option>
                <option value="USD">{t('currencyName.USD')}</option>
                <option value="CNY">{t('currencyName.CNY')}</option>
                <option value="GBP">{t('currencyName.GBP')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.taxRatePct')}</label>
              <input type="number" value={editForm.taxRate} onChange={(e) => setEditForm(prev => ({ ...prev, taxRate: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" min="0" max="100" />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.triggerCondition')}</label>
              <select value={editForm.triggerRule} onChange={(e) => setEditForm(prev => ({ ...prev, triggerRule: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                <option value="order_complete">{t('invoiceTemplate.triggerOrderCompleted')}</option>
                <option value="cmr_uploaded">{t('invoiceTemplate.triggerCmrUploaded')}</option>
                <option value="manual">{t('invoiceTemplate.triggerManual')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.headerInfo')}</label>
            <textarea value={editForm.headerInfo} onChange={(e) => setEditForm(prev => ({ ...prev, headerInfo: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" rows={3} placeholder={t('invoiceTemplate.headerPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">{t('invoiceTemplate.footerInfo')}</label>
            <textarea value={editForm.footerInfo} onChange={(e) => setEditForm(prev => ({ ...prev, footerInfo: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" rows={3} placeholder={t('invoiceTemplate.footerPlaceholder')} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
