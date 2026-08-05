import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileQuestion } from 'lucide-react'

/**
 * 404 兜底页
 *
 * 此前 App.tsx 没有 path="*"，任何未匹配的路径都渲染成一片空白，
 * 且控制台不报错，表现和"页面坏了"一模一样（QuotationManagement 里
 * 那个指向不存在路由的编辑按钮就是这么撞出来的）。
 */
export default function NotFound() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="h-full flex items-center justify-center p-4 lg:p-6">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-8 py-10 max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('notFound.title')}</h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          {t('notFound.line1')}
          <br />
          {t('notFound.line2')}
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-all duration-200 ease-in-out"
        >
          {t('notFound.backHome')}
        </button>
      </div>
    </div>
  )
}
