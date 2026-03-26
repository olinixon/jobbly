import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'

const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
const filePath = dbUrl.replace('file:', '')
const dbPath = path.isAbsolute(filePath)
  ? filePath
  : path.join(process.cwd(), filePath)
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Create admin user (idempotent)
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'oli@omnisideai.com' },
  })

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: 'Oli',
        email: 'oli@omnisideai.com',
        passwordHash: await bcrypt.hash('changeme123', 12),
        role: 'ADMIN',
        campaignId: null,
        isActive: true,
      },
    })
    console.log('✅ Admin user created')
  } else {
    console.log('⏭️  Admin user already exists')
  }

  // Create first campaign (idempotent)
  const existingCampaign = await prisma.campaign.findFirst({
    where: { name: 'Continuous Group Guttering' },
  })

  if (!existingCampaign) {
    await prisma.campaign.create({
      data: {
        name: 'Continuous Group Guttering',
        industry: 'Guttering',
        clientCompanyName: 'Continuous Group',
        subcontractorCompanyName: 'Pro Water Blasting',
        markupPercentage: 25.0,
        commissionPercentage: 40.0,
        clientMarginPercentage: 60.0,
        status: 'ACTIVE',
        startDate: new Date('2025-01-01'),
      },
    })
    console.log('✅ Campaign created')
  } else {
    console.log('⏭️  Campaign already exists')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
