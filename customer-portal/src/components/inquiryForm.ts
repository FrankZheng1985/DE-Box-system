/**
 * 询价建单表单的公共类型与工具
 *
 * 两层（卡派 LTL / 卡车 FTL）和三层（本地派送）两套表单都要用，
 * 抽出来免得同一份 LDM 换算和「联系人并进地址」在两个文件里各写一遍 ——
 * 那种重复改一处忘一处，正是踩坑 011 / 047 的老路子。
 */

import { calcUnitVolumeM3, calcLineLdm } from '../constants/inquiryQuotation'

export interface AddressForm {
  country: string
  zipCode: string
  city: string
  address: string
}

/** 一侧的联系人（发货侧存进地址 JSONB，收货侧看服务类型决定落点） */
export interface ContactForm {
  name: string
  phone: string
  email: string
}

/** 行内一律用字符串存，避免受控 number input 清空时跳成 0 */
export interface CargoRow {
  key: string
  referenceNo: string
  description: string
  quantity: string
  lengthCm: string
  widthCm: string
  heightCm: string
  unitWeightKg: string
}

export const EMPTY_ADDRESS: AddressForm = { country: '', zipCode: '', city: '', address: '' }
export const EMPTY_CONTACT: ContactForm = { name: '', phone: '', email: '' }

export const inputClass =
  'w-full h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200 ease-in-out'

let rowSeq = 0
export function newCargoRow(): CargoRow {
  rowSeq += 1
  return {
    key: `row-${rowSeq}`,
    referenceNo: '', description: '', quantity: '1',
    lengthCm: '', widthCm: '', heightCm: '', unitWeightKg: '',
  }
}

/** 一票派送（对应后端 inquiry_delivery_orders 的一行） */
export interface DeliveryOrderForm {
  key: string
  customerSubRef: string
  companyName: string
  address: AddressForm
  contact: ContactForm
  remarks: string
  rows: CargoRow[]
}

/** 本地派送整张表单：一个柜 + 若干票派送 */
export interface LocalDeliveryFormValue {
  containerNo: string
  customerRef: string
  pickupAddress: AddressForm
  pickupContact: ContactForm
  deliveryOrders: DeliveryOrderForm[]
}

let orderSeq = 0
export function newDeliveryOrder(): DeliveryOrderForm {
  orderSeq += 1
  return {
    key: `drop-${orderSeq}`,
    customerSubRef: '',
    companyName: '',
    address: { ...EMPTY_ADDRESS },
    contact: { ...EMPTY_CONTACT },
    remarks: '',
    rows: [newCargoRow()],
  }
}

export function newLocalDeliveryValue(): LocalDeliveryFormValue {
  return {
    containerNo: '',
    customerRef: '',
    pickupAddress: { ...EMPTY_ADDRESS },
    pickupContact: { ...EMPTY_CONTACT },
    deliveryOrders: [newDeliveryOrder()],
  }
}

/** 空字符串转 null，其余转数字 */
export function toNum(value: string): number | null {
  if (!value || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** 一行的派生值（件数 / 单件体积 / 行 LDM） */
export function deriveRow(r: CargoRow) {
  const qty = toNum(r.quantity) ?? 1
  const l = toNum(r.lengthCm)
  const w = toNum(r.widthCm)
  const h = toNum(r.heightCm)
  return {
    qty,
    unitVolume: calcUnitVolumeM3(l, w, h),
    ldm: calcLineLdm(l, w, qty),
  }
}

export interface CargoTotals {
  quantity: number
  weight: number
  volume: number
  ldm: number
}

/** 合计（口径和后端 recalcInquiryTotals / recalcDeliveryOrderTotals 一致） */
export function sumRows(rows: CargoRow[]): CargoTotals {
  return rows.reduce<CargoTotals>(
    (acc, r) => {
      const { qty, unitVolume, ldm } = deriveRow(r)
      const unitWeight = toNum(r.unitWeightKg)
      acc.quantity += qty
      if (unitWeight !== null) acc.weight += unitWeight * qty
      if (unitVolume !== null) acc.volume += unitVolume * qty
      if (ldm !== null) acc.ldm += ldm
      return acc
    },
    { quantity: 0, weight: 0, volume: 0, ldm: 0 }
  )
}

/** 只提交填了内容的行，并转成后端要的字段名 */
export function buildCargoItems(rows: CargoRow[]) {
  return rows
    .filter((r) => r.referenceNo.trim() || r.description.trim()
      || toNum(r.lengthCm) !== null || toNum(r.unitWeightKg) !== null)
    .map((r) => ({
      referenceNo: r.referenceNo.trim() || null,
      description: r.description.trim() || null,
      quantity: toNum(r.quantity) ?? 1,
      lengthCm: toNum(r.lengthCm),
      widthCm: toNum(r.widthCm),
      heightCm: toNum(r.heightCm),
      unitWeightKg: toNum(r.unitWeightKg),
    }))
}

/**
 * 联系人并进地址对象
 *
 * 三个都没填就原样返回，不造出一堆空串键 —— 空串比 NULL 更难排查（踩坑 047）。
 */
export function mergeContact<T extends object>(address: T, contact: ContactForm) {
  const name = contact.name.trim()
  const phone = contact.phone.trim()
  const email = contact.email.trim()
  if (!name && !phone && !email) return address
  return {
    ...address,
    ...(name ? { contactName: name } : {}),
    ...(phone ? { contactPhone: phone } : {}),
    ...(email ? { contactEmail: email } : {}),
  }
}
