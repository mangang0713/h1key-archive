import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedHeaders = [
  '행사명',
  '날짜 (YYYY-MM-DD)',
  '장소명',
  '장소 주소 / 홀 이름 (알면)',
  '시작 시간 (HH:mm, 알면)',
  '같은 날짜 순서 (확인된 경우)',
  '세트리스트 상태',
  '기억나는 곡 (확실한 순서대로 → 구분)',
]
const locationHeaders = {
  address: '자동 검색 주소',
  coordinates: '자동 검색 좌표 [경도, 위도]',
  status: '장소 좌표 확인 상태',
}
const statusByLabel = new Map([
  ['전체 확인', 'known'],
  ['일부 확인', 'partial'],
  ['임시', 'provisional'],
  ['미확인', 'unknown'],
  ['곡 공연 없음', 'none'],
])

function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.')
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function extractJsonArray(source, exportName) {
  const declaration = new RegExp(`export const ${exportName}[^=]*=\\s*\\[`)
  const match = declaration.exec(source)
  if (!match) throw new Error(`${exportName} 배열을 읽을 수 없습니다.`)

  const start = match.index + match[0].length - 1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') inString = true
    else if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, i + 1))
    }
  }
  throw new Error(`${exportName} 배열의 끝을 찾을 수 없습니다.`)
}

function readSongCatalog(source) {
  const songs = []
  const songPattern = /\{\s*id:\s*'((?:\\.|[^'])*)',\s*title:\s*'((?:\\.|[^'])*)'\s*\}/g
  for (const match of source.matchAll(songPattern)) {
    songs.push({
      id: match[1].replaceAll("\\'", "'").replaceAll('\\\\', '\\'),
      title: match[2].replaceAll("\\'", "'").replaceAll('\\\\', '\\'),
    })
  }
  if (songs.length === 0) throw new Error('기존 songs.ts에서 곡 목록을 읽을 수 없습니다.')
  return songs
}

function normalize(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/g, '').toLocaleLowerCase()
}

