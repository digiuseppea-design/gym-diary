const views = [...document.querySelectorAll('.view')];
const navLinks = [...document.querySelectorAll('.demo-nav a')];

function showView(route) {
  const target = document.getElementById(route) || document.getElementById('home');
  views.forEach(view => view.classList.toggle('is-active', view === target));
  navLinks.forEach(link => link.classList.toggle('is-current', link.dataset.route === target.id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', event => {
  const routeLink = event.target.closest('[data-route]');
  if (!routeLink) return;
  event.preventDefault();
  const route = routeLink.dataset.route;
  history.replaceState(null, '', `#${route}`);
  showView(route);
});

window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
showView(location.hash.slice(1) || 'home');

const toast = document.getElementById('toast');
document.getElementById('save-set').addEventListener('click', () => {
  toast.textContent = `${document.getElementById('weight').value} kg × ${document.getElementById('reps').value} registrato`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
});

document.getElementById('add-set').addEventListener('click', () => {
  toast.textContent = 'Nuova serie pronta';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
});

let elapsed = 84;
const timer = document.getElementById('timer');
function renderTimer() {
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
}
setInterval(() => { elapsed += 1; renderTimer(); }, 1000);
document.getElementById('reset-timer').addEventListener('click', () => { elapsed = 0; renderTimer(); });

const calendarSessions = {
  3: ['Venerdì 3 luglio', 'Parte alta A', 'Panca piana · Pulley · Shoulder press', '49 min', '11 serie registrate', 'Panca stabile rispetto alla sessione precedente'],
  7: ['Martedì 7 luglio', 'Gambe A', 'Squat · Hip thrust · Leg curl · Polpacci', '52 min', '12 serie registrate', 'Dati completi per 4 esercizi su 4'],
  8: ['Mercoledì 8 luglio', 'Gambe B', 'Stacco rumeno · Pressa · Leg extension', '44 min', '10 serie registrate', 'Stacco rumeno meglio dell’ultima volta'],
  11: ['Sabato 11 luglio', 'Parte alta B', 'Lat machine · Panca piana · Pulley · Alzate laterali', '48 min', '13 serie registrate', 'Lat machine: nuovo riferimento personale'],
  14: ['Martedì 14 luglio', 'Gambe A', 'Squat · Hip thrust · Leg curl · Polpacci', '56 min', '12 serie registrate', 'Squat meglio dell’ultima volta'],
  16: ['Giovedì 16 luglio', 'Gambe A', 'Squat · Hip thrust · Leg curl · Polpacci', '54 min', '12 serie registrate', 'Squat e hip thrust meglio dell’ultima volta']
};

const tooltip = document.getElementById('calendar-tooltip');
const modalOverlay = document.getElementById('session-modal-overlay');
const sessionModal = document.getElementById('session-modal');
const modalContent = document.getElementById('session-modal-content');
let lastCalendarTrigger = null;

function showCalendarTooltip(button) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const session = calendarSessions[button.dataset.session];
  const exercises = session[2].split(' · ').slice(0, 2).join(' · ');
  tooltip.innerHTML = `<strong>${session[1]}</strong><span>${exercises}</span><em>${session[3]}</em>`;
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.classList.add('is-visible');
  const dayRect = button.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tipRect.width - 12, Math.max(12, dayRect.left + dayRect.width / 2 - tipRect.width / 2));
  const above = dayRect.top - tipRect.height - 10;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${above > 8 ? above : dayRect.bottom + 10}px`;
}

function hideCalendarTooltip() {
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

function openSessionModal(button) {
  const session = calendarSessions[button.dataset.session];
  lastCalendarTrigger = button;
  hideCalendarTooltip();
  modalContent.innerHTML = `<span class="eyebrow modal-date">${session[0]}</span><h2 id="session-modal-title">${session[1]}</h2><p class="modal-exercises">${session[2]}</p><div class="modal-stats"><div><strong>${session[3]}</strong><span>Durata</span></div><div><strong>${session[4].split(' ')[0]}</strong><span>Serie registrate</span></div></div><p class="modal-reading"><span>Il diario ti dice</span>${session[5]}</p>`;
  modalOverlay.hidden = false;
  document.body.classList.add('modal-open');
  sessionModal.focus();
}

function closeSessionModal() {
  if (modalOverlay.hidden) return;
  modalOverlay.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastCalendarTrigger) lastCalendarTrigger.focus();
}

document.querySelectorAll('.calendar-grid .trained').forEach(button => {
  button.addEventListener('mouseenter', () => showCalendarTooltip(button));
  button.addEventListener('mouseleave', hideCalendarTooltip);
  button.addEventListener('focus', () => showCalendarTooltip(button));
  button.addEventListener('blur', hideCalendarTooltip);
  button.addEventListener('click', () => openSessionModal(button));
});

document.getElementById('modal-close').addEventListener('click', closeSessionModal);
modalOverlay.addEventListener('click', event => {
  if (event.target === modalOverlay) closeSessionModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modalOverlay.hidden) closeSessionModal();
});

document.querySelector('.save-sheet').addEventListener('click', () => {
  toast.textContent = 'La tua scheda è stata salvata';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
});
