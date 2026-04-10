/**
 * 订单编辑页面
 * 加载已有订单数据，根据业务类型展示对应表单
 * 仅 PENDING_REVIEW / CONFIRMED 状态可编辑
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Loader2,
  MapPin,
  Package,
  FileText,
  Euro,
  Ship,
  User,
  Phone,
  AlertCircle,
  Lock,
} from 'lucide-react'
import api, { type ApiResponse } from '../utils/api'

// ==================== 类型定义 ====================

interface Address {
  country: string
  city: string
  zipCode: string
  address: string
  contact?: string
  phone?: string
}

interface OrderData {
  id: string
  order_number: string
  business_type: string
  status: string
  transport_type: string
  cargo_description: string
  cargo_weight_kg: number
  cargo_volume_m3: number
  cargo_quantity: number
  pickup_address: Address | string
  delivery_address: Address | string
  pickup_date: string
  delivery_date: string
  special_requirements: string
  remarks: string
  client_name: string
  client_id: string
  client_price: number
  currency: string
  // 集装箱字段
  shipping_line: string
  container_no: string
  bl_number: string
  cnee: string
  eta: string
  pod: string
  final_destination: string
  release_method: string
  needs_clearance: boolean
  seal_no: string
  container_type: string
  expected_delivery_date: string
  delivery_contact: string
  delivery_phone: string
  pickup_contact: string
  pickup_phone: string
}

// ==================== 常量 ====================

const EUROPEAN_COUNTRIES = [
  'Germany', 'France', 'Poland', 'Italy', 'Spain',
  'Netherlands', 'Belgium', 'Czech Republic', 'Austria', 'Hungary',
]

const EDITABLE_STATUSES = ['PENDING_REVIEW', 'CONFIRMED']

// ==================== 通用输入组件 ====================

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text', disabled,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400"
    />
  )
}

function SelectInput({
  value, onChange, options, placeholder, disabled,
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
      <Icon className="w-4 h-4 text-blue-500" />
      <h3 className="text-sm font-semibold text-slate-800">{children}</h3>
    </div>
  )
}

// ==================== 地址解析 ====================

function parseAddress(addr: Address | string | null): Address {
  const empty: Address = { country: '', city: '', zipCode: '', address: '', contact: '', phone: '' }
  if (!addr) return empty
  if (typeof addr === 'string') {
    try { return JSON.parse(addr) } catch { return empty }
  }
  return addr
}

// ==================== 主组件 ====================

export default function OrderEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [order, setOrder] = useState<OrderData | null>(null)
  const [isEditable, setIsEditable] = useState(false)

  // 篷布车表单字段
  const [cargoDescription, setCargoDescription] = useState('')
  const [cargoWeightKg, setCargoWeightKg] = useState('')
  const [cargoVolumeM3, setCargoVolumeM3] = useState('')
  const [cargoQuantity, setCargoQuantity] = useState('')
  const [pickupCountry, setPickupCountry] = useState('')
  const [pickupCity, setPickupCity] = useState('')
  const [pickupZipCode, setPickupZipCode] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupContact, setPickupContact] = useState('')
  const [pickupPhone, setPickupPhone] = useState('')
  const [deliveryCountry, setDeliveryCountry] = useState('')
  const [deliveryCity, setDeliveryCity] = useState('')
  const [deliveryZipCode, setDeliveryZipCode] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryContact, setDeliveryContact] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [remarks, setRemarks] = useState('')
  const [clientPrice, setClientPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')

  // 集装箱表单字段
  const [blNumber, setBlNumber] = useState('')
  const [containerNo, setContainerNo] = useState('')
  const [containerType, setContainerType] = useState('')
  const [sealNo, setSealNo] = useState('')
  const [eta, setEta] = useState('')
  const [cnee, setCnee] = useState('')
  const [pod, setPod] = useState('')
  const [finalDestination, setFinalDestination] = useState('')
  const [finalDestAddress, setFinalDestAddress] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [releaseMethod, setReleaseMethod] = useState('TELEX')
  const [needsClearance, setNeedsClearance] = useState(false)

  // ==================== 加载订单数据 ====================

  useEffect(() => {
    if (!id) return
    loadOrder()
  }, [id])

  async function loadOrder() {
    setLoading(true)
    try {
      const res = await api.get<ApiResponse<{ order: OrderData }>>(`/orders/${id}`)
      if (res.code === 200 && res.data?.order) {
        const o = res.data.order
        setOrder(o)
        setIsEditable(EDITABLE_STATUSES.includes(o.status?.toUpperCase()))
        fillForm(o)
      } else {
        setErrors(['订单数据加载失败'])
      }
    } catch (err: any) {
      console.error('加载订单失败:', err)
      setErrors([err.message || '加载订单失败'])
    } finally {
      setLoading(false)
    }
  }

  function fillForm(o: OrderData) {
    // 通用字段
    setCargoDescription(o.cargo_description || '')
    setCargoWeightKg(o.cargo_weight_kg?.toString() || '')
    setCargoVolumeM3(o.cargo_volume_m3?.toString() || '')
    setCargoQuantity(o.cargo_quantity?.toString() || '')
    setSpecialRequirements(o.special_requirements || '')
    setRemarks(o.remarks || '')
    setClientPrice(o.client_price?.toString() || '')
    setCurrency(o.currency || 'EUR')

    if (o.business_type === 'CURTAIN_SIDE') {
      const pickup = parseAddress(o.pickup_address)
      const delivery = parseAddress(o.delivery_address)
      setPickupCountry(pickup.country || '')
      setPickupCity(pickup.city || '')
      setPickupZipCode(pickup.zipCode || '')
      setPickupAddress(pickup.address || '')
      setPickupDate(o.pickup_date?.split('T')[0] || '')
      setPickupContact(pickup.contact || o.pickup_contact || '')
      setPickupPhone(pickup.phone || o.pickup_phone || '')
      setDeliveryCountry(delivery.country || '')
      setDeliveryCity(delivery.city || '')
      setDeliveryZipCode(delivery.zipCode || '')
      setDeliveryAddress(delivery.address || '')
      setDeliveryDate(o.delivery_date?.split('T')[0] || '')
      setDeliveryContact(delivery.contact || o.delivery_contact || '')
      setDeliveryPhone(delivery.phone || o.delivery_phone || '')
    } else {
      // 集装箱
      setBlNumber(o.bl_number || '')
      setContainerNo(o.container_no || '')
      setContainerType(o.container_type || '')
      setSealNo(o.seal_no || '')
      setEta(o.eta?.split('T')[0] || '')
      setCnee(o.cnee || '')
      setPod(o.pod || '')
      setFinalDestination(o.final_destination || '')
      const delivery = parseAddress(o.delivery_address)
      setFinalDestAddress(delivery.address || '')
      setExpectedDeliveryDate(o.expected_delivery_date?.split('T')[0] || o.delivery_date?.split('T')[0] || '')
      setDeliveryContact(o.delivery_contact || delivery.contact || '')
      setDeliveryPhone(o.delivery_phone || delivery.phone || '')
      setReleaseMethod(o.release_method || 'TELEX')
      setNeedsClearance(o.needs_clearance || false)
    }
  }

  // ==================== 提交 ====================

  async function handleSubmit() {
    if (!order || !isEditable) return
    setErrors([])

    // 基本验证
    const errs: string[] = []
    if (!cargoDescription.trim()) errs.push('请填写货物描述')

    if (order.business_type === 'CURTAIN_SIDE') {
      if (!pickupCity.trim()) errs.push('请填写装货城市')
      if (!deliveryCity.trim()) errs.push('请填写卸货城市')
    } else {
      if (!blNumber.trim()) errs.push('请填写提单号')
      if (!containerNo.trim()) errs.push('请填写柜号')
    }

    if (errs.length > 0) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      let payload: Record<string, unknown>

      if (order.business_type === 'CURTAIN_SIDE') {
        payload = {
          cargoDescription,
          cargoWeightKg: cargoWeightKg ? Number(cargoWeightKg) : null,
          cargoVolumeM3: cargoVolumeM3 ? Number(cargoVolumeM3) : null,
          cargoQuantity: cargoQuantity ? Number(cargoQuantity) : null,
          pickupAddress: { country: pickupCountry, city: pickupCity, zipCode: pickupZipCode, address: pickupAddress },
          deliveryAddress: { country: deliveryCountry, city: deliveryCity, zipCode: deliveryZipCode, address: deliveryAddress },
          pickupDate: pickupDate || null,
          deliveryDate: deliveryDate || null,
          pickupContact: pickupContact || null,
          pickupPhone: pickupPhone || null,
          deliveryContact: deliveryContact || null,
          deliveryPhone: deliveryPhone || null,
          specialRequirements,
          remarks: remarks || null,
          clientPrice: clientPrice ? Number(clientPrice) : null,
          currency,
        }
      } else {
        payload = {
          cargoDescription,
          blNumber,
          containerNo,
          containerType,
          sealNo: sealNo || null,
          eta: eta || null,
          cnee,
          pod,
          finalDestination,
          finalDestAddress,
          expectedDeliveryDate: expectedDeliveryDate || null,
          deliveryContact: deliveryContact || null,
          deliveryPhone: deliveryPhone || null,
          releaseMethod,
          needsClearance,
          remarks: remarks || null,
          clientPrice: clientPrice ? Number(clientPrice) : null,
          currency,
        }
      }

      const res = await api.put<ApiResponse>(`/orders/${id}`, payload)
      if (res.code === 200) {
        navigate(`/orders/${id}`)
      } else {
        setErrors([res.message || '更新失败'])
      }
    } catch (err: any) {
      console.error('更新订单失败:', err)
      setErrors([err.message || '网络错误，请检查连接后重试'])
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 加载中 ====================

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-2 text-slate-500 text-sm">加载订单数据...</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-600">订单不存在或加载失败</p>
        <button onClick={() => navigate('/orders')} className="mt-4 text-blue-600 hover:underline text-sm">
          返回订单列表
        </button>
      </div>
    )
  }

  const isCurtainSide = order.business_type === 'CURTAIN_SIDE'
  const countryOptions = EUROPEAN_COUNTRIES.map(c => ({ value: c, label: c }))

  // ==================== 不可编辑提示 ====================

  if (!isEditable) {
    return (
      <div className="p-4 lg:p-6 min-h-screen bg-slate-50/50">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(`/orders/${id}`)}
            className="p-2 rounded-xl hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">编辑订单</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 text-center">
          <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">订单不可编辑</h2>
          <p className="text-sm text-slate-500 mb-1">订单号：{order.order_number}</p>
          <p className="text-sm text-slate-500 mb-6">
            当前状态为 <span className="font-medium text-slate-700">{order.status}</span>，仅待审核或已确认状态的订单可编辑。
          </p>
          <button onClick={() => navigate(`/orders/${id}`)}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors">
            查看订单详情
          </button>
        </div>
      </div>
    )
  }

  // ==================== 渲染表单 ====================

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50/50">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/orders/${id}`)}
            className="p-2 rounded-xl hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">编辑订单</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {order.order_number} · {isCurtainSide ? '篷布车运输' : '集装箱物流'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl
            hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {submitting ? '保存中...' : '保存修改'}
        </button>
      </div>

      {/* 错误提示 */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 表单区域 */}
      <div className="space-y-6">
        {/* 货物信息 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
          <SectionTitle icon={Package}>货物信息</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Label required>货物描述</Label>
              <TextInput value={cargoDescription} onChange={setCargoDescription} placeholder="请描述货物内容" />
            </div>
            <div>
              <Label required>重量 (kg)</Label>
              <TextInput value={cargoWeightKg} onChange={setCargoWeightKg} type="number" placeholder="0" />
            </div>
            <div>
              <Label>体积 (m³)</Label>
              <TextInput value={cargoVolumeM3} onChange={setCargoVolumeM3} type="number" placeholder="0" />
            </div>
            <div>
              <Label>数量</Label>
              <TextInput value={cargoQuantity} onChange={setCargoQuantity} type="number" placeholder="0" />
            </div>
          </div>
        </div>

        {/* 篷布车：路线信息 */}
        {isCurtainSide && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <SectionTitle icon={MapPin}>装货地址</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <Label required>国家</Label>
                <SelectInput value={pickupCountry} onChange={setPickupCountry} options={countryOptions} placeholder="选择国家" />
              </div>
              <div>
                <Label required>城市</Label>
                <TextInput value={pickupCity} onChange={setPickupCity} placeholder="城市" />
              </div>
              <div>
                <Label required>邮编</Label>
                <TextInput value={pickupZipCode} onChange={setPickupZipCode} placeholder="邮编" />
              </div>
              <div>
                <Label required>装货日期</Label>
                <TextInput value={pickupDate} onChange={setPickupDate} type="date" />
              </div>
              <div className="sm:col-span-2">
                <Label required>详细地址</Label>
                <TextInput value={pickupAddress} onChange={setPickupAddress} placeholder="街道门牌号" />
              </div>
              <div>
                <Label>联系人</Label>
                <TextInput value={pickupContact} onChange={setPickupContact} placeholder="联系人姓名" />
              </div>
              <div>
                <Label>电话</Label>
                <TextInput value={pickupPhone} onChange={setPickupPhone} placeholder="联系电话" />
              </div>
            </div>

            <SectionTitle icon={MapPin}>卸货地址</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label required>国家</Label>
                <SelectInput value={deliveryCountry} onChange={setDeliveryCountry} options={countryOptions} placeholder="选择国家" />
              </div>
              <div>
                <Label required>城市</Label>
                <TextInput value={deliveryCity} onChange={setDeliveryCity} placeholder="城市" />
              </div>
              <div>
                <Label required>邮编</Label>
                <TextInput value={deliveryZipCode} onChange={setDeliveryZipCode} placeholder="邮编" />
              </div>
              <div>
                <Label required>到达日期</Label>
                <TextInput value={deliveryDate} onChange={setDeliveryDate} type="date" />
              </div>
              <div className="sm:col-span-2">
                <Label required>详细地址</Label>
                <TextInput value={deliveryAddress} onChange={setDeliveryAddress} placeholder="街道门牌号" />
              </div>
              <div>
                <Label>联系人</Label>
                <TextInput value={deliveryContact} onChange={setDeliveryContact} placeholder="联系人姓名" />
              </div>
              <div>
                <Label>电话</Label>
                <TextInput value={deliveryPhone} onChange={setDeliveryPhone} placeholder="联系电话" />
              </div>
            </div>
          </div>
        )}

        {/* 集装箱：船运信息 */}
        {!isCurtainSide && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
            <SectionTitle icon={Ship}>船运与柜信息</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <Label>船司</Label>
                <TextInput value={order.shipping_line || ''} onChange={() => {}} disabled />
              </div>
              <div>
                <Label required>提单号</Label>
                <TextInput value={blNumber} onChange={setBlNumber} placeholder="BL Number" />
              </div>
              <div>
                <Label>ETA</Label>
                <TextInput value={eta} onChange={setEta} type="date" />
              </div>
              <div>
                <Label>收货人 (CNEE)</Label>
                <TextInput value={cnee} onChange={setCnee} placeholder="CNEE" />
              </div>
              <div>
                <Label required>柜号</Label>
                <TextInput value={containerNo} onChange={setContainerNo} placeholder="XXXX1234567" />
              </div>
              <div>
                <Label>柜型</Label>
                <SelectInput value={containerType} onChange={setContainerType}
                  options={['20GP','40GP','40HQ','45HQ'].map(v => ({ value: v, label: v }))} placeholder="选择柜型" />
              </div>
              <div>
                <Label>铅封号</Label>
                <TextInput value={sealNo} onChange={setSealNo} placeholder="铅封号" />
              </div>
              <div>
                <Label>放单方式</Label>
                <SelectInput value={releaseMethod} onChange={setReleaseMethod}
                  options={[{ value: 'TELEX', label: '电放 (Telex)' }, { value: 'ORIGINAL', label: '正本 (Original)' }]} />
              </div>
            </div>

            <SectionTitle icon={MapPin}>目的地信息</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>卸港 (POD)</Label>
                <TextInput value={pod} onChange={setPod} placeholder="Hamburg" />
              </div>
              <div>
                <Label>最终目的地</Label>
                <TextInput value={finalDestination} onChange={setFinalDestination} placeholder="最终城市" />
              </div>
              <div className="sm:col-span-2">
                <Label>目的地详细地址</Label>
                <TextInput value={finalDestAddress} onChange={setFinalDestAddress} placeholder="详细地址" />
              </div>
              <div>
                <Label>期望送仓日期</Label>
                <TextInput value={expectedDeliveryDate} onChange={setExpectedDeliveryDate} type="date" />
              </div>
              <div>
                <Label>联系人</Label>
                <TextInput value={deliveryContact} onChange={setDeliveryContact} placeholder="联系人" />
              </div>
              <div>
                <Label>电话</Label>
                <TextInput value={deliveryPhone} onChange={setDeliveryPhone} placeholder="电话" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={needsClearance} onChange={(e) => setNeedsClearance(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700">需要清关</span>
              </div>
            </div>
          </div>
        )}

        {/* 其他信息 */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
          <SectionTitle icon={FileText}>其他信息</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isCurtainSide && (
              <div>
                <Label>特殊要求</Label>
                <SelectInput value={specialRequirements} onChange={setSpecialRequirements}
                  options={['无','温控运输','危险品 ADR','超宽超重','需要尾板'].map(v => ({ value: v, label: v }))} />
              </div>
            )}
            <div>
              <Label>客户报价</Label>
              <TextInput value={clientPrice} onChange={setClientPrice} type="number" placeholder="0.00" />
            </div>
            <div>
              <Label>币种</Label>
              <SelectInput value={currency} onChange={setCurrency}
                options={[
                  { value: 'EUR', label: 'EUR (欧元)' },
                  { value: 'GBP', label: 'GBP (英镑)' },
                  { value: 'PLN', label: 'PLN (兹罗提)' },
                ]} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>备注</Label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="订单备注信息..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
                  placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                  transition-all duration-200 resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
