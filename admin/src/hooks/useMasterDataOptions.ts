import { useState, useEffect } from 'react'
import api, { type ApiResponse } from '../utils/api'
import type { MasterDataOption } from '../types'

/**
 * 获取基础数据下拉选项
 * 调用 /system/master-data/:type/options API
 * 返回仅活跃项，按 sort_order 排序
 */
export function useMasterDataOptions(type: string) {
  const [options, setOptions] = useState<MasterDataOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchOptions = async () => {
      try {
        const res = await api.get<ApiResponse<MasterDataOption[]>>(
          `/system/master-data/${type}/options`
        )
        if (!cancelled && res.code === 200 && res.data) {
          setOptions(res.data)
        }
      } catch (err) {
        console.error(`[MasterData] 加载 ${type} 选项失败:`, err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOptions()
    return () => { cancelled = true }
  }, [type])

  return { options, loading }
}
