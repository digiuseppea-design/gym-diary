(function () {
const DB_NAME = 'gym-diary';
const DB_VERSION = 4;
const BACKUP_FORMAT = 'gym-diary-backup';
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_STORES = ['exercises', 'sessions', 'checkins', 'maxRecords', 'settings'];
let databasePromise = null;

function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function normalizeName(value) {
  return value.trim().toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transazione annullata'));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      const transaction = event.target.transaction;
      if (db.objectStoreNames.contains('routines')) db.deleteObjectStore('routines');
      if (!db.objectStoreNames.contains('exercises')) {
        const exercises = db.createObjectStore('exercises', { keyPath: 'id' });
        exercises.createIndex('normalizedName', 'normalizedName', { unique: true });
      } else {
        const exercises = transaction.objectStore('exercises');
        if (!exercises.indexNames.contains('normalizedName')) exercises.createIndex('normalizedName', 'normalizedName', { unique: true });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('date', 'date', { unique: true });
      } else {
        const sessions = transaction.objectStore('sessions');
        if (!sessions.indexNames.contains('date')) sessions.createIndex('date', 'date', { unique: true });
      }
      if (!db.objectStoreNames.contains('checkins')) {
        const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
        checkins.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('maxRecords')) {
        const maxRecords = db.createObjectStore('maxRecords', { keyPath: 'id' });
        maxRecords.createIndex('exerciseName', 'exerciseName', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
  });
  return databasePromise;
}

async function migrateLegacySessions() {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const store = transaction.objectStore('sessions');
  const records = await requestToPromise(store.getAll());
  const legacyRecords = records.filter(record => !record.date && record.completedAt);
  const grouped = new Map();
  for (const record of legacyRecords) {
    const date = record.completedAt.slice(0, 10);
    const migratedExercises = (record.exercises || []).map(exercise => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        imageUrl: exercise.imageUrl ?? null,
        technique: exercise.technique || null,
        sets: (exercise.sets || []).map(set => ({ weight: set.weight ?? null, reps: set.reps ?? null })),
        note: exercise.note || ''
      }));
    const sameDay = grouped.get(date);
    grouped.set(date, sameDay ? { ...sameDay, exercises: [...sameDay.exercises, ...migratedExercises], updatedAt: record.completedAt > sameDay.updatedAt ? record.completedAt : sameDay.updatedAt } : { id: record.id, date, name: record.dayName || 'Allenamento', exercises: migratedExercises, createdAt: record.startedAt || record.completedAt, updatedAt: record.completedAt });
    store.delete(record.id);
  }
  grouped.forEach(record => store.put(record));
  await transactionDone(transaction);
}

async function seedExercisesIfEmpty() {
  const db = await openDatabase();
  const countTransaction = db.transaction('exercises', 'readonly');
  const count = await requestToPromise(countTransaction.objectStore('exercises').count());
  if (count > 0) return;
  const response = await fetch('./exercise-catalog-seed.json');
  if (!response.ok) throw new Error('Impossibile caricare il catalogo esercizi iniziale.');
  const seed = await response.json();
  const transaction = db.transaction('exercises', 'readwrite');
  const store = transaction.objectStore('exercises');
  const createdAt = new Date().toISOString();
  seed.forEach(item => store.put({ id: createId(), name: item.name.trim(), normalizedName: normalizeName(item.name), imageUrl: item.imageUrl || null, createdAt }));
  await transactionDone(transaction);
}

async function initializeDatabase() {
  await openDatabase();
  await migrateLegacySessions();
  await seedExercisesIfEmpty();
}

async function ensureExercise(name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Scrivi il nome dell’esercizio.');
  const normalizedName = normalizeName(cleanName);
  const db = await openDatabase();
  const transaction = db.transaction('exercises', 'readwrite');
  const store = transaction.objectStore('exercises');
  const existing = await requestToPromise(store.index('normalizedName').get(normalizedName));
  if (existing) return existing;
  const exercise = { id: createId(), name: cleanName, normalizedName, imageUrl: null, createdAt: new Date().toISOString() };
  store.add(exercise);
  await transactionDone(transaction);
  return exercise;
}

async function searchExercises(query) {
  const normalizedQuery = normalizeName(query || '');
  if (!normalizedQuery) return [];
  const db = await openDatabase();
  const transaction = db.transaction('exercises', 'readonly');
  const exercises = await requestToPromise(transaction.objectStore('exercises').getAll());
  return exercises
    .filter(exercise => exercise.normalizedName.includes(normalizedQuery))
    .sort((a, b) => {
      const aStarts = a.normalizedName.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = b.normalizedName.startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, 'it');
    })
    .slice(0, 8);
}

async function getSessionByDate(date) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  return requestToPromise(transaction.objectStore('sessions').index('date').get(date));
}

async function completeSession({ date, feeling, sessionNote }) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const store = transaction.objectStore('sessions');
  const session = await requestToPromise(store.index('date').get(date));
  if (!session) throw new Error('La sessione non è ancora stata salvata.');
  session.feeling = feeling;
  session.sessionNote = sessionNote?.trim() || '';
  session.completedAt = new Date().toISOString();
  session.updatedAt = session.completedAt;
  store.put(session);
  await transactionDone(transaction);
  return session;
}

