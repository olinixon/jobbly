import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

async function testAuth() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('1. Testing DB connection...')
    const result = await pool.query('SELECT COUNT(*) FROM "User"')
    console.log('Users in DB:', result.rows[0].count)

    console.log('2. Looking for oli@omnisideai.com...')
    const user = await pool.query('SELECT id, email, "passwordHash", role, "isActive" FROM "User" WHERE email = $1', ['oli@omnisideai.com'])

    if (user.rows.length === 0) {
      console.log('ERROR: User not found in database')
      return
    }

    const u = user.rows[0]
    console.log('User found:', { id: u.id, email: u.email, role: u.role, isActive: u.isActive })
    console.log('Password hash exists:', !!u.passwordHash)
    console.log('Hash value:', u.passwordHash)

    console.log('3. Testing password changeme123...')
    const valid = await bcrypt.compare('changeme123', u.passwordHash)
    console.log('Password valid:', valid)

    if (!valid) {
      console.log('4. Generating correct hash for changeme123...')
      const newHash = await bcrypt.hash('changeme123', 12)
      console.log('Run this SQL to fix it:')
      console.log(`UPDATE "User" SET "passwordHash" = '${newHash}' WHERE email = 'oli@omnisideai.com';`)
    }

  } catch (err) {
    console.error('ERROR:', err)
  } finally {
    await pool.end()
  }
}

testAuth()
