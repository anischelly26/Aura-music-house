/** Two-finger house navigation, using the same movement and collision engine as WASD. */
export class TouchNavigation {
  constructor(house) {
    this.house = house;
    this.root = document.querySelector('#touchNavigation');
    this.pad = document.querySelector('#touchMovePad');
    this.thumb = document.querySelector('#touchMoveThumb');
    this.forward = 0;
    this.strafe = 0;
    this.pointerId = null;
    this.media = matchMedia('(any-pointer: coarse)');
    this.media.addEventListener('change', () => this.refresh());
    this.pad.addEventListener('pointerdown', event => {
      if (!this.available() || this.pointerId !== null || event.button !== 0) return;
      event.preventDefault();
      this.house.beginManualMove();
      this.house.pointer.set(0, 0);
      this.pointerId = event.pointerId;
      this.bounds = this.pad.getBoundingClientRect();
      this.pad.setPointerCapture(event.pointerId);
      this.update(event);
    });
    this.pad.addEventListener('pointermove', event => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this.update(event);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.pad.addEventListener(name, event => {
        if (event.pointerId === this.pointerId) this.reset();
      });
    }
    this.pad.addEventListener('contextmenu', event => event.preventDefault());
    document.querySelector('#touchInteract').addEventListener('click', () => {
      if (!this.available()) return;
      this.house.pointer.set(0, 0);
      this.house.camera.updateMatrixWorld();
      this.house.findInteraction();
      this.house.interact();
    });
    // Includes dialogs opened by instruments, the coach, the game and project tools.
    new MutationObserver(records => {
      if (records.some(record => record.target.matches('dialog'))) this.refresh();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    this.refresh();
  }

  available() {
    return (this.media.matches || navigator.maxTouchPoints > 0) &&
      this.house.entered && this.house.mode === 'house' && this.house.renderer &&
      !this.house.arrival && !document.hidden && !document.querySelector('dialog[open]');
  }

  refresh() {
    const touch = this.media.matches || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('houseTouch', touch);
    this.root.hidden = !this.available();
    if (this.root.hidden) this.house.resetNavigationInput();
  }

  update(event) {
    const radius = (this.bounds.width - this.thumb.offsetWidth) / 2 - 5;
    let x = (event.clientX - this.bounds.left - this.bounds.width / 2) / radius;
    let y = (event.clientY - this.bounds.top - this.bounds.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    const amount = Math.max(0, (Math.min(1, length) - .12) / .88);
    const direction = Math.hypot(x, y) || 1;
    this.strafe = x / direction * amount;
    this.forward = -y / direction * amount;
    this.thumb.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    this.pad.classList.toggle('active', amount > 0);
  }

  reset() {
    const pointerId = this.pointerId;
    this.pointerId = null;
    this.forward = this.strafe = 0;
    this.thumb.style.transform = '';
    this.pad.classList.remove('active');
    if (pointerId !== null && this.pad.hasPointerCapture(pointerId)) this.pad.releasePointerCapture(pointerId);
  }
}
