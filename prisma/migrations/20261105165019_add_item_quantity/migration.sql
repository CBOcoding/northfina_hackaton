-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApplicationAsset" (
    "application_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("application_id", "asset_id"),
    CONSTRAINT "ApplicationAsset_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationAsset_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApplicationAsset" ("application_id", "asset_id", "list_price_cents") SELECT "application_id", "asset_id", "list_price_cents" FROM "ApplicationAsset";
DROP TABLE "ApplicationAsset";
ALTER TABLE "new_ApplicationAsset" RENAME TO "ApplicationAsset";
CREATE TABLE "new_ContractAsset" (
    "contract_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "life_number" INTEGER NOT NULL,

    PRIMARY KEY ("contract_id", "asset_id"),
    CONSTRAINT "ContractAsset_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAsset_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContractAsset" ("asset_id", "contract_id", "life_number", "list_price_cents") SELECT "asset_id", "contract_id", "life_number", "list_price_cents" FROM "ContractAsset";
DROP TABLE "ContractAsset";
ALTER TABLE "new_ContractAsset" RENAME TO "ContractAsset";
CREATE INDEX "ContractAsset_asset_id_idx" ON "ContractAsset"("asset_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
