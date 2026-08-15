/**
 * 按件货物明细表格
 *
 * 两层表单（整张询价单一张表）和三层表单（每票派送一张表）共用。
 * 体积和 LDM 是系统按长宽高实时算的，客户不填、也不可编辑。
 */

import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Package } from 'lucide-react'
import {
  type CargoRow, deriveRow, newCargoRow, sumRows, inputClass,
} from './inquiryForm'

interface Props {
  rows: CargoRow[]
  onChange: (rows: CargoRow[]) => void
  /** 标题左边的小标签，不传就用默认的「按件货物明细」 */
  title?: string
  /** 紧凑模式：用在派送子订单卡片里，标题小一号、去掉外层留白 */
  compact?: boolean
}

export default function CargoItemsTable({ rows, onChange, title, compact = false }: Props) {
  const { t } = useTranslation()
  const totals = sumRows(rows)

  const updateRow = (key: string, patch: Partial<CargoRow>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const removeRow = (key: string) => {
    // 删到只剩一行时给一行空的，表格整个消失会让人以为坏了
    onChange(rows.length === 1 ? [newCargoRow()] : rows.filter((x) => x.key !== key))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className={`flex items-center gap-1.5 font-medium text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {!compact && <Package className="w-3.5 h-3.5 text-slate-400" />}
          {title || t('inquiry.cargoItems')}
        </p>
        <button
          type="button"
          onClick={() => onChange([...rows, newCargoRow()])}
          className="h-7 px-2 text-[11px] text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
        >
          <Plus className="w-3 h-3" />
          {t('inquiry.addRow')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[820px]">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead>
            <tr className="text-[11px] text-slate-500 border-b border-gray-100">
              <th className="text-left px-1.5 py-2 font-medium">{t('inquiry.colRef')}</th>
              <th className="text-left px-1.5 py-2 font-medium">{t('inquiry.colDesc')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colQty')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colLength')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colWidth')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colHeight')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colUnitWeight')}</th>
              <th className="text-right px-1.5 py-2 font-medium">{t('inquiry.colVolume')}</th>
              <th className="text-right px-1.5 py-2 font-medium">LDM</th>
              <th className="text-center px-1.5 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { unitVolume, ldm } = deriveRow(r)
              return (
                <tr key={r.key} className="border-b border-gray-50">
                  <td className="px-1.5 py-1.5"><input type="text" value={r.referenceNo} onChange={(e) => updateRow(r.key, { referenceNo: e.target.value })} className={inputClass} /></td>
                  <td className="px-1.5 py-1.5"><input type="text" value={r.description} onChange={(e) => updateRow(r.key, { description: e.target.value })} className={inputClass} /></td>
                  <td className="px-1.5 py-1.5"><input type="number" min="1" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: e.target.value })} className={`${inputClass} text-right`} /></td>
                  <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.lengthCm} onChange={(e) => updateRow(r.key, { lengthCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                  <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.widthCm} onChange={(e) => updateRow(r.key, { widthCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                  <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.1" value={r.heightCm} onChange={(e) => updateRow(r.key, { heightCm: e.target.value })} className={`${inputClass} text-right`} /></td>
                  <td className="px-1.5 py-1.5"><input type="number" min="0" step="0.01" value={r.unitWeightKg} onChange={(e) => updateRow(r.key, { unitWeightKg: e.target.value })} className={`${inputClass} text-right`} /></td>
                  {/* 体积和 LDM 由系统自动算，客户不用填 */}
                  <td className="px-1.5 py-1.5 text-right text-[11px] text-slate-500">{unitVolume !== null ? unitVolume.toFixed(3) : '-'}</td>
                  <td className="px-1.5 py-1.5 text-right text-[11px] text-slate-500">{ldm !== null ? ldm.toFixed(2) : '-'}</td>
                  <td className="px-1.5 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="h-6 w-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200 ease-in-out"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={`flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[11px] text-slate-500`}>
        <span>{t('inquiry.totalQty')} <b className="text-slate-900">{totals.quantity}</b></span>
        <span>{t('inquiry.totalWeight')} <b className="text-slate-900">{totals.weight.toFixed(2)}</b> kg</span>
        <span>{t('inquiry.totalVolume')} <b className="text-slate-900">{totals.volume.toFixed(3)}</b> m³</span>
        <span>LDM <b className="text-slate-900">{totals.ldm.toFixed(2)}</b></span>
        {!compact && <span className="text-slate-400">{t('inquiry.ldmHint')}</span>}
      </div>
    </div>
  )
}
