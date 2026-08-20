-- CreateTable
CREATE TABLE "AiCircuitBreaker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCircuitBreaker_pkey" PRIMARY KEY ("id")
);
