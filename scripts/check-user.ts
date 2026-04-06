import { prisma } from '../lib/prisma'

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, isActive: true, role: true, passwordHash: true },
  })
  console.log('User count:', users.length)
  for (const u of users) {
    console.log({ email: u.email, role: u.role, isActive: u.isActive, hashPrefix: u.passwordHash.slice(0, 10) })
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
