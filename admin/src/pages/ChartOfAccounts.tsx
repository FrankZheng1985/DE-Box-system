import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ArrowLeft, Search } from 'lucide-react'

// ==================== 科目数据 ====================

interface Account {
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'
  parentCode: string | null
  isReconciliation: boolean
  isPostable: boolean
}

const ACCOUNTS: Account[] = [
  // 资产类
  { code: '1000', name: '银行存款', type: 'ASSET', parentCode: null, isReconciliation: false, isPostable: true },
  { code: '1100', name: '银行存款-EUR', type: 'ASSET', parentCode: '1000', isReconciliation: false, isPostable: true },
  { code: '1110', name: '银行存款-GBP', type: 'ASSET', parentCode: '1000', isReconciliation: false, isPostable: true },
  { code: '1120', name: '银行存款-PLN', type: 'ASSET', parentCode: '1000', isReconciliation: false, isPostable: true },
  { code: '1200', name: '应收账款', type: 'ASSET', parentCode: null, isReconciliation: true, isPostable: false },
  { code: '1210', name: '应收账款-客户', type: 'ASSET', parentCode: '1200', isReconciliation: true, isPostable: false },
  { code: '1300', name: '预付款项', type: 'ASSET', parentCode: null, isReconciliation: false, isPostable: true },
  { code: '1400', name: 'GR/IR 暂估清算', type: 'ASSET', parentCode: null, isReconciliation: false, isPostable: true },
  // 负债类
  { code: '2000', name: '应付账款', type: 'LIABILITY', parentCode: null, isReconciliation: true, isPostable: false },
  { code: '2100', name: '应付账款-承运商', type: 'LIABILITY', parentCode: '2000', isReconciliation: true, isPostable: false },
  { code: '2200', name: '应付税款', type: 'LIABILITY', parentCode: null, isReconciliation: false, isPostable: true },
  { code: '2210', name: '应付增值税', type: 'LIABILITY', parentCode: '2200', isReconciliation: false, isPostable: true },
  { code: '2300', name: '预收款项', type: 'LIABILITY', parentCode: null, isReconciliation: false, isPostable: true },
  // 收入类
  { code: '4000', name: '运输收入', type: 'REVENUE', parentCode: null, isReconciliation: false, isPostable: false },
  { code: '4100', name: '篷布车运输收入', type: 'REVENUE', parentCode: '4000', isReconciliation: false, isPostable: true },
  { code: '4200', name: '集装箱物流收入', type: 'REVENUE', parentCode: '4000', isReconciliation: false, isPostable: true },
  { code: '4300', name: '附加服务收入', type: 'REVENUE', parentCode: '4000', isReconciliation: false, isPostable: true },
  // 成本/费用类
  { code: '5000', name: '运输成本', type: 'EXPENSE', parentCode: null, isReconciliation: false, isPostable: false },
  { code: '5100', name: '篷布车运输成本', type: 'EXPENSE', parentCode: '5000', isReconciliation: false, isPostable: true },
  { code: '5200', name: '集装箱物流成本', type: 'EXPENSE', parentCode: '5000', isReconciliation: false, isPostable: true },
  { code: '5300', name: '燃油附加费', type: 'EXPENSE', parentCode: '5000', isReconciliation: false, isPostable: true },
  { code: '5400', name: '保险费用', type: 'EXPENSE', parentCode: '5000', isReconciliation: false, isPostable: true },
  { code: '5900', name: '价格差异', type: 'EXPENSE', parentCode: '5000', isReconciliation: false, isPostable: true },
  { code: '6000', name: '营业费用', type: 'EXPENSE', parentCode: null, isReconciliation: false, isPostable: false },
  { code: '6100', name: '管理费用', type: 'EXPENSE', parentCode: '6000', isReconciliation: false, isPostable: true },
  { code: '6200', name: '销售费用', type: 'EXPENSE', parentCode: '6000', isReconciliation: false, isPostable: true },
]

// 类型颜色映射
const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ASSET:     { bg: 'bg-blue-100', text: 'text-blue-700', label: '资产' },
  LIABILITY: { bg: 'bg-red-100', text: 'text-red-700', label: '负债' },
  REVENUE:   { bg: 'bg-green-100', text: 'text-green-700', label: '收入' },
  EXPENSE:   { bg: 'bg-orange-100', text: 'text-orange-700', label: '费用' },
}

// ==================== 组件 ====================

export default function ChartOfAccounts() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? ACCOUNTS.filter(a => a.code.includes(search) || a.name.includes(search))
    : ACCOUNTS

  return (
    <div className="p-4 lg:p-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="p-2 bg-green-50 rounded-xl">
          <BookOpen className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">会计科目表</h1>
          <p className="text-xs text-slate-500 mt-0.5">公司代码 DE01 的科目层级结构</p>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索科目代码或名称..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          />
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">科目代码</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-left">科目名称</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">科目类型</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">调节科目</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">可过账</th>
                <th className="text-xs font-medium text-slate-500 px-4 py-3 text-center">层级</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const style = TYPE_STYLES[a.type]
                const isChild = a.parentCode !== null
                return (
                  <tr
                    key={a.code}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-all duration-200"
                  >
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-900">
                      {a.code}
                    </td>
                    <td className={`px-4 py-3 text-sm text-slate-700 ${isChild ? 'pl-10' : ''}`}>
                      {isChild && <span className="text-slate-300 mr-1">└</span>}
                      {a.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.isReconciliation ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="调节科目" />
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.isPostable ? (
                        <span className="text-xs text-green-600 font-medium">是</span>
                      ) : (
                        <span className="text-xs text-slate-400">否</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-500">{isChild ? '子科目' : '汇总科目'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-6">
          <span className="text-xs text-slate-500">共 {filtered.length} 个科目</span>
          <div className="flex items-center gap-4">
            {Object.entries(TYPE_STYLES).map(([key, style]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`w-2 h-2 rounded-full ${style.bg.replace('100', '500')}`} />
                {style.label} {ACCOUNTS.filter(a => a.type === key).length}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
