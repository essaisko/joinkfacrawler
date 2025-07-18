// cache-service.js - 메모리 캐싱 서비스
class CacheService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = new Map(); // Time To Live
  }

  set(key, value, ttlMinutes = 10) {
    this.cache.set(key, value);
    this.cacheTTL.set(key, Date.now() + (ttlMinutes * 60 * 1000));
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    
    // TTL 체크
    const expiryTime = this.cacheTTL.get(key);
    if (Date.now() > expiryTime) {
      this.cache.delete(key);
      this.cacheTTL.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  invalidate(pattern) {
    // 패턴에 맞는 캐시 무효화
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.cacheTTL.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.cacheTTL.clear();
  }

  size() {
    return this.cache.size;
  }
}

module.exports = new CacheService();