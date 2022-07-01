import { IoRedisStorage } from "node-ts-cache-storage-ioredis"
import IoRedis from "ioredis";
import { CacheContainer } from "node-ts-cache";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL not set");

declare global {
    var __ioredis__: IoRedis;
}

if (!global.__ioredis__) {
    global.__ioredis__ = new IoRedis(process.env.REDIS_URL!);
}

const getCache = () => new CacheContainer(new IoRedisStorage(global.__ioredis__));

export default getCache
