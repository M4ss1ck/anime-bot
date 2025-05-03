-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "Anime" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "onAir" BOOLEAN DEFAULT false,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "updatedAt" DATETIME,
    CONSTRAINT "Anime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Novel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "volume" REAL,
    "chapter" INTEGER,
    "part" INTEGER,
    "releasing" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "updatedAt" DATETIME,
    CONSTRAINT "Novel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_NotificationGroupToUser" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_NotificationGroupToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "NotificationGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_NotificationGroupToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Anime_name_userId_key" ON "Anime"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Novel_name_userId_key" ON "Novel"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationGroup_groupId_key" ON "NotificationGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "_NotificationGroupToUser_AB_unique" ON "_NotificationGroupToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_NotificationGroupToUser_B_index" ON "_NotificationGroupToUser"("B");
