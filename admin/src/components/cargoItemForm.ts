/**
 * 询价件明细表单的公共类型与工具（运营端）
 *
 * 两层结构（卡派 LTL / 卡车 FTL：明细直接挂询价单）和三层结构
 * （本地派送：明细挂在每一票派送下面）共用同一套行编辑逻辑，
 * 抽出来免得 LDM 手改联动这种有状态的算法在两个文件里各写一遍。
 */

import { calcUnitVolumeM3, calcLineLdm } from '../constants/inquiryQuotation'

/** 行内一律用字符串存，避免受控 number input 清空时跳成 0 */
export interface CargoItemForm {
  key: string
  referenceNo: string
  description: string
  quantity: string
  lengthCm: string
  widthCm: string
  heightCm: string
  unitWeightKg: string
  ldm: string
  ldmManual: boolean
  stackable: boolean
  remarks: string
}

let rowSeq = 0
export function newCargoRow(): CargoItemForm {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    referenceNo: '', description: '', quantity: '1',
    lengthCm: '', widthCm: '', heightCm: '', unitWeightKg: '',
    ldm: '', ldmManual: false, stackable: true, remarks: '',
  }
}

/** 后端回来的一行明细 → 表单行 */
export function cargoRowFromApi(it: any): CargoItemForm {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    referenceNo: it.reference_no || '',
    description: it.description || '',
    quantity: String(it.quantity ?? 1),
    lengthCm: it.length_cm !== null && it.length_cm !== undefined ? String(Number(it.length_cm)) : '',
    widthCm: it.width_cm !== null && it.width_cm !== undefined ? String(Number(it.width_cm)) : '',
    heightCm: it.height_cm !== null && it.height_cm !== undefined ? String(Number(it.height_cm)) : '',
    unitWeightKg: it.unit_weight_kg !== null && it.unit_weight_kg !== undefined ? String(Number(it.unit_weight_kg)) : '',
    ldm: it.ldm !== null && it.ldm !== undefined ? String(Number(it.ldm)) : '',
    ldmManual: Boolean(it.ldm_manual),
    stackable: it.stackable !== false,
    remarks: it.remarks || '',
  }
}

/** 空字符串转 null，其余转数字；非法输入也返回 null */
export function toNum(value: string): number | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** 一行的派生值（体积 / 自动 LDM / 实际生效的 LDM），显示用 */
export function deriveCargoRow(it: CargoItemForm) {
  const qty = toNum(it.quantity) ?? 1
  const l = toNum(it.lengthCm)
  const w = toNum(it.widthCm)
  const h = toNum(it.heightCm)
  const unitVolume = calcUnitVolumeM3(l, w, h)
  const autoLdm = calcLineLdm(l, w, qty)
  const effectiveLdm = it.ldmManual ? toNum(it.ldm) : autoLdm
  return { qty, unitVolume, autoLdm, effectiveLdm }
}

export interface CargoTotals {
  quantity: number
  weight: number
  volume: number
  ldm: number
}

/** 合计，和后端 recalcInquiryTotals / recalcDeliveryOrderTotals 同口径 */
export function sumCargoRows(rows: CargoItemForm[]): CargoTotals {
  return rows.reduce<CargoTotals>((acc, it) => {
    const { qty, unitVolume, effectiveLdm } = deriveCargoRow(it)
    const unitWeight = toNum(it.unitWeightKg)
    acc.quantity += qty
    if (unitWeight !== null) acc.weight += unitWeight * qty
    if (unitVolume !== null) acc.volume += unitVolume * qty
    if (effectiveLdm !== null) acc.ldm += effectiveLdm
    return acc
  }, { quantity: 0, weight: 0, volume: 0, ldm: 0 })
}

/** 只提交填了内容的行，并转成后端要的字段名 */
export function buildCargoItems(rows: CargoItemForm[]) {
  return rows
    .filter((it) => it.referenceNo.trim() || it.description.trim()
      || toNum(it.lengthCm) !== null || toNum(it.unitWeightKg) !== null)
    .map((it) => ({
      referenceNo: it.referenceNo.trim() || null,
      description: it.description.trim() || null,
      quantity: toNum(it.quantity) ?? 1,
      lengthCm: toNum(it.lengthCm),
      widthCm: toNum(it.widthCm),
      heightCm: toNum(it.heightCm),
      unitWeightKg: toNum(it.unitWeightKg),
      ldm: it.ldmManual ? toNum(it.ldm) : null,
      ldmManual: it.ldmManual,
      stackable: it.stackable,
      remarks: it.remarks.trim() || null,
    }))
}
