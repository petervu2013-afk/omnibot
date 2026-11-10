-- Step 8: shifts carry shopId (tenant guard); conversations keep where they came from (ADS-08).
ALTER TABLE "WorkShift" ADD COLUMN "shopId" TEXT;
UPDATE "WorkShift" w SET "shopId" = m."shopId" FROM "ShopMember" m WHERE m.id = w."memberId";
DELETE FROM "WorkShift" WHERE "shopId" IS NULL;
ALTER TABLE "WorkShift" ALTER COLUMN "shopId" SET NOT NULL;
CREATE INDEX "WorkShift_shopId_memberId_idx" ON "WorkShift"("shopId", "memberId");

ALTER TABLE "Conversation" ADD COLUMN "ref" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "src" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "adId" TEXT;
