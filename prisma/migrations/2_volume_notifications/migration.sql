CREATE TABLE "VolumeNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "novelId" INTEGER NOT NULL,
    "volume" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "VolumeNotification_userId_novelId_volume_key" ON "VolumeNotification"("userId", "novelId", "volume");
