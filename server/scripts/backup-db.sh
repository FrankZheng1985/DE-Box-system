#!/bin/bash
#
# 数据库备份脚本
#
# 背景：2026-08-01 排查 P0 时发现生产服务器上一份数据库备份都没有，
#      也没有任何备份定时任务。阿里云 RDS 自己的自动备份是一层，
#      这里再加一层可以直接下载、直接 psql 恢复的逻辑备份。
#
# 用法：
#   bash server/scripts/backup-db.sh                    # 备份到默认目录
#   bash server/scripts/backup-db.sh /path/to/dir       # 备份到指定目录
#
# 依赖：postgresql-client（pg_dump）
#   Debian/Ubuntu: apt-get install -y postgresql-client
#
# 恢复：
#   gunzip -c germany_box_transport_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
#
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/germany-box-db}"
KEEP_DAYS=30

# 从 server/.env 读 DATABASE_URL
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "错误：找不到 DATABASE_URL（既不在环境变量里，也不在 $ENV_FILE 里）" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "错误：pg_dump 未安装，请先执行 apt-get install -y postgresql-client" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/germany_box_transport_${TIMESTAMP}.sql.gz"

echo "开始备份 → $OUTFILE"
# --no-owner --no-acl：恢复到别的实例时不会因为角色不存在而失败
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > "$OUTFILE"

SIZE="$(du -h "$OUTFILE" | cut -f1)"
echo "备份完成：$OUTFILE（$SIZE）"

# 清理超过保留期的旧备份
DELETED="$(find "$BACKUP_DIR" -name 'germany_box_transport_*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)"
if [ "$DELETED" -gt 0 ]; then
  echo "已清理 $DELETED 个超过 $KEEP_DAYS 天的旧备份"
fi

echo "当前备份列表："
ls -lh "$BACKUP_DIR" | tail -n +2
