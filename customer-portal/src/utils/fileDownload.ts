/**
 * 业务文件的下载 / 预览
 *
 * ⚠️ 不要再用列表里的 file_url 直接做 <a href>：
 *   1. 那是阿里云 OSS 的 http:// 直链，门户跑在 https 上，
 *      浏览器会按"不安全下载"直接拦掉，点了什么都不会发生；
 *   2. <a download> 这个属性对跨域地址无效，就算换成 https 也只是在新标签页打开；
 *   3. 直链不带鉴权，等于把客户的单据交给全网。
 *
 * 统一走后端代理接口：同源、https、带 JWT、文件名和 Content-Disposition 由后端给。
 */

import i18n from '../i18n'
import { getAuthHeaders } from './api'

const API_PREFIX = '/api/v1'

/**
 * 拉取文件内容
 *
 * @param endpoint - 不含 /api/v1 前缀，如 /orders/files/xxx/download
 * @param inline - true 走在线预览（后端回 Content-Disposition: inline）
 */
async function fetchFileBlob(endpoint: string, inline = false): Promise<Blob> {
  const url = `${API_PREFIX}${endpoint}${inline ? '?inline=1' : ''}`
  const res = await fetch(url, {
    headers: { ...getAuthHeaders(), 'Accept-Language': i18n.language || 'zh' },
  })

  if (!res.ok) {
    // 后端错误统一是 JSON，能读出 message 就用它，读不出来就用通用文案
    let message = i18n.t('common.downloadFailed')
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      // 响应体不是 JSON（例如网关层报错），保持通用文案
    }
    throw new Error(message)
  }

  return res.blob()
}

/**
 * 下载并另存为
 *
 * @param endpoint - 后端下载接口路径
 * @param fileName - 保存时的文件名
 */
export async function downloadFile(endpoint: string, fileName: string): Promise<void> {
  const blob = await fetchFileBlob(endpoint)
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()

  // 立刻 revoke 在 Safari 上会让下载拿不到内容，延一拍再释放
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

/**
 * 在新标签页里预览
 *
 * ⚠️ 必须在用户点击的同步阶段先把空白窗口开出来。
 *    等 fetch 回来再 window.open，浏览器会当成非用户触发的弹窗直接拦掉。
 */
export async function openFileInNewTab(endpoint: string): Promise<void> {
  const win = window.open('', '_blank')

  try {
    const blob = await fetchFileBlob(endpoint, true)
    const objectUrl = URL.createObjectURL(blob)
    if (win) {
      win.location.href = objectUrl
    } else {
      // 窗口还是被拦了，退而求其次在当前页开
      window.open(objectUrl, '_blank')
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (err) {
    win?.close()
    throw err
  }
}

/**
 * 按文件来源拼下载接口路径
 *
 * 订单文件弹窗里的列表是 order_files + cmr_documents 的统一视图，
 * 两者是不同的表、不同的接口，靠 source 区分。
 */
export function fileDownloadEndpoint(source: 'ORDER_FILE' | 'CMR_DOC', id: string): string {
  return source === 'CMR_DOC' ? `/cmr/${id}/download` : `/orders/files/${id}/download`
}