function makeSongId(title, usedIds) {
  let hash = 2166136261
  for (const char of title) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const base = `song-import-${(hash >>> 0).toString(36)}`
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`
  return candidate
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

function findLocation(row, geo, locations, line, errors) {
  const name = normalize(row[2])
  const candidateConfirmed = geo.status === '확인 완료'
  const candidateAddress = candidateConfirmed ? geo.address : ''
  const address = normalize(candidateAddress || row[3])
  let coordinates
  try {
    const parsedCoordinates = JSON.parse(geo.coordinates)
    if (Array.isArray(parsedCoordinates) && parsedCoordinates.length === 2) {
      const [longitude, latitude] = parsedCoordinates.map(Number)
      if (Number.isFinite(longitude) && Number.isFinite(latitude)
        && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90) {
        coordinates = [longitude, latitude]
      }
    }
  } catch {
    coordinates = undefined
  }
  const hasCoordinates = coordinates !== undefined

  if (name === 'ㅇ') {
    if (address || hasCoordinates) errors.push(`행 ${line}: 영상통화 표시 "ㅇ"과 실제 장소 정보를 함께 입력했습니다.`)
    return undefined
  }
  const byName = name ? locations.filter((location) => normalize(location.name) === name) : []
  const byAddress = address ? locations.filter((location) => normalize(location.address) === address) : []
  const nameIds = new Set(byName.map((location) => location.id))
  const addressIds = new Set(byAddress.map((location) => location.id))

  if (nameIds.size > 1 && addressIds.size !== 1) {
    errors.push(`행 ${line}: 장소명 "${row[2]}"이 여러 장소와 일치합니다.`)
    return undefined
  }
  if (addressIds.size > 1 && nameIds.size !== 1) {
    errors.push(`행 ${line}: 주소 "${row[3]}"가 여러 장소와 일치합니다.`)
    return undefined
  }
  if (nameIds.size === 1 && addressIds.size === 1 && [...nameIds][0] !== [...addressIds][0]) {
    errors.push(`행 ${line}: 장소명과 주소가 서로 다른 기존 장소를 가리킵니다.`)
    return undefined
  }

  const matched = byName.length === 1 ? byName[0] : byAddress[0]
  if (matched && row[3] && normalize(matched.address) !== normalize(row[3])) {
    errors.push(`행 ${line}: 장소명 "${row[2]}"과 주소가 기존 장소 정보와 일치하지 않습니다.`)
    return undefined
  }
  if (!matched && (name || address)) {
    if (!candidateConfirmed) {
      errors.push(`행 ${line}: 새 장소 "${row[2] || row[3]}"의 자동 검색 결과를 확인 완료로 바꾼 뒤 가져와 주세요.`)
      return undefined
    }
    if (!candidateAddress || !hasCoordinates) {
      errors.push(`행 ${line}: 새 장소 "${row[2] || row[3]}"는 확인된 주소와 유효한 위도·경도가 필요합니다.`)
      return undefined
    }

    const addressMatch = locations.find((location) => normalize(location.address) === address)
    if (addressMatch) {
      if (name && normalize(addressMatch.name) !== name) {
        errors.push(`행 ${line}: 장소명과 자동 검색 주소가 서로 다른 기존 장소를 가리킵니다.`)
        return undefined
      }
      return addressMatch.id
    }

    const highestVenueNumber = locations.reduce((highest, location) => {
      const match = /^venue-(\d+)$/.exec(location.id)
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0)
    const newLocation = {
      id: `venue-${String(highestVenueNumber + 1).padStart(3, '0')}`,
      name: row[2].trim(),
      address: candidateAddress.trim(),
      coordinates,
    }
    locations.push(newLocation)
    return newLocation.id
  }
  return matched?.id
}

function parseScheduleRows(rows, locations, songs, currentSchedules) {
  const errors = []
  const songByTitle = new Map(songs.map((song) => [normalize(song.title), song]))
  const usedSongIds = new Set(songs.map((song) => song.id))
  const usedScheduleIds = new Set()
  const occupiedScheduleIds = new Set(currentSchedules.map((schedule) => schedule.id))
  const currentByIdentity = new Map()
  const addedSongs = []
  for (const schedule of currentSchedules) {
    const key = `${schedule.date}|${normalize(schedule.title)}`
    const current = currentByIdentity.get(key) ?? []
    current.push(schedule)
    currentByIdentity.set(key, current)
  }

  const titleCounts = new Map()
  const imported = []
  for (const { row, geo, line } of rows) {
    const title = row[0]?.trim() ?? ''
    const date = row[1]?.trim() ?? ''
    const startTime = row[4]?.trim() ?? ''
    const orderText = row[5]?.trim() ?? ''
    const statusLabel = row[6]?.trim() ?? ''
    const songText = row[7]?.trim() ?? ''
    if (!title) {
      errors.push(`행 ${line}: 다른 값은 있는데 행사명이 비어 있습니다. 빈 행만 가져오기에서 제외됩니다.`)
      continue
    }
    if (!validateDate(date)) errors.push(`행 ${line}: 날짜 "${date}"가 YYYY-MM-DD 형식의 실제 날짜가 아닙니다.`)
    if (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      errors.push(`행 ${line}: 시작 시간 "${startTime}"은 HH:mm 형식이어야 합니다.`)
    }
    const orderInDay = orderText ? Number(orderText) : undefined
    if (orderText && (!Number.isInteger(orderInDay) || orderInDay < 1)) {
      errors.push(`행 ${line}: 같은 날짜 순서는 1 이상의 정수여야 합니다.`)
    }
    const setlistStatus = statusByLabel.get(statusLabel)
    if (!setlistStatus) errors.push(`행 ${line}: 알 수 없는 세트리스트 상태 "${statusLabel}"입니다.`)

    const setlistTitles = songText
      ? songText.split(/(?:->|→|\r?\n|\s+-\.?\s+)/).map((song) => song.trim()).filter(Boolean)
      : []
    if ((setlistStatus === 'none' || setlistStatus === 'unknown') && setlistTitles.length > 0) {
      errors.push(`행 ${line}: "${statusLabel}" 상태에는 곡 목록을 비워야 합니다.`)
    }
    if (['known', 'partial', 'provisional'].includes(setlistStatus) && setlistTitles.length === 0) {
      errors.push(`행 ${line}: "${statusLabel}" 상태에는 1곡 이상 입력해야 합니다.`)
    }

    const setlist = []
    for (const songTitle of setlistTitles) {
      const songKey = normalize(songTitle)
      let song = songByTitle.get(songKey)
      if (!song) {
        song = { id: makeSongId(songTitle, usedSongIds), title: songTitle }
        usedSongIds.add(song.id)
        songs.push(song)
        addedSongs.push(song)
        songByTitle.set(songKey, song)
      }
      setlist.push(song.id)
    }

    const locationId = findLocation(row, geo, locations, line, errors)
    const identity = `${date}|${normalize(title)}`
    const prior = currentByIdentity.get(identity)?.shift()
    const eventFormat = prior?.eventFormat ?? (
      /대면/.test(title) && /영상통화/.test(title) ? 'hybrid' : /영상통화/.test(title) ? 'online' : 'in-person'
    )
    if (eventFormat === 'online' && locationId) {
      errors.push(`행 ${line}: 영상통화 일정에 장소가 연결되었습니다. 실제 행사 형식을 확인해 주세요.`)
    }
    const identityDate = validateDate(date) ? date : 'invalid-date'
    let dateOrdinal = titleCounts.get(identityDate) ?? 0
    let fallbackId
    do {
      dateOrdinal += 1
      fallbackId = `schedule-${identityDate}-${String(dateOrdinal).padStart(2, '0')}`
    } while (occupiedScheduleIds.has(fallbackId) || usedScheduleIds.has(fallbackId))
    titleCounts.set(identityDate, dateOrdinal)
    const id = prior?.id ?? fallbackId
    if (usedScheduleIds.has(id)) errors.push(`행 ${line}: 일정 ID "${id}"가 중복됩니다.`)
    usedScheduleIds.add(id)

    const schedule = {
      id,
      ...(locationId ? { locationId } : {}),
      eventFormat,
      title,
      date,
      ...(startTime ? { startTime } : {}),
      ...(orderInDay !== undefined ? { orderInDay } : {}),
      setlistStatus,
      setlist,
    }
    imported.push(schedule)
  }

  const dayOrders = new Set()
  for (const schedule of imported) {
    if (schedule.orderInDay === undefined) continue
    const key = `${schedule.date}:${schedule.orderInDay}`
    if (dayOrders.has(key)) errors.push(`${schedule.date}: 같은 날짜 순서 ${schedule.orderInDay}가 중복됩니다.`)
    dayOrders.add(key)
  }
  return { imported, errors, addedSongs, locations }
}

function serializeLocations(locations) {
  return `import type { Location } from '../types/archive'\n\n// 광장·캠퍼스·관광특구처럼 넓은 장소는 실제 무대 좌표가 아닌 지도 탐색용 대표 지점을 사용합니다.\nexport const locations: Location[] = ${JSON.stringify(locations, null, 2)}\n`
}

