-- 136 的回滚脚本
--
-- ⚠️ 跑这个会**永久删掉**所有询价单上已经填写的预计到仓日期，不可恢复。
--    只有在确认 136 引入的功能要整体撤下、且新填的数据不再需要时才跑。
--    如果只是想临时停用这个字段，改前端不显示即可，不要删列。
--
-- 跑之前先备份：
--   ssh eu-tms "cd /var/www/germany-box-system/server && export \$(grep '^DATABASE_URL' .env | xargs) \
--     && pg_dump \"\$DATABASE_URL\" | gzip > /var/backups/germany-box-db/before_rollback_136_\$(date +%Y%m%d_%H%M%S).sql.gz"

ALTER TABLE inquiries DROP COLUMN IF EXISTS expected_arrival_date;

-- 柜号列是迁移 129 建的，本次只改过注释，回滚时把注释恢复成原来的口径。
-- 列本身不要动（删掉会连本地派送的柜号一起没了）。
COMMENT ON COLUMN inquiries.container_no IS
  '柜号，仅本地派送（LOCAL_DELIVERY）使用：一张询价单 = 一个柜';
