import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import api, { ApiResponse } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { BUSINESS_TYPES, BUSINESS_TYPE_VALUES, type BusinessType } from '../constants/businessTypes'

export default function CreateOrder() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    businessType: BUSINESS_TYPES.TRUCK_LTL as BusinessType,
    pickupCountry: '',
    pickupCity: '',
    pickupZipCode: '',
    pickupAddress: '',
    deliveryCountry: '',
    deliveryCity: '',
    deliveryZipCode: '',
    deliveryAddress: '',
    transportType: 'FTL',
    cargoDescription: '',
    totalWeight: '',
    totalVolume: '',
    packageCount: '',
    pickupDate: '',
    deliveryDate: '',
    specialRequirements: '',
    contactName: '',
    contactPhone: '',
  })

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const inputClass =
    'w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.pickupCountry.trim() || !form.pickupCity.trim()) {
      setError(t('createOrder.errorPickup'))
      return
    }
    if (!form.deliveryCountry.trim() || !form.deliveryCity.trim()) {
      setError(t('createOrder.errorDelivery'))
      return
    }

    setLoading(true)
    setError('')

    try {
      // ⚠️ 后端 order/model.js 是 JSON.stringify(data.pickupAddress) 写进 JSONB 列，
      //    传 pickupCountry / deliveryCountry 这种平铺字段地址会整个落成 NULL。
      //    结构与 admin 端 OrderCreate.tsx 保持一致：{ country, city, zipCode, address }
      const payload = {
        clientId: user?.linkedEntityId,
        businessType: form.businessType,
        // 本地派送没有 FTL/LTL 之分
        transportType: form.businessType === BUSINESS_TYPES.LOCAL_DELIVERY ? null : form.transportType,
        pickupAddress: {
          country: form.pickupCountry,
          city: form.pickupCity,
          zipCode: form.pickupZipCode,
          address: form.pickupAddress,
        },
        deliveryAddress: {
          country: form.deliveryCountry,
          city: form.deliveryCity,
          zipCode: form.deliveryZipCode,
          address: form.deliveryAddress,
        },
        pickupDate: form.pickupDate || undefined,
        deliveryDate: form.deliveryDate || undefined,
        cargoDescription: form.cargoDescription || form.specialRequirements,
        cargoWeightKg: form.totalWeight ? Number(form.totalWeight) : undefined,
        cargoVolumeM3: form.totalVolume ? Number(form.totalVolume) : undefined,
        cargoQuantity: form.packageCount ? Number(form.packageCount) : undefined,
        specialRequirements: form.specialRequirements || undefined,
        remarks: form.contactName || form.contactPhone
          ? `${t('createOrder.contactName')}: ${form.contactName || '-'} / ${form.contactPhone || '-'}`
          : undefined,
        clientPrice: 0,
        currency: 'EUR',
      }
      const res = await api.post<ApiResponse<any>>('/orders', payload)
      if (res.code === 200 || res.code === 201) {
        setSuccess(true)
        setTimeout(() => navigate('/orders'), 1500)
      } else {
        setError(res.message || t('createOrder.failed'))
      }
    } catch (err: any) {
      setError(err.message || t('createOrder.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Save className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">{t('createOrder.success')}</h2>
        <p className="text-sm text-slate-500">{t('createOrder.redirecting')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 顶部 */}
      <button
        onClick={() => navigate('/orders')}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('createOrder.backToList')}
      </button>

      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">{t('createOrder.title')}</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 装货地址 */}
          <div>
            <h3 className="text-xs font-semibold text-slate-700 mb-2">{t('createOrder.pickupAddress')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.country')} {t('common.required')}</label>
                <input
                  type="text"
                  value={form.pickupCountry}
                  onChange={(e) => handleChange('pickupCountry', e.target.value)}
                  placeholder={t('createOrder.phCountryDE')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.city')} {t('common.required')}</label>
                <input
                  type="text"
                  value={form.pickupCity}
                  onChange={(e) => handleChange('pickupCity', e.target.value)}
                  placeholder={t('createOrder.phCityDE')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.zipCode')}</label>
                <input
                  type="text"
                  value={form.pickupZipCode}
                  onChange={(e) => handleChange('pickupZipCode', e.target.value)}
                  placeholder={t('createOrder.phZipDE')}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.address')}</label>
              <input
                type="text"
                value={form.pickupAddress}
                onChange={(e) => handleChange('pickupAddress', e.target.value)}
                placeholder={t('createOrder.phStreet')}
                className={inputClass}
              />
            </div>
          </div>

          {/* 卸货地址 */}
          <div>
            <h3 className="text-xs font-semibold text-slate-700 mb-2">{t('createOrder.deliveryAddress')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.country')} {t('common.required')}</label>
                <input
                  type="text"
                  value={form.deliveryCountry}
                  onChange={(e) => handleChange('deliveryCountry', e.target.value)}
                  placeholder={t('createOrder.phCountryPL')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.city')} {t('common.required')}</label>
                <input
                  type="text"
                  value={form.deliveryCity}
                  onChange={(e) => handleChange('deliveryCity', e.target.value)}
                  placeholder={t('createOrder.phCityPL')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.zipCode')}</label>
                <input
                  type="text"
                  value={form.deliveryZipCode}
                  onChange={(e) => handleChange('deliveryZipCode', e.target.value)}
                  placeholder={t('createOrder.phZipPL')}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.address')}</label>
              <input
                type="text"
                value={form.deliveryAddress}
                onChange={(e) => handleChange('deliveryAddress', e.target.value)}
                placeholder={t('createOrder.phStreet')}
                className={inputClass}
              />
            </div>
          </div>

          {/* 服务类型 + 运输类型 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.serviceType')} {t('common.required')}</label>
              <select
                value={form.businessType}
                onChange={(e) => handleChange('businessType', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white"
              >
                {BUSINESS_TYPE_VALUES.map((bt) => (
                  <option key={bt} value={bt}>{t(`businessType.${bt}`)}</option>
                ))}
              </select>
            </div>
            {/* 本地派送没有 FTL/LTL 之分 */}
            {form.businessType !== BUSINESS_TYPES.LOCAL_DELIVERY && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.transportType')}</label>
                <select
                  value={form.transportType}
                  onChange={(e) => handleChange('transportType', e.target.value)}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="FTL">{t('transportType.FTL')}</option>
                  <option value="LTL">{t('transportType.LTL')}</option>
                  <option value="FCL">{t('transportType.FCL')}</option>
                  <option value="LCL">{t('transportType.LCL')}</option>
                </select>
              </div>
            )}
          </div>

          {/* 货物信息 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.cargoDescription')}</label>
            <textarea
              value={form.cargoDescription}
              onChange={(e) => handleChange('cargoDescription', e.target.value)}
              placeholder={t('createOrder.phCargo')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.weightKg')}</label>
              <input
                type="number"
                value={form.totalWeight}
                onChange={(e) => handleChange('totalWeight', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.volumeM3')}</label>
              <input
                type="number"
                value={form.totalVolume}
                onChange={(e) => handleChange('totalVolume', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.quantity')}</label>
              <input
                type="number"
                value={form.packageCount}
                onChange={(e) => handleChange('packageCount', e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 日期 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.pickupDate')}</label>
              <input
                type="date"
                value={form.pickupDate}
                onChange={(e) => handleChange('pickupDate', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.deliveryDate')}</label>
              <input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => handleChange('deliveryDate', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 联系人 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.contactName')}</label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => handleChange('contactName', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.contactPhone')}</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* 特殊要求 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('createOrder.specialRequirements')}</label>
            <textarea
              value={form.specialRequirements}
              onChange={(e) => handleChange('specialRequirements', e.target.value)}
              placeholder={t('createOrder.phSpecial')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="h-9 px-4 text-xs text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('createOrder.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
