-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "quoted_on" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "answers_json" TEXT NOT NULL DEFAULT '{}',
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "reasons_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApplicationAsset" (
    "application_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "list_price_cents" INTEGER NOT NULL,

    PRIMARY KEY ("application_id", "asset_id"),
    CONSTRAINT "ApplicationAsset_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationAsset_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "signed_on" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "price_list_version" INTEGER NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL,
    "financed_cents" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "factor_micro" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "monthly_net_cents" INTEGER NOT NULL,
    "buyout_percent" INTEGER NOT NULL,
    "buyout_net_cents" INTEGER NOT NULL,
    "lock_reason" TEXT NOT NULL,
    "signed_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ended_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contract_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractAsset" (
    "contract_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "list_price_cents" INTEGER NOT NULL,
    "life_number" INTEGER NOT NULL,

    PRIMARY KEY ("contract_id", "asset_id"),
    CONSTRAINT "ContractAsset_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAsset_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contract_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period_start" TEXT,
    "period_end" TEXT,
    "due_date" TEXT NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "paid_on" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Application_customer_id_idx" ON "Application"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_application_id_key" ON "Contract"("application_id");

-- CreateIndex
CREATE INDEX "Contract_customer_id_idx" ON "Contract"("customer_id");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "ContractAsset_asset_id_idx" ON "ContractAsset"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_due_date_idx" ON "Invoice"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_contract_id_seq_key" ON "Invoice"("contract_id", "seq");
