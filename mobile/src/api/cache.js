import AsyncStorage from "@react-native-async-storage/async-storage"

const CACHE_PREFIX = "chefos:api:"

function keyFor(key) {
  return `${CACHE_PREFIX}${key}`
}

export async function readCachedValue(key, { maxAgeMs = Infinity } = {}) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(key))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const cachedAt = Number(parsed?.cachedAt || 0)
    if (!parsed || !("data" in parsed) || !cachedAt) return null
    if (Date.now() - cachedAt > maxAgeMs) return null
    return parsed.data
  } catch {
    return null
  }
}

export async function writeCachedValue(key, data) {
  try {
    await AsyncStorage.setItem(
      keyFor(key),
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      })
    )
  } catch {}
}

export async function removeCachedValue(key) {
  try {
    await AsyncStorage.removeItem(keyFor(key))
  } catch {}
}
