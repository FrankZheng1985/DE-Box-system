-- ============================================================================
-- 102_master_data_tables.sql
-- 基础数据管理表 (7 张)
-- 所有表使用 md_ 前缀 (master data)，避免与业务表命名冲突
-- ============================================================================

-- 1. 船司 (Shipping Lines)
CREATE TABLE IF NOT EXISTS md_shipping_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  country VARCHAR(100),
  website VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 箱型 (Container Types)
CREATE TABLE IF NOT EXISTS md_container_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  length_ft NUMERIC(5,1),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 币种 (Currencies)
CREATE TABLE IF NOT EXISTS md_currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(3) NOT NULL UNIQUE,
  name_zh VARCHAR(50) NOT NULL,
  name_en VARCHAR(50),
  symbol VARCHAR(5),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. 国家 (Countries)
CREATE TABLE IF NOT EXISTS md_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  region VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. 港口/城市 (Ports)
CREATE TABLE IF NOT EXISTS md_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  country_code VARCHAR(10) REFERENCES md_countries(code),
  port_type VARCHAR(20) DEFAULT 'SEA',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 车型 (Vehicle Types)
CREATE TABLE IF NOT EXISTS md_vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  max_weight_kg NUMERIC(10,2),
  max_volume_m3 NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. 特殊要求 (Special Requirements)
CREATE TABLE IF NOT EXISTS md_special_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_md_shipping_lines_active ON md_shipping_lines(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_container_types_active ON md_container_types(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_currencies_active ON md_currencies(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_countries_active ON md_countries(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_ports_active ON md_ports(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_ports_country ON md_ports(country_code);
CREATE INDEX IF NOT EXISTS idx_md_vehicle_types_active ON md_vehicle_types(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_md_special_reqs_active ON md_special_requirements(is_active, sort_order);
