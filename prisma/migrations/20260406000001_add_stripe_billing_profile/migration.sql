-- AlterTable
ALTER TABLE "ReconciliationBatch" ADD COLUMN     "invoice_sent_at" TIMESTAMP(3),
ADD COLUMN     "invoice_sent_by" TEXT,
ADD COLUMN     "stripe_invoice_id" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "invoice_reminder_day" INTEGER;

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "billing_email" TEXT NOT NULL,
    "billing_address" TEXT,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_secret_key" TEXT NOT NULL,
    "stripe_gst_rate_id" TEXT NOT NULL,
    "stripe_verified" BOOLEAN NOT NULL DEFAULT false,
    "stripe_verified_at" TIMESTAMP(3),
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_campaign_id_role_key" ON "BillingProfile"("campaign_id", "role");

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