function serializeSchedules(schedules) {
  return `import type { Schedule } from '../types/archive'\nimport { locations } from './locations'\nimport { songs } from './songs'\n\n// 사용자 확인 스프레드시트의 일정과 세트리스트입니다.\nexport const schedules: Schedule[] = ${JSON.stringify(schedules, null, 2)}\n\n// 새 데이터를 추가할 때 잘못된 ID 연결과 같은 날짜의 순서 중복을 발견합니다.\nfor (const [name, entries] of [\n  ['Location', locations],\n  ['Song', songs],\n  ['Schedule', schedules],\n] as const) {\n  const ids = entries.map((entry) => entry.id)\n  if (new Set(ids).size !== ids.length) throw new Error(name + ' ID가 중복되었습니다.')\n}\nconst locationIds = new Set(locations.map((location) => location.id))\nconst songIds = new Set(songs.map((song) => song.id))\nconst dayOrders = new Set<string>()\nfor (const schedule of schedules) {\n  if (schedule.locationId && !locationIds.has(schedule.locationId)) {\n    throw new Error(schedule.id + ': 존재하지 않는 locationId')\n  }\n  if (schedule.eventFormat === 'online' && schedule.locationId) {\n    throw new Error(schedule.id + ': 온라인 일정에는 장소를 연결할 수 없습니다.')\n  }\n  for (const songId of schedule.setlist) {\n    if (!songIds.has(songId)) throw new Error(schedule.id + ': 존재하지 않는 songId (' + songId + ')')\n  }\n  if (schedule.orderInDay !== undefined) {\n    const key = schedule.date + ':' + schedule.orderInDay\n    if (!Number.isInteger(schedule.orderInDay) || schedule.orderInDay < 1 || dayOrders.has(key)) {\n      throw new Error(schedule.id + ': 같은 날짜의 행사 순서가 잘못되었거나 중복되었습니다.')\n    }\n    dayOrders.add(key)\n  }\n}\n`
}

