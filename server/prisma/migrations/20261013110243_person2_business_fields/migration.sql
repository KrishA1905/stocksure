-- AlterTable
ALTER TABLE `issues` ADD COLUMN `purpose` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `items` ADD COLUMN `unavailableQuantity` INTEGER NOT NULL DEFAULT 0;
