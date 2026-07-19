const { initializeDatabase, createId, ensureExercise, searchExercises, getSessionByDate, completeSession, saveExerciseToSession, getSessionsByMonth, getRecentSessions, getAllSessions, getLastExposure, getExerciseHistory, saveCheckin, getCheckins, saveMaxRecord, getMaxRecords, saveSetting, getSetting, createBackup, restoreBackup } = window.GymDiaryDB;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const fullDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const compactDate = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const backupDateLabel = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
const buildDateLabel = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const onboardingPreview = new URLSearchParams(location.search).get('onboarding') === '1';
const THEME_STORAGE_KEY = 'gymDiaryTheme';
const BACKUP_REMINDER_DAYS = 7;
const BACKUP_REMINDER_MIN_SESSIONS = 5;
const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024;

const state = {
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  session: null,
  selectedExercise: null,
  lastExposure: null,
  maxRecords: [],
  onboardingMaxes: [],
  exerciseHistory: [],
  selectedFeeling: null,
  weightEntries: [],
  energyEntries: [],
  allWeightEntries: [],
  allEnergyEntries: [],
  weightPeriod: 'all',
  energyPeriod: 'all',
  visibleSessionCount: 5,
  progressExercises: [],
  selectedProgressExercise: null,
  selectedSeriesKey: null,
  progressPoints: [],
  technique: 'normal',
  restWeight: null,
  setRows: [],
  searchToken: 0
};

function cachedTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === 'alternative' ? 'alternative' : 'original'; }
  catch (error) { return 'original'; }
}

function updateThemeControls(theme) {
  $$('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === theme;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'alternative' ? 'alternative' : 'original';
  if (normalizedTheme === 'alternative') document.documentElement.dataset.theme = 'alternative';
  else document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'alternative' ? '#0d1012' : '#f5f0e7');
  try { localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme); } catch (error) {}
  updateThemeControls(normalizedTheme);
  return normalizedTheme;
}

async function chooseTheme(theme) {
  const normalizedTheme = applyTheme(theme);
  await saveSetting('theme', normalizedTheme);
  showToast(normalizedTheme === 'alternative' ? 'Tema Steel & Chalk attivo' : 'Tema originale attivo');
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function validDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(dateFromKey(key).getTime());
}

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

const TECHNIQUE_LABELS = { 'rest-pause': 'Rest-pause', stripping: 'Stripping' };
function techniqueLabel(technique) { return TECHNIQUE_LABELS[technique] || ''; }
function exposureTechnique(exposure) { return exposure?.technique || 'normal'; }
function commaNumber(value) { return String(value).replace('.', ','); }
function formatKg(value) { const rounded = Math.round(value * 10) / 10; return `${commaNumber(Number.isInteger(rounded) ? rounded : rounded.toFixed(1))} kg`; }
function exposureTonnage(exposure) { return (exposure?.sets || []).reduce((sum, set) => sum + (set.weight > 0 && set.reps > 0 ? set.weight * set.reps : 0), 0); }

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function showError(error) {
  console.error(error);
  const panel = $('#app-error');
  panel.textContent = error?.message || 'Qualcosa non ha funzionato. Riprova.';
  panel.hidden = false;
  setTimeout(() => { panel.hidden = true; }, 5000);
}

async function renderAppVersion() {
  const target = $('#app-version');
  if (!target) return;
  try {
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Build info non disponibile');
    const info = await response.json();
    const publishedAt = info.publishedAt ? buildDateLabel.format(new Date(info.publishedAt)) : 'versione locale';
    const version = info.version || info.commit?.slice?.(0, 7) || 'local';
    target.textContent = `Versione app: ${version} · pubblicata: ${publishedAt}`;
  } catch (error) {
    target.textContent = 'Versione app: non verificabile';
  }
}

function navigateHome() {
  history.pushState(null, '', '#home');
  showView('home');
  renderHome().catch(showError);
}

function navigateProfile() {
  history.pushState(null, '', '#profilo');
  showView('profilo');
  renderProfile().catch(showError);
}

function navigateResults(exerciseId = null) {
  history.pushState(null, '', exerciseId ? `#risultati/${encodeURIComponent(exerciseId)}` : '#risultati');
  showView('risultati');
  renderResults(exerciseId).catch(showError);
}

function navigateToDate(date) {
  if (date > localDateKey()) return;
  history.pushState(null, '', `#giorno/${date}`);
  openDay(date).catch(showError);
}

