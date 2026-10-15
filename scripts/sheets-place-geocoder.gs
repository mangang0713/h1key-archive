/**
 * Bound Apps Script for the H1-KEY schedule input sheet.
 * Run installPlaceLookupTrigger once from the Apps Script editor and grant the
 * requested Google Sheets/Maps authorization. Afterwards, edits to the venue
 * name/address columns create reviewable address and coordinate candidates.
 */
var PLACE_LOOKUP_CONFIG = {
  sheetName: '확정 일정',
  firstDataRow: 2,
  venueNameColumn: 3, // C: 장소명
  venueDetailsColumn: 4, // D: 장소 주소 / 홀 이름 (알면)
  addressCandidateColumn: 11, // K
  coordinatesColumn: 12, // L: [경도, 위도]
  statusColumn: 13, // M
  searchStatus: '검토 필요',
  confirmedStatus: '확인 완료',
  failedStatus: '검색 실패'
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('장소 좌표')
    .addItem('선택 행 주소·좌표 찾기', 'lookupSelectedPlace')
    .addItem('자동 검색 사용 설정', 'installPlaceLookupTrigger')
    .addToUi()
}

function installPlaceLookupTrigger() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = spreadsheet.getSheetByName(PLACE_LOOKUP_CONFIG.sheetName)
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + PLACE_LOOKUP_CONFIG.sheetName)

  var existingTriggers = ScriptApp.getProjectTriggers()
  var handlerTriggers = existingTriggers.filter(function (trigger) {
    return trigger.getHandlerFunction() === 'handlePlaceEdit'
  })

  // Reuse an existing trigger so a timeout/retry doesn't leave duplicates.
  handlerTriggers.slice(1).forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger)
  })
  if (handlerTriggers.length === 0) {
    ScriptApp.newTrigger('handlePlaceEdit')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create()
  }

  Logger.log('장소 자동 검색 트리거 설정 완료: ' + spreadsheet.getName())
}

function handlePlaceEdit(event) {
  if (!event || !event.range) return
  var sheet = event.range.getSheet()
  if (sheet.getName() !== PLACE_LOOKUP_CONFIG.sheetName) return
  if (event.range.getLastRow() < PLACE_LOOKUP_CONFIG.firstDataRow) return

  var firstColumn = event.range.getColumn()
  var lastColumn = event.range.getLastColumn()
  var watchesVenueName = firstColumn <= PLACE_LOOKUP_CONFIG.venueNameColumn
    && lastColumn >= PLACE_LOOKUP_CONFIG.venueNameColumn
  var watchesDetails = firstColumn <= PLACE_LOOKUP_CONFIG.venueDetailsColumn
    && lastColumn >= PLACE_LOOKUP_CONFIG.venueDetailsColumn
  var watchesStatus = firstColumn <= PLACE_LOOKUP_CONFIG.statusColumn
    && lastColumn >= PLACE_LOOKUP_CONFIG.statusColumn
  if (!watchesVenueName && !watchesDetails && !watchesStatus) return

  var firstRow = Math.max(event.range.getRow(), PLACE_LOOKUP_CONFIG.firstDataRow)
  var lastRow = event.range.getLastRow()
  for (var row = firstRow; row <= lastRow; row += 1) {
    if (watchesVenueName || watchesDetails) {
      var details = String(
        sheet.getRange(row, PLACE_LOOKUP_CONFIG.venueDetailsColumn).getDisplayValue(),
      ).replace(/^\s+|\s+$/g, '')
      if (hasAddress_(details)) continue

      sheet.getRange(row, PLACE_LOOKUP_CONFIG.statusColumn).setValue(PLACE_LOOKUP_CONFIG.searchStatus)
      lookupPlaceRow_(sheet, row)
    } else if (sheet.getRange(row, PLACE_LOOKUP_CONFIG.statusColumn).getDisplayValue() === PLACE_LOOKUP_CONFIG.searchStatus) {
      lookupPlaceRow_(sheet, row)
    }
  }
}

function lookupSelectedPlace() {
  var sheet = SpreadsheetApp.getActiveSheet()
  var row = sheet.getActiveRange().getRow()
  if (sheet.getName() !== PLACE_LOOKUP_CONFIG.sheetName || row < PLACE_LOOKUP_CONFIG.firstDataRow) {
    sheet.getParent().toast('확정 일정 탭에서 행사 행을 선택해 주세요.', '장소 좌표', 5)
    return
  }
  sheet.getRange(row, PLACE_LOOKUP_CONFIG.statusColumn).setValue(PLACE_LOOKUP_CONFIG.searchStatus)
  lookupPlaceRow_(sheet, row)
  sheet.getParent().toast('행 ' + row + '의 주소·좌표 검색을 마쳤습니다.', '장소 좌표', 5)
}

function lookupPlaceRow_(sheet, row) {
  var config = PLACE_LOOKUP_CONFIG
  var name = String(sheet.getRange(row, config.venueNameColumn).getDisplayValue()).replace(/^\s+|\s+$/g, '')
  var details = String(sheet.getRange(row, config.venueDetailsColumn).getDisplayValue()).replace(/^\s+|\s+$/g, '')
  var statusCell = sheet.getRange(row, config.statusColumn)
  var status = String(statusCell.getDisplayValue()).replace(/^\s+|\s+$/g, '')

  if (!name || name === 'ㅇ' || status === config.confirmedStatus || hasAddress_(details)) return

  var query = [name, details, '대한민국'].filter(Boolean).join(' ')
  try {
    var response = Maps.newGeocoder()
      .setLanguage('ko')
      .setRegion('kr')
      .geocode(query)
    var result = response.results && response.results[0]
    if (response.status !== 'OK' || !result) {
      clearCandidate_(sheet, row)
      statusCell.setValue(config.failedStatus)
      return
    }

    var latitude = Number(result.geometry.location.lat)
    var longitude = Number(result.geometry.location.lng)
    if (!isFinite(latitude) || !isFinite(longitude)) {
      clearCandidate_(sheet, row)
      statusCell.setValue(config.failedStatus)
      return
    }

    sheet.getRange(row, config.addressCandidateColumn, 1, config.coordinatesColumn - config.addressCandidateColumn + 1).setValues([[
      result.formatted_address || '',
      JSON.stringify([longitude, latitude])
    ]])
    statusCell.setValue(config.searchStatus)
  } catch (error) {
    clearCandidate_(sheet, row)
    statusCell.setValue(config.failedStatus)
    console.error('행 ' + row + ' 장소 검색 오류', error)
  }
}

function hasAddress_(value) {
  var text = String(value || '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ')
  if (!text) return false

  var hasRoadAddress = /(?:^|[\s,])[^\s,]*(?:대로|로|길)\s*\d+(?:-\d+)?(?:\s|,|$)/.test(text)
  var hasLotAddress = /(?:^|[\s,])[가-힣0-9]+(?:동|읍|면|리)\s*\d+(?:-\d+)?(?:번지)?(?:\s|,|$)/.test(text)
  return hasRoadAddress || hasLotAddress
}

function clearCandidate_(sheet, row) {
  var config = PLACE_LOOKUP_CONFIG
  sheet.getRange(row, config.addressCandidateColumn, 1, config.coordinatesColumn - config.addressCandidateColumn + 1).clearContent()
}
