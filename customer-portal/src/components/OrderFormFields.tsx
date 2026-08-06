/**
 * 建单表单的字段组（按运输产品分两套）
 *
 * 三个运输产品要填的东西差别很大，所以不共用一张表单：
 *   - 卡车派送 LTL / 本地派送 → GroundOrderFields（装卸地址 + 货物 + 日期）
 *   - 卡车运输 FTL（集装箱）  → ContainerOrderFields（航运 + 集装箱 + 港口配送 + 放单）
 * 字段划分与运营端 admin/src/pages/OrderCreate.tsx 保持一致，
 * 差别只在门户不填客户和报价 —— 客户是登录方自己，价格由我们出。
 */

import { useTranslation } from 'react-i18next'
import { Package, MapPin, Ship, Box, FileText, CalendarDays } from 'lucide-react'
import { BUSINESS_TYPES, type BusinessType } from '../constants/businessTypes'

/** 地面运输（卡车派送 LTL / 本地派送）的表单值 */
export interface GroundOrderForm {
  customerRef: string
  transportType: string
  pickupCountry: string
  pickupCity: string
  pickupZipCode: string
  pickupAddress: string
  pickupContact: string
  pickupPhone: string
  deliveryCountry: string
  deliveryCity: string
  deliveryZipCode: string
  deliveryAddress: string
  deliveryContact: string
  deliveryPhone: string
  cargoDescription: string
  cargoQuantity: string
  cargoWeightKg: string
  cargoVolumeM3: string
  pickupDate: string
  deliveryDate: string
  specialRequirements: string
  remarks: string
}

/** 集装箱（卡车运输 FTL）的表单值 */
export interface ContainerOrderForm {
  customerRef: string
  shippingLine: string
  blNumber: string
  eta: string
  cnee: string
  containerNo: string
  containerType: string
  sealNo: string
  // 提柜地点（选填）：留空就按常规从卸货港提柜
  pickupCountry: string
  pickupCity: string
  pickupZipCode: string
  pickupAddress: string
  pickupContact: string
  pickupPhone: string
  pickupRef: string
  pod: string
  finalDestination: string
  finalDestAddress: string
  expectedDeliveryDate: string
  deliveryContact: string
  deliveryPhone: string
  releaseMethod: string
  needsClearance: boolean
  cargoDescription: string
  cargoQuantity: string
  cargoWeightKg: string
  cargoVolumeM3: string
  remarks: string
}

export const initialGroundForm: GroundOrderForm = {
  customerRef: '',
  transportType: 'LTL',
  pickupCountry: '', pickupCity: '', pickupZipCode: '', pickupAddress: '',
  pickupContact: '', pickupPhone: '',
  deliveryCountry: '', deliveryCity: '', deliveryZipCode: '', deliveryAddress: '',
  deliveryContact: '', deliveryPhone: '',
  cargoDescription: '', cargoQuantity: '', cargoWeightKg: '', cargoVolumeM3: '',
  pickupDate: '', deliveryDate: '',
  specialRequirements: '', remarks: '',
}

export const initialContainerForm: ContainerOrderForm = {
  customerRef: '',
  shippingLine: '', blNumber: '', eta: '', cnee: '',
  containerNo: '', containerType: '', sealNo: '',
  pickupCountry: '', pickupCity: '', pickupZipCode: '', pickupAddress: '',
  pickupContact: '', pickupPhone: '', pickupRef: '',
  pod: '', finalDestination: '', finalDestAddress: '', expectedDeliveryDate: '',
  deliveryContact: '', deliveryPhone: '',
  releaseMethod: 'TELEX', needsClearance: false,
  cargoDescription: '', cargoQuantity: '', cargoWeightKg: '', cargoVolumeM3: '',
  remarks: '',
}

/** 常见柜型；填别的也不拦，运营会在审核时核对 */
const CONTAINER_TYPES = ['20GP', '40GP', '40HQ', '45HQ', '20RF', '40RF']

// ==================== 通用小控件 ====================

const inputClass =
  'w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 ' +
  'focus:border-transparent outline-none transition-all duration-200'

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
}