function showView(id) {
  $$('.view').forEach(view => view.classList.toggle('is-active', view.id === id));
  const currentRoute = id === 'profilo' ? 'profile' : id === 'risultati' ? 'results' : 'home';
  $$('.demo-nav a').forEach(link => link.classList.toggle('is-current', link.dataset.route === currentRoute));
  updateCompleteButton(id);
  scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCompleteButton(viewId = $('.view.is-active')?.id) {
  const button = $('#complete-workout');
  const visible = viewId === 'giorno' && Boolean(state.session?.exercises?.length);
  button.classList.toggle('is-visible', visible);
  button.setAttribute('aria-hidden', String(!visible));
  button.disabled = !visible;
}

function exerciseSeries(exercise) {
  const series = [];
  const classic = exercise.exposures.filter(exposure => exposureTechnique(exposure) === 'normal');
  const byDay = new Map();
  for (const exposure of classic) {
    if (!byDay.has(exposure.date)) byDay.set(exposure.date, { date: exposure.date, sessionName: exposure.sessionName, note: exposure.note || '', bestByReps: new Map() });
    const day = byDay.get(exposure.date);
    for (const set of exposure.sets) {
      const reps = Number(set.reps), weight = Number(set.weight);
      if (!Number.isInteger(reps) || reps <= 0 || !Number.isFinite(weight) || weight <= 0) continue;
      if (!day.bestByReps.has(reps) || weight > day.bestByReps.get(reps)) day.bestByReps.set(reps, weight);
    }
    if (exposure.note && !day.note.includes(exposure.note)) day.note = [day.note, exposure.note].filter(Boolean).join(' · ');
  }
  const repTracks = new Map();
  for (const day of [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    day.bestByReps.forEach((weight, reps) => {
      if (!repTracks.has(reps)) repTracks.set(reps, []);
      repTracks.get(reps).push({ date: day.date, value: weight, reps, note: day.note, sessionName: day.sessionName });
    });
  }
  [...repTracks.entries()].sort((a, b) => a[0] - b[0]).forEach(([reps, points]) => series.push({ key: `reps-${reps}`, kind: 'reps', reps, label: `${reps} rip.`, points }));
  for (const technique of Object.keys(TECHNIQUE_LABELS)) {
    const exposures = exercise.exposures.filter(exposure => exposureTechnique(exposure) === technique);
    const dayMap = new Map();
    for (const exposure of exposures) {
      const tonnage = exposureTonnage(exposure);
      if (!tonnage) continue;
      const existing = dayMap.get(exposure.date);
      if (!existing || tonnage > existing.value) dayMap.set(exposure.date, { date: exposure.date, value: tonnage, note: exposure.note || '', sessionName: exposure.sessionName });
    }
    const points = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (points.length) series.push({ key: `tech-${technique}`, kind: 'technique', technique, label: techniqueLabel(technique), points });
  }
  return series;
}

function defaultSeries(exercise) {
  return [...exerciseSeries(exercise)].sort((a, b) => b.points.length - a.points.length || b.points.at(-1).date.localeCompare(a.points.at(-1).date))[0] || null;
}

function lastExposureDate(exercise) {
  return exercise.exposures.reduce((max, exposure) => exposure.date > max ? exposure.date : max, '');
}

async function loadProgressExercises() {
  const sessions = await getAllSessions();
  const exercises = new Map();
  for (const session of sessions) {
    for (const exposure of session.exercises || []) {
      const id = exposure.exerciseId || `legacy-${String(exposure.name).toLocaleLowerCase('it')}`;
      if (!exercises.has(id)) exercises.set(id, { id, name: exposure.name, imageUrl: exposure.imageUrl || null, exposures: [] });
      exercises.get(id).exposures.push({ date: session.date, sessionName: session.name, technique: exposureTechnique(exposure), sets: exposure.sets || [], note: exposure.note || '' });
    }
  }
  state.progressExercises = [...exercises.values()]
    .filter(exercise => exerciseSeries(exercise).length)
    .sort((a, b) => lastExposureDate(b).localeCompare(lastExposureDate(a)) || a.name.localeCompare(b.name, 'it'));
}

function progressDelta(points) {
  if (points.length < 2) return null;
  return points.at(-1).value - points.at(-2).value;
}

function signedKg(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${String(rounded).replace('.', ',')} kg`;
}

function seriesLatestLabel(series, point = series.points.at(-1)) {
  return series.kind === 'reps' ? `${point.value} kg × ${series.reps}` : formatKg(point.value);
}

function seriesSubLabel(series) {
  const sessions = `${series.points.length} ${series.points.length === 1 ? 'sessione' : 'sessioni'}`;
  return series.kind === 'reps' ? `${sessions} a ${series.reps} rip.` : `${sessions} · ${series.label}`;
}

function renderResultsList(query = '') {
  const list = $('#results-exercise-list');
  const normalizedQuery = query.trim().toLocaleLowerCase('it');
  const exercises = state.progressExercises.filter(exercise => exercise.name.toLocaleLowerCase('it').includes(normalizedQuery));
  if (!state.progressExercises.length) {
    list.innerHTML = '<div class="results-empty"><strong>Qui compariranno i tuoi progressi.</strong><span>Registra almeno una serie con carico e ripetizioni.</span></div>';
    return;
  }
  if (!exercises.length) { list.innerHTML = '<p class="empty-list">Nessun esercizio corrisponde alla ricerca.</p>'; return; }
  list.innerHTML = exercises.map(exercise => {
    const series = defaultSeries(exercise), delta = progressDelta(series.points);
    const trend = delta === null ? 'Primo dato confrontabile' : delta === 0 ? 'Stabile rispetto al precedente' : `${signedKg(delta)} rispetto al precedente`;
    const trendClass = delta === null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down';
    return `<button class="result-exercise-card" type="button" data-open-result="${escapeHtml(exercise.id)}"><span class="result-exercise-mark">${escapeHtml(exercise.name.charAt(0).toLocaleUpperCase('it'))}</span><span class="result-exercise-copy"><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(seriesSubLabel(series))}</small></span><span class="result-exercise-value"><strong>${escapeHtml(seriesLatestLabel(series))}</strong><small class="${trendClass}">${escapeHtml(trend)}</small></span><span class="result-exercise-chevron" aria-hidden="true">→</span></button>`;
  }).join('');
}

async function renderResults(exerciseId = null) {
  await loadProgressExercises();
  $('#results-list-panel').hidden = Boolean(exerciseId);
  $('#result-detail').hidden = !exerciseId;
  if (!exerciseId) {
    state.selectedProgressExercise = null;
    state.selectedSeriesKey = null;
    renderResultsList($('#results-search').value);
    return;
  }
  const exercise = state.progressExercises.find(item => item.id === exerciseId);
  if (!exercise) { navigateResults(); return; }
  state.selectedProgressExercise = exercise;
  const series = exerciseSeries(exercise);
  if (!series.some(item => item.key === state.selectedSeriesKey)) state.selectedSeriesKey = defaultSeries(exercise).key;
  $('#result-exercise-name').textContent = exercise.name;
  $('#result-rep-filters').innerHTML = series.map(item => `<button type="button" data-series-key="${escapeHtml(item.key)}" class="${item.key === state.selectedSeriesKey ? 'is-active' : ''}${item.kind === 'technique' ? ' is-technique' : ''}" aria-pressed="${item.key === state.selectedSeriesKey}">${escapeHtml(item.label)}</button>`).join('');
  renderProgressTrack();
}

function renderProgressTrack() {
  const series = exerciseSeries(state.selectedProgressExercise).find(item => item.key === state.selectedSeriesKey);
  const points = series?.points || [];
  state.progressPoints = points.map(point => ({ ...point, kind: series?.kind, reps: series?.reps }));
  const latest = points.at(-1), delta = progressDelta(points);
  const subject = $('#result-chart-subject');
  if (subject) subject.textContent = series ? (series.kind === 'reps' ? 'Stesse ripetizioni' : `Tonnellaggio · ${series.label}`) : '';
  $('#result-latest').innerHTML = latest ? `<span>Ultimo risultato</span><strong>${escapeHtml(seriesLatestLabel(series, latest))}</strong><small>${delta === null ? 'Primo dato' : delta === 0 ? 'Stabile rispetto alla volta precedente' : `${signedKg(delta)} rispetto alla volta precedente`}</small>` : '';
  const chart = $('#result-chart');
  if (!points.length) { chart.innerHTML = '<p class="chart-empty">Nessun dato disponibile.</p>'; return; }
  const values = points.map(point => point.value), min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const coordinates = points.map((point, index) => ({ x: points.length === 1 ? 50 : 7 + (index / (points.length - 1)) * 86, y: points.length === 1 ? 50 : 80 - ((point.value - min) / range) * 60 }));
  const line = points.length > 1 ? `<polyline points="${coordinates.map(point => `${point.x},${point.y}`).join(' ')}"/>` : '';
  const axisLabels = series.kind === 'reps' ? `<span>${max} kg</span><span>${min} kg</span>` : `<span>${escapeHtml(formatKg(max))}</span><span>${escapeHtml(formatKg(min))}</span>`;
  const pointAria = point => series.kind === 'reps' ? `${point.value} kg per ${series.reps} ripetizioni` : `${formatKg(point.value)} di tonnellaggio`;
  const pointButtons = coordinates.map((point, index) => `<button class="progress-point" type="button" data-progress-index="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="${escapeHtml(pointAria(points[index]))}, ${escapeHtml(compactDate.format(dateFromKey(points[index].date)))}"><span></span></button>`).join('');
  chart.innerHTML = `<div class="result-chart-axis" aria-hidden="true">${axisLabels}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${line}</svg>${pointButtons}<div class="progress-point-popover" id="progress-point-popover" hidden></div>`;
  const caption = series.kind === 'reps'
    ? (points.length < 2 ? `Serve un’altra sessione da ${series.reps} ripetizioni per vedere l’andamento.` : `Ogni punto è il carico più alto eseguito a ${series.reps} ripetizioni in quella sessione.`)
    : (points.length < 2 ? `Serve un’altra sessione in ${series.label} per vedere l’andamento.` : `Ogni punto è il tonnellaggio totale della tecnica ${series.label} in quella sessione.`);
  $('#result-chart-caption').textContent = caption;
  $('#result-history-count').textContent = `${points.length} ${points.length === 1 ? 'sessione' : 'sessioni'}`;
  $('#result-history').innerHTML = [...points].reverse().map(point => {
    const valueLabel = series.kind === 'reps' ? `${point.value} kg × ${series.reps}` : `${formatKg(point.value)} di tonnellaggio`;
    return `<article><time datetime="${point.date}">${escapeHtml(compactDate.format(dateFromKey(point.date)))}</time><div><strong>${escapeHtml(valueLabel)}</strong><span>${escapeHtml(point.sessionName || 'Allenamento')}</span>${point.note ? `<p>${escapeHtml(point.note)}</p>` : ''}</div></article>`;
  }).join('');
}

function showProgressPoint(button) {
  const point = state.progressPoints[Number(button.dataset.progressIndex)], popover = $('#progress-point-popover');
  if (!point || !popover) return;
  $$('.progress-point').forEach(item => item.classList.toggle('is-selected', item === button));
  const valueLabel = point.kind === 'reps' ? `${point.value} kg × ${point.reps}` : `${formatKg(point.value)} di tonnellaggio`;
  popover.innerHTML = `<strong>${escapeHtml(valueLabel)}</strong><span>${escapeHtml(fullDate.format(dateFromKey(point.date)))}</span>${point.note ? `<small>${escapeHtml(point.note)}</small>` : ''}`;
  const y = Number.parseFloat(button.style.top);
  popover.style.top = `${y < 45 ? Math.min(88, y + 12) : Math.max(8, y - 8)}%`;
  popover.classList.toggle('is-above', y >= 45);
  popover.hidden = false;
}

async function renderProfile() {
  const profile = await getSetting('profile');
  $('#profile-title').textContent = profile?.name ? `${profile.name}.` : 'Profilo.';
  updateThemeControls(document.documentElement.dataset.theme === 'alternative' ? 'alternative' : 'original');
  const demoCard = $('#demo-data-card');
  const demoButton = $('#load-demo-data');
  if (demoCard && demoButton) {
    const demoImported = await getSetting('demoDataImportedV3');
    demoCard.classList.toggle('is-loaded', Boolean(demoImported));
    demoButton.disabled = Boolean(demoImported);
    demoButton.textContent = demoImported ? 'Demo estesa caricata' : 'Carica demo estesa';
  }
  $('#checkin-date').value ||= localDateKey();
  state.allWeightEntries = await getCheckins();
  state.allEnergyEntries = (await getRecentSessions(1000)).filter(session => session.feeling).reverse();
  renderWeightChart();
  renderEnergyChart();
  state.maxRecords = await getMaxRecords();
  const names = ['Panca piana', 'Squat HB', 'Squat LB', 'Stacco regular', 'Stacco Sumo'];
  const latestMaxes = names.map(name => [...state.maxRecords].reverse().find(record => record.exerciseName === name)).filter(Boolean);
  $('#profile-max-list').innerHTML = latestMaxes.length ? latestMaxes.map(record => `<article><div><strong>${escapeHtml(record.exerciseName)}</strong><small>${compactDate.format(new Date(record.recordedAt))}</small></div><b>${record.weight} kg</b></article>`).join('') : '<p class="empty-list">Non hai ancora registrato massimali.</p>';
  await renderBackupState();
}

async function backupState() {
  const [sessions, checkins, lastBackup] = await Promise.all([getAllSessions(), getCheckins(), getSetting('lastBackup')]);
  const hasData = sessions.length > 0 || checkins.length > 0;
  const hasEnoughSessionsForReminder = sessions.length >= BACKUP_REMINDER_MIN_SESSIONS;
  const lastBackupTime = lastBackup?.createdAt ? new Date(lastBackup.createdAt).getTime() : 0;
  const elapsedDays = lastBackupTime ? (Date.now() - lastBackupTime) / 86400000 : Infinity;
  const newSessions = Math.max(0, sessions.length - Number(lastBackup?.sessionCount || 0));
  const newCheckins = Math.max(0, checkins.length - Number(lastBackup?.checkinCount || 0));
  const due = hasEnoughSessionsForReminder && (!lastBackupTime || elapsedDays >= BACKUP_REMINDER_DAYS);
  return { sessions, checkins, lastBackup, hasData, hasEnoughSessionsForReminder, due, newSessions, newCheckins };
}

async function renderBackupState() {
  const info = await backupState();
  const status = $('#backup-status');
  const mark = $('#backup-status-mark');
  if (status) {
    status.classList.toggle('is-current', info.hasData && !info.due);
    if (!info.hasData) status.innerHTML = '<strong>Nessun backup necessario</strong><span>Quando inizierai a registrare dati, ti ricorderemo di salvarne una copia.</span>';
    else if (!info.lastBackup?.createdAt) status.innerHTML = '<strong>Nessuna copia ancora salvata</strong><span>Il diario contiene dati che esistono soltanto su questo dispositivo.</span>';
    else status.innerHTML = `<strong>Ultima copia: ${escapeHtml(backupDateLabel.format(new Date(info.lastBackup.createdAt)))}</strong><span>${info.due ? 'Ci sono nuovi dati da mettere al sicuro.' : 'La copia di riserva è aggiornata.'}</span>`;
  }
  if (mark) mark.textContent = info.hasData && !info.due ? '✓' : '↓';
  const reminder = $('#backup-reminder');
  if (reminder) {
    reminder.hidden = !info.due;
    const copy = $('#backup-reminder-copy');
    if (copy) copy.textContent = info.lastBackup?.createdAt ? 'È passata circa una settimana dall’ultima copia.' : 'Hai almeno 5 sessioni: è un buon momento per salvare una copia.';
  }
  return info;
}

function backupFilename(exportedAt) {
  const date = new Date(exportedAt);
  const day = localDateKey(date);
  const time = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
  return `gym-diary-backup-${day}_${time}.json`;
}

async function downloadBackup() {
  const backup = await createBackup();
  const contents = JSON.stringify(backup, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename(backup.exportedAt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const sessionCount = backup.data.sessions.length, checkinCount = backup.data.checkins.length;
  await saveSetting('lastBackup', { createdAt: backup.exportedAt, sessionCount, checkinCount });
  await renderBackupState();
  showToast('Copia di riserva creata');
}

async function importBackupFile(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_FILE_SIZE) throw new Error('Il file è troppo grande per essere un backup di Gym Diary.');
  let backup;
  try { backup = JSON.parse(await file.text()); }
  catch (error) { throw new Error('Il file scelto non contiene un JSON valido.'); }
  const sessionCount = backup?.data?.sessions?.length || 0;
  const checkinCount = backup?.data?.checkins?.length || 0;
  const description = `${sessionCount} ${sessionCount === 1 ? 'sessione' : 'sessioni'}${checkinCount ? ` e ${checkinCount} ${checkinCount === 1 ? 'misurazione' : 'misurazioni'}` : ''}`;
  if (!confirm(`Ripristinare ${description} da questa copia?\n\nI dati presenti ora nell’app verranno sostituiti.`)) return;
  await restoreBackup(backup);
  await saveSetting('lastBackup', { createdAt: backup.exportedAt || new Date().toISOString(), sessionCount, checkinCount });
  showToast('Diario ripristinato');
  setTimeout(() => location.reload(), 500);
}

function entriesInPeriod(entries, period) {
  const today = dateFromKey(localDateKey());
  if (period === 'all') return entries.filter(entry => dateFromKey(entry.date) <= today);
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - Number(period));
  return entries.filter(entry => { const date = dateFromKey(entry.date); return date >= cutoff && date <= today; });
}

function renderWeightChart() {
  const entries = entriesInPeriod(state.allWeightEntries, state.weightPeriod);
  state.weightEntries = entries;
  const latest = entries.at(-1), first = entries[0];
  $('#weight-summary').innerHTML = latest ? `<span>Ultimo peso nel periodo</span><strong>${latest.weight} kg</strong><small>${compactDate.format(dateFromKey(latest.date))}${entries.length > 1 ? ` · ${(latest.weight - first.weight) > 0 ? '+' : ''}${(latest.weight - first.weight).toFixed(1)} kg nel periodo` : ''}</small>` : '<span>Peso</span><strong>Nessun dato</strong><small>Nessuna misurazione in questo periodo.</small>';
  const chart = $('#weight-chart');
  if (!entries.length) { chart.innerHTML = '<p class="chart-empty">Nessun dato in questo periodo.</p>'; return; }
  const weights = entries.map(entry => entry.weight), min = Math.min(...weights), max = Math.max(...weights), range = max - min || 1;
  const coordinates = entries.map((entry, index) => ({ x: entries.length === 1 ? 50 : 5 + (index / (entries.length - 1)) * 90, y: entries.length === 1 ? 50 : 82 - ((entry.weight - min) / range) * 64 }));
  const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
  const buttons = coordinates.map((point, index) => `<button class="weight-point" type="button" data-weight-index="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="${entries[index].weight} kg, ${escapeHtml(compactDate.format(dateFromKey(entries[index].date)))}"><span></span></button>`).join('');
  chart.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}"/></svg>${buttons}<div class="weight-point-popover" id="weight-point-popover" hidden></div>`;
}

