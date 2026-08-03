# 030 屏蔽 readline 回显，会把提示行一起擦掉

## 问题现象

`server/scripts/reset-user-password.js` 用隐藏回显的方式读密码。运行后终端上是这样：

```
目标账号: suling（Suling / OPERATOR / 启用中）
改完之后，该账号所有已登录的会话在 token 过期后都要重新登录。

（光标停在这里，一片空白，什么提示都没有）
```

看起来像卡死了。实际上**脚本正在等输入**，只是 `请输入新密码（不会显示）: ` 这行提示看不见。
用户以为没跑起来，按 Ctrl+C 中止；换 `ssh -t` 分配终端后现象一模一样。

## 根本原因

屏蔽回显的常见写法是把 `rl._writeToOutput` 换成空函数。但 readline 重绘一行时做的是**三步**：

```js
// Node 内部 _refreshLine() 的实质
cursorTo(this.output, 0)        // ① 光标回到行首——直接写 output
this._writeToOutput(line)       // ② 写入内容——走 _writeToOutput
clearScreenDown(this.output)    // ③ 清到屏幕尾——直接写 output
```

**① 和 ③ 是直接写 `output` 的，不经过 `_writeToOutput`。**
所以把 `_writeToOutput` 整个屏蔽掉之后：光标退回行首 → 内容不写 → 清屏，
把先前用 `process.stdout.write(prompt)` 手写的提示**连带擦掉**。

字节确实写出去过，但屏幕上没有——这也是为什么"检查输出里有没有提示字符串"的测试查不出问题。

## 错误代码

```js
// ❌ 先手写提示，再无条件屏蔽全部输出 —— 提示会被 clearScreenDown 擦掉
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stdout, terminal: true
    })
    process.stdout.write(prompt)
    rl._writeToOutput = () => {}          // 连提示的重绘一起挡了
    rl.question('', (answer) => { rl.close(); resolve(answer) })
  })
}
```

## 正确代码

```js
// ✅ 提示交给 readline 自己输出，question() 调用之后再静音
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stdout, terminal: true
    })
    let muted = false
    rl._writeToOutput = (str) => { if (!muted) rl.output.write(str) }
    rl.question(prompt, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true                          // 提示已输出，之后只挡击键回显
  })
}
```

关键是**顺序**：`muted` 在 `rl.question()` 之后才置 true，让提示这一次重绘正常输出，
后续每次击键的重绘才被挡住。

## 怎么测才测得准

只断言"输出里包含提示字符串"是**测不出来**的——字节写过了，断言会通过，
但用户屏幕上是空的。必须还原终端最终渲染结果：跑一个极简 ANSI 行模拟器，
处理 `\x1b[nG`（光标定位）、`\x1b[0J`（清到屏幕尾）、`\x1b[0K`（清到行尾）、
`\r`、`\n`，再看最终可见内容里有没有提示。

用内存流 + `terminal: true` 即可，不需要真实 TTY。本次验证结果：

| | 屏幕可见内容 | 提示可见 | 输入未泄露 |
|---|---|---|---|
| 旧实现 | `""` | ❌ | ✅ |
| 新实现 | `"请输入新密码（不会显示）: "` | ✅ | ✅ |

## 防护规则

1. **改 `_writeToOutput` 时要分清哪些输出走它、哪些直接写 `output`。**
   光标定位（`cursorTo`）和清屏（`clearScreenDown`/`clearLine`）都是直接写的，
   屏蔽 `_writeToOutput` 挡不住它们，反而会因为"只清不写"造成内容凭空消失。
2. **凡是"屏蔽输出"类的改动，测试必须断言【渲染后的可见内容】，不是【写出去的字节】。**
   两者在有转义序列参与时会得出相反结论。
3. **交互脚本要考虑没有 TTY 的场景。**
   `ssh host "cmd"` 默认不分配终端，隐藏输入不能正常工作，要用 `ssh -t`。
   脚本里可以加一句 `if (!process.stdin.isTTY)` 的提示，直接告诉用户加 `-t`。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `server/scripts/reset-user-password.js` | 修正 `askHidden`：提示交给 readline 输出，`question()` 后再静音 |