function SelectInput({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} bg-white`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TextArea({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500
        focus:border-transparent outline-none resize-none transition-all duration-200"
    />
  )
}

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
        <Icon className="w-4 h-4 text-primary-500" />
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ==================== 地面运输（LTL / 本地派送） ====================

export function GroundOrderFields({ businessType, form, onChange }: {
  businessType: BusinessType
  form: GroundOrderForm
  onChange: <K extends keyof GroundOrderForm>(key: K, value: GroundOrderForm[K]) => void
}) {
  const { t } = useTranslation()
  const isLocalDelivery = businessType === BUSINESS_TYPES.LOCAL_DELIVERY

  return (
    <div className="space-y-5">
      <Section icon={Package} title={t('createOrder.sectionBasic')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.customerRef')}>
            <TextInput
              value={form.customerRef}
              onChange={(v) => onChange('customerRef', v)}
              placeholder={t('createOrder.phCustomerRef')}
            />
            <p className="mt-1 text-[11px] text-slate-400">{t('createOrder.customerRefHint')}</p>
          </Field>
          {/* 本地派送没有 FTL/LTL 之分 */}
          {!isLocalDelivery && (
            <Field label={t('createOrder.transportType')}>
              <SelectInput
                value={form.transportType}
                onChange={(v) => onChange('transportType', v)}
                options={[
                  { value: 'LTL', label: t('transportType.LTL') },
                  { value: 'FTL', label: t('transportType.FTL') },
                ]}
              />
            </Field>
          )}
        </div>
      </Section>

      <Section icon={MapPin} title={t('createOrder.pickupAddress')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('createOrder.country')} required>
            <TextInput value={form.pickupCountry} onChange={(v) => onChange('pickupCountry', v)} placeholder={t('createOrder.phCountryDE')} />
          </Field>
          <Field label={t('createOrder.city')} required>
            <TextInput value={form.pickupCity} onChange={(v) => onChange('pickupCity', v)} placeholder={t('createOrder.phCityDE')} />
          </Field>
          <Field label={t('createOrder.zipCode')}>
            <TextInput value={form.pickupZipCode} onChange={(v) => onChange('pickupZipCode', v)} placeholder={t('createOrder.phZipDE')} />
          </Field>
          <div className="sm:col-span-3">
            <Field label={t('createOrder.address')}>
              <TextInput value={form.pickupAddress} onChange={(v) => onChange('pickupAddress', v)} placeholder={t('createOrder.phStreet')} />
            </Field>
          </div>
          <Field label={t('createOrder.pickupContact')}>
            <TextInput value={form.pickupContact} onChange={(v) => onChange('pickupContact', v)} />
          </Field>
          <Field label={t('createOrder.pickupPhone')}>
            <TextInput value={form.pickupPhone} onChange={(v) => onChange('pickupPhone', v)} type="tel" />
          </Field>
        </div>
      </Section>

      <Section icon={MapPin} title={t('createOrder.deliveryAddress')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('createOrder.country')} required>
            <TextInput value={form.deliveryCountry} onChange={(v) => onChange('deliveryCountry', v)} placeholder={t('createOrder.phCountryPL')} />
          </Field>
          <Field label={t('createOrder.city')} required>
            <TextInput value={form.deliveryCity} onChange={(v) => onChange('deliveryCity', v)} placeholder={t('createOrder.phCityPL')} />
          </Field>
          <Field label={t('createOrder.zipCode')}>
            <TextInput value={form.deliveryZipCode} onChange={(v) => onChange('deliveryZipCode', v)} placeholder={t('createOrder.phZipPL')} />
          </Field>
          <div className="sm:col-span-3">
            <Field label={t('createOrder.address')}>
              <TextInput value={form.deliveryAddress} onChange={(v) => onChange('deliveryAddress', v)} placeholder={t('createOrder.phStreet')} />
            </Field>
          </div>
          <Field label={t('createOrder.deliveryContact')}>
            <TextInput value={form.deliveryContact} onChange={(v) => onChange('deliveryContact', v)} />
          </Field>
          <Field label={t('createOrder.deliveryPhone')}>
            <TextInput value={form.deliveryPhone} onChange={(v) => onChange('deliveryPhone', v)} type="tel" />
          </Field>
        </div>
      </Section>

      <Section icon={Package} title={t('createOrder.sectionCargo')}>
        <div className="space-y-4">
          <Field label={t('createOrder.cargoDescription')}>
            <TextArea value={form.cargoDescription} onChange={(v) => onChange('cargoDescription', v)} placeholder={t('createOrder.phCargo')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('createOrder.quantity')}>
              <TextInput value={form.cargoQuantity} onChange={(v) => onChange('cargoQuantity', v)} type="number" placeholder="0" />
            </Field>
            <Field label={t('createOrder.weightKg')}>
              <TextInput value={form.cargoWeightKg} onChange={(v) => onChange('cargoWeightKg', v)} type="number" placeholder="0" />
            </Field>
            <Field label={t('createOrder.volumeM3')}>
              <TextInput value={form.cargoVolumeM3} onChange={(v) => onChange('cargoVolumeM3', v)} type="number" placeholder="0" />
            </Field>
          </div>
        </div>
      </Section>

      <Section icon={CalendarDays} title={t('createOrder.sectionSchedule')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.pickupDate')}>
            <TextInput value={form.pickupDate} onChange={(v) => onChange('pickupDate', v)} type="date" />
          </Field>
          <Field label={t('createOrder.deliveryDate')}>
            <TextInput value={form.deliveryDate} onChange={(v) => onChange('deliveryDate', v)} type="date" />
          </Field>
        </div>
      </Section>

      <Section icon={FileText} title={t('createOrder.sectionOther')}>
        <div className="space-y-4">
          <Field label={t('createOrder.specialRequirements')}>
            <TextArea value={form.specialRequirements} onChange={(v) => onChange('specialRequirements', v)} placeholder={t('createOrder.phSpecial')} />
          </Field>
          <Field label={t('common.remark')}>
            <TextArea value={form.remarks} onChange={(v) => onChange('remarks', v)} />
          </Field>
        </div>
      </Section>
    </div>
  )
}

// ==================== 集装箱（卡车运输 FTL） ====================

export function ContainerOrderFields({ form, onChange }: {
  form: ContainerOrderForm
  onChange: <K extends keyof ContainerOrderForm>(key: K, value: ContainerOrderForm[K]) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-5">
      <Section icon={Package} title={t('createOrder.sectionBasic')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.customerRef')}>
            <TextInput
              value={form.customerRef}
              onChange={(v) => onChange('customerRef', v)}
              placeholder={t('createOrder.phCustomerRef')}
            />
            <p className="mt-1 text-[11px] text-slate-400">{t('createOrder.customerRefHint')}</p>
          </Field>
        </div>
      </Section>

      <Section icon={Ship} title={t('createOrder.sectionShipping')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.shippingLine')}>
            <TextInput value={form.shippingLine} onChange={(v) => onChange('shippingLine', v)} placeholder={t('createOrder.phShippingLine')} />
          </Field>
          <Field label={t('createOrder.blNumber')} required>
            <TextInput value={form.blNumber} onChange={(v) => onChange('blNumber', v)} placeholder={t('createOrder.phBlNumber')} />
          </Field>
          <Field label={t('createOrder.eta')}>
            <TextInput value={form.eta} onChange={(v) => onChange('eta', v)} type="date" />
          </Field>
          <Field label={t('createOrder.cnee')}>
            <TextInput value={form.cnee} onChange={(v) => onChange('cnee', v)} placeholder={t('createOrder.phCnee')} />
          </Field>
        </div>
      </Section>

      <Section icon={Box} title={t('createOrder.sectionContainer')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('createOrder.containerNo')} required>
            <TextInput value={form.containerNo} onChange={(v) => onChange('containerNo', v)} placeholder={t('createOrder.phContainerNo')} />
          </Field>
          <Field label={t('createOrder.containerType')}>
            <SelectInput
              value={form.containerType}
              onChange={(v) => onChange('containerType', v)}
              options={[
                { value: '', label: t('common.notSelected') },
                ...CONTAINER_TYPES.map((c) => ({ value: c, label: c })),
              ]}
            />
          </Field>
          <Field label={t('createOrder.sealNo')}>
            <TextInput value={form.sealNo} onChange={(v) => onChange('sealNo', v)} />
          </Field>
        </div>
      </Section>

      {/* 提柜地点：留空就是从卸货港提柜，只有指定堆场/自有仓库时才填 */}
      <Section icon={MapPin} title={t('createOrder.sectionPickupFtl')}>
        <p className="-mt-1 mb-3 text-[11px] text-slate-400">{t('createOrder.pickupFtlHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t('createOrder.country')}>
            <TextInput value={form.pickupCountry} onChange={(v) => onChange('pickupCountry', v)} placeholder={t('createOrder.phCountryDE')} />
          </Field>
          <Field label={t('createOrder.city')}>
            <TextInput value={form.pickupCity} onChange={(v) => onChange('pickupCity', v)} placeholder={t('createOrder.phPickupTerminal')} />
          </Field>
          <Field label={t('createOrder.zipCode')}>
            <TextInput value={form.pickupZipCode} onChange={(v) => onChange('pickupZipCode', v)} placeholder={t('createOrder.phZipDE')} />
          </Field>
          <div className="sm:col-span-3">
            <Field label={t('createOrder.address')}>
              <TextInput value={form.pickupAddress} onChange={(v) => onChange('pickupAddress', v)} placeholder={t('createOrder.phPickupTerminalAddr')} />
            </Field>
          </div>
          <Field label={t('createOrder.pickupContact')}>
            <TextInput value={form.pickupContact} onChange={(v) => onChange('pickupContact', v)} />
          </Field>
          <Field label={t('createOrder.pickupPhone')}>
            <TextInput value={form.pickupPhone} onChange={(v) => onChange('pickupPhone', v)} type="tel" />
          </Field>
          <Field label={t('createOrder.pickupRef')}>
            <TextInput
              value={form.pickupRef}
              onChange={(v) => onChange('pickupRef', v)}
              placeholder={t('createOrder.phPickupRef')}
            />
          </Field>
        </div>
      </Section>

      <Section icon={MapPin} title={t('createOrder.sectionPortDelivery')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.pod')} required>
            <TextInput value={form.pod} onChange={(v) => onChange('pod', v)} placeholder={t('createOrder.phPod')} />
          </Field>
          <Field label={t('createOrder.finalDestination')} required>
            <TextInput value={form.finalDestination} onChange={(v) => onChange('finalDestination', v)} placeholder={t('createOrder.phFinalDest')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('createOrder.finalDestAddress')}>
              <TextInput value={form.finalDestAddress} onChange={(v) => onChange('finalDestAddress', v)} placeholder={t('createOrder.phStreet')} />
            </Field>
          </div>
          <Field label={t('createOrder.expectedDeliveryDate')}>
            <TextInput value={form.expectedDeliveryDate} onChange={(v) => onChange('expectedDeliveryDate', v)} type="date" />
          </Field>
          <div />
          <Field label={t('createOrder.deliveryContact')}>
            <TextInput value={form.deliveryContact} onChange={(v) => onChange('deliveryContact', v)} />
          </Field>
          <Field label={t('createOrder.deliveryPhone')}>
            <TextInput value={form.deliveryPhone} onChange={(v) => onChange('deliveryPhone', v)} type="tel" />
          </Field>
        </div>
      </Section>

      <Section icon={FileText} title={t('createOrder.sectionRelease')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('createOrder.releaseMethod')}>
            <SelectInput
              value={form.releaseMethod}
              onChange={(v) => onChange('releaseMethod', v)}
              options={[
                { value: 'TELEX', label: t('releaseMethod.TELEX') },
                { value: 'ORIGINAL', label: t('releaseMethod.ORIGINAL') },
              ]}
            />
          </Field>
          <Field label={t('createOrder.needsClearance')}>
            <SelectInput
              value={form.needsClearance ? 'YES' : 'NO'}
              onChange={(v) => onChange('needsClearance', v === 'YES')}
              options={[
                { value: 'NO', label: t('common.no') },
                { value: 'YES', label: t('common.yes') },
              ]}
            />
          </Field>
        </div>
      </Section>

      <Section icon={Package} title={t('createOrder.sectionCargo')}>
        <div className="space-y-4">
          <Field label={t('createOrder.cargoDescription')}>
            <TextArea value={form.cargoDescription} onChange={(v) => onChange('cargoDescription', v)} placeholder={t('createOrder.phCargo')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('createOrder.quantity')}>
              <TextInput value={form.cargoQuantity} onChange={(v) => onChange('cargoQuantity', v)} type="number" placeholder="0" />
            </Field>
            <Field label={t('createOrder.weightKg')}>
              <TextInput value={form.cargoWeightKg} onChange={(v) => onChange('cargoWeightKg', v)} type="number" placeholder="0" />
            </Field>
            <Field label={t('createOrder.volumeM3')}>
              <TextInput value={form.cargoVolumeM3} onChange={(v) => onChange('cargoVolumeM3', v)} type="number" placeholder="0" />
            </Field>
          </div>
          <Field label={t('common.remark')}>
            <TextArea value={form.remarks} onChange={(v) => onChange('remarks', v)} />
          </Field>
        </div>
      </Section>
    </div>
  )
}
