/**
 * 表单基础控件
 *
 * 原来 OrderCreate.tsx 和 OrderEdit.tsx 各自内联了一份，样式一模一样，
 * 只有 SelectInput 的 disabled 支持不一致（OrderEdit 有、OrderCreate 没有）。
 * 这里合并成一份，参数取两边的超集。
 */

// ==================== 表单标签 ====================

interface LabelProps {
  children: React.ReactNode
  /** 必填时在文字后面加红色星号 */
  required?: boolean
}

export function Label({ children, required }: LabelProps) {
  return (
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

// ==================== 文本输入 ====================

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}

export function TextInput({ value, onChange, placeholder, type = 'text', disabled }: TextInputProps) {
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

// ==================== 下拉选择 ====================

interface SelectInputProps {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}

export function SelectInput({ value, onChange, options, placeholder, disabled }: SelectInputProps) {
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
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ==================== 多行文本 ====================

interface TextAreaProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: TextAreaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900
        placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
        transition-all duration-200 resize-none"
    />
  )
}

// ==================== 分组标题 ====================

interface SectionTitleProps {
  icon: React.ElementType
  children: React.ReactNode
}

export function SectionTitle({ icon: Icon, children }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
      <Icon className="w-4 h-4 text-blue-500" />
      <h3 className="text-sm font-semibold text-slate-800">{children}</h3>
    </div>
  )
}
