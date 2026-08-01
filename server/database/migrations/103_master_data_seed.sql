-- ============================================================================
-- 103_master_data_seed.sql
-- 基础数据种子数据
-- 注意: 所有值与现有前端硬编码完全一致，确保数据兼容
-- ============================================================================

-- 1. 船司种子数据
INSERT INTO md_shipping_lines (code, name_zh, name_en, sort_order) VALUES
  ('MSC', 'MSC 地中海航运', 'MSC', 1),
  ('MAERSK', '马士基', 'Maersk', 2),
  ('CMA_CGM', '达飞轮船', 'CMA CGM', 3),
  ('HAPAG_LLOYD', '赫伯罗特', 'Hapag-Lloyd', 4),
  ('COSCO', '中远海运', 'COSCO', 5),
  ('EVERGREEN', '长荣海运', 'Evergreen', 6),
  ('ONE', '海洋网联', 'ONE', 7)
ON CONFLICT (code) DO NOTHING;

-- 2. 箱型种子数据
INSERT INTO md_container_types (code, name_zh, name_en, length_ft, sort_order) VALUES
  ('20GP', '20尺普柜', '20'' General Purpose', 20, 1),
  ('40GP', '40尺普柜', '40'' General Purpose', 40, 2),
  ('40HQ', '40尺高柜', '40'' High Cube', 40, 3),
  ('45HQ', '45尺高柜', '45'' High Cube', 45, 4)
ON CONFLICT (code) DO NOTHING;

-- 3. 币种种子数据
INSERT INTO md_currencies (code, name_zh, name_en, symbol, sort_order) VALUES
  ('EUR', '欧元', 'Euro', '€', 1),
  ('GBP', '英镑', 'British Pound', '£', 2),
  ('PLN', '兹罗提', 'Polish Zloty', 'zł', 3),
  ('USD', '美元', 'US Dollar', '$', 4),
  ('CNY', '人民币', 'Chinese Yuan', '¥', 5),
  ('CZK', '捷克克朗', 'Czech Koruna', 'Kč', 6),
  ('HUF', '匈牙利福林', 'Hungarian Forint', 'Ft', 7),
  ('SEK', '瑞典克朗', 'Swedish Krona', 'kr', 8),
  ('CHF', '瑞士法郎', 'Swiss Franc', 'CHF', 9)
ON CONFLICT (code) DO NOTHING;

-- 4. 国家种子数据 (name_en 与前端硬编码 EUROPEAN_COUNTRIES 值一致)
INSERT INTO md_countries (code, name_zh, name_en, region, sort_order) VALUES
  ('DE', '德国', 'Germany', 'Western Europe', 1),
  ('FR', '法国', 'France', 'Western Europe', 2),
  ('PL', '波兰', 'Poland', 'Eastern Europe', 3),
  ('IT', '意大利', 'Italy', 'Southern Europe', 4),
  ('ES', '西班牙', 'Spain', 'Southern Europe', 5),
  ('NL', '荷兰', 'Netherlands', 'Western Europe', 6),
  ('BE', '比利时', 'Belgium', 'Western Europe', 7),
  ('CZ', '捷克', 'Czech Republic', 'Eastern Europe', 8),
  ('AT', '奥地利', 'Austria', 'Western Europe', 9),
  ('HU', '匈牙利', 'Hungary', 'Eastern Europe', 10),
  ('SK', '斯洛伐克', 'Slovakia', 'Eastern Europe', 11),
  ('RO', '罗马尼亚', 'Romania', 'Eastern Europe', 12),
  ('BG', '保加利亚', 'Bulgaria', 'Eastern Europe', 13),
  ('HR', '克罗地亚', 'Croatia', 'Southern Europe', 14),
  ('SI', '斯洛文尼亚', 'Slovenia', 'Southern Europe', 15),
  ('DK', '丹麦', 'Denmark', 'Northern Europe', 16),
  ('SE', '瑞典', 'Sweden', 'Northern Europe', 17),
  ('PT', '葡萄牙', 'Portugal', 'Southern Europe', 18),
  ('GB', '英国', 'United Kingdom', 'Western Europe', 19),
  ('CH', '瑞士', 'Switzerland', 'Western Europe', 20),
  ('TR', '土耳其', 'Turkey', 'Southeastern Europe', 21),
  ('CN', '中国', 'China', 'East Asia', 22)
