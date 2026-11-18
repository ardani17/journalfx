UPDATE "Project"
SET "name" = 'Horizon Journal', "updatedAt" = CURRENT_TIMESTAMP
WHERE "isDefault" AND "name" = 'Million Dollar Trading Project';