async function saveExerciseToSession({ date, sessionName, exercise }) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const store = transaction.objectStore('sessions');
  const index = store.index('date');
  const existing = await requestToPromise(index.get(date));
  const now = new Date().toISOString();
  const session = existing || { id: createId(), date, name: sessionName.trim(), exercises: [], createdAt: now, updatedAt: now };
  if (!session.name) throw new Error('Dai un nome alla sessione prima di salvare il primo esercizio.');
  session.exercises.push({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    imageUrl: exercise.imageUrl ?? null,
    technique: exercise.technique || null,
    sets: exercise.sets.map(set => ({ weight: set.weight ?? null, reps: set.reps ?? null })),
    note: exercise.note?.trim() || ''
  });
  session.updatedAt = now;
  store.put(session);
  await transactionDone(transaction);
  return session;
}

async function deleteExerciseFromSession({ date, index }) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readwrite');
  const store = transaction.objectStore('sessions');
  const session = await requestToPromise(store.index('date').get(date));
  if (!session) return null;
  if (!Number.isInteger(index) || index < 0 || index >= session.exercises.length) throw new Error('Esercizio non trovato.');
  session.exercises.splice(index, 1);
  if (!session.exercises.length) {
    store.delete(session.id);
    await transactionDone(transaction);
    return null;
  }
  session.updatedAt = new Date().toISOString();
  store.put(session);
  await transactionDone(transaction);
  return session;
}

async function getSessionsByMonth(year, monthIndex) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const sessions = await requestToPromise(transaction.objectStore('sessions').getAll());
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return sessions.filter(session => session.date?.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

async function getRecentSessions(limit = 12) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const sessions = await requestToPromise(transaction.objectStore('sessions').getAll());
  return sessions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

async function getAllSessions() {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const sessions = await requestToPromise(transaction.objectStore('sessions').getAll());
  return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
}

async function getLastExposure(exerciseId, beforeDate) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const sessions = await requestToPromise(transaction.objectStore('sessions').getAll());
  return sessions
    .filter(session => session.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(session => ({ session, exposure: [...session.exercises].reverse().find(item => item.exerciseId === exerciseId) }))
    .find(item => item.exposure) || null;
}

async function getExerciseHistory(exerciseId, beforeDate) {
  const db = await openDatabase();
  const transaction = db.transaction('sessions', 'readonly');
  const sessions = await requestToPromise(transaction.objectStore('sessions').getAll());
  return sessions
    .filter(session => !beforeDate || session.date < beforeDate)
    .flatMap(session => session.exercises.filter(item => item.exerciseId === exerciseId).map(exposure => ({ session, exposure })));
}

async function saveCheckin(entry) {
  const db = await openDatabase();
  const transaction = db.transaction('checkins', 'readwrite');
  transaction.objectStore('checkins').put({ ...entry, id: createId(), createdAt: new Date().toISOString() });
  await transactionDone(transaction);
}

async function getCheckins() {
  const db = await openDatabase();
  const transaction = db.transaction('checkins', 'readonly');
  const entries = await requestToPromise(transaction.objectStore('checkins').getAll());
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

async function saveMaxRecord(record) {
  const db = await openDatabase();
  const transaction = db.transaction('maxRecords', 'readwrite');
  transaction.objectStore('maxRecords').put({ ...record, id: createId(), createdAt: new Date().toISOString() });
  await transactionDone(transaction);
}

async function getMaxRecords() {
  const db = await openDatabase();
  const transaction = db.transaction('maxRecords', 'readonly');
  const records = await requestToPromise(transaction.objectStore('maxRecords').getAll());
  return records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

async function saveSetting(key, value) {
  const db = await openDatabase();
  const transaction = db.transaction('settings', 'readwrite');
  transaction.objectStore('settings').put({ key, value });
  await transactionDone(transaction);
}

async function getSetting(key) {
  const db = await openDatabase();
  const transaction = db.transaction('settings', 'readonly');
  return (await requestToPromise(transaction.objectStore('settings').get(key)))?.value;
}

async function createBackup() {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUP_STORES, 'readonly');
  const entries = await Promise.all(BACKUP_STORES.map(storeName => requestToPromise(transaction.objectStore(storeName).getAll())));
  await transactionDone(transaction);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    databaseVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(BACKUP_STORES.map((storeName, index) => [storeName, entries[index]]))
  };
}

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || backup.format !== BACKUP_FORMAT) throw new Error('Questo file non è un backup di Gym Diary.');
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Versione del backup non supportata: ${backup.schemaVersion ?? 'sconosciuta'}.`);
  if (!backup.data || typeof backup.data !== 'object') throw new Error('Il backup non contiene dati validi.');
  for (const storeName of BACKUP_STORES) {
    if (!Array.isArray(backup.data[storeName])) throw new Error(`Nel backup manca la sezione “${storeName}”.`);
    if (backup.data[storeName].some(record => !record || typeof record !== 'object' || Array.isArray(record))) throw new Error(`La sezione “${storeName}” contiene dati non validi.`);
  }
  return backup;
}

async function restoreBackup(backup) {
  validateBackup(backup);
  const db = await openDatabase();
  const transaction = db.transaction(BACKUP_STORES, 'readwrite');
  for (const storeName of BACKUP_STORES) {
    const store = transaction.objectStore(storeName);
    store.clear();
    backup.data[storeName].forEach(record => store.put(record));
  }
  await transactionDone(transaction);
}

window.GymDiaryDB = { initializeDatabase, createId, ensureExercise, searchExercises, getSessionByDate, completeSession, saveExerciseToSession, deleteExerciseFromSession, getSessionsByMonth, getRecentSessions, getAllSessions, getLastExposure, getExerciseHistory, saveCheckin, getCheckins, saveMaxRecord, getMaxRecords, saveSetting, getSetting, createBackup, validateBackup, restoreBackup };
})();
