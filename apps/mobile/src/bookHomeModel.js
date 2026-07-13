import { ageAt, formatAge } from './ageModel.js';
import { buildBookCollectionSummaries, letterOpenState } from './bookCollectionsModel.js';
import { childIdForRow, childScopeContext, filterRowsForChildScope } from './childScopeModel.js';
import { buildBookWorthinessForMoment, buildBookWorthinessForPhoto, sortBookHighlightCandidates } from './bookWorthinessModel.js';
import { countLabel } from './plural.js';

export const BOOK_HOME_PRINT_READY_MOMENT_MIN = 12;
export const BOOK_HOME_PRINT_READY_CHAPTER_MIN = 3;

export function buildBookHomeModel({
  moments = [],
  sharedPhotos = [],
  firsts = [],
  letters = [],
  digests = [],
  childBirthday,
  promptResponses = [],
  voiceNotes = [],
  uploadRepairState = null,
  exportLimitations = [],
  lapsedSubscriptionPolicy = null,
  now = new Date(),
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const scopedMoments = filterRowsForChildScope(moments, scope.childId);
  const scopedSharedPhotos = filterRowsForChildScope(sharedPhotos, scope.childId);
  const scopedFirsts = filterRowsForChildScope(firsts, scope.childId);
  const scopedLetters = filterRowsForChildScope(letters, scope.childId);
  const scopedPromptResponses = filterRowsForChildScope(promptResponses, scope.childId);
  const scopedDigests = filterRowsForChildScope(digests, scope.childId);
  const scopedVoiceNotes = filterRowsForChildScope(voiceNotes, scope.childId);
  const records = buildArchiveRecords({
    moments: scopedMoments,
    sharedPhotos: scopedSharedPhotos,
    voiceNotes: scopedVoiceNotes,
  });
  const stats = buildArchiveStats(records);
  const bookReadyRecords = records.filter((record) => record.bookEligible);
  const bookReadyStats = buildArchiveStats(bookReadyRecords);
  const chapterContextItems = buildChapterContextItems({
    records,
    firsts: scopedFirsts,
    letters: scopedLetters,
    promptResponses: scopedPromptResponses,
    now,
  });
  const chapters = buildArchiveMonthSections({
    records,
    babyBirthday: childBirthday,
    contextItems: chapterContextItems,
  });
  const yearSummaries = buildYearSummaries(records);
  const collections = buildBookCollectionSummaries({
    firsts: scopedFirsts,
    letters: scopedLetters,
    sharedPhotos: scopedSharedPhotos,
    now,
    childId: scope.childId,
  });
  const promptSummary = buildPromptResponseSummary(scopedPromptResponses);
  const voiceSummary = buildVoiceSummary({ moments: scopedMoments, voiceNotes: scopedVoiceNotes });
  const digestSummary = buildDigestSummary(scopedDigests);
  const printExportReadiness = buildPrintExportReadiness({
    stats: bookReadyStats,
    archiveStats: stats,
    chapters: chapters.filter((chapter) => (chapter.bookReadyRecords || []).length || (chapter.contextItems || []).length),
    firstsSummary: collections.firsts,
    lettersSummary: collections.letters,
    promptSummary,
    voiceSummary,
    digestSummary,
    exportLimitations,
    lapsedSubscriptionPolicy,
  });
  const utilityAlerts = buildBookUtilityAlerts({
    uploadRepairState,
    exportLimitations,
    lapsedSubscriptionPolicy,
  });

  return {
    ...scope,
    records,
    stats,
    bookReadyStats,
    bookReadyRecords,
    chapters,
    currentMonthChapter: chapters[0] || null,
    latestSavedMoment: records[0] || null,
    yearSummaries,
    collections,
    firstsSummary: collections.firsts,
    lettersSummary: collections.letters,
    promptSummary,
    voiceSummary,
    digestSummary,
    printExportReadiness,
    utilityAlerts,
    subtitle: bookMediaSubtitle(stats, chapters),
  };
}

export function buildArchiveRecords({
  moments = [],
  sharedPhotos = [],
  shared = [],
  voiceNotes = [],
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const scopedMoments = filterRowsForChildScope(moments, scope.childId);
  const scopedSharedPhotos = filterRowsForChildScope(sharedPhotos, scope.childId);
  const scopedShared = filterRowsForChildScope(shared, scope.childId);
  const scopedVoiceNotes = filterRowsForChildScope(voiceNotes, scope.childId);
  const externalVoiceByMoment = groupVoiceNotesByMoment(scopedVoiceNotes);
  const momentRecords = (scopedMoments || []).map((moment) => {
    const media = moment.media || [];
    const combinedVoiceNotes = mergeVoiceNotes(moment.voiceNotes, externalVoiceByMoment.get(moment.id));
    const imageCount = media.filter((item) => item.media_type !== 'video').length;
    const videoCount = media.filter((item) => item.media_type === 'video').length;
    const firstMedia = media[0];
    const capturedAt = moment.captured_at || moment.created_at;
    const tags = Array.from(new Set((moment.tags || []).filter(Boolean)));
    const dateLabel = formatDateLabel(capturedAt);
    const bookWorthiness = buildBookWorthinessForMoment(moment, { voiceCount: combinedVoiceNotes.length });
    return {
      key: `moment:${moment.id}`,
      id: moment.id,
      childId: childIdForRow(moment),
      moment,
      title: moment.title || firstMeaningful([moment.caption_note, tags[0], moment.place_name, dateLabel]),
      subtitle: [dateLabel, moment.place_name, mediaSummary({ imageCount, videoCount, voiceCount: combinedVoiceNotes.length })].filter(Boolean).join(' · '),
      capturedAt,
      year: yearFor(capturedAt),
      place: moment.place_name || '',
      tags,
      imageCount,
      videoCount,
      voiceCount: combinedVoiceNotes.length,
      voiceOnly: !media.length && !!combinedVoiceNotes.length,
      thumbUrl: firstMedia?.thumbUrl || firstMedia?.posterUrl || firstMedia?.fullUrl || null,
      bookWorthiness,
      savedToArchive: bookWorthiness.savedToArchive,
      bookEligible: bookWorthiness.bookEligible,
      bookScore: bookWorthiness.bookScore,
      archiveStatusLabel: bookWorthiness.archiveStatusLabel,
      bookStatusLabel: bookWorthiness.bookStatusLabel,
      bookWorthinessReasons: bookWorthiness.reasons,
      searchText: [
        moment.title,
        moment.caption_note,
        moment.place_name,
        dateLabel,
        String(yearFor(capturedAt) || ''),
        tags.join(' '),
        videoCount ? 'video' : '',
        combinedVoiceNotes.length ? 'voice audio recording' : '',
        imageCount ? 'photo image' : '',
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });

  const photoRows = scopedSharedPhotos.length ? scopedSharedPhotos : scopedShared;
  const legacyRecords = (photoRows || [])
    .filter((photo) => !photo.moment_id)
    .map((photo) => {
      const capturedAt = photo.creation_time || photo.tagged_at;
      const dateLabel = formatDateLabel(capturedAt);
      const place = photo.location_label || '';
      const bookWorthiness = buildBookWorthinessForPhoto(photo);
      return {
        key: `legacy:${photo.asset_owner_user_id}:${photo.asset_id}`,
        id: photo.asset_id,
        childId: childIdForRow(photo),
        moment: null,
        photo,
        title: firstMeaningful([place, dateLabel, 'Saved photo']),
        subtitle: [dateLabel, place, 'Photo'].filter(Boolean).join(' · '),
        capturedAt,
        year: yearFor(capturedAt),
        place,
        tags: ['photo'],
        imageCount: 1,
        videoCount: 0,
        voiceCount: 0,
        voiceOnly: false,
        thumbUrl: photo.thumbUrl || photo.fullUrl || null,
        bookWorthiness,
        savedToArchive: bookWorthiness.savedToArchive,
        bookEligible: bookWorthiness.bookEligible,
        bookScore: bookWorthiness.bookScore,
        archiveStatusLabel: bookWorthiness.archiveStatusLabel,
        bookStatusLabel: bookWorthiness.bookStatusLabel,
        bookWorthinessReasons: bookWorthiness.reasons,
        searchText: [dateLabel, place, 'saved photo image'].filter(Boolean).join(' ').toLowerCase(),
      };
    });

  return [...momentRecords, ...legacyRecords]
    .filter((record) => record.capturedAt || record.title)
    .sort((a, b) => timestampMs(b.capturedAt) - timestampMs(a.capturedAt));
}

export function buildArchiveMonthSections({ records = [], babyBirthday, contextItems = [] } = {}) {
  const buckets = new Map();
  for (const record of records || []) {
    const bucket = ensureChapterBucket(buckets, record.capturedAt, babyBirthday);
    bucket.records.push(record);
    if (record.bookEligible) {
      bucket.bookReadyRecords.push(record);
      bucket.bookReady += 1;
    }
    bucket.photos += record.imageCount || 0;
    bucket.videos += record.videoCount || 0;
    bucket.voiceNotes += record.voiceCount || 0;
  }
  for (const item of contextItems || []) {
    const bucket = ensureChapterBucket(buckets, item.capturedAt, babyBirthday);
    bucket.contextItems.push(item);
  }

  return Array.from(buckets.values())
    .sort((a, b) => timestampMs(b.date) - timestampMs(a.date))
    .map((bucket) => ({
      ...bucket,
      contextItems: bucket.contextItems.sort((a, b) => timestampMs(b.capturedAt) - timestampMs(a.capturedAt)),
      bookReadyRecords: sortBookHighlightCandidates(bucket.bookReadyRecords, (record) => record.bookScore),
      summary: monthSectionSummary(bucket),
      bookReadySummary: bucket.bookReady
        ? `${countText(bucket.bookReady, 'book-ready highlight')}`
        : 'Saved in the archive; add context to make a highlight.',
    }));
}

export function buildChapterContextItems({
  records = [],
  firsts = [],
  letters = [],
  promptResponses = [],
  now = new Date(),
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const scopedFirsts = filterRowsForChildScope(firsts, scope.childId);
  const scopedLetters = filterRowsForChildScope(letters, scope.childId);
  const scopedPromptResponses = filterRowsForChildScope(promptResponses, scope.childId);
  const momentDateById = new Map(
    (records || [])
      .filter((record) => record?.moment?.id)
      .map((record) => [record.moment.id, record.capturedAt]),
  );
  const items = [];

  for (const record of records || []) {
    if (!record?.voiceCount) continue;
    items.push({
      kind: 'voice',
      key: `voice:${record.key}`,
      title: record.title || 'Voice note',
      caption: `${countText(record.voiceCount, 'voice note')} saved with this moment`,
      capturedAt: record.capturedAt,
      momentId: record.moment?.id || null,
      recordKey: record.key,
    });
  }

  for (const first of scopedFirsts || []) {
    if (!first || first.done === false) continue;
    const capturedAt = first.happened_at || momentDateById.get(first.moment_id) || first.created_at;
    items.push({
      kind: 'first',
      key: `first:${first.id || first.goal_key || first.title}`,
      title: first.title || 'Saved first',
      caption: first.target_age_label ? `First saved around ${first.target_age_label}` : 'First saved with this chapter',
      capturedAt,
      childId: childIdForRow(first),
      firstId: first.id || null,
      momentId: first.moment_id || null,
    });
  }

  for (const letter of scopedLetters || []) {
    if (!letter) continue;
    const capturedAt = momentDateById.get(letter.source_moment_id) || letter.created_at || letter.open_on;
    const state = letterOpenState(letter, now);
    items.push({
      kind: 'letter',
      key: `letter:${letter.id || letter.title}`,
      title: letter.title || 'Letter saved for later',
      caption: letterStateCaption(state, letter),
      capturedAt,
      childId: childIdForRow(letter),
      letterId: letter.id || null,
      momentId: letter.source_moment_id || null,
      firstId: letter.source_first_id || null,
    });
  }

  for (const response of scopedPromptResponses || []) {
    if (!String(response?.response_text || response?.responseText || '').trim()) continue;
    const capturedAt = response.prompt_date || response.promptDate || response.created_at || response.createdAt;
    items.push({
      kind: 'prompt',
      key: `prompt:${response.id || response.prompt_date || response.promptDate}`,
      title: response.prompt_text || response.promptText || 'Prompt answered',
      caption: promptResponseCaption(response),
      capturedAt,
      childId: childIdForRow(response),
      promptDate: response.prompt_date || response.promptDate || null,
      momentId: response.moment_id || response.momentId || null,
    });
  }

  return items.filter((item) => item.capturedAt || item.title);
}

export function buildArchiveStats(records = []) {
  return (records || []).reduce((acc, record) => {
    acc.moments += 1;
    acc.photos += record.imageCount || 0;
    acc.videos += record.videoCount || 0;
    acc.voiceNotes += record.voiceCount || 0;
    if (record.tags.some((tag) => tag.toLowerCase().includes('first'))) acc.firsts += 1;
    if (record.bookEligible) {
      acc.bookReadyMoments += 1;
      acc.bookReadyPhotos += record.imageCount || 0;
      acc.bookReadyVideos += record.videoCount || 0;
      acc.bookReadyVoiceNotes += record.voiceCount || 0;
    }
    return acc;
  }, {
    moments: 0,
    photos: 0,
    videos: 0,
    voiceNotes: 0,
    firsts: 0,
    bookReadyMoments: 0,
    bookReadyPhotos: 0,
    bookReadyVideos: 0,
    bookReadyVoiceNotes: 0,
  });
}

export function buildYearSummaries(records = []) {
  const byYear = new Map();
  for (const record of records || []) {
    const year = record.year || 'Undated';
    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        moments: 0,
        photos: 0,
        videos: 0,
        voiceNotes: 0,
        places: [],
        representative: [],
      });
    }
    const bucket = byYear.get(year);
    bucket.moments += 1;
    bucket.photos += record.imageCount || 0;
    bucket.videos += record.videoCount || 0;
    bucket.voiceNotes += record.voiceCount || 0;
    if (record.place && !bucket.places.includes(record.place)) bucket.places.push(record.place);
    bucket.representative.push(record);
  }
  return Array.from(byYear.values())
    .map((year) => ({
      ...year,
      representative: sortBookHighlightCandidates(year.representative, (record) => record.bookScore).slice(0, 6),
    }))
    .sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

export function buildPromptResponseSummary(promptResponses = [], { childId = null } = {}) {
  const rows = filterRowsForChildScope(promptResponses, childId).filter(Boolean);
  const answered = rows.filter((row) => String(row.response_text || row.responseText || '').trim());
  const latest = [...answered].sort((a, b) => latestPromptTimestamp(b) - latestPromptTimestamp(a))[0] || null;
  return {
    count: rows.length,
    answeredCount: answered.length,
    linkedMomentCount: answered.filter((row) => row.moment_id || row.momentId).length,
    latest,
  };
}

export function buildVoiceSummary({ moments = [], voiceNotes = [], childId = null } = {}) {
  const scopedMoments = filterRowsForChildScope(moments, childId);
  const scopedVoiceNotes = filterRowsForChildScope(voiceNotes, childId);
  const byId = new Map();
  for (const note of scopedVoiceNotes || []) {
    if (note?.id) byId.set(note.id, note);
  }
  for (const moment of scopedMoments || []) {
    for (const note of moment?.voiceNotes || []) {
      if (note?.id) byId.set(note.id, note);
      else byId.set(`moment:${moment.id}:${byId.size}`, note);
    }
  }
  return {
    count: byId.size,
    latest: [...byId.values()].sort((a, b) => timestampMs(b?.created_at || b?.createdAt) - timestampMs(a?.created_at || a?.createdAt))[0] || null,
  };
}

export function buildDigestSummary(digests = [], { childId = null } = {}) {
  const rows = filterRowsForChildScope(digests, childId).filter(Boolean);
  const latest = [...rows].sort((a, b) => latestDigestTimestamp(b) - latestDigestTimestamp(a))[0] || null;
  return {
    count: rows.length,
    latest,
    momentCount: rows.reduce((sum, row) => sum + Number(row.momentCount ?? row.moment_count ?? 0), 0),
    voiceNoteCount: rows.reduce((sum, row) => sum + Number(row.voiceNoteCount ?? row.voice_note_count ?? 0), 0),
  };
}

export function buildPrintExportReadiness({
  stats = {},
  archiveStats = {},
  chapters = [],
  firstsSummary = {},
  lettersSummary = {},
  promptSummary = {},
  voiceSummary = {},
  digestSummary = {},
  exportLimitations = [],
  lapsedSubscriptionPolicy = null,
} = {}) {
  const momentCount = Number(stats.moments || 0);
  const archiveMomentCount = Number(archiveStats.moments || 0);
  const durableContextCount = Number(firstsSummary.count || 0)
    + Number(lettersSummary.count || 0)
    + Number(promptSummary.answeredCount || 0)
    + Number(voiceSummary.count || 0)
    + Number(digestSummary.count || 0);
  const hasBookContent = momentCount > 0 || durableContextCount > 0;
  const hasArchiveOnly = !hasBookContent && archiveMomentCount > 0;
  const ready = momentCount >= BOOK_HOME_PRINT_READY_MOMENT_MIN
    || (chapters.length >= BOOK_HOME_PRINT_READY_CHAPTER_MIN && momentCount >= 6);
  const state = !hasBookContent ? (hasArchiveOnly ? 'archive_only' : 'empty') : ready ? 'print_ready' : 'building';
  const title = state === 'empty' || state === 'archive_only'
    ? 'Not ready to print yet'
    : state === 'print_ready'
      ? 'Print preview is worth a look'
      : 'The book is taking shape';
  const reasons = [];
  if (momentCount) reasons.push(countText(momentCount, 'saved moment'));
  if (chapters.length) reasons.push(countText(chapters.length, 'chapter'));
  if (firstsSummary.count) reasons.push(countText(firstsSummary.count, 'first'));
  if (lettersSummary.count) reasons.push(countText(lettersSummary.count, 'letter'));
  if (voiceSummary.count) reasons.push(countText(voiceSummary.count, 'voice note'));
  if (promptSummary.answeredCount) reasons.push(countText(promptSummary.answeredCount, 'prompt answer'));
  if (digestSummary.count) reasons.push(countText(digestSummary.count, 'digest'));

  return {
    state,
    title,
    body: readinessBody({ state, reasons, archiveMomentCount }),
    reasons,
    policy: normalizeExportPolicy(lapsedSubscriptionPolicy),
    limitations: normalizeExportLimitations(exportLimitations),
  };
}

export function buildBookUtilityAlerts({
  uploadRepairState = null,
  exportLimitations = [],
  lapsedSubscriptionPolicy = null,
} = {}) {
  const alerts = [];
  const uploadTotal = Number(uploadRepairState?.total || 0);
  if (uploadTotal > 0) {
    const failed = Number(uploadRepairState?.failed || 0);
    const uploading = Number(uploadRepairState?.uploading || 0);
    const pending = Number(uploadRepairState?.pending || 0);
    alerts.push({
      kind: 'upload_repair',
      severity: failed ? 'blocking' : 'notice',
      title: failed ? 'Some memories did not finish saving' : 'Some memories are still saving',
      body: `${failed ? `${countText(failed, 'memory')} ${failed === 1 ? 'needs' : 'need'}` : 'No memories need'} a retry. ${uploading} uploading · ${pending} waiting.`,
      actionLabel: failed ? 'Retry' : null,
      counts: { total: uploadTotal, failed, uploading, pending },
    });
  }

  const limitations = normalizeExportLimitations(exportLimitations);
  if (limitations.length) {
    alerts.push({
      kind: 'export_limitation',
      severity: 'notice',
      title: 'Export has limits right now',
      body: limitations.map((item) => item.label).join(' · '),
      actionLabel: 'Review export',
      limitations,
    });
  }

  const policy = normalizeExportPolicy(lapsedSubscriptionPolicy);
  if (policy.finalized && policy.state && policy.state !== 'active') {
    alerts.push({
      kind: 'lapsed_subscription_policy',
      severity: policy.state === 'lapsed' ? 'blocking' : 'notice',
      title: policy.title || 'Subscription export policy',
      body: policy.body || 'Review what can be exported before sharing the book.',
      actionLabel: policy.actionLabel || 'Review policy',
      policy,
    });
  }
  return alerts;
}

export function bookMediaSubtitle(stats, sections) {
  const current = sections?.[0]?.title;
  const photos = stats?.photos || 0;
  const videos = stats?.videos || 0;
  const mediaTotal = photos + videos;
  if (!mediaTotal) return 'Approve a moment to begin';
  if (current) return `Current chapter: ${current}`;
  if (photos && videos) return `${mediaTotal.toLocaleString()} photos and videos in the book`;
  if (photos) return `${countText(photos, 'photo')} in the book`;
  return `${countText(videos, 'video')} in the book`;
}

export function formatBookDateLabel(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function countText(value, singular, pluralValue) {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${countLabel(count, singular, pluralValue)}`;
}

function groupVoiceNotesByMoment(voiceNotes = []) {
  const grouped = new Map();
  for (const note of voiceNotes || []) {
    const momentId = note?.moment_id || note?.momentId;
    if (!momentId) continue;
    if (!grouped.has(momentId)) grouped.set(momentId, []);
    grouped.get(momentId).push(note);
  }
  return grouped;
}

function mergeVoiceNotes(inlineNotes = [], externalNotes = []) {
  const merged = new Map();
  for (const note of inlineNotes || []) {
    merged.set(note?.id || `inline:${merged.size}`, note);
  }
  for (const note of externalNotes || []) {
    merged.set(note?.id || `external:${merged.size}`, note);
  }
  return [...merged.values()].filter(Boolean);
}

function readinessBody({ state, reasons, archiveMomentCount = 0 }) {
  if (state === 'empty') {
    return 'Approve a moment, save a first, answer a prompt, or write a letter before making a book preview.';
  }
  if (state === 'archive_only') {
    return `${countText(archiveMomentCount, 'moment')} saved in the archive. Add a note, voice, first, prompt answer, or parent-kept highlight before making a book preview.`;
  }
  const reasonText = reasons.length ? reasons.slice(0, 4).join(' · ') : 'Saved context';
  if (state === 'print_ready') return `A parent-approved preview can include: ${reasonText}.`;
  return `Saved so far: ${reasonText}. A fuller preview will get better as more chapters collect.`;
}

function ensureChapterBucket(buckets, capturedAt, babyBirthday) {
  const date = validDate(capturedAt);
  const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'undated';
  if (!buckets.has(key)) {
    buckets.set(key, {
      key,
      date,
      title: date
        ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : 'Undated',
      ageLabel: sectionAgeLabel({ date, babyBirthday }),
      records: [],
      bookReadyRecords: [],
      contextItems: [],
      photos: 0,
      videos: 0,
      voiceNotes: 0,
      bookReady: 0,
    });
  }
  return buckets.get(key);
}

function letterStateCaption(state, letter) {
  if (state === 'open') return 'Letter open in the book';
  if (state === 'sealed') {
    const date = formatBookDateLabel(letter?.open_on);
    return date ? `Letter sealed until ${date}` : 'Letter saved for later';
  }
  return 'Letter saved with this chapter';
}

function promptResponseCaption(response) {
  const date = formatBookDateLabel(response?.prompt_date || response?.promptDate);
  return date ? `Prompt answered ${date}` : 'Prompt answer saved with this chapter';
}

function normalizeExportLimitations(limitations = []) {
  return (limitations || [])
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return { key: item, label: item };
      const label = item.label || item.title || item.body || item.reason;
      if (!label) return null;
      return { ...item, label };
    })
    .filter(Boolean);
}

function normalizeExportPolicy(policy) {
  if (!policy) return { finalized: false, state: 'pending' };
  return {
    finalized: policy.finalized === true,
    state: policy.state || policy.status || 'pending',
    title: policy.title || '',
    body: policy.body || policy.message || '',
    actionLabel: policy.actionLabel || '',
    scope: Array.isArray(policy.scope) ? policy.scope : [],
  };
}

function latestPromptTimestamp(row) {
  return timestampMs(row?.updated_at || row?.updatedAt)
    || timestampMs(row?.created_at || row?.createdAt)
    || localDateMs(row?.prompt_date || row?.promptDate)
    || 0;
}

function latestDigestTimestamp(row) {
  return timestampMs(row?.generatedAt || row?.generated_at)
    || localDateMs(row?.weekStart || row?.week_start)
    || localDateMs(row?.weekEnd || row?.week_end)
    || 0;
}

function firstMeaningful(values) {
  return (values || []).find((value) => String(value || '').trim()) || '';
}

function sectionAgeLabel({ date, babyBirthday }) {
  if (!date || !babyBirthday) return '';
  const label = formatAge(ageAt(babyBirthday, date.getTime()));
  return label ? `Around ${label}` : '';
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearFor(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function mediaSummary({ imageCount, videoCount, voiceCount }) {
  const parts = [];
  if (imageCount) parts.push(countText(imageCount, 'photo'));
  if (videoCount) parts.push(countText(videoCount, 'video'));
  if (voiceCount) parts.push(countText(voiceCount, 'voice note'));
  return parts.join(' · ');
}

function monthSectionSummary(section) {
  const photos = section.photos || 0;
  const videos = section.videos || 0;
  const voiceNotes = section.voiceNotes || 0;
  const contextCount = (section.contextItems || []).filter((item) => item.kind !== 'voice').length;
  if (photos && videos) return `${countText(photos, 'photo')} · ${countText(videos, 'video')}`;
  if (photos) return countText(photos, 'photo');
  if (videos) return countText(videos, 'video');
  if (voiceNotes) return countText(voiceNotes, 'voice note');
  if (contextCount) return countText(contextCount, 'book note');
  return countText(section.records.length, 'moment');
}

function localDateMs(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = new Date(`${raw}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function timestampMs(value) {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
