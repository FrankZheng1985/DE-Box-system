import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Database,
  Folder,
  Tag,
  Globe,
  Truck,
  Package,
  MapPin,
  RefreshCw
} from 'lucide-react'

// 数据类型分类
const dataCategories = [
  { id: 'country', label: '国家地区', icon: Globe, count: 12 },
  { id: 'warehouse', label: '仓库信息', icon: Package, count: 8 },
  { id: 'carrier', label: '承运商类型', icon: Truck, count: 6 },
  { id: 'service', label: '服务类型', icon: Tag, count: 15 },
  { id: 'zone', label: '运输分区', icon: MapPin, count: 24 },
]

// 模拟基础数据
const mockBasicData: Record<string, Array<{ id: string; code: string; name: string; description: string; sortOrder: number; status: string }>> = {
  country: [
    { id: '1', code: 'DE', name: '德国', description: 'Germany', sortOrder: 1, status: 'active' },
    { id: '2', code: 'CN', name: '中国', description: 'China', sortOrder: 2, status: 'active' },
    { id: '3', code: 'FR', name: '法国', description: 'France', sortOrder: 3, status: 'active' },
    { id: '4', code: 'NL', name: '荷兰', description: 'Netherlands', sortOrder: 4, status: 'active' },
    { id: '5', code: 'BE', name: '比利时', description: 'Belgium', sortOrder: 5, status: 'active' },
    { id: '6', code: 'AT', name: '奥地利', description: 'Austria', sortOrder: 6, status: 'active' },
  ],
  warehouse: [
    { id: '1', code: 'DE-BER', name: '柏林仓库', description: '德国柏林主仓库', sortOrder: 1, status: 'active' },
    { id: '2', code: 'DE-MUC', name: '慕尼黑仓库', description: '德国慕尼黑分仓', sortOrder: 2, status: 'active' },
    { id: '3', code: 'DE-FRA', name: '法兰克福仓库', description: '德国法兰克福分仓', sortOrder: 3, status: 'active' },
    { id: '4', code: 'CN-SZX', name: '深圳仓库', description: '中国深圳仓库', sortOrder: 4, status: 'active' },
    { id: '5', code: 'CN-SHA', name: '上海仓库', description: '中国上海仓库', sortOrder: 5, status: 'active' },
  ],
  carrier: [
    { id: '1', code: 'AIR', name: '空运', description: '航空运输', sortOrder: 1, status: 'active' },
    { id: '2', code: 'SEA', name: '海运', description: '海洋运输', sortOrder: 2, status: 'active' },
    { id: '3', code: 'RAIL', name: '铁路', description: '铁路运输', sortOrder: 3, status: 'active' },
    { id: '4', code: 'TRUCK', name: '公路', description: '公路运输', sortOrder: 4, status: 'active' },
    { id: '5', code: 'EXPRESS', name: '快递', description: '国际快递', sortOrder: 5, status: 'active' },
  ],
  service: [
    { id: '1', code: 'STD', name: '标准服务', description: '标准物流服务', sortOrder: 1, status: 'active' },
    { id: '2', code: 'EXP', name: '特快服务', description: '加急物流服务', sortOrder: 2, status: 'active' },
    { id: '3', code: 'ECO', name: '经济服务', description: '经济型物流服务', sortOrder: 3, status: 'active' },
    { id: '4', code: 'FBA', name: 'FBA服务', description: '亚马逊FBA入仓服务', sortOrder: 4, status: 'active' },
    { id: '5', code: 'DDP', name: 'DDP服务', description: '完税交货服务', sortOrder: 5, status: 'active' },
  ],
  zone: [
    { id: '1', code: 'ZONE-1', name: '一区', description: '德国境内主要城市', sortOrder: 1, status: 'active' },
    { id: '2', code: 'ZONE-2', name: '二区', description: '德国境内其他地区', sortOrder: 2, status: 'active' },
    { id: '3', code: 'ZONE-3', name: '三区', description: '欧盟邻国', sortOrder: 3, status: 'active' },
    { id: '4', code: 'ZONE-4', name: '四区', description: '欧盟其他国家', sortOrder: 4, status: 'active' },
    { id: '5', code: 'ZONE-5', name: '五区', description: '欧洲非欧盟国家', sortOrder: 5, status: 'active' },
  ],
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '启用', color: 'bg-green-100 text-green-700' },
  inactive: { label: '停用', color: 'bg-red-100 text-red-700' },
}

interface DataFormData {
  code: string
  name: string
  description: string
  sortOrder: string
  status: string
}

export default function BasicData() {
  const [selectedCategory, setSelectedCategory] = useState('country')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedItem, setSelectedItem] = useState<typeof mockBasicData['country'][0] | null>(null)
  const [formData, setFormData] = useState<DataFormData>({
    code: '',
    name: '',
    description: '',
    sortOrder: '0',
    status: 'active'
  })
  
  const pageSize = 10
  
  // 获取当前分类数据
  const currentData = mockBasicData[selectedCategory] || []
  
  // 筛选数据
  const filteredData = currentData.filter(item => {
    const matchSearch = item.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       item.name.toLowerCase().includes(searchKeyword.toLowerCase())
    return matchSearch
  })
  
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 获取当前分类信息
  const currentCategoryInfo = dataCategories.find(c => c.id === selectedCategory)

  // 打开创建弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      code: '',
      name: '',
      description: '',
      sortOrder: '0',
      status: 'active'
    })
    setShowModal(true)
  }

  // 打开编辑弹窗
  const handleEdit = (item: typeof mockBasicData['country'][0]) => {
    setModalMode('edit')
    setSelectedItem(item)
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description,
      sortOrder: item.sortOrder.toString(),
      status: item.status
    })
    setShowModal(true)
  }

  // 删除数据
  const handleDelete = (item: typeof mockBasicData['country'][0]) => {
    if (confirm(`确定要删除 ${item.name} 吗？`)) {
      console.log('删除数据:', item.id)
    }
  }

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (modalMode === 'create') {
      console.log('创建数据:', selectedCategory, formData)
    } else {
      console.log('更新数据:', selectedItem?.id, formData)
    }
    setShowModal(false)
  }

  // 切换分类
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1)
    setSearchKeyword('')
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">基础数据</h1>
          <p className="text-gray-500 mt-1">管理系统基础配置数据</p>
        </div>
        <button className="btn btn-md btn-secondary">
          <RefreshCw className="w-4 h-4" />
          刷新缓存
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧分类列表 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Folder className="w-4 h-4 text-blue-600" />
                数据分类
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {dataCategories.map((category) => {
                const IconComponent = category.icon
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryChange(category.id)}
                    className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className={`w-4 h-4 ${selectedCategory === category.id ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-medium">{category.label}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      selectedCategory === category.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {category.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 右侧数据列表 */}
        <div className="lg:col-span-3 space-y-4">
          {/* 搜索和操作栏 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {currentCategoryInfo && (
                  <div className="flex items-center gap-2">
                    <currentCategoryInfo.icon className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">{currentCategoryInfo.label}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索编码或名称..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  className="btn btn-md btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  新增
                </button>
              </div>
            </div>
          </div>

          {/* 数据表格 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">编码</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">排序</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-blue-600">{item.code}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm">{item.description}</td>
                      <td className="px-4 py-3 text-center text-gray-900">{item.sortOrder}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[item.status].color}`}>
                          {statusMap[item.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
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
                共 {filteredData.length} 条记录
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
        </div>
      </div>

      {/* 数据编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '新增数据' : '编辑数据'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">编码 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
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
          </div>
        </div>
      )}
    </div>
  )
}
