import { prisma } from '../lib/prisma'

const defaults = [
  { name: 'Standard Gutter Clean', durationMinutes: 120, sortOrder: 1 },
  { name: 'Mid-Range Clean', durationMinutes: 240, sortOrder: 2 },
  { name: 'Full Service Clean', durationMinutes: 360, sortOrder: 3 },
]

async function main() {
  const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } })
  console.log('Campaigns found:', campaigns.length)
  for (const c of campaigns) {
    const existing = await prisma.jobType.count({ where: { campaignId: c.id } })
    if (existing === 0) {
      await prisma.jobType.createMany({ data: defaults.map(d => ({ ...d, campaignId: c.id })) })
      console.log('Seeded job types for:', c.name)
    } else {
      console.log('Already has', existing, 'job types:', c.name)
    }
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
