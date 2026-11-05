// jsdom lacks native dialog methods. This shim only supports component lifecycle;
// actual focus confinement/inertness/Escape are verified in Chrome, not simulated here.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } },
});