function renderEnergyChart() {
  const sessions = entriesInPeriod(state.allEnergyEntries, state.energyPeriod);
  state.energyEntries = sessions;
  const chart = $('#energy-trend');
  if (!sessions.length) { chart.innerHTML = '<p class="chart-empty">Nessuna sensazione registrata in questo periodo.</p>'; return; }
  const energyLabel = value => value <= 2 ? 'Energie basse' : value === 3 ? 'Energie nella media' : 'Energie alte';
  const coordinates = sessions.map((session, index) => ({ x: sessions.length === 1 ? 50 : 7 + (index / (sessions.length - 1)) * 86, y: 88 - ((session.feeling - 1) / 4) * 72 }));
  const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
  const points = coordinates.map((point, index) => `<button class="energy-point energy-${sessions[index].feeling}" type="button" data-energy-index="${index}" style="left:${point.x}%;top:${point.y}%" aria-label="${energyLabel(sessions[index].feeling)}, ${sessions[index].feeling} su 5, ${escapeHtml(compactDate.format(dateFromKey(sessions[index].date)))}"><span></span></button>`).join('');
  const recent = sessions.slice(-Math.min(3, sessions.length));
  const average = recent.reduce((sum, session) => sum + session.feeling, 0) / recent.length;
  chart.innerHTML = `<div class="energy-chart-summary"><span>${recent.length === 1 ? 'Ultima sessione' : `Ultime ${recent.length} sessioni`}</span><strong>${average.toFixed(1).replace('.', ',')}/5</strong><small>${energyLabel(Math.round(average))}</small></div><div class="energy-chart"><div class="energy-axis" aria-hidden="true"><span>5 · Alte</span><span>3 · Nella media</span><span>1 · Basse</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}"/></svg>${points}<div class="energy-point-popover" id="energy-point-popover" hidden></div></div><p class="energy-caption">Ogni punto racconta le energie percepite in una sessione, non la prestazione.</p>`;
}

function showWeightPoint(button) {
  const entry = state.weightEntries[Number(button.dataset.weightIndex)];
  const popover = $('#weight-point-popover'); if (!entry || !popover) return;
  $$('.weight-point').forEach(point => point.classList.toggle('is-selected', point === button));
  popover.innerHTML = `<strong>${entry.weight} kg</strong><span>${escapeHtml(fullDate.format(dateFromKey(entry.date)))}</span>${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ''}`;
  const x = Number.parseFloat(button.style.left); const y = Number.parseFloat(button.style.top);
  popover.style.left = `${Math.min(78, Math.max(22, x))}%`;
  popover.style.top = `${y < 45 ? Math.min(88, y + 12) : Math.max(8, y - 8)}%`;
  popover.classList.toggle('is-above', y >= 45); popover.hidden = false;
}

