/**
 * 按件货物明细的编辑表格（运营端）
 *
 * 两层结构（明细直接挂询价单）和三层结构（明细挂在每一票派送下）共用。
 * 体积纯自动算不给编辑；LDM 自动算，勾「手改」后才可编辑 —— 特殊摆放方式
 * 要能人工调整（Frank 2026-08-01 定）。
 */

import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import {
  type CargoItemForm, deriveCargoRow, newCargoRow, sumCargoRows,
} from './cargoItemForm'

interface Props {
  rows: CargoItemForm[]
  onChange: (rows: CargoItemForm[]) => void
  /** 紧凑模式：嵌在派送票卡片里时字号小一号、去掉公式提示 */
  compact?: boolean
}

const cellInput =
  'w-full h-8 px-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500'

export default function CargoItemsEditor({ rows, onChange, compact = false }: Props) {
  const { t } = useTranslation()
  const totals = sumCargoRows(rows)

  const updateItem = (key: string, patch: Partial<CargoItemForm>) => {
    onChange(rows.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const removeItem = (key: string) => {
    // 删到只剩一行时补一行空的：表格整个消失会让人以为坏了
    onChange(rows.length === 1 ? [newCargoRow()] : rows.filter((r) => r.key !== key))
  }

  return (
    <div>
      {compact && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium text-slate-600">{t('cargo.itemsTitle')}</p>
          <button
            type="button"
            onClick={() => onChange([...rows, newCargoRow()])}
            className="h-7 px-2 text-[11px] text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1 transition-all duration-200 ease-in-out"
          >
            <Plus className="w-3 h-3" />
            {t('cargo.addRow')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[1150px]">
          <colgroup>
            <col className="w-[11%]" />
            <col className="w-[14%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[7%]" />
            <col className="w-[4%]" />
          </colgroup>
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-100">
              <th className="text-left px-2 py-2.5 font-medium">{t('cargo.colItemNo')}</th>
              <th className="text-left px-2 py-2.5 font-medium">{t('field.cargoDescription')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colPieces')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colLengthCm')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colWidthCm')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colHeightCm')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colUnitWeightKg')}</th>
              <th className="text-right px-2 py-2.5 font-medium">{t('cargo.colUnitVolumeM3')}</th>
              <th className="text-right px-2 py-2.5 font-medium">LDM</th>
              <th className="text-center px-2 py-2.5 font-medium">{t('cargo.colStackable')}</th>
              <th className="text-center px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const { unitVolume, autoLdm } = deriveCargoRow(it)
              return (
                <tr key={it.key} className="border-b border-slate-50">
                  <td className="px-2 py-2">
                    <input type="text" value={it.referenceNo} onChange={(e) => updateItem(it.key, { referenceNo: e.target.value })} className={cellInput} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="text" value={it.description} onChange={(e) => updateItem(it.key, { description: e.target.value })} className={cellInput} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })} className={`${cellInput} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.1" value={it.lengthCm} onChange={(e) => updateItem(it.key, { lengthCm: e.target.value })} className={`${cellInput} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.1" value={it.widthCm} onChange={(e) => updateItem(it.key, { widthCm: e.target.value })} className={`${cellInput} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.1" value={it.heightCm} onChange={(e) => updateItem(it.key, { heightCm: e.target.value })} className={`${cellInput} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.01" value={it.unitWeightKg} onChange={(e) => updateItem(it.key, { unitWeightKg: e.target.value })} className={`${cellInput} text-right`} />
                  </td>
                  {/* 体积纯自动，不给编辑入口 */}
                  <td className="px-2 py-2 text-right text-xs text-slate-500">
                    {unitVolume !== null ? unitVolume.toFixed(3) : '-'}
                  </td>
                  {/* LDM 自动算，勾「手改」后才可编辑 */}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.ldmManual ? it.ldm : (autoLdm !== null ? String(autoLdm) : '')}
                        disabled={!it.ldmManual}
                        onChange={(e) => updateItem(it.key, { ldm: e.target.value })}
                        className={`${cellInput} text-right disabled:bg-slate-50 disabled:text-slate-500`}
                      />
                      <label className="flex items-center gap-0.5 text-[10px] text-slate-400 whitespace-nowrap cursor-pointer" title={t('cargo.manualLdmTitle')}>
                        <input
                          type="checkbox"
                          checked={it.ldmManual}
                          onChange={(e) => updateItem(it.key, {
                            ldmManual: e.target.checked,
                            // 勾上时把当前自动值填进去当起点，取消时清掉
                            ldm: e.target.checked ? (autoLdm !== null ? String(autoLdm) : '') : '',
                          })}
                          className="rounded border-slate-300"
                        />
                        {t('cargo.manualAdjusted')}
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={it.stackable} onChange={(e) => updateItem(it.key, { stackable: e.target.checked })} className="rounded border-slate-300" />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      title={t('cargo.deleteRow')}
                      className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 ease-in-out"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 实时合计，和保存后后端算出来的值一致 */}
      <div className={`flex flex-wrap items-center gap-6 border-t border-slate-100 text-slate-500 ${
        compact ? 'mt-2 pt-2 text-[11px]' : 'mt-4 pt-4 text-xs'
      }`}>
        <span>{t('cargo.totalPieces')} <b className="text-slate-900">{totals.quantity}</b></span>
        <span>{t('cargo.totalWeight')} <b className="text-slate-900">{totals.weight.toFixed(2)}</b> kg</span>
        <span>{t('cargo.totalVolume')} <b className="text-slate-900">{totals.volume.toFixed(3)}</b> m³</span>
        <span>LDM <b className="text-slate-900">{totals.ldm.toFixed(2)}</b></span>
        {!compact && <span className="text-slate-400">{t('cargo.ldmFormula')}</span>}
      </div>
    </div>
  )
}
