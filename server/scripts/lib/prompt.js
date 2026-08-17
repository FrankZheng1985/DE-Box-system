/**
 * 命令行脚本的交互输入工具
 *
 * 原来 reset-user-password.js 和 create-client-portal-user.js 各抄了一份
 * `askHidden`，里面还带着 readline 重绘那段微妙逻辑（踩坑 030）。
 * 这次要给它加「会话断开」和「超时」两道退出，抽出来免得写两遍、下次再抄第三遍。
 */

import readline from 'readline'

/**
 * 等输入的上限。超过就自己退出，不无限等下去。
 *
 * 5 分钟：够一个人从看到提示到翻出密码管理器粘贴过来，
 * 又不至于在无人值守时挂太久。
 */
const INPUT_TIMEOUT_MS = 5 * 60 * 1000

/**
 * 隐藏回显地读一行输入
 *
 * ⚠️ 这个函数**必须能自己结束**（踩坑 068）：
 *    生产上通过 SSH 跑这类脚本时，操作者中途断开连接是常事。
 *    readline 不会因为 SSH 断了就结束——它继续等 stdin，而进程被 systemd
 *    收养成 PPID=1 的孤儿，不在 pm2 列表、没有任何面板显示，
 *    只是一直占着内存和一条数据库连接。2026-08-03 就这么挂了一个进程 15 天。
 *
 *    所以除了正常应答，还要处理两种收场：
 *      1. stdin 关闭（SSH 断开 / 管道结束）→ 立刻抛错
 *      2. 等太久 → 超时抛错
 *    抛出的错由调用方的 main().catch() 接住，那里会关连接池并 exit(1)。
 *
 * @param {string} prompt 提示语
 * @param {number} [timeoutMs] 等待上限，默认 5 分钟
 * @returns {Promise<string>}
 */
export function askHidden(prompt, timeoutMs = INPUT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    })

    /** 已经拿到答案了吗——用来区分「正常关闭」和「被动断开」 */
    let answered = false
    let timer = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      rl.removeAllListeners('close')
      rl.close()
    }

    // 提示行必须交给 readline 自己输出：question() 会重绘当前行，
    // 若先手写提示、再无条件屏蔽全部输出，重绘会把提示一起擦掉——
    // 终端上看不到任何字，只剩一个光标（实际仍在等输入，踩坑 030）。
    // 正确顺序：先放行提示输出，question() 调用之后再静音，只挡击键回显。
    let muted = false
    rl._writeToOutput = (str) => {
      if (!muted) rl.output.write(str)
    }

    // stdin 被关掉（SSH 断开、管道结束、Ctrl-D）时 readline 会触发 close。
    // 正常应答也会触发，所以靠 answered 区分——没答就关，说明是被动断开
    rl.on('close', () => {
      if (answered) return
      cleanup()
      reject(new Error('输入已中断（连接断开或输入结束），未做任何改动'))
    })

    timer = setTimeout(() => {
      if (answered) return
      cleanup()
      process.stdout.write('\n')
      reject(new Error(`等待输入超过 ${Math.round(timeoutMs / 1000)} 秒，已自动退出，未做任何改动`))
    }, timeoutMs)

    rl.question(prompt, (answer) => {
      answered = true
      cleanup()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

export default { askHidden }
