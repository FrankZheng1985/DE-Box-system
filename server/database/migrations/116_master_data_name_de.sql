-- ============================================================================
-- 116_master_data_name_de.sql
-- P9 三语国际化：基础数据加德语名称
--
-- 背景：admin / 客户门户 / 承运商门户三端前端已经全部三语化，但国家、币种、
--       箱型、船司、港口、车型、特殊要求这些**下拉框的文案是后端给的**——
--       `/system/master-data/:type/options` 用 name_zh 拼 label：
--
--         value = row.name_en
--         label = `${row.name_en} (${row.name_zh})`   ← 中文写死在后端
--
--       所以切到英文/德文界面，这些下拉框仍然显示中文。
--       这是前端翻完之后，界面上唯一剩下的中文来源。
--
-- 做法：7 张 md_* 表统一加 name_de 列并回填种子数据的德语名，
--       接口按 Accept-Language 选用哪一列拼 label。
--
-- 为什么用数据库列而不是前端语言包：基础数据是运营在「基础数据维护」页
-- 自己维护的，随时可以加新国家/新港口。放前端语言包的话，运营新加的行
-- 永远没有译名。加列之后，新增行时顺手把德语名填了就行（表单已同步加字段）。
--
-- name_de 可以为空：留空时接口自动回退到 name_en，再回退到 name_zh，
-- 不会因为漏填就显示空白。
--
-- ⚠️ 执行前请先备份 RDS
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 加列（幂等，重复执行安全）
-- ---------------------------------------------------------------------------
ALTER TABLE md_shipping_lines       ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_container_types      ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_currencies           ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_countries            ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_ports                ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_vehicle_types        ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);
ALTER TABLE md_special_requirements ADD COLUMN IF NOT EXISTS name_de VARCHAR(100);

COMMENT ON COLUMN md_countries.name_de IS '德语名称，留空时接口回退 name_en → name_zh';

-- ---------------------------------------------------------------------------
-- 2. 回填种子数据的德语名
--    只更新 name_de 还是空的行，不覆盖运营已经填过的内容
-- ---------------------------------------------------------------------------

-- 2.1 船司（公司名是专有名词，德语沿用原名，只有中远/长荣这类中文名要给德语写法）
UPDATE md_shipping_lines SET name_de = v.name_de
FROM (VALUES
  ('MSC',         'MSC'),
  ('MAERSK',      'Maersk'),
  ('CMA_CGM',     'CMA CGM'),
  ('HAPAG_LLOYD', 'Hapag-Lloyd'),
  ('COSCO',       'COSCO'),
  ('EVERGREEN',   'Evergreen'),
  ('ONE',         'ONE')
) AS v(code, name_de)
WHERE md_shipping_lines.code = v.code AND md_shipping_lines.name_de IS NULL;

-- 2.2 箱型
UPDATE md_container_types SET name_de = v.name_de
FROM (VALUES
  ('20GP', '20-Fuß-Standardcontainer'),
  ('40GP', '40-Fuß-Standardcontainer'),
  ('40HQ', '40-Fuß-High-Cube'),
  ('45HQ', '45-Fuß-High-Cube')
) AS v(code, name_de)
WHERE md_container_types.code = v.code AND md_container_types.name_de IS NULL;

-- 2.3 币种
UPDATE md_currencies SET name_de = v.name_de
FROM (VALUES
  ('EUR', 'Euro'),
  ('GBP', 'Britisches Pfund'),
  ('PLN', 'Polnischer Zloty'),
  ('USD', 'US-Dollar'),
  ('CNY', 'Chinesischer Yuan'),
  ('CZK', 'Tschechische Krone'),
  ('HUF', 'Ungarischer Forint'),
  ('SEK', 'Schwedische Krone'),
  ('CHF', 'Schweizer Franken')
) AS v(code, name_de)
WHERE md_currencies.code = v.code AND md_currencies.name_de IS NULL;