function showEnergyPoint(button) {
  const session = state.energyEntries[Number(button.dataset.energyIndex)];
  const popover = $('#energy-point-popover'); if (!session || !popover) return;
  const label = session.feeling <= 2 ? 'Energie basse' : session.feeling === 3 ? 'Energie nella media' : 'Energie alte';
  $$('.energy-point').forEach(point => point.classList.toggle('is-selected', point === button));
  popover.innerHTML = `<strong>${label} · ${session.feeling}/5</strong><span>${escapeHtml(session.name)} · ${escapeHtml(fullDate.format(dateFromKey(session.date)))}</span>${session.sessionNote ? `<small>${escapeHtml(session.sessionNote)}</small>` : ''}`;
  const x = Number.parseFloat(button.style.left); const y = Number.parseFloat(button.style.top);
  popover.style.left = `${Math.min(76, Math.max(24, x))}%`;
  popover.style.top = `${y < 45 ? Math.min(88, y + 12) : Math.max(8, y - 8)}%`;
  popover.classList.toggle('is-above', y >= 45); popover.hidden = false;
}

async function renderHome() {
  await Promise.all([renderCalendar(), renderRecentSessions(), renderBackupState()]);
}

async function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const sessions = await getSessionsByMonth(year, month);
  const sessionsByDate = new Map(sessions.map(session => [session.date, session]));
  $('#calendar-title').textContent = monthLabel.format(state.calendarDate);
  $('#month-count').textContent = `${sessions.length} ${sessions.length === 1 ? 'allenamento' : 'allenamenti'}`;
  const firstDay = new Date(year, month, 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset, 12);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const today = localDateKey();
  const cells = [];
  for (let index = 0; index < cellCount; index += 1) {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + index);
    const key = localDateKey(date);
    const outside = date.getMonth() !== month;
    const future = key > today;
    const hasSession = sessionsByDate.has(key);
    const classes = [outside ? 'outside' : '', future ? 'future' : '', key === today ? 'today' : '', hasSession ? 'has-session' : ''].filter(Boolean).join(' ');
    if (future) cells.push(`<span class="${classes}" aria-label="${escapeHtml(fullDate.format(date))}, data futura">${date.getDate()}</span>`);
    else {
      const session = sessionsByDate.get(key);
      const tooltipMeta = session ? `${session.exercises.length} ${session.exercises.length === 1 ? 'esercizio' : 'esercizi'}${session.feeling ? ` · Sensazione ${session.feeling}/5` : ''}` : '';
      const tooltipData = session ? ` data-tooltip-title="${escapeHtml(session.name)}" data-tooltip-exercises="${escapeHtml(session.exercises.map(exercise => exercise.name).join(' · '))}" data-tooltip-meta="${escapeHtml(tooltipMeta)}"` : '';
      const feeling = session?.feeling ? `<span class="calendar-feeling" aria-hidden="true">${session.feeling}/5</span>` : '';
      cells.push(`<button class="${classes}" type="button" data-open-date="${key}"${tooltipData} aria-label="${escapeHtml(fullDate.format(date))}${hasSession ? `, ${escapeHtml(session.name)}${session.feeling ? `, sensazione ${session.feeling} su 5` : ''}` : ', nessun allenamento'}"><span class="calendar-day-number">${date.getDate()}</span>${feeling}</button>`);
    }
  }
  $('#calendar-grid').innerHTML = cells.join('');
}

function showCalendarTooltip(button) {
  if (!button?.dataset.tooltipTitle) return;
  const tooltip = $('#calendar-tooltip');
  tooltip.innerHTML = `<strong>${escapeHtml(button.dataset.tooltipTitle)}</strong><span>${escapeHtml(button.dataset.tooltipExercises)}</span><em>${escapeHtml(button.dataset.tooltipMeta)}</em>`;
  tooltip.setAttribute('aria-hidden', 'false'); tooltip.classList.add('is-visible');
  const dayRect = button.getBoundingClientRect(), tipRect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tipRect.width - 10, Math.max(10, dayRect.left + dayRect.width / 2 - tipRect.width / 2));
  const above = dayRect.top - tipRect.height - 10;
  tooltip.style.left = `${left}px`; tooltip.style.top = `${above > 8 ? above : dayRect.bottom + 10}px`;
}
function hideCalendarTooltip() { const tooltip = $('#calendar-tooltip'); tooltip.classList.remove('is-visible'); tooltip.setAttribute('aria-hidden', 'true'); }

