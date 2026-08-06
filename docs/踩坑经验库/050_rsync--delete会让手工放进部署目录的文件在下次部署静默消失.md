# 050 rsync --delete 会让手工放进部署目录的文件在下次部署静默消失

## 问题现象

给官网补 Impressum / Datenschutz / AGB 三页时，按 CLAUDE.md 里官网的老办法准备手工 scp
到服务器的 `admin/dist/`。**幸好先看了一眼 CI 脚本**，否则会埋下一个很难发现的雷：

```yaml
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
  admin/dist/ \
  ${REMOTE}:${REMOTE_DIR}/admin/dist/
```

`--delete` 的语义是「让目标目录和源目录完全一致」——**源目录里没有的文件，目标目录里会被删掉**。
`admin/dist/` 的源是前端构建产物，法务页不在其中，所以：

- 手工 scp 上去，当天一切正常
- 下一次任何人推代码触发部署，三个法务页被 rsync 删掉，Impressum 变成 404
- **不会有任何报错**，部署照样绿，官网首页照常打开，只有页脚那几个链接点开是 404
- 在德国，缺少 Impressum 是可被竞争对手发警告函（Abmahnung）追究的

官网首页其实早就踩过这个坑，所以 CI 里才有一个「第十一步：恢复官网主页」，
从 `homepage/index.html` 复制回 `admin/dist/homepage.html`。这一步的存在本身就是线索。

## 根本原因

部署目录 `admin/dist/` 有两类内容，来源完全不同：

| 内容 | 来源 | rsync --delete 之后 |
|------|------|--------------------|
| `index.html`、`assets/*` | 前端构建产物 | 每次覆盖，正常 |
| `homepage.html`、法务页 | 不是构建产物，另外放进去的 | **被删掉** |

把「非构建产物」放进「用 --delete 同步的目录」，就等于把它托付给了一个每次都会清场的地方。

## 正确做法

不要手工往 `admin/dist/` 里放东西，而是让它成为部署流程的一部分：

```yaml
- name: Restore Homepage & Legal Pages
  run: |
    # 法务页在仓库里维护，先同步到服务器的 homepage/ 目录
    # 刻意不加 --delete：服务器上的 index.html 和历次备份要留着
    rsync -avz -e "ssh ${SSH_OPTS}" homepage/ ${REMOTE}:/var/www/germany-box-system/homepage/

    ssh ${SSH_OPTS} ${REMOTE} << 'RESTORE'
      set -e
      cd /var/www/germany-box-system
      cp homepage/index.html admin/dist/homepage.html
      cp homepage/impressum.html homepage/datenschutz.html homepage/agb.html \
         homepage/legal.css homepage/legal.js admin/dist/
      ls -1 admin/dist/impressum.html   # 落地证据，缺文件时这一步会失败
    RESTORE
```

两个细节：
- **`homepage/` 那次 rsync 不能加 `--delete`**，否则会删掉服务器上的 `index.html` 和历次备份
- **heredoc 的结束标记必须顶格**。写在 YAML 的 `run: |` 块里时，YAML 会剥掉公共缩进，
  所以结束标记要和块内其他行同一缩进级别；缩进错了 shell 读不到结尾，整段直接语法错误。
  改完用 `python3 -c "import yaml; yaml.safe_load(open(...))"` 解析一遍再推

## 防护规则

1. **往服务器部署目录放文件前，先看 CI 是怎么同步这个目录的**。
   看到 `--delete` 就意味着：不在源目录里的东西活不过下一次部署。
2. **凡是要长期存在的文件，都要有一个"每次部署都会把它放回去"的步骤**，
   而不是依赖"我上次放过了"。
3. **这类丢失是静默的**：部署绿、首页正常、只有特定 URL 404。
   所以在恢复步骤末尾加一条 `ls` 断言（文件不在就让部署失败），比事后靠人发现可靠得多。
4. 同族提醒：`git checkout .`、`rm -rf dist`、`docker build` 覆盖挂载目录，
   都是同一个模式 —— **"让目标与源一致"的操作，会清掉源里没有的东西**。

## 涉及文件

- `.github/workflows/deploy.yml`（第八步的 `--delete`、第十一步的恢复）
- `homepage/`（法务页在仓库里的维护位置）