-- 2.4 国家
UPDATE md_countries SET name_de = v.name_de
FROM (VALUES
  ('DE', 'Deutschland'),
  ('FR', 'Frankreich'),
  ('PL', 'Polen'),
  ('IT', 'Italien'),
  ('ES', 'Spanien'),
  ('NL', 'Niederlande'),
  ('BE', 'Belgien'),
  ('CZ', 'Tschechien'),
  ('AT', 'Österreich'),
  ('HU', 'Ungarn'),
  ('SK', 'Slowakei'),
  ('RO', 'Rumänien'),
  ('BG', 'Bulgarien'),
  ('HR', 'Kroatien'),
  ('SI', 'Slowenien'),
  ('DK', 'Dänemark'),
  ('SE', 'Schweden'),
  ('PT', 'Portugal'),
  ('GB', 'Vereinigtes Königreich'),
  ('CH', 'Schweiz'),
  ('TR', 'Türkei'),
  ('CN', 'China')
) AS v(code, name_de)
WHERE md_countries.code = v.code AND md_countries.name_de IS NULL;

-- 2.5 港口（德国港口用德语原名，其余用德语惯用写法）
UPDATE md_ports SET name_de = v.name_de
FROM (VALUES
  ('DEHAM', 'Hamburg'),
  ('DEBRV', 'Bremerhaven'),
  ('NLRTM', 'Rotterdam'),
  ('BEANR', 'Antwerpen'),
  ('PLGDY', 'Danzig'),
  ('PLGDN', 'Gdingen'),
  ('ITGOA', 'Genua'),
  ('FRLEH', 'Le Havre'),
  ('ESVLC', 'Valencia'),
  ('ESALG', 'Algeciras'),
  ('GBFXT', 'Felixstowe'),
  ('GBLGP', 'London Gateway'),
  ('CNSHA', 'Shanghai'),
  ('CNNGB', 'Ningbo'),
  ('CNQIN', 'Qingdao'),
  ('CNTXG', 'Tianjin'),
  ('CNYTN', 'Yantian'),
  ('CNXMN', 'Xiamen')
) AS v(code, name_de)
WHERE md_ports.code = v.code AND md_ports.name_de IS NULL;

-- 2.6 车型
UPDATE md_vehicle_types SET name_de = v.name_de
FROM (VALUES
  ('CURTAIN_SIDE',      'Planenauflieger'),
  ('CONTAINER_CHASSIS', 'Containerchassis'),
  ('FLATBED',           'Plattformauflieger'),
  ('REFRIGERATED',      'Kühlfahrzeug'),
  ('BOX_TRUCK',         'Kofferaufbau'),
  ('TANKER',            'Tankfahrzeug'),
  ('LOWBED',            'Tieflader')
) AS v(code, name_de)
WHERE md_vehicle_types.code = v.code AND md_vehicle_types.name_de IS NULL;

-- 2.7 特殊要求
UPDATE md_special_requirements SET name_de = v.name_de
FROM (VALUES
  ('NONE',         'Keine'),
  ('TEMP_CONTROL', 'Temperaturgeführt'),
  ('ADR',          'Gefahrgut ADR'),
  ('OVERSIZE',     'Übermaß / Übergewicht'),
  ('TAIL_LIFT',    'Ladebordwand erforderlich'),
  ('TOP_LOADING',  'Dachbeladung erforderlich'),
  ('FUMIGATION',   'Begasung erforderlich')
) AS v(code, name_de)
WHERE md_special_requirements.code = v.code AND md_special_requirements.name_de IS NULL;

COMMIT;

-- ============================================================================
-- 回滚（如需）
-- ============================================================================
-- BEGIN;
-- ALTER TABLE md_shipping_lines       DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_container_types      DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_currencies           DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_countries            DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_ports                DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_vehicle_types        DROP COLUMN IF EXISTS name_de;
-- ALTER TABLE md_special_requirements DROP COLUMN IF EXISTS name_de;
-- COMMIT;
