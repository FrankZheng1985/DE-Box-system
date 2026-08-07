/**
 * 阿里云 OSS 文件上传服务
 */

import OSS from 'ali-oss'
import dotenv from 'dotenv'
dotenv.config()

let client = null

function getClient() {
  if (!client) {
    const { OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_REGION } = process.env
    if (!OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) {
      console.warn('[OSS] 未配置 OSS，文件将保存到本地磁盘')
      return null
    }
    client = new OSS({
      region: OSS_REGION || 'oss-cn-hongkong',
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
      bucket: OSS_BUCKET,
    })
  }
  return client
}

/**
 * 上传文件到 OSS
 * @param {Buffer} buffer - 文件内容
 * @param {string} filename - 文件名（含路径前缀，如 cmr/CMR-xxx.pdf）
 * @returns {Promise<{url: string, ossPath: string}>}
 */
export async function uploadToOSS(buffer, filename) {
  const ossClient = getClient()
  if (!ossClient) {
    return null // OSS 未配置，返回 null 让调用方回退到本地存储
  }

  try {
    const result = await ossClient.put(filename, buffer)
    return {
      url: result.url,
      ossPath: filename
    }
  } catch (error) {
    console.error('[OSS] 上传失败:', error.message)
    throw error
  }
}

/**
 * 删除 OSS 文件
 */
export async function deleteFromOSS(filename) {
  const ossClient = getClient()
  if (!ossClient) return
  try {
    await ossClient.delete(filename)
  } catch (error) {
    console.error('[OSS] 删除失败:', error.message)
  }
}

/**
 * 生成签名 URL（用于私有 Bucket 的临时访问）
 */
export async function getSignedUrl(filename, expireSeconds = 3600) {
  const ossClient = getClient()
  if (!ossClient) return null
  try {
    return ossClient.signatureUrl(filename, { expires: expireSeconds })
  } catch (error) {
    console.error('[OSS] 生成签名URL失败:', error.message)
    return null
  }
}

/**
 * 读取 OSS 对象的可读流（后端代理下载用）
 *
 * @param {string} ossPath - OSS 对象路径，如 orders/EU-20260806-0002/123-a.jpg
 * @returns {Promise<{stream: import('stream').Readable, headers: object}|null>}
 *          OSS 未配置时返回 null（调用方回退到本地文件）
 */
export async function getOSSStream(ossPath) {
  const ossClient = getClient()
  if (!ossClient) return null
  const result = await ossClient.getStream(ossPath)
  return { stream: result.stream, headers: result.res?.headers || {} }
}

/**
 * 从已存的 file_url 反推 OSS 对象路径
 *
 * cmr_documents 表压根没有 oss_path 列，order_files 的早期记录也可能是空的，
 * 所以下载时要能从
 *   http://box-cargo-files.oss-cn-hongkong.aliyuncs.com/cmr/EU-xxx/CMR-1.pdf
 * 里把 cmr/EU-xxx/CMR-1.pdf 抠出来。
 *
 * @param {string} fileUrl
 * @returns {string|null} 不是 OSS 地址（本地回退的 /uploads/...）时返回 null
 */
export function ossPathFromUrl(fileUrl) {
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) return null
  try {
    const parsed = new URL(fileUrl)
    if (!/\.aliyuncs\.com$/i.test(parsed.hostname)) return null
    // pathname 是 URL 编码过的，OSS 的 key 要用解码后的原文
    return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

export default { uploadToOSS, deleteFromOSS, getSignedUrl, getOSSStream, ossPathFromUrl }
