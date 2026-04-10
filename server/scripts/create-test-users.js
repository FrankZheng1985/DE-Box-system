/**
 * 创建测试用户脚本
 * 运行方式: node scripts/create-test-users.js
 */

import pg from 'pg'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
dotenv.config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. 创建测试客户
    const clientResult = await client.query(`
      INSERT INTO clients (client_code, company_name, vat_number, country, city, address,
        contact_name, contact_email, contact_phone, invoice_email,
        credit_limit, credit_level, risk_category, payment_terms, status, company_code)
      VALUES ('C-00002', 'Siemens AG', 'DE811205527', 'Germany', 'Munich',
        'Werner-von-Siemens-Str. 1', 'Maria Schmidt', 'maria@siemens.de', '+49-89-636-0',
        'invoices@siemens.de', 200000, 'A', 'LOW', 45, 'ACTIVE', 'DE01')
      ON CONFLICT (client_code) DO NOTHING
      RETURNING id
    `)
    let clientId = clientResult.rows[0]?.id
    if (!clientId) {
      const existing = await client.query("SELECT id FROM clients WHERE client_code = 'C-00002'")
      clientId = existing.rows[0]?.id
    }
    console.log('客户 Siemens AG:', clientId ? 'OK' : '失败')

    // 2. 创建测试承运商
    const carrierResult = await client.query(`
      INSERT INTO carriers (carrier_code, company_name, vat_number, country,
        transport_license, license_expiry, insurance_number, insurance_expiry,
        service_countries, vehicle_types, contact_name, contact_email, contact_phone,
        performance_score, status, company_code)
      VALUES ('S-00001', 'SpeedTrans GmbH', 'DE987654321', 'Germany',
        'TL-2026-001', '2028-12-31', 'INS-2026-001', '2027-06-30',
        '["DE","PL","CZ","AT","FR"]', '["Curtain Side","Flatbed"]',
        'Klaus Weber', 'klaus@speedtrans.de', '+49-30-123456',
        8.5, 'ACTIVE', 'DE01')
      ON CONFLICT (carrier_code) DO NOTHING
      RETURNING id
    `)
    let carrierId = carrierResult.rows[0]?.id
    if (!carrierId) {
      const existing = await client.query("SELECT id FROM carriers WHERE carrier_code = 'S-00001'")
      carrierId = existing.rows[0]?.id
    }
    console.log('承运商 SpeedTrans:', carrierId ? 'OK' : '失败')

    // 3. 获取角色 ID
    const clientRole = await client.query("SELECT id FROM roles WHERE role_code = 'client_admin'")
    const carrierRole = await client.query("SELECT id FROM roles WHERE role_code = 'carrier_admin'")

    // 4. 创建客户用户
    const clientPwHash = await bcrypt.hash('client123', 10)
    const clientUser = await client.query(`
      INSERT INTO users (username, password_hash, email, display_name, role_id,
        user_type, linked_entity_id, is_active)
      VALUES ('siemens', $1, 'maria@siemens.de', 'Maria Schmidt (Siemens)',
        $2, 'CLIENT', $3, true)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `, [clientPwHash, clientRole.rows[0].id, clientId])
    console.log('客户用户 siemens:', clientUser.rows[0]?.id ? '创建成功' : '已存在')

    // 5. 创建承运商用户
    const carrierPwHash = await bcrypt.hash('carrier123', 10)
    const carrierUser = await client.query(`
      INSERT INTO users (username, password_hash, email, display_name, role_id,
        user_type, linked_entity_id, is_active)
      VALUES ('speedtrans', $1, 'klaus@speedtrans.de', 'Klaus Weber (SpeedTrans)',
        $2, 'CARRIER', $3, true)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `, [carrierPwHash, carrierRole.rows[0].id, carrierId])
    console.log('承运商用户 speedtrans:', carrierUser.rows[0]?.id ? '创建成功' : '已存在')

    // 6. 分配组织
    for (const userId of [clientUser.rows[0]?.id, carrierUser.rows[0]?.id].filter(Boolean)) {
      await client.query(`
        INSERT INTO user_org_assignments (user_id, company_code, is_default)
        VALUES ($1, 'DE01', true)
        ON CONFLICT (user_id, company_code, business_area) DO NOTHING
      `, [userId])
    }

    await client.query('COMMIT')

    // 验证
    console.log('')
    console.log('========================================')
    console.log('  测试用户创建完成')
    console.log('========================================')
    const users = await pool.query('SELECT username, display_name, user_type FROM users ORDER BY username')
    users.rows.forEach(u => console.log(`  ${u.user_type.padEnd(10)} ${u.username.padEnd(15)} ${u.display_name}`))
    console.log('')
    console.log('登录信息:')
    console.log('  运营管理端: admin / admin123      → http://47.83.241.117/')
    console.log('  客户门户:   siemens / client123    → http://47.83.241.117/customer/')
    console.log('  承运商门户: speedtrans / carrier123 → http://47.83.241.117/carrier/')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('错误:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