async function main() {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf('--input')
  const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined
  const write = args.includes('--write')
  if (!input || input.startsWith('--')) {
    throw new Error('사용법: npm run data:import -- --input <다운로드한 CSV 또는 TSV 경로> [--write]')
  }

  const inputPath = path.resolve(process.cwd(), input)
  const text = await readFile(inputPath, 'utf8')
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ','
  const table = parseDelimited(text.replace(/^\uFEFF/, ''), delimiter)
  const headers = (table.shift() ?? []).map((header) => header.trim())
  const missingHeaders = expectedHeaders.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) throw new Error(`필수 열을 찾지 못했습니다: ${missingHeaders.join(', ')}`)
  const indices = expectedHeaders.map((header) => headers.indexOf(header))
  const geoIndices = Object.fromEntries(Object.entries(locationHeaders)
    .map(([key, header]) => [key, headers.indexOf(header)]))
  const rows = table
    .map((row, index) => ({
      row: indices.map((column) => row[column] ?? ''),
      geo: Object.fromEntries(Object.entries(geoIndices)
        .map(([key, column]) => [key, column >= 0 ? row[column] ?? '' : ''])),
      line: index + 2,
    }))
    .filter(({ row }) => row.some((value) => value.trim() !== ''))

  const [locationsSource, songsSource, schedulesSource] = await Promise.all([
    readFile(path.join(root, 'src/data/locations.ts'), 'utf8'),
    readFile(path.join(root, 'src/data/songs.ts'), 'utf8'),
    readFile(path.join(root, 'src/data/schedules.ts'), 'utf8'),
  ])
  const locations = extractJsonArray(locationsSource, 'locations')
  const songs = readSongCatalog(songsSource)
  const currentSchedules = extractJsonArray(schedulesSource, 'schedules')
  const { imported, errors, addedSongs, locations: importedLocations } = parseScheduleRows(rows, locations, songs, currentSchedules)
  if (errors.length > 0) {
    console.error(`가져오기 중단: ${errors.length}개 항목을 검토해 주세요.`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const summary = {
    schedules: imported.length,
    locations: importedLocations.length,
    songs: songs.length,
    withLocation: imported.filter((schedule) => schedule.locationId).length,
    withoutLocation: imported.filter((schedule) => !schedule.locationId).length,
    setlistStatus: Object.fromEntries([...new Set(imported.map((schedule) => schedule.setlistStatus))]
      .map((status) => [status, imported.filter((schedule) => schedule.setlistStatus === status).length])),
  }
  console.log('가져오기 검증 통과:', JSON.stringify(summary))
  if (addedSongs.length > 0) {
    console.log('곡 목록에 새로 추가될 항목:', addedSongs.map((song) => song.title).join(' / '))
  }
  if (!write) {
    console.log('미리보기만 완료했습니다. 반영하려면 같은 명령에 --write를 추가하세요.')
    return
  }

  const songsOutput = `import type { Song } from '../types/archive'\n\n// 사용자 확인 세트리스트에서 실제로 참조되는 곡과 커버 기록입니다.\nexport const songs: Song[] = ${JSON.stringify(songs, null, 2)}\n`
  await Promise.all([
    writeFile(path.join(root, 'src/data/locations.ts'), serializeLocations(importedLocations), 'utf8'),
    writeFile(path.join(root, 'src/data/schedules.ts'), serializeSchedules(imported), 'utf8'),
    writeFile(path.join(root, 'src/data/songs.ts'), songsOutput, 'utf8'),
  ])
  console.log('src/data/locations.ts, src/data/schedules.ts, src/data/songs.ts에 반영했습니다.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
