// ==============================================================================
// Three Little Bosses — Linktree Interactive Script
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const shareBtn = document.getElementById('share-btn');
  const qrBtn = document.getElementById('qr-btn');
  const qrModal = document.getElementById('qr-modal');
  const modalClose = document.getElementById('modal-close');
  const modalCopyBtn = document.getElementById('modal-copy-btn');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrUrlDisplay = document.getElementById('qr-url-display');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const avatarContainer = document.getElementById('avatar-container');
  const pawsContainer = document.getElementById('floating-paws');

  const pageUrl = window.location.href;
  if (qrUrlDisplay) {
    try {
      const urlObj = new URL(pageUrl);
      qrUrlDisplay.textContent = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
    } catch (_) {
      qrUrlDisplay.textContent = 'threelittlebosses.link';
    }
  }

  // 1. Toast Notification Helper
  let toastTimer = null;
  function showToast(message) {
    if (toastMessage) toastMessage.textContent = message;
    if (toast) {
      toast.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
    }
  }

  // 2. Copy Link to Clipboard
  async function copyLink(urlToCopy = window.location.href) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const input = document.createElement('input');
        input.value = urlToCopy;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showToast('Link copied to clipboard! 🐾');
    } catch (err) {
      showToast('Copied: ' + urlToCopy);
    }
  }

  // 3. Share Action (Web Share API with fallback)
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      playCuteSound();
      if (navigator.share) {
        try {
          await navigator.share({
            title: '🐱 Three Little Bosses',
            text: 'Three cats. One home. Endless chaos. Follow Three Little Bosses!',
            url: window.location.href,
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            copyLink();
          }
        }
      } else {
        copyLink();
      }
    });
  }

  // 4. QR Code Modal
  function openQrModal() {
    playCuteSound();
    if (qrModal) {
      qrModal.classList.add('active');
      qrModal.setAttribute('aria-hidden', 'false');
      renderQrCode();
    }
  }

  function closeQrModal() {
    if (qrModal) {
      qrModal.classList.remove('active');
      qrModal.setAttribute('aria-hidden', 'true');
    }
  }

  function renderQrCode() {
    if (typeof QRCode !== 'undefined' && qrCanvas) {
      QRCode.toCanvas(qrCanvas, window.location.href, {
        width: 180,
        margin: 1,
        color: {
          dark: '#0a0b10',
          light: '#ffffff'
        }
      }, (error) => {
        if (error) console.error('QR code generation error:', error);
      });
    }
  }

  if (qrBtn) qrBtn.addEventListener('click', openQrModal);
  if (modalClose) modalClose.addEventListener('click', closeQrModal);
  if (modalCopyBtn) modalCopyBtn.addEventListener('click', () => copyLink());

  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) closeQrModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qrModal && qrModal.classList.contains('active')) {
      closeQrModal();
    }
  });

  // 5. Easter Egg: Cute Meow / Sound Synthesizer via Web Audio API (Zero external assets needed!)
  function playCuteSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      
      // Frequency envelope simulating a playful kitty chirp/purr
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.18);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }

  if (avatarContainer) {
    avatarContainer.addEventListener('click', () => {
      playCuteSound();
      showToast('Meow! Three Little Bosses say hi! 🐱❤️');
      
      // Fun spin effect on avatar
      const img = avatarContainer.querySelector('.avatar-img');
      if (img) {
        img.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
        img.style.transform = 'scale(1.12) rotate(12deg)';
        setTimeout(() => {
          img.style.transform = '';
        }, 600);
      }
    });
  }

  // 6. Floating Decorative Cat Paws
  if (pawsContainer) {
    const pawSymbols = ['🐾', '🐱', '✨', '🐾', '❤️', '🐾'];
    for (let i = 0; i < 14; i++) {
      const paw = document.createElement('div');
      paw.className = 'floating-paw';
      paw.textContent = pawSymbols[i % pawSymbols.length];
      paw.style.left = `${Math.random() * 94 + 3}%`;
      paw.style.animationDelay = `${Math.random() * 14}s`;
      paw.style.animationDuration = `${12 + Math.random() * 10}s`;
      paw.style.fontSize = `${14 + Math.random() * 12}px`;
      pawsContainer.appendChild(paw);
    }
  }

  // 7. Track link clicks
  const linkCards = document.querySelectorAll('.link-card');
  linkCards.forEach((card) => {
    card.addEventListener('click', () => {
      playCuteSound();
    });
  });
});
