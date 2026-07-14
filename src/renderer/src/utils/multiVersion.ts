import type { AppVersionEntry } from '@/types'

export interface MultiVersionIndex {
  families: Record<string, AppVersionEntry[]>
  familyByApp: Record<string, string>
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function buildMultiVersionIndex(rawMaps: unknown): MultiVersionIndex {
  const families: Record<string, AppVersionEntry[]> = {}
  const familyByApp: Record<string, string> = {}

  if (!rawMaps || typeof rawMaps !== 'object') {
    return { families, familyByApp }
  }

  for (const [familyKey, entries] of Object.entries(rawMaps as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue

    const versions = entries.filter((entry): entry is AppVersionEntry =>
      !!entry
      && typeof entry === 'object'
      && typeof (entry as AppVersionEntry).name === 'string'
      && typeof (entry as AppVersionEntry).version === 'string'
      && typeof (entry as AppVersionEntry).bucket === 'string'
    )

    families[familyKey] = versions
    familyByApp[normalizeName(familyKey)] = familyKey

    for (const version of versions) {
      familyByApp[normalizeName(version.name)] = familyKey
    }
  }

  return { families, familyByApp }
}

export function getMultiVersionFamily(appName: string, index: MultiVersionIndex): string | null {
  return index.familyByApp[normalizeName(appName)] ?? null
}

export function isMultiVersionApp(appName: string, index: MultiVersionIndex): boolean {
  return getMultiVersionFamily(appName, index) !== null
}
