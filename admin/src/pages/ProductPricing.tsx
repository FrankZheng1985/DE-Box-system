import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  Eye, 
  Edit, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Package,
  Euro,
  TrendingUp,
  Percent
} from 'lucide-react'

// 模拟产品数据
const mockProducts = [
  { id: '1', code: 'P001', name: '标准空运服务', category: 'air', unit: 'kg', basePrice: 8.50, currency: 'EUR', status: 'active', description: '中国到德国标准空运服务' },
  { id: '2', code: 'P002', name: '特快空运服务', category: 'air', unit: 'kg', basePrice: 12.80, currency: 'EUR', status: 'active', description: '中国到德国特快空运服务' },
  { id: '3', code: 'P003', name: '海运整柜服务', category: 'sea', unit: 'container', basePrice: 2500.00, currency: 'EUR', status: 'active', description: '20尺集装箱海运服务' },
  { id: '4', code: 'P004', name: '海运拼箱服务', category: 'sea', unit: 'cbm', basePrice: 85.00, currency: 'EUR', status: 'active', description: '海运拼箱服务按立方计费' },
  { id: '5', code: 'P005', name: '德国境内派送', category: 'delivery', unit: 'package', basePrice: 15.00, currency: 'EUR', status: 'active', description: '德国境内包裹派送' },
  { id: '6', code: 'P006', name: '仓储服务', category: 'warehouse', unit: 'pallet/day', basePrice: 2.50, currency: 'EUR', status: 'active', description: '仓储托管服务' },
  { id: '7', code: 'P007', name: '包装服务', category: 'service', unit: 'package', basePrice: 5.00, currency: 'EUR', status: 'active', description: '专业包装服务' },
  { id: '8', code: 'P008', name: '铁路运输服务', category: 'rail', unit: 'kg', basePrice: 4.20, currency: 'EUR', status: 'inactive', description: '中欧班列运输服务' },
]

// 模拟价格规则
const mockPriceRules = [
  { id: '1', productId: '1', minQuantity: 0, maxQuantity: 100, price: 8.50, discountRate: 0 },
  { id: '2', productId: '1', minQuantity: 100, maxQuantity: 500, price: 7.80, discountRate: 0.08 },
  { id: '3', productId: '1', minQuantity: 500, maxQuantity: null, price: 7.00, discountRate: 0.18 },
]

const categoryMap: Record<string, { label: string; color: string }> = {
  air: { label: '空运', color: 'bg-blue-100 text-blue-700' },
  sea: { label: '海运', color: 'bg-cyan-100 text-cyan-700' },
  rail: { label: '铁路', color: 'bg-orange-100 text-orange-700' },
  delivery: { label: '派送', color: 'bg-green-100 text-green-700' },
  warehouse: { label: '仓储', color: 'bg-purple-100 text-purple-700' },
  service: { label: '服务', color: 'bg-gray-100 text-gray-600' },
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '启用', color: 'bg-green-100 text-green-700' },
  inactive: { label: '停用', color: 'bg-red-100 text-red-700' },
}

interface ProductFormData {
  code: string
  name: string
  category: string
  unit: string
  basePrice: string
  currency: string
  status: string
  description: string
}

