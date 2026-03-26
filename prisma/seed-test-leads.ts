import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
const filePath = dbUrl.replace('file:', '')
const dbPath = path.isAbsolute(filePath)
  ? filePath
  : path.join(process.cwd(), filePath)

const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { name: 'Continuous Group Guttering' },
  })
  if (!campaign) throw new Error('Campaign not found — run seed.ts first')

  const leads = [
    {
      quoteNumber: 'QU00102',
      customerName: 'Oli Nixon',
      customerPhone: '+642102854355',
      customerEmail: 'oli@omnisideai.com',
      propertyAddress: '22 Chatham Avenue, Mount Albert Auckland 1025',
      notes: 'Oli was contacted about gutter cleaning services but did not indicate interest or a timeline for booking. He confirmed his email address as oli@omnisideai.com.',
      source: 'past customer',
    },
    {
      quoteNumber: 'QU00103',
      customerName: 'Omar Shahab',
      customerPhone: '+64212427550',
      customerEmail: 'omar@switchlighting.co.nz',
      propertyAddress: '97 Landscape Road, Mount Eden Auckland 1024',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00104',
      customerName: 'Beda Baumann',
      customerPhone: '+642102979759',
      customerEmail: 'bedabaumann@gmail.com',
      propertyAddress: '55 Trig Road, Whitford 2571',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00105',
      customerName: 'Michelle Heywood',
      customerPhone: '+6421624139',
      customerEmail: 'bremco@ihug.co.nz',
      propertyAddress: '50 Rodeo Drive, Redvale 0794',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00106',
      customerName: 'Banu Elmore',
      customerPhone: '+64210758701',
      customerEmail: 'banuelmore@hotmail.com',
      propertyAddress: '2284A Hunua Road, Hunua 2583',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00107',
      customerName: 'Garry Meyer',
      customerPhone: '+64274774868',
      customerEmail: 'gazdimeyer@outlook.com',
      propertyAddress: '1 Blunt Road, Te Kauwhata 3710',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00108',
      customerName: 'Mark Ballantyne',
      customerPhone: '+64277519193',
      customerEmail: 'ballantyne.family@xtra.co.nz',
      propertyAddress: '7B Beresford Street, Pukekohe, Auckland 2120',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00109',
      customerName: 'Bruce Begg',
      customerPhone: '+64272920786',
      customerEmail: 'beggsnz@xtra.co.nz',
      propertyAddress: '52 Edendale Road, Somerville, Auckland 2014',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00110',
      customerName: 'Paul Clark',
      customerPhone: '+64210756683',
      customerEmail: 'clark.6@xtra.co.nz',
      propertyAddress: '164 Browns Road, Manurewa, Auckland 2102',
      source: 'csv_import',
    },
    {
      quoteNumber: 'QU00111',
      customerName: 'Keith Griffin',
      customerPhone: '+64212464646',
      customerEmail: 'grifandco@gmail.com',
      propertyAddress: '17 Arkles Strand, Auckland 0932',
      source: 'csv_import',
    },
  ]

  for (const lead of leads) {
    const existing = await prisma.lead.findUnique({ where: { quoteNumber: lead.quoteNumber } })
    if (existing) {
      console.log(`⏭️  ${lead.quoteNumber} already exists`)
      continue
    }

    await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        quoteNumber: lead.quoteNumber,
        customerName: lead.customerName,
        customerPhone: lead.customerPhone,
        customerEmail: lead.customerEmail,
        propertyAddress: lead.propertyAddress,
        googleMapsUrl: mapsUrl(lead.propertyAddress),
        notes: lead.notes ?? null,
        source: lead.source,
        status: 'LEAD_RECEIVED',
      },
    })
    console.log(`✅ ${lead.quoteNumber} — ${lead.customerName}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
