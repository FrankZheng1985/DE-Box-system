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
  User,
  Shield,
  Mail,
  Phone,
  Key,
  UserCheck,
  UserX,
  Clock
} from 'lucide-react'

// 模拟用户数据
const mockUsers = [
  { id: '1', username: 'admin', name: '系统管理员', email: 'admin@box-logistics.de', phone: '+49 30 1234567', role: 'admin', status: 'active', lastLogin: '2024-01-15 10:30', loginCount: 156 },
  { id: '2', username: 'zhangsan', name: '张三', email: 'zhangsan@box-logistics.de', phone: '+49 30 2345678', role: 'manager', status: 'active', lastLogin: '2024-01-15 09:15', loginCount: 89 },
  { id: '3', username: 'lisi', name: '李四', email: 'lisi@box-logistics.de', phone: '+49 30 3456789', role: 'operator', status: 'active', lastLogin: '2024-01-14 16:45', loginCount: 234 },
  { id: '4', username: 'wangwu', name: '王五', email: 'wangwu@box-logistics.de', phone: '+49 30 4567890', role: 'operator', status: 'active', lastLogin: '2024-01-14 11:20', loginCount: 167 },
  { id: '5', username: 'zhaoliu', name: '赵六', email: 'zhaoliu@box-logistics.de', phone: '+49 30 5678901', role: 'finance', status: 'inactive', lastLogin: '2024-01-10 08:30', loginCount: 45 },
  { id: '6', username: 'sunqi', name: '孙七', email: 'sunqi@box-logistics.de', phone: '+49 30 6789012', role: 'sales', status: 'active', lastLogin: '2024-01-15 08:00', loginCount: 78 },
]

const roleMap: Record<string, { label: string; color: string }> = {
  admin: { label: '系统管理员', color: 'bg-red-100 text-red-700' },
  manager: { label: '部门经理', color: 'bg-purple-100 text-purple-700' },
  operator: { label: '操作员', color: 'bg-blue-100 text-blue-700' },
  finance: { label: '财务人员', color: 'bg-green-100 text-green-700' },
  sales: { label: '销售人员', color: 'bg-orange-100 text-orange-700' },
}

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-700' },
  inactive: { label: '停用', color: 'bg-red-100 text-red-700' },
}

interface UserFormData {
  username: string
  name: string
  email: string
  phone: string
  role: string
  status: string
  password: string
}

export default function UserManagement() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [selectedUser, setSelectedUser] = useState<typeof mockUsers[0] | null>(null)
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    name: '',
    email: '',
    phone: '',
    role: 'operator',
    status: 'active',
    password: ''
  })
  
  const pageSize = 10
  
  // 筛选用户
  const filteredUsers = mockUsers.filter(user => {
    const matchSearch = user.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       user.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                       user.email.toLowerCase().includes(searchKeyword.toLowerCase())
    const matchRole = roleFilter === 'all' || user.role === roleFilter
    const matchStatus = statusFilter === 'all' || user.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })
  
  const totalPages = Math.ceil(filteredUsers.length / pageSize)
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // 统计数据
  const stats = [
    { label: '总用户数', value: mockUsers.length, icon: User, color: 'bg-blue-500' },
    { label: '活跃用户', value: mockUsers.filter(u => u.status === 'active').length, icon: UserCheck, color: 'bg-green-500' },
    { label: '停用用户', value: mockUsers.filter(u => u.status === 'inactive').length, icon: UserX, color: 'bg-red-500' },
    { label: '管理员', value: mockUsers.filter(u => u.role === 'admin').length, icon: Shield, color: 'bg-purple-500' },
  ]

  // 打开创建用户弹窗
  const handleCreate = () => {
    setModalMode('create')
    setFormData({
      username: '',
      name: '',
      email: '',
      phone: '',
      role: 'operator',
      status: 'active',
      password: ''
    })
    setShowModal(true)
  }

  // 打开编辑用户弹窗
  const handleEdit = (user: typeof mockUsers[0]) => {
    setModalMode('edit')
    setSelectedUser(user)
    setFormData({
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      password: ''
    })
    setShowModal(true)
  }

  // 打开查看用户弹窗
  const handleView = (user: typeof mockUsers[0]) => {
    setModalMode('view')
    setSelectedUser(user)
    setShowModal(true)
  }

  // 重置密码
  const handleResetPassword = (user: typeof mockUsers[0]) => {
    if (confirm(`确定要重置用户 ${user.name} 的密码吗？`)) {
      console.log('重置密码:', user.id)
    }
  }

  // 删除用户
  const handleDelete = (user: typeof mockUsers[0]) => {
    if (confirm(`确定要删除用户 ${user.name} 吗？`)) {
      console.log('删除用户:', user.id)
    }
  }

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (modalMode === 'create') {
      console.log('创建用户:', formData)
    } else {
      console.log('更新用户:', selectedUser?.id, formData)
    }
    setShowModal(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="text-gray-500 mt-1">管理系统用户和权限</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-md btn-primary"
        >
          <Plus className="w-4 h-4" />
          新建用户
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
              placeholder="搜索用户名、姓名、邮箱..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部角色</option>
              <option value="admin">系统管理员</option>
              <option value="manager">部门经理</option>
              <option value="operator">操作员</option>
              <option value="finance">财务人员</option>
              <option value="sales">销售人员</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="inactive">停用</option>
          </select>
          
          <button className="btn btn-md btn-secondary">
            <Download className="w-4 h-4" />
            导出
          </button>
        </div>
      </div>

      {/* 用户表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户信息</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系方式</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后登录</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">登录次数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium">{user.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleMap[user.role].color}`}>
                      {roleMap[user.role].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="w-3 h-3" />
                        {user.phone}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Clock className="w-3 h-3" />
                      {user.lastLogin}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-900">
                    {user.loginCount}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[user.status].color}`}>
                      {statusMap[user.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleView(user)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(user)}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                        title="重置密码"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
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
            共 {filteredUsers.length} 条记录
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

      {/* 用户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? '新建用户' : modalMode === 'edit' ? '编辑用户' : '用户详情'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            {modalMode === 'view' && selectedUser ? (
              <div className="p-6 space-y-6">
                {/* 用户头像和基本信息 */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-2xl font-bold text-blue-600">{selectedUser.name.charAt(0)}</span>
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold text-gray-900">{selectedUser.name}</h4>
                    <p className="text-gray-500">@{selectedUser.username}</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${roleMap[selectedUser.role].color}`}>
                      {roleMap[selectedUser.role].label}
                    </span>
                  </div>
                </div>

                {/* 详细信息 */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm text-gray-500">邮箱</label>
                    <p className="font-medium text-gray-900">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">电话</label>
                    <p className="font-medium text-gray-900">{selectedUser.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">最后登录</label>
                    <p className="font-medium text-gray-900">{selectedUser.lastLogin}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">登录次数</label>
                    <p className="font-medium text-gray-900">{selectedUser.loginCount} 次</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">状态</label>
                    <p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[selectedUser.status].color}`}>
                        {statusMap[selectedUser.status].label}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">用户名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      required
                      disabled={modalMode === 'edit'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="admin">系统管理员</option>
                      <option value="manager">部门经理</option>
                      <option value="operator">操作员</option>
                      <option value="finance">财务人员</option>
                      <option value="sales">销售人员</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="active">正常</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                </div>
                {modalMode === 'create' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">初始密码 <span className="text-red-500">*</span></label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      required={modalMode === 'create'}
                    />
                  </div>
                )}
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
    </div>
  )
}
