-- ============================================================================
-- 117_master_data_name_de_prod_rows.sql
-- P9：给运营自己加的基础数据行补德语名
--
-- 背景：迁移 116 只回填了 103 种子文件里那 74 行。生产库里运营后来又加了
--       一批（EMC 各条线、武汉/海防/布达佩斯港、危险品与电池类特殊要求等），
--       116 按 code 匹配，匹配不上就留空。留空不会出错（接口会回退到
--       name_en），但德语界面下这些下拉项会显示英文，看着不整齐。
--
-- 这条迁移把这 16 行补齐。同样是幂等的：只填 name_de 还为空的行。
--
-- ⚠️ 其中 EMC-内电 / EMC-内电保 两条是公司内部叫法，德语按字面译成
--    Elektro / Elektro (Zolllager)，**请德语同事在术语表校对时一并确认**。
--    其余都是地名、危险品、电池这类无歧义术语。
-- ============================================================================

BEGIN;

-- 船司（EMC 各条服务线 + 两个口岸名）
UPDATE md_shipping_lines SET name_de = v.name_de
FROM (VALUES
  ('EMC_DG',           'EMC-Gefahrgut'),
  ('EMC_NEIDIAN',      'EMC-Elektro'),
  ('EMC_NEIDIAN_BAO',  'EMC-Elektro (Zolllager)'),
  ('EMC_UN3480',       'EMC-UN3480-Batterien'),
  ('EMC_UN3481',       'EMC-UN3481-Batterien'),
  ('GUOSI',            'Horgos'),
  ('SHANKOU',          'Yamaguchi')
) AS v(code, name_de)
WHERE md_shipping_lines.code = v.code AND md_shipping_lines.name_de IS NULL;

-- 箱型
UPDATE md_container_types SET name_de = v.name_de
FROM (VALUES
  ('40HQ-DG', '40-Fuß-High-Cube (Gefahrgut)')
) AS v(code, name_de)
WHERE md_container_types.code = v.code AND md_container_types.name_de IS NULL;

-- 国家
UPDATE md_countries SET name_de = v.name_de
FROM (VALUES
  ('VN', 'Vietnam')
) AS v(code, name_de)
WHERE md_countries.code = v.code AND md_countries.name_de IS NULL;

-- 港口
UPDATE md_ports SET name_de = v.name_de
FROM (VALUES
  ('CNWUH', 'Wuhan'),
  ('HUBUD', 'Budapest'),
  ('VNHPH', 'Haiphong')
) AS v(code, name_de)
WHERE md_ports.code = v.code AND md_ports.name_de IS NULL;

-- 特殊要求
UPDATE md_special_requirements SET name_de = v.name_de
FROM (VALUES
  ('DG',      'Gefahrgut'),
  ('UN3480',  'UN3480-Batterien'),
  ('UN3481',  'UN3481-Batterien')
) AS v(code, name_de)
WHERE md_special_requirements.code = v.code AND md_special_requirements.name_de IS NULL;

COMMIT;

-- ============================================================================
-- 回滚：只是把这 16 行的 name_de 清回 NULL，接口会自动回退英文名
-- ============================================================================
-- UPDATE md_shipping_lines       SET name_de = NULL WHERE code IN ('EMC_DG','EMC_NEIDIAN','EMC_NEIDIAN_BAO','EMC_UN3480','EMC_UN3481','GUOSI','SHANKOU');
-- UPDATE md_container_types      SET name_de = NULL WHERE code = '40HQ-DG';
-- UPDATE md_countries            SET name_de = NULL WHERE code = 'VN';
-- UPDATE md_ports                SET name_de = NULL WHERE code IN ('CNWUH','HUBUD','VNHPH');
-- UPDATE md_special_requirements SET name_de = NULL WHERE code IN ('DG','UN3480','UN3481');