export default function ProductPricing() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedProduct, setSelectedProduct] = useState<typeof mockProducts[0] | null>(null)
  const [formData, setFormData] = useState<ProductFormData>({
    code: '',
    name: '',
    category: 'air',
    unit: 'kg',
    basePrice: '',
    currency: 'EUR',
    status: 'active',
    description: ''
  })
  
  const pageSize = 10
  
  // 筛选产品
  const filteredProducts = mockProducts.filter(product => {
    const matchSearch = product.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       product.name.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchCategory = categoryFilter === 'all' || product.category === categoryFilter
    const matchStatus = statusFilter === 'all' || product.status === statusFilter
    return matchSearch && matchCategory && matchStatus
  })
  
  const totalPages = Math.ceil(filteredProducts.length / pageSize)
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = [
    { label: '总产品数', value: mockProducts.length, icon: Package, color: 'bg-blue-500' },
    { label: '空运产品', value: mockProducts.filter(p => p.category === 'air').length, icon: Tag, color: 'bg-cyan-500' },
    { label: '海运产品', value: mockProducts.filter(p => p.category === 'sea').length, icon: Tag, color: 'bg-green-500' },
    { label: '启用产品', value: mockProducts.filter(p => p.status === 'active').length, icon: TrendingUp, color: 'bg-emerald-500' },
  ]

  // 打开创建产品弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      code: '',
      name: '',
      category: 'air',
      unit: 'kg',
      basePrice: '',
      currency: 'EUR',
      status: 'active',
      description: ''
    })
    setShowModal(true)
  }

  // 打开编辑产品弹窗
  const handleEdit = (product: typeof mockProducts[0]) => {
    setModalMode('edit')
    setSelectedProduct(product)
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category,
      unit: product.unit,
      basePrice: product.basePrice.toString(),
      currency: product.currency,
      status: product.status,
      description: product.description
    })
    setShowModal(true)
  }

  // 打开查看产品弹窗
  const handleView = (product: typeof mockProducts[0]) => {
    setModalMode('view')
    setSelectedProduct(product)
    setShowModal(true)
  }

  // 打开价格规则弹窗
  const handlePriceRules = (product: typeof mockProducts[0]) => {
    setSelectedProduct(product)
    setShowPriceModal(true)
  }

  // 删除产品
  const handleDelete = (product: typeof mockProducts[0]) => {
    if (confirm(`确定要删除产品 ${product.name} 吗？`)) {
      console.log('删除产品:', product.id)
    }
  }

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (modalMode === 'create') {
      console.log('创建产品:', formData)
    } else {
      console.log('更新产品:', selectedProduct?.id, formData)
    }
    setShowModal(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">产品定价</h1>
          <p className="text-gray-500 mt-1">管理服务产品和定价策略</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-4 h-4" />
          新建产品
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className={`p-3 ${stat.color} rounded-lg`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索产品编号、名称..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部类别</option>
              <option value="air">空运</option>
              <option value="sea">海运</option>
              <option value="rail">铁路</option>
              <option value="delivery">派送</option>
              <option value="warehouse">仓储</option>
              <option value="service">服务</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </select>
          
          <button className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 产品表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">产品编号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">产品名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类别</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">单位</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">基础价格</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-blue-600">{product.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">{product.description}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryMap[product.category]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {categoryMap[product.category]?.label || '其他'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-900">{product.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-gray-900">
                      {product.currency} {product.basePrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[product.status].color}`}>
                      {statusMap[product.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleView(product)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handlePriceRules(product)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="价格规则"
                      >
                        <Percent className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* 分页 */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            共 {filteredProducts.length} 条记录
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-sm font-medium ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 产品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Tag className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '新建产品' : modalMode === 'edit' ? '编辑产品' : '产品详情'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedProduct ? (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">产品编号</label>
                    <p className="font-medium text-gray-900">{selectedProduct.code}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">类别</label>
                    <p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryMap[selectedProduct.category]?.color}`}>
                        {categoryMap[selectedProduct.category]?.label}
                      </span>
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-gray-500">产品名称</label>
                    <p className="font-medium text-gray-900">{selectedProduct.name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">计量单位</label>
                    <p className="font-medium text-gray-900">{selectedProduct.unit}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">基础价格</label>
                    <p className="font-medium text-gray-900">{selectedProduct.currency} {selectedProduct.basePrice.toFixed(2)}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-gray-500">描述</label>
                    <p className="font-medium text-gray-900">{selectedProduct.description}</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">产品编号 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">类别</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="air">空运</option>
                      <option value="sea">海运</option>
                      <option value="rail">铁路</option>
                      <option value="delivery">派送</option>
                      <option value="warehouse">仓储</option>
                      <option value="service">服务</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">产品名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">计量单位</label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">基础价格</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-md btn-secondary"
                  >
                    取消
                  </button>
                  <button type="submit" className="btn btn-md btn-primary">
                    {modalMode === 'create' ? '创建' : '保存'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 价格规则弹窗 */}
      {showPriceModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Percent className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">价格规则</h3>
                  <p className="text-sm text-gray-500">{selectedProduct.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPriceModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6">
              {/* 基础价格信息 */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">基础价格</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedProduct.currency} {selectedProduct.basePrice.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Euro className="w-6 h-6 text-blue-600" />
                  <span className="text-sm text-gray-600">/ {selectedProduct.unit}</span>
                </div>
              </div>

              {/* 阶梯价格规则 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">阶梯价格规则</h4>
                  <button className="text-sm text-blue-600 hover:text-blue-700">
                    + 添加规则
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">数量范围</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">单价</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">折扣率</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mockPriceRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {rule.minQuantity} - {rule.maxQuantity || '∞'} {selectedProduct.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {selectedProduct.currency} {rule.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {rule.discountRate > 0 ? (
                            <span className="text-green-600">-{(rule.discountRate * 100).toFixed(0)}%</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowPriceModal(false)}
                className="btn btn-md btn-secondary"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