async function renderRecentSessions() {
  const sessions = await getRecentSessions(1000);
  const visibleCount = Math.min(state.visibleSessionCount, sessions.length);
  const visibleSessions = sessions.slice(0, visibleCount);
  const remaining = Math.max(0, sessions.length - visibleCount);
  const allSessionsVisible = sessions.length > 5 && remaining === 0;
  $('#recent-count').textContent = sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'sessione' : 'sessioni'}` : '';
  if (!sessions.length) {
    $('#session-list').innerHTML = '<p class="empty-list">Il diario è vuoto. Scegli un giorno dal calendario e scrivi il primo esercizio.</p>';
    return;
  }
  const moreSessions = remaining || allSessionsVisible ? `<div class="session-list-more"><span>${allSessionsVisible ? `Tutte le ${sessions.length} sessioni registrate` : `Altre ${remaining} sessioni registrate`}</span><button class="text-button" id="toggle-session-list" type="button">${allSessionsVisible ? 'Mostra meno' : 'Vedi di più'}</button></div>` : '';
  $('#session-list').innerHTML = visibleSessions.map(sessionRowHtml).join('') + moreSessions;
}

function sessionRowHtml(session) {
  const notes = session.exercises.map(exercise => exercise.note).filter(Boolean).join(' · ');
  const notePreview = notes.length > 30 ? `${notes.slice(0, 30)}…` : notes;
  return `<article class="session-card" tabindex="0" role="link" data-open-date="${session.date}"><div class="date-tile"><span>${compactDate.format(dateFromKey(session.date)).replace('.', '')}</span></div><div class="session-main"><h3>${escapeHtml(session.name)}</h3><p>${session.exercises.map(exercise => escapeHtml(exercise.name)).join(' · ')}</p>${notePreview ? `<span class="session-notes">“${escapeHtml(notePreview)}”</span>` : ''}</div><span class="session-chevron" aria-hidden="true">›</span></article>`;
}

async function openDay(date) {
  if (!validDateKey(date) || date > localDateKey()) {
    navigateHome();
    return;
  }
  state.selectedDate = date;
  state.session = await getSessionByDate(date) || null;
  showView('giorno');
  renderDayHeader();
  resetExerciseForm();
  await renderLoggedExercises();
  $('#giorno').classList.toggle('title-step', !state.session);
}

function renderDayHeader() {
  const date = dateFromKey(state.selectedDate);
  $('#day-date-label').textContent = fullDate.format(date);
  $('#session-name').value = state.session?.name || '';
  $('#day-session-title').textContent = state.session?.name || $('#session-name').value;
  $('.day-context-copy').classList.toggle('has-title', Boolean(state.session?.name || $('#session-name').value));
  $('#session-name').readOnly = Boolean(state.session);
  $('#session-name-field small').textContent = state.session ? 'Nome già salvato per questa pagina.' : 'Obbligatorio solo quando salvi il primo esercizio.';
  updateCompleteButton('giorno');
}

function continueToExerciseForm() {
  const name = $('#session-name').value.trim();
  if (!name) throw new Error('Dai un nome alla sessione per continuare.');
  $('#day-session-title').textContent = name;
  $('.day-context-copy').classList.add('has-title');
  $('#giorno').classList.remove('title-step');
  $('#exercise-search').focus();
}

function resetExerciseForm() {
  state.selectedExercise = null;
  state.lastExposure = null;
  state.exerciseHistory = [];
  state.technique = 'normal';
  state.restWeight = null;
  state.setRows = [{ id: createId(), weight: null, reps: null }];
  $('#exercise-search').value = '';
  $('#exercise-search').setAttribute('aria-expanded', 'false');
  $('#exercise-suggestions').hidden = true;
  $('#exercise-suggestions').innerHTML = '';
  $('#selected-exercise').hidden = true;
  $('#last-exposure').hidden = true;
  $('#exercise-note').value = '';
  updateTechniquePicker();
  renderSetsEditor();
}

function updateTechniquePicker() {
  $$('#technique-picker [data-technique]').forEach(button => {
    const active = button.dataset.technique === state.technique;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function selectTechnique(technique) {
  if (state.technique === technique) return;
  readSetRows();
  state.technique = technique;
  state.setRows = state.setRows.length ? state.setRows.map(row => ({ id: row.id || createId(), weight: row.weight ?? null, reps: row.reps ?? null })) : [{ id: createId(), weight: null, reps: null }];
  updateTechniquePicker();
  renderSetsEditor();
}

function classicRowHtml(set, index) {
  return `<div class="set-row editable" data-set-index="${index}"><strong>${index + 1}</strong><label><span class="sr-only">Ripetizioni serie ${index + 1}</span><input data-reps inputmode="numeric" value="${set.reps ?? ''}" placeholder="—"></label><label class="weight-field"><span class="sr-only">Peso serie ${index + 1}</span><input data-weight inputmode="decimal" value="${set.weight ?? ''}" placeholder="—"><small data-rep-best></small></label><button type="button" data-remove-set aria-label="Rimuovi serie ${index + 1}">×</button></div>`;
}

function restPauseRowHtml(set, index) {
  return `<div class="set-row set-row-rp editable" data-set-index="${index}"><strong>${index + 1}</strong><label><span class="sr-only">Ripetizioni mini-serie ${index + 1}</span><input data-reps inputmode="numeric" value="${set.reps ?? ''}" placeholder="—"></label><button type="button" data-remove-set aria-label="Rimuovi mini-serie ${index + 1}">×</button></div>`;
}

function strippingRowHtml(set, index) {
  return `<div class="set-row editable" data-set-index="${index}"><strong>${index + 1}</strong><label><span class="sr-only">Ripetizioni gradino ${index + 1}</span><input data-reps inputmode="numeric" value="${set.reps ?? ''}" placeholder="—"></label><label class="weight-field"><span class="sr-only">Carico gradino ${index + 1}</span><input data-weight inputmode="decimal" value="${set.weight ?? ''}" placeholder="—"></label><button type="button" data-remove-set aria-label="Rimuovi gradino ${index + 1}">×</button></div>`;
}

function renderSetsEditor() {
  const editor = $('#sets-editor');
  if (state.technique === 'rest-pause') {
    editor.innerHTML = `<div class="technique-lead"><span>Rest-pause</span><p>Stesso carico, mini-serie separate da un breve recupero.</p></div>
      <label class="rp-weight-field">Carico<div class="unit-input"><input id="rest-weight" inputmode="decimal" value="${state.restWeight ?? ''}" placeholder="Es. 60"><span>kg</span></div></label>
      <div class="set-row set-header set-header-rp"><span>Mini-serie</span><span>Rip.</span><span></span></div>
      <div id="set-rows">${state.setRows.map(restPauseRowHtml).join('')}</div>
      <button class="add-set" id="add-set" type="button">＋ Aggiungi mini-serie</button>
      <div class="tonnage-preview" id="tonnage-preview"></div>`;
  } else if (state.technique === 'stripping') {
    editor.innerHTML = `<div class="technique-lead"><span>Stripping</span><p>Cali di carico in successione, senza recupero tra i gradini.</p></div>
      <div class="set-row set-header"><span>Gradino</span><span>Rip.</span><span>Kg</span><span></span></div>
      <div id="set-rows">${state.setRows.map(strippingRowHtml).join('')}</div>
      <button class="add-set" id="add-set" type="button">＋ Aggiungi gradino</button>
      <div class="tonnage-preview" id="tonnage-preview"></div>`;
  } else {
    editor.innerHTML = `<div class="set-row set-header"><span>Serie</span><span>Rip.</span><span>Kg</span><span></span></div>
      <div id="set-rows">${state.setRows.map(classicRowHtml).join('')}</div>
      <button class="add-set" id="add-set" type="button">＋ Aggiungi serie</button>`;
  }
  if (state.technique === 'normal') $$('#set-rows [data-set-index]').forEach(updateRowRecord);
  else updateTonnagePreview();
}

function techniqueBestTonnage() {
  return state.exerciseHistory
    .filter(item => exposureTechnique(item.exposure) === state.technique)
    .map(item => exposureTonnage(item.exposure))
    .reduce((max, tonnage) => Math.max(max, tonnage), 0) || null;
}

function updateTonnagePreview() {
  const preview = $('#tonnage-preview');
  if (!preview) return;
  const sharedWeight = state.technique === 'rest-pause' ? nullableNumber($('#rest-weight')?.value) : null;
  let tonnage = 0, valid = 0;
  $$('#set-rows [data-set-index]').forEach(row => {
    const reps = nullableNumber(row.querySelector('[data-reps]')?.value);
    const weight = state.technique === 'rest-pause' ? sharedWeight : nullableNumber(row.querySelector('[data-weight]')?.value);
    if (weight > 0 && reps > 0) { tonnage += weight * reps; valid += 1; }
  });
  if (!valid) { preview.innerHTML = '<span>Tonnellaggio totale</span><strong>—</strong>'; return; }
  const best = techniqueBestTonnage();
  const bestHtml = best ? `<small>${tonnage > best ? `🏆 Nuovo record (prec. ${formatKg(best)})` : `Record: ${formatKg(best)}`}</small>` : '';
  preview.innerHTML = `<span>Tonnellaggio totale</span><strong>${formatKg(tonnage)}</strong>${bestHtml}`;
}

function personalBests(history = state.exerciseHistory) {
  const bests = {};
  history.flatMap(item => item.exposure.sets || []).forEach(set => { if (Number.isInteger(set.reps) && set.reps >= 3 && set.reps <= 12 && set.weight > (bests[set.reps]?.weight || 0)) bests[set.reps] = { weight: set.weight, date: history.find(item => item.exposure.sets?.includes(set))?.session.date }; });
  return bests;
}
function updateRowRecord(row) { const label = row.querySelector('[data-rep-best]'); if (!label) return; const reps = nullableNumber(row.querySelector('[data-reps]').value), best = personalBests()[reps]; label.textContent = best ? `🏆 ${best.weight} kg` : ''; }

function readSetRows() {
  if (state.technique === 'rest-pause') state.restWeight = nullableNumber($('#rest-weight')?.value);
  state.setRows = $$('#set-rows [data-set-index]').map(row => {
    const previous = state.setRows[Number(row.dataset.setIndex)];
    const weightInput = row.querySelector('[data-weight]');
    return { id: previous?.id || createId(), weight: weightInput ? nullableNumber(weightInput.value) : (previous?.weight ?? null), reps: nullableNumber(row.querySelector('[data-reps]').value) };
  });
}

async function updateExerciseSuggestions(query) {
  const token = ++state.searchToken;
  state.selectedExercise = null;
  $('#selected-exercise').hidden = true;
  $('#last-exposure').hidden = true;
  const cleanQuery = query.trim();
  if (!cleanQuery) { closeSuggestions(); return; }
  const results = await searchExercises(cleanQuery);
  if (token !== state.searchToken) return;
  const exact = results.some(exercise => exercise.name.localeCompare(cleanQuery, 'it', { sensitivity: 'accent' }) === 0);
  $('#exercise-suggestions').innerHTML = results.map(suggestionHtml).join('') + (!exact ? `<button class="suggestion add-new" type="button" data-add-new="${escapeHtml(cleanQuery)}"><span class="suggestion-placeholder">＋</span><span>Aggiungi “${escapeHtml(cleanQuery)}” come nuovo esercizio</span></button>` : '');
  $('#exercise-suggestions').hidden = false;
  $('#exercise-search').setAttribute('aria-expanded', 'true');
}

function suggestionHtml(exercise) {
  const image = exercise.imageUrl ? `<img src="${escapeHtml(exercise.imageUrl)}" alt="" loading="lazy">` : '<span class="suggestion-placeholder">—</span>';
  return `<button class="suggestion" type="button" role="option" data-exercise-id="${exercise.id}" data-exercise-name="${escapeHtml(exercise.name)}" data-exercise-image="${escapeHtml(exercise.imageUrl || '')}">${image}<span>${escapeHtml(exercise.name)}</span></button>`;
}

function closeSuggestions() {
  $('#exercise-suggestions').hidden = true;
  $('#exercise-search').setAttribute('aria-expanded', 'false');
}

async function chooseExercise(exercise) {
  state.selectedExercise = exercise;
  $('#exercise-search').value = exercise.name;
  closeSuggestions();
  const image = exercise.imageUrl ? `<img src="${escapeHtml(exercise.imageUrl)}" alt="" loading="lazy">` : '<span class="suggestion-placeholder">—</span>';
  $('#selected-exercise').innerHTML = `${image}<div><strong>${escapeHtml(exercise.name)}</strong><span>${exercise.imageUrl ? 'Dal catalogo esercizi' : 'Esercizio creato da te'}</span></div>`;
  $('#selected-exercise').hidden = false;
  state.exerciseHistory = await getExerciseHistory(exercise.id);
  await renderLastExposure(exercise.id); renderSetsEditor();
}

async function renderLastExposure(exerciseId) {
  const last = await getLastExposure(exerciseId, state.selectedDate);
  state.lastExposure = last || null;
  const panel = $('#last-exposure');
  panel.hidden = false;
  const maxRecord = [...state.maxRecords].reverse().find(record => record.exerciseName === state.selectedExercise?.name);
  const historicalSets = state.exerciseHistory.flatMap(item => item.exposure.sets || []).filter(set => set.weight > 0 && Number.isInteger(set.reps) && set.reps >= 3 && set.reps <= 12);
  const estimatedOneRm = historicalSets.length ? Math.max(...historicalSets.map(set => set.weight * (1 + set.reps / 30))) : null;
  const rmSource = maxRecord?.weight || estimatedOneRm;
  const top = last ? topSet(last.exposure.sets) : null;
  const historyHtml = last && top ? `<div class="reference-history"><span>Ultima volta · ${escapeHtml(compactDate.format(dateFromKey(last.session.date)))}</span><strong>${escapeHtml(formatSet(top))}</strong><small>Top set</small></div>` : '<div class="reference-history reference-empty"><span>Ultima volta</span><strong>—</strong><small>Nessuno storico</small></div>';
  const rmHtml = rmSource ? [5, 8, 12].map(reps => `<div class="rm-chip"><span>${reps}RM</span><strong>${Math.round((rmSource / (1 + reps / 30)) * 2) / 2} kg</strong></div>`).join('') : '';
  panel.innerHTML = `<div class="reference-title"><span>Riferimenti</span></div><div class="reference-content">${historyHtml}<div class="reference-rm"><span class="rm-section-label">Stime</span>${rmHtml}</div></div>`;
}

function topSet(sets = []) {
  const useful = sets.filter(set => set.weight !== null && set.reps !== null);
  if (!useful.length) return null;
  return useful.reduce((top, set) => set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps) ? set : top);
}

function bestSet(sets = []) {
  const useful = sets.filter(set => set.weight !== null || set.reps !== null);
  if (!useful.length) return null;
  return useful.reduce((best, set) => performanceScore(set) > performanceScore(best) ? set : best);
}

function performanceScore(set) {
  if (!set) return -1;
  if (set.weight !== null && set.reps !== null) return set.weight * set.reps;
  return set.weight ?? set.reps ?? -1;
}

function formatSet(set) {
  if (!set) return 'Dati non sufficienti';
  if (set.weight !== null && set.reps !== null) return `${set.weight} kg × ${set.reps}`;
  if (set.weight !== null) return `${set.weight} kg · ripetizioni non registrate`;
  return `Peso non registrato · ${set.reps} rip.`;
}

function compareExposures(currentSets, previousSets) {
  const current = bestSet(currentSets); const previous = bestSet(previousSets);
  if (!current || !previous || current.weight === null || current.reps === null || previous.weight === null || previous.reps === null) return { result: 'insufficient', text: 'Dati insufficienti per confrontare le due esposizioni.' };
  const currentScore = performanceScore(current); const previousScore = performanceScore(previous);
  if (currentScore > previousScore) return { result: 'better', text: `Meglio dell’ultima volta (${formatSet(current)} vs ${formatSet(previous)}).` };
  if (currentScore < previousScore) return { result: 'worse', text: `Sotto l’ultima volta (${formatSet(current)} vs ${formatSet(previous)}).` };
  return { result: 'stable', text: `Stabile rispetto all’ultima volta (${formatSet(current)}).` };
}

async function saveCurrentExercise() {
  if (!state.selectedExercise) throw new Error('Scegli un esercizio dai risultati oppure aggiungilo come nuovo.');
  const sessionName = $('#session-name').value.trim();
  if (!state.session && !sessionName) throw new Error('Dai un nome alla sessione prima di salvare il primo esercizio.');
  readSetRows();
  const technique = state.technique;
  const builtSets = technique === 'rest-pause'
    ? state.setRows.map(row => ({ weight: state.restWeight, reps: row.reps }))
    : state.setRows.map(row => ({ weight: row.weight, reps: row.reps }));
  const previousBests = personalBests();
  const previousBestTonnage = techniqueBestTonnage() || 0;
  const savedExerciseName = state.selectedExercise.name;
  state.session = await saveExerciseToSession({
    date: state.selectedDate,
    sessionName: state.session?.name || sessionName,
    exercise: { exerciseId: state.selectedExercise.id, name: state.selectedExercise.name, imageUrl: state.selectedExercise.imageUrl, technique: technique === 'normal' ? null : technique, sets: builtSets, note: $('#exercise-note').value }
  });
  renderDayHeader();
  resetExerciseForm();
  await renderLoggedExercises();
  if (technique === 'normal') {
    const newRecords = builtSets.filter(set => Number.isInteger(set.reps) && set.reps >= 3 && set.reps <= 12 && set.weight > (previousBests[set.reps]?.weight || 0));
    if (newRecords.length) showPrCelebration(savedExerciseName, newRecords, previousBests);
  } else {
    const tonnage = builtSets.reduce((sum, set) => sum + (set.weight > 0 && set.reps > 0 ? set.weight * set.reps : 0), 0);
    if (tonnage > 0 && tonnage > previousBestTonnage) showTonnagePr(savedExerciseName, technique, tonnage, previousBestTonnage);
  }
  showToast('Esercizio aggiunto al diario');
}

function showTonnagePr(exerciseName, technique, tonnage, previousBest) {
  $('#pr-title').textContent = exerciseName;
  $('#pr-results').innerHTML = `<p><strong>${escapeHtml(formatKg(tonnage))} di tonnellaggio</strong><small>${previousBest ? `Precedente ${escapeHtml(techniqueLabel(technique))}: ${escapeHtml(formatKg(previousBest))}` : `Primo record in ${escapeHtml(techniqueLabel(technique))}`}</small></p>`;
  $('#pr-celebration').hidden = false;
}

function openSessionCompleteModal() {
  state.selectedFeeling = state.session?.feeling || null;
  $$('#session-feeling-scale [data-feeling]').forEach(button => button.classList.toggle('is-selected', Number(button.dataset.feeling) === state.selectedFeeling));
  $('#session-complete-note').value = state.session?.sessionNote || '';
  $('#session-complete-modal').hidden = false;
  document.body.classList.add('modal-open');
}
function closeSessionCompleteModal() { $('#session-complete-modal').hidden = true; document.body.classList.remove('modal-open'); }

function showPrCelebration(exerciseName, records, previous) { const best = Object.values(records.reduce((map, set) => { if (!map[set.reps] || set.weight > map[set.reps].weight) map[set.reps] = set; return map; }, {})); $('#pr-title').textContent = exerciseName; $('#pr-results').innerHTML = best.map(set => `<p><strong>${set.weight} kg × ${set.reps}</strong>${previous[set.reps] ? `<small>Precedente: ${previous[set.reps].weight} kg</small>` : '<small>Primo record su queste ripetizioni</small>'}</p>`).join(''); $('#pr-celebration').hidden = false; }

function loggedSetsHtml(exercise) {
  const technique = exposureTechnique(exercise);
  const sets = exercise.sets || [];
  if (technique === 'rest-pause') {
    const weight = sets.find(set => set.weight !== null)?.weight ?? null;
    const reps = sets.map(set => set.reps).filter(rep => rep !== null);
    const label = weight !== null && reps.length ? `${commaNumber(weight)} kg × ${reps.join('+')}` : 'Dati non sufficienti';
    const tonnage = exposureTonnage(exercise);
    return `<span class="logged-set logged-set-technique">${escapeHtml(label)}</span>${tonnage ? `<span class="logged-set logged-tonnage">${escapeHtml(formatKg(tonnage))} tot.</span>` : ''}`;
  }
  if (technique === 'stripping') {
    const chain = sets.filter(set => set.weight !== null || set.reps !== null).map(set => `${set.weight !== null ? commaNumber(set.weight) : '—'}×${set.reps ?? '—'}`).join(' → ');
    const tonnage = exposureTonnage(exercise);
    return `<span class="logged-set logged-set-technique">${escapeHtml(chain || 'Dati non sufficienti')}</span>${tonnage ? `<span class="logged-set logged-tonnage">${escapeHtml(formatKg(tonnage))} tot.</span>` : ''}`;
  }
  return sets.map((set, index) => `<span class="logged-set">${index + 1}. ${escapeHtml(formatSet(set))}</span>`).join('');
}

function compareTechnique(current, previous) {
  const currentTonnage = exposureTonnage(current);
  if (!currentTonnage) return { result: 'insufficient', text: 'Servono carico e ripetizioni per calcolare il tonnellaggio.' };
  if (!previous || !exposureTonnage(previous)) return { result: 'first', text: `Prima volta in ${techniqueLabel(exposureTechnique(current))}: tonnellaggio ${formatKg(currentTonnage)}.` };
  const previousTonnage = exposureTonnage(previous);
  const delta = currentTonnage - previousTonnage;
  if (delta > 0) return { result: 'better', text: `Meglio dell’ultima volta (${formatKg(currentTonnage)} vs ${formatKg(previousTonnage)} di tonnellaggio).` };
  if (delta < 0) return { result: 'worse', text: `Sotto l’ultima volta (${formatKg(currentTonnage)} vs ${formatKg(previousTonnage)}).` };
  return { result: 'stable', text: `Stabile rispetto all’ultima volta (${formatKg(currentTonnage)} di tonnellaggio).` };
}

async function renderLoggedExercises() {
  const container = $('#logged-exercises');
  const exercises = state.session?.exercises || [];
  $('#logged-count').textContent = `${exercises.length} ${exercises.length === 1 ? 'esercizio' : 'esercizi'}`;
  if (!exercises.length) {
    container.innerHTML = '<p class="empty-list">Ancora nessun esercizio in questa pagina.</p>';
    return;
  }
  const cards = [];
  for (const exercise of exercises) {
    const technique = exposureTechnique(exercise);
    const history = await getExerciseHistory(exercise.exerciseId, state.selectedDate);
    const previous = history.filter(item => exposureTechnique(item.exposure) === technique).sort((a, b) => b.session.date.localeCompare(a.session.date))[0] || null;
    const comparison = technique === 'normal'
      ? (previous ? compareExposures(exercise.sets, previous.exposure.sets) : { result: 'first', text: 'Prima volta: niente da confrontare.' })
      : compareTechnique(exercise, previous?.exposure || null);
    const image = exercise.imageUrl ? `<img class="logged-thumb" src="${escapeHtml(exercise.imageUrl)}" alt="" loading="lazy">` : '<span class="logged-thumb suggestion-placeholder">—</span>';
    const badge = technique !== 'normal' ? `<span class="technique-badge technique-${technique}">${escapeHtml(techniqueLabel(technique))}</span>` : '';
    cards.push(`<article class="logged-exercise">${image}<div class="logged-main"><h3>${escapeHtml(exercise.name)}${badge}</h3><div class="logged-sets">${loggedSetsHtml(exercise)}</div>${exercise.note ? `<p class="logged-note">${escapeHtml(exercise.note)}</p>` : ''}<p class="comparison ${comparison.result}">${escapeHtml(comparison.text)}</p></div></article>`);
  }
  container.innerHTML = cards.join('');
}

document.addEventListener('click', async event => {
  try {
    if (!event.target.closest('[data-weight-index]')) {
      const popover = $('#weight-point-popover'); if (popover) popover.hidden = true;
      $$('.weight-point').forEach(point => point.classList.remove('is-selected'));
    }
    if (!event.target.closest('[data-energy-index]')) {
      const popover = $('#energy-point-popover'); if (popover) popover.hidden = true;
      $$('.energy-point').forEach(point => point.classList.remove('is-selected'));
    }
    if (!event.target.closest('[data-progress-index]')) {
      const popover = $('#progress-point-popover'); if (popover) popover.hidden = true;
      $$('.progress-point').forEach(point => point.classList.remove('is-selected'));
    }
    const themeButton = event.target.closest('[data-theme-choice]');
    if (themeButton) { await chooseTheme(themeButton.dataset.themeChoice); return; }
    const homeLink = event.target.closest('[data-route="home"]');
    if (homeLink) { event.preventDefault(); navigateHome(); return; }
    const resultsLink = event.target.closest('[data-route="results"]');
    if (resultsLink) { event.preventDefault(); navigateResults(); return; }
    const profileLink = event.target.closest('[data-route="profile"]');
    if (profileLink) { event.preventDefault(); navigateProfile(); return; }
    const resultCard = event.target.closest('[data-open-result]');
    if (resultCard) { navigateResults(resultCard.dataset.openResult); return; }
    const seriesButton = event.target.closest('[data-series-key]');
    if (seriesButton) {
      state.selectedSeriesKey = seriesButton.dataset.seriesKey;
      $$('#result-rep-filters [data-series-key]').forEach(button => { const active = button === seriesButton; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
      renderProgressTrack();
      return;
    }
    const techniqueButton = event.target.closest('#technique-picker [data-technique]');
    if (techniqueButton) { selectTechnique(techniqueButton.dataset.technique); return; }
    const progressPoint = event.target.closest('[data-progress-index]');
    if (progressPoint) { showProgressPoint(progressPoint); return; }
    const dateButton = event.target.closest('[data-open-date]');
    if (dateButton) { navigateToDate(dateButton.dataset.openDate); return; }
    if (event.target.closest('#add-workout') || event.target.closest('#add-workout-mobile')) { navigateToDate(localDateKey()); return; }
    if (event.target.closest('#toggle-session-list')) {
      const totalSessions = (await getRecentSessions(1000)).length;
      state.visibleSessionCount = state.visibleSessionCount >= totalSessions ? 5 : Math.min(state.visibleSessionCount + 5, totalSessions);
      await renderRecentSessions();
      return;
    }
    if (event.target.closest('#prev-month')) { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); await renderCalendar(); return; }
    if (event.target.closest('#next-month')) { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); await renderCalendar(); return; }
    const suggestion = event.target.closest('[data-exercise-id]');
    if (suggestion) { await chooseExercise({ id: suggestion.dataset.exerciseId, name: suggestion.dataset.exerciseName, imageUrl: suggestion.dataset.exerciseImage || null }); return; }
    const addNew = event.target.closest('[data-add-new]');
    if (addNew) { await chooseExercise(await ensureExercise(addNew.dataset.addNew)); return; }
    if (event.target.closest('#clear-exercise')) { resetExerciseForm(); $('#exercise-search').focus(); return; }
    if (event.target.closest('#continue-session')) { continueToExerciseForm(); return; }
    if (event.target.closest('#add-set')) { readSetRows(); state.setRows.push({ id: createId(), weight: null, reps: null }); renderSetsEditor(); return; }
    const removeSet = event.target.closest('[data-remove-set]');
    if (removeSet) { readSetRows(); if (state.setRows.length > 1) state.setRows.splice(Number(removeSet.closest('[data-set-index]').dataset.setIndex), 1); else state.setRows[0] = { id: createId(), weight: null, reps: null }; renderSetsEditor(); return; }
    if (event.target.closest('#save-exercise')) { await saveCurrentExercise(); return; }
    const periodButton = event.target.closest('[data-period-control] [data-period]');
    if (periodButton) {
      const control = periodButton.closest('[data-period-control]');
      control.querySelectorAll('[data-period]').forEach(button => button.classList.toggle('is-active', button === periodButton));
      if (control.dataset.periodControl === 'weight') { state.weightPeriod = periodButton.dataset.period; renderWeightChart(); }
      else { state.energyPeriod = periodButton.dataset.period; renderEnergyChart(); }
      return;
    }
  } catch (error) { showError(error); }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const weightPopover = $('#weight-point-popover'); if (weightPopover) weightPopover.hidden = true;
  const energyPopover = $('#energy-point-popover'); if (energyPopover) energyPopover.hidden = true;
  const progressPopover = $('#progress-point-popover'); if (progressPopover) progressPopover.hidden = true;
  $$('.weight-point,.energy-point,.progress-point').forEach(point => point.classList.remove('is-selected'));
});
$('#calendar-grid').addEventListener('mouseover', event => { const button = event.target.closest('[data-tooltip-title]'); if (button) showCalendarTooltip(button); });
$('#calendar-grid').addEventListener('mouseout', event => { if (event.target.closest('[data-tooltip-title]')) hideCalendarTooltip(); });
$('#calendar-grid').addEventListener('focusin', event => { const button = event.target.closest('[data-tooltip-title]'); if (button) showCalendarTooltip(button); });
$('#calendar-grid').addEventListener('focusout', hideCalendarTooltip);

$('#exercise-search').addEventListener('input', event => updateExerciseSuggestions(event.target.value).catch(showError));
$('#results-search').addEventListener('input', event => renderResultsList(event.target.value));
$('#sets-editor').addEventListener('input', event => {
  if (state.technique === 'normal') { const row = event.target.closest('[data-set-index]'); if (row && event.target.matches('[data-reps]')) updateRowRecord(row); }
  else updateTonnagePreview();
});
$('#close-pr').addEventListener('click', () => { $('#pr-celebration').hidden = true; });
$('#load-demo-data')?.addEventListener('click', async () => {
  try {
    if (await getSetting('demoDataImportedV3')) { showToast('La demo estesa è già stata caricata'); return; }
    const response = await fetch('./demo-history.json'); if (!response.ok) throw new Error('Impossibile leggere i dati demo.');
    const demo = await response.json();
    const existingRecords = await getMaxRecords();
    for (const record of demo.maxRecords || []) {
      const duplicate = existingRecords.some(item => item.exerciseName === record.exerciseName && item.weight === record.weight && item.recordedAt === record.recordedAt);
      if (!duplicate) await saveMaxRecord(record);
    }
    for (const session of demo.sessions) {
      let storedSession = await getSessionByDate(session.date);
      for (const item of session.exercises) {
        const duplicate = storedSession?.exercises?.some(exposure => exposure.name === item.name);
        if (duplicate) continue;
        const exercise = await ensureExercise(item.name);
        await saveExerciseToSession({ date: session.date, sessionName: session.name, exercise: { exerciseId: exercise.id, name: exercise.name, imageUrl: exercise.imageUrl, sets: item.sets, note: item.note || 'Dato demo' } });
        storedSession = await getSessionByDate(session.date);
      }
      if (storedSession) await completeSession({ date: session.date, feeling: session.feeling, sessionNote: session.sessionNote });
    }
    const existingCheckins = await getCheckins();
    for (const entry of demo.weightEntries || []) {
      if (!existingCheckins.some(item => item.date === entry.date && item.weight === entry.weight)) await saveCheckin({ ...entry, feeling: null });
    }
    await saveSetting('demoDataImported', true);
    await saveSetting('demoDataImportedV2', true);
    await saveSetting('demoDataImportedV3', true); state.maxRecords = await getMaxRecords();
    $('#demo-data-card')?.classList.add('is-loaded'); if ($('#load-demo-data')) { $('#load-demo-data').textContent = 'Demo estesa caricata'; $('#load-demo-data').disabled = true; }
    await renderProfile(); showToast(`${demo.sessions.length} sessioni demo caricate`);
  } catch (error) { showError(error); }
});
$('#download-backup').addEventListener('click', () => downloadBackup().catch(showError));
$('#backup-reminder-button').addEventListener('click', () => downloadBackup().catch(showError));
$('#restore-backup').addEventListener('click', () => $('#backup-file-input').click());
$('#backup-file-input').addEventListener('change', async event => {
  try { await importBackupFile(event.target.files?.[0]); }
  catch (error) { showError(error); }
  finally { event.target.value = ''; }
});
$('#exercise-search').addEventListener('keydown', event => { if (event.key === 'Escape') closeSuggestions(); });
$('#session-name').addEventListener('keydown', event => { if (event.key === 'Enter' && $('#giorno').classList.contains('title-step')) { event.preventDefault(); try { continueToExerciseForm(); } catch (error) { showError(error); } } });
$('#checkin-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const weight = nullableNumber($('#checkin-weight').value);
    if (!weight || weight <= 0) throw new Error('Inserisci un peso valido.');
    await saveCheckin({ date: $('#checkin-date').value, weight, feeling: null, note: $('#checkin-note').value.trim() });
    $('#checkin-weight').value = ''; $('#checkin-note').value = '';
    closeWeightModal(); await renderProfile(); showToast('Misurazione salvata');
  } catch (error) { showError(error); }
});
function openWeightModal() { $('#checkin-date').value = localDateKey(); $('#weight-modal').hidden = false; document.body.classList.add('modal-open'); setTimeout(() => $('#checkin-weight').focus(), 50); }
function closeWeightModal() { $('#weight-modal').hidden = true; document.body.classList.remove('modal-open'); }
$('#open-weight-modal').addEventListener('click', openWeightModal);
$('#close-weight-modal').addEventListener('click', closeWeightModal);
$('#weight-chart').addEventListener('click', event => { const point = event.target.closest('[data-weight-index]'); if (point) showWeightPoint(point); });
$('#weight-chart').addEventListener('focusin', event => { const point = event.target.closest('[data-weight-index]'); if (point) showWeightPoint(point); });
$('#energy-trend').addEventListener('click', event => { const point = event.target.closest('[data-energy-index]'); if (point) showEnergyPoint(point); });
$('#energy-trend').addEventListener('focusin', event => { const point = event.target.closest('[data-energy-index]'); if (point) showEnergyPoint(point); });
$('#complete-workout').addEventListener('click', openSessionCompleteModal);
$('#session-feeling-scale').addEventListener('click', event => { const button = event.target.closest('[data-feeling]'); if (!button) return; state.selectedFeeling = Number(button.dataset.feeling); $$('#session-feeling-scale [data-feeling]').forEach(item => item.classList.toggle('is-selected', item === button)); });
$('#skip-session-feeling').addEventListener('click', closeSessionCompleteModal);
$('#save-session-feeling').addEventListener('click', async () => {
  try {
    if (!state.selectedFeeling) throw new Error('Scegli come ti sei sentita durante la sessione.');
    state.session = await completeSession({ date: state.selectedDate, feeling: state.selectedFeeling, sessionNote: $('#session-complete-note').value });
    closeSessionCompleteModal(); showToast('Sessione salvata'); navigateHome();
  } catch (error) { showError(error); }
});

let onboardingStep = 0;
function showOnboardingStep(step) {
  const direction = step > onboardingStep ? 1 : -1;
  onboardingStep = step;
  $$('.onboarding-step').forEach(panel => { panel.classList.toggle('is-active', Number(panel.dataset.onboardingStep) === step); panel.style.setProperty('--direction', direction); });
  $$('.onboarding-progress i').forEach((dot, index) => dot.classList.toggle('active', index <= step));
}
function renderOnboardingMaxes() {
  $('#onboarding-max-list').innerHTML = state.onboardingMaxes.map((item, index) => `<span>${escapeHtml(item.exerciseName)} <strong>${item.weight} kg</strong><button type="button" data-remove-onboarding-max="${index}" aria-label="Rimuovi">×</button></span>`).join('');
}
$$('.onboarding-next').forEach(button => button.addEventListener('click', () => {
  if (onboardingStep === 0 && !$('#onboarding-name').value.trim()) { showError(new Error('Scrivi il tuo nome per continuare.')); return; }
  showOnboardingStep(Math.min(5, onboardingStep + 1));
}));
$$('.onboarding-back').forEach(button => button.addEventListener('click', () => showOnboardingStep(Math.max(0, onboardingStep - 1))));
$('#add-onboarding-max').addEventListener('click', () => {
  const exerciseName = $('#onboarding-max-exercise').value, weight = nullableNumber($('#onboarding-max-weight').value);
  if (!exerciseName || !weight || weight <= 0) { showError(new Error('Scegli un esercizio e inserisci il massimale.')); return; }
  state.onboardingMaxes = [...state.onboardingMaxes.filter(item => item.exerciseName !== exerciseName), { exerciseName, weight }];
  $('#onboarding-max-exercise').value = ''; $('#onboarding-max-weight').value = ''; renderOnboardingMaxes();
});
$('#onboarding-max-list').addEventListener('click', event => { const button = event.target.closest('[data-remove-onboarding-max]'); if (button) { state.onboardingMaxes.splice(Number(button.dataset.removeOnboardingMax), 1); renderOnboardingMaxes(); } });
$('#finish-onboarding').addEventListener('click', async () => {
  try {
    if (onboardingPreview) {
      $('#onboarding').classList.add('is-leaving');
      document.body.classList.remove('onboarding-open');
      const cleanUrl = `${location.pathname}${location.hash || '#home'}`;
      history.replaceState(null, '', cleanUrl);
      setTimeout(() => { $('#onboarding').hidden = true; }, 450);
      return;
    }
    const now = new Date().toISOString(), name = $('#onboarding-name').value.trim(), weight = nullableNumber($('#onboarding-weight').value);
    await saveSetting('profile', { name });
    if (weight && weight > 0) await saveCheckin({ date: localDateKey(), weight, feeling: null, note: 'Peso iniziale' });
    for (const item of state.onboardingMaxes) await saveMaxRecord({ ...item, recordedAt: now });
    await saveSetting('onboardingComplete', true); state.maxRecords = await getMaxRecords();
    $('.avatar').textContent = name.charAt(0).toLocaleUpperCase('it'); $('#onboarding').classList.add('is-leaving');
    document.body.classList.remove('onboarding-open'); setTimeout(() => { $('#onboarding').hidden = true; }, 450);
  } catch (error) { showError(error); }
});
document.addEventListener('keydown', event => {
  const card = event.target.closest?.('[data-open-date][role="link"]');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigateToDate(card.dataset.openDate); }
});
window.addEventListener('popstate', () => routeFromHash().catch(showError));

async function routeFromHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('giorno/')) { await openDay(hash.split('/')[1]); return; }
  if (hash.startsWith('risultati/')) { showView('risultati'); await renderResults(decodeURIComponent(hash.slice('risultati/'.length))); return; }
  if (hash === 'risultati') { showView('risultati'); await renderResults(); return; }
  if (hash === 'profilo') { showView('profilo'); await renderProfile(); return; }
  showView('home'); await renderHome();
}

async function init() {
  try {
    await initializeDatabase(); state.maxRecords = await getMaxRecords();
    applyTheme(await getSetting('theme') || cachedTheme());
    const profile = await getSetting('profile');
    if (profile?.name) { $('.avatar').textContent = profile.name.charAt(0).toLocaleUpperCase('it'); if (onboardingPreview) $('#onboarding-name').value = profile.name; }
    if (onboardingPreview) $('#finish-onboarding').innerHTML = 'Torna al diario <span>→</span>';
    if (onboardingPreview || !await getSetting('onboardingComplete')) { $('#onboarding').hidden = false; document.body.classList.add('onboarding-open'); }
    await routeFromHash();
    renderAppVersion();
  }
  catch (error) { showError(new Error(`Impossibile aprire il diario: ${error.message}`)); }
}

init();
