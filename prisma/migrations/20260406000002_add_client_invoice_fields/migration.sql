-- AlterTable
ALTER TABLE "ReconciliationBatch" ADD COLUMN     "client_invoice_sent_at" TIMESTAMP(3),
ADD COLUMN     "client_invoice_sent_by" TEXT,
ADD COLUMN     "client_stripe_invoice_id" TEXT;
