-- ID-01: customer identity resolution.
-- nameKey: accent- and case-insensitive name ("Nguyễn Văn An" = "nguyen van an"), maintained by the database so every
-- writer (staff API, chat channels, imports) gets it. Used only to suggest possible duplicates for staff to review.
CREATE FUNCTION customer_name_key(name text) RETURNS text AS $$
  SELECT NULLIF(btrim(regexp_replace(translate(name, 'àÀáÁạẠảẢãÃâÂầẦấẤậẬẩẨẫẪăĂằẰắẮặẶẳẲẵẴèÈéÉẹẸẻẺẽẼêÊềỀếẾệỆểỂễỄìÌíÍịỊỉỈĩĨòÒóÓọỌỏỎõÕôÔồỒốỐộỘổỔỗỖơƠờỜớỚợỢởỞỡỠùÙúÚụỤủỦũŨưƯừỪứỨựỰửỬữỮỳỲýÝỵỴỷỶỹỸđĐABCDEFGHIJKLMNOPQRSTUVWXYZ', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiioooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyyddabcdefghijklmnopqrstuvwxyz'), '[[:space:]]+', ' ', 'g')), '')
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE "Customer" ADD COLUMN "nameKey" TEXT;

CREATE FUNCTION customer_set_name_key() RETURNS trigger AS $$
BEGIN
  NEW."nameKey" := customer_name_key(NEW."name");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_name_key BEFORE INSERT OR UPDATE OF "name" ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION customer_set_name_key();

UPDATE "Customer" SET "nameKey" = customer_name_key("name");

CREATE INDEX "Customer_shopId_nameKey_idx" ON "Customer"("shopId", "nameKey");

-- Merge log keeps what was moved, so a merge can be undone exactly.
ALTER TABLE "CustomerMergeLog" ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "undoneAt" TIMESTAMP(3),
  ADD COLUMN "undoneById" TEXT;
CREATE INDEX "CustomerMergeLog_shopId_intoId_idx" ON "CustomerMergeLog"("shopId", "intoId");
CREATE INDEX "CustomerMergeLog_shopId_fromId_idx" ON "CustomerMergeLog"("shopId", "fromId");

-- Pairs staff marked "not the same person": no longer suggested. aId < bId.
CREATE TABLE "CustomerMergeDismissal" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerMergeDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerMergeDismissal_shopId_aId_bId_key" ON "CustomerMergeDismissal"("shopId", "aId", "bId");
