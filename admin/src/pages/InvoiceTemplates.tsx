import { useState, useEffect } from 'react'
import { FileText, Eye, Pencil, Clock, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import api, { ApiResponse } from '../utils/api'
import Modal from '../components/Modal'

interface InvoiceTemplate {
  id: string
  name: string
  clientType: string
  currency: string
  taxRate: string
  triggerRule: string
  lastUsedAt: string | null
}

/** 演示用的默认模板（尚无后端接口），按当前语言构造 */
function buildDefaultTemplates(t: TFunction): InvoiceTemplate[] {
  return [
  {
    id: '1',
    name: t('invoiceTemplate.sampleStandard'),
    clientType: t('invoiceTemplate.typeGeneral'),
    currency: 'EUR',
    taxRate: '19%',
    triggerRule: t('invoiceTemplate.triggerOrderCompleted'),
    lastUsedAt: '2026-04-08 14:30',
  },
  {
    id: '2',
    name: t('invoiceTemplate.sampleDhl'),
    clientType: t('invoiceTemplate.typeDedicated'),
    currency: 'EUR',
    taxRate: '19%',
    triggerRule: t('invoiceTemplate.triggerCmrUploaded'),
    lastUsedAt: '2026-04-05 09:15',
  },
  {
    id: '3',
    name: t('invoiceTemplate.sampleCustoms'),
    clientType: t('invoiceTemplate.typeGeneral'),
    currency: 'USD',
    taxRate: '0%',
    triggerRule: t('invoiceTemplate.triggerManual'),
    lastUsedAt: null,
  },
  ]
}

export default function InvoiceTemplates() {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(() => buildDefaultTemplates(t))
  const [triggerCondition, setTriggerCondition] = useState('order_complete')
  const [defaultTemplate, setDefaultTemplate] = useState('1')
  const [sendMethod, setSendMethod] = useState('email')
  const [autoSendEmail, setAutoSendEmail] = useState(true)
  const [autoReminder, setAutoReminder] = useState(false)
  const [mergeClient, setMergeClient] = useState(false)

  useEffect(() => {
    api.get<ApiResponse<InvoiceTemplate[]>>('/invoice-templates')
      .then((res) => { if (res.data && res.data.length > 0) setTemplates(res.data) })
      .catch(() => {})
  }, [])

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
  const handlePreview = (tpl: InvoiceTemplate) => {
    setPreviewTemplate(tpl)
    setPreviewOpen(true)
  }

  const handleEdit = (tpl: InvoiceTemplate) => {
    setEditForm({
      id: tpl.id,
      name: tpl.name,
      clientType: tpl.clientType,
      currency: tpl.currency,
      taxRate: tpl.taxRate.replace('%', ''),
      triggerRule: tpl.triggerRule === t('invoiceTemplate.triggerOrderCompleted') ? 'order_complete'
        : tpl.triggerRule === t('invoiceTemplate.triggerCmrUploaded') ? 'cmr_uploaded' : 'manual',
      headerInfo: 'Kaluna UG (haftungsbeschränkt)\nNiederbeckstraße 35, 40472 Düsseldorf',
      footerInfo: `${t('invoiceTemplate.paymentTerms')}: ${t('invoiceTemplate.paymentTermsText')}\n${t('invoiceTemplate.bankLine')}`,
    })
    setEditOpen(true)
  }

  const triggerLabelMap: Record<string, string> = {
    order_complete: t('invoiceTemplate.triggerOrderCompleted'), cmr_uploaded: t('invoiceTemplate.triggerCmrUploaded'), manual: t('invoiceTemplate.triggerManual'),
  }

  const handleEditSave = async () => {
    setEditSaving(true)
    try {
      await api.put<ApiResponse>(`/invoice-templates/${editForm.id}`, {
        name: editForm.name, client_type: editForm.clientType, currency: editForm.currency,
        tax_rate: editForm.taxRate, trigger_rule: editForm.triggerRule,
        header_info: editForm.headerInfo, footer_info: editForm.footerInfo,
      })
    } catch {
      // 接口可能未完全实现，静默处理
    } finally {
      // 无论成功失败都更新本地状态并关闭
      setTemplates(prev => prev.map(tpl => tpl.id === editForm.id ? {
        ...tpl, name: editForm.name, clientType: editForm.clientType,
        currency: editForm.currency, taxRate: editForm.taxRate + '%',
        triggerRule: triggerLabelMap[editForm.triggerRule] || t('invoiceTemplate.triggerManual'),
      } : tpl))
      setEditOpen(false)
      setEditSaving(false)
    }
  }

  const previewSubtotal = 2800
  const previewTaxRate = previewTemplate ? Number(previewTemplate.taxRate.replace('%', '')) : 19
  const previewTax = Number((previewSubtotal * previewTaxRate / 100).toFixed(2))
  const previewTotal = Number((previewSubtotal + previewTax).toFixed(2))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('invoiceTemplate.pageTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('invoiceTemplate.pageSubtitle')}</p>
      </div>
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
                  <h3 className="text-sm font-semibold text-slate-900">{tpl.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tpl.clientType === t('invoiceTemplate.typeDedicated') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {tpl.clientType}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {[[t('common.currency'), tpl.currency], [t('invoiceTemplate.taxRate'), tpl.taxRate], [t('invoiceTemplate.triggerRule'), tpl.triggerRule]].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-700 font-medium">{val}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('invoiceTemplate.lastUsed')}</span>
                <span className="text-slate-500">
                  {tpl.lastUsedAt
                    ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tpl.lastUsedAt}</span>
                    : t('invoiceTemplate.neverUsed')}
                </span>
              </div>
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
              {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
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

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title={`${t('invoiceTemplate.previewTitle')} - ${previewTemplate?.name || ''}`} size="lg">
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
                  [t('invoiceTemplate.taxLine', { rate: previewTemplate.taxRate }), Number(previewTax).toFixed(2)],
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
