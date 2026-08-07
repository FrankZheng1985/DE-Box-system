/**
 * 把存储层里的业务文件回给浏览器（后端代理下载）
 *
 * 为什么不让前端直接用库里的 file_url：
 *   1. 库里存的是阿里云 OSS 返回的 http:// 直链，而门户页面跑在 https 上，
 *      浏览器会按"不安全下载"直接拦掉，点了没反应（踩坑记见 052）；
 *   2. <a download> 这个属性对跨域地址无效，就算换成 https 也只是在新标签页打开，
 *      不会另存为；
 *   3. OSS 直链不带任何鉴权，把它交给前端等于这份文件对全网公开。
 *
 * 统一走这里之后：同源、https、带 JWT 鉴权、Content-Disposition 由后端说了算。
 */

import fs from 'fs'
import path from 'path'
import { getOSSStream, ossPathFromUrl } from './oss-service.js'

/**
 * 本地回退目录的根（OSS 不可用时上传落在这里，见 order / cmr 模块）
 *
 * 生产就是这个绝对路径；开发机没有 /var/www 写权限，可以用 UPLOAD_ROOT 改到别处。
 */
const LOCAL_UPLOAD_ROOT = process.env.UPLOAD_ROOT || '/var/www/germany-box-system/uploads'

/** 上传只放行 PDF/JPG/PNG/WebP，这里按扩展名兜一个 Content-Type */
const EXT_TO_MIME = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * 拼 Content-Disposition
 *
 * 中文文件名必须用 RFC 5987 的 filename*，同时保留一个 ASCII 的 filename 兜底，
 * 否则老浏览器会把文件名显示成乱码。
 *
 * @param {string} fileName
 * @param {boolean} inline - true 为在线预览，false 为下载
 */
function buildContentDisposition(fileName, inline) {
  const safe = String(fileName || 'file').replace(/["\\\r\n]/g, '_')
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_')
  const type = inline ? 'inline' : 'attachment'
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

/**
 * 把本地回退路径解析成真实文件路径，并挡住路径穿越
 *
 * @param {string} fileUrl - 形如 /uploads/orders/123-a.jpg
 * @returns {string|null}
 */
function resolveLocalPath(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return null
  const resolved = path.resolve(LOCAL_UPLOAD_ROOT, fileUrl.replace(/^\/uploads\//, ''))
  // 只允许留在 uploads 目录内，防止库里被塞进 ../../etc/passwd 这类值
  if (resolved !== LOCAL_UPLOAD_ROOT && !resolved.startsWith(LOCAL_UPLOAD_ROOT + path.sep)) {
    return null
  }
  return resolved
}

/**
 * 把一份存储文件写进响应
 *
 * 调用方负责鉴权和租户校验，这里只管取文件。
 *
 * @param {import('express').Response} res
 * @param {object} file
 * @param {string} file.fileUrl   - 库里存的 file_url
 * @param {string} [file.ossPath] - 库里存的 oss_path（没有就从 fileUrl 反推）
 * @param {string} file.fileName  - 回给浏览器的文件名（带不带扩展名都行）
 * @param {boolean} [file.inline] - true 在线预览，false（默认）下载
 */
export async function sendStoredFile(res, { fileUrl, ossPath, fileName, inline = false }) {
  const key = ossPath || ossPathFromUrl(fileUrl)
  const displayName = ensureExtension(fileName, key || fileUrl)
  const ext = path.extname(displayName).toLowerCase()

  // 1) 优先从 OSS 取
  if (key) {
    let oss = null
    try {
      oss = await getOSSStream(key)
    } catch (error) {
      // NoSuchKey 说明库里有记录但对象没了，其余按 500 抛给调用方
      if (error.code === 'NoSuchKey' || error.status === 404) {
        res.status(404).json({ code: 404, message: '文件在存储中不存在', data: null })
        return
      }
      throw error
    }

    if (oss) {
      res.setHeader('Content-Type', oss.headers['content-type'] || EXT_TO_MIME[ext] || 'application/octet-stream')
      if (oss.headers['content-length']) {
        res.setHeader('Content-Length', oss.headers['content-length'])
      }
      res.setHeader('Content-Disposition', buildContentDisposition(displayName, inline))
      // 业务文件不给中间层缓存，避免换了登录身份还能从缓存里翻出上一个客户的单据
      res.setHeader('Cache-Control', 'private, no-store')
      oss.stream.on('error', (err) => {
        console.error('[文件下载] OSS 流读取失败:', err.message)
        res.destroy(err)
      })
      oss.stream.pipe(res)
      return
    }
    // oss 为 null = 没配 OSS，继续往下走本地回退
  }

  // 2) 回退到本地磁盘
  const localPath = resolveLocalPath(fileUrl)
  if (!localPath || !fs.existsSync(localPath)) {
    res.status(404).json({ code: 404, message: '文件在存储中不存在', data: null })
    return
  }

  res.setHeader('Content-Type', EXT_TO_MIME[ext] || 'application/octet-stream')
  res.setHeader('Content-Disposition', buildContentDisposition(displayName, inline))
  res.setHeader('Cache-Control', 'private, no-store')
  fs.createReadStream(localPath)
    .on('error', (err) => {
      console.error('[文件下载] 本地文件读取失败:', err.message)
      res.destroy(err)
    })
    .pipe(res)
}

/**
 * 文件名没有扩展名时，从存储路径上补一个
 *
 * CMR 那边下载名用的是 cmr_number（如 CMR-2026-000001），本身不带扩展名，
 * 不补的话存下来的文件双击打不开。
 *
 * @param {string} fileName
 * @param {string} storagePath - OSS key 或 file_url，用来取扩展名
 */
function ensureExtension(fileName, storagePath) {
  const name = String(fileName || 'file')
  if (path.extname(name)) return name
  const ext = path.extname(String(storagePath || ''))
  return ext ? `${name}${ext}` : name
}

export default { sendStoredFile }