ON CONFLICT (code) DO NOTHING;

-- 5. 港口种子数据
INSERT INTO md_ports (code, name_zh, name_en, country_code, port_type, sort_order) VALUES
  ('DEHAM', '汉堡港', 'Hamburg', 'DE', 'SEA', 1),
  ('DEBRV', '不来梅港', 'Bremerhaven', 'DE', 'SEA', 2),
  ('NLRTM', '鹿特丹港', 'Rotterdam', 'NL', 'SEA', 3),
  ('BEANR', '安特卫普港', 'Antwerp', 'BE', 'SEA', 4),
  ('PLGDY', '格但斯克港', 'Gdansk', 'PL', 'SEA', 5),
  ('PLGDN', '格丁尼亚港', 'Gdynia', 'PL', 'SEA', 6),
  ('ITGOA', '热那亚港', 'Genoa', 'IT', 'SEA', 7),
  ('FRLEH', '勒阿弗尔港', 'Le Havre', 'FR', 'SEA', 8),
  ('ESVLC', '巴伦西亚港', 'Valencia', 'ES', 'SEA', 9),
  ('ESALG', '阿尔赫西拉斯港', 'Algeciras', 'ES', 'SEA', 10),
  ('GBFXT', '费利克斯托港', 'Felixstowe', 'GB', 'SEA', 11),
  ('GBLGP', '伦敦门户港', 'London Gateway', 'GB', 'SEA', 12),
  ('CNSHA', '上海港', 'Shanghai', 'CN', 'SEA', 13),
  ('CNNGB', '宁波港', 'Ningbo', 'CN', 'SEA', 14),
  ('CNQIN', '青岛港', 'Qingdao', 'CN', 'SEA', 15),
  ('CNTXG', '天津港', 'Tianjin', 'CN', 'SEA', 16),
  ('CNYTN', '盐田港', 'Yantian', 'CN', 'SEA', 17),
  ('CNXMN', '厦门港', 'Xiamen', 'CN', 'SEA', 18)
ON CONFLICT (code) DO NOTHING;

-- 6. 车型种子数据
INSERT INTO md_vehicle_types (code, name_zh, name_en, sort_order) VALUES
  ('CURTAIN_SIDE', '篷布车', 'Curtain Side', 1),
  ('CONTAINER_CHASSIS', '集装箱底盘车', 'Container Chassis', 2),
  ('FLATBED', '平板车', 'Flatbed', 3),
  ('REFRIGERATED', '冷藏车', 'Refrigerated', 4),
  ('BOX_TRUCK', '厢式货车', 'Box Truck', 5),
  ('TANKER', '罐车', 'Tanker', 6),
  ('LOWBED', '低板车', 'Low Bed', 7)
ON CONFLICT (code) DO NOTHING;

-- 7. 特殊要求种子数据 (name_zh 与前端硬编码 SPECIAL_REQUIREMENTS 值一致)
INSERT INTO md_special_requirements (code, name_zh, name_en, sort_order) VALUES
  ('NONE', '无', 'None', 1),
  ('TEMP_CONTROL', '温控运输', 'Temperature Controlled', 2),
  ('ADR', '危险品 ADR', 'ADR Dangerous Goods', 3),
  ('OVERSIZE', '超宽超重', 'Oversize/Overweight', 4),
  ('TAIL_LIFT', '需要尾板', 'Tail Lift Required', 5),
  ('TOP_LOADING', '需要顶部装卸', 'Top Loading Required', 6),
  ('FUMIGATION', '需要熏蒸', 'Fumigation Required', 7)
ON CONFLICT (code) DO NOTHING;
