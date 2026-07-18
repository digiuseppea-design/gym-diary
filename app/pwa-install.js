(() => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const wasDismissed = () => {
    try { return sessionStorage.getItem('gymDiaryInstallDismissed') === '1'; }
    catch (error) { return false; }
  };
  let installPrompt = null;
  let modal = null;

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-visible');
    try { sessionStorage.setItem('gymDiaryInstallDismissed', '1'); } catch (error) {}
    setTimeout(() => {
      modal?.remove();
      modal = null;
    }, 220);
  }

  function createModal(mode) {
    if (modal || isStandalone || wasDismissed()) return;

    const iosCopy = `
      <p>Per installarla su iPhone o iPad:</p>
      <ol>
        <li>Tocca <strong>Condividi</strong> <span aria-hidden="true">□↑</span></li>
        <li>Scegli <strong>Aggiungi alla schermata Home</strong></li>
      </ol>`;
    const installCopy = '<p class="pwa-install-copy">Aprila dalla schermata Home e usala anche quando la connessione non c\'è.</p>';

    modal = document.createElement('div');
    modal.className = 'pwa-install-overlay';
    modal.innerHTML = `
      <section class="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button class="pwa-install-close" type="button" aria-label="Chiudi">×</button>
        <img src="icons/icon-192.png" width="72" height="72" alt="">
        <span class="pwa-install-eyebrow">Gym Diary sul tuo telefono</span>
        <h2 id="pwa-install-title">Installa l’app.</h2>
        ${mode === 'ios' ? iosCopy : installCopy}
        <button class="primary-button pwa-install-action" type="button">${mode === 'ios' ? 'Ho capito' : 'Installa Gym Diary'}</button>
        <button class="text-button pwa-install-later" type="button">Non ora</button>
      </section>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal?.classList.add('is-visible'));

    modal.querySelector('.pwa-install-close').addEventListener('click', closeModal);
    modal.querySelector('.pwa-install-later').addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    modal.querySelector('.pwa-install-action').addEventListener('click', async () => {
      if (mode === 'ios') {
        closeModal();
        return;
      }
      const action = modal.querySelector('.pwa-install-action');
      if (!installPrompt) {
        if (action.dataset.fallback === '1') {
          closeModal();
          return;
        }
        modal.querySelector('.pwa-install-copy').innerHTML = 'Apri il menu del browser <strong>⋮</strong> e scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.';
        action.dataset.fallback = '1';
        action.textContent = 'Ho capito';
        return;
      }
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      closeModal();
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (modal) {
      const action = modal.querySelector('.pwa-install-action');
      delete action.dataset.fallback;
      action.textContent = 'Installa Gym Diary';
    } else {
      createModal('prompt');
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    modal?.remove();
    modal = null;
  });

  createModal(isIos ? 'ios' : 'prompt');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(error => {
        console.warn('Installazione offline non disponibile:', error);
      });
    });
  }
})();
