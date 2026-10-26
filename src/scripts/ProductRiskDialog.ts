/*
文件说明: 拦截需确认的商品访问，保存浏览器免提醒偏好，确认后沿用原链接跳转和统计。
*/
export class ProductRiskDialog {
  private static readonly preferenceKey = 'cardnav.productRiskDismissed';
  private pendingLink: HTMLAnchorElement | null = null;
  private approvedLink: HTMLAnchorElement | null = null;
  private checkbox: HTMLInputElement;

  constructor(private dialog: HTMLDialogElement) {
    this.checkbox = dialog.querySelector<HTMLInputElement>('[data-dismiss-product-risk]')!;
    document.addEventListener('click', event => this.intercept(event), true);
    document.addEventListener('auxclick', event => this.intercept(event), true);
    dialog.addEventListener('close', () => { this.pendingLink = null; });
    dialog.querySelector('[data-confirm-product-risk]')?.addEventListener('click', () => {
      const link = this.pendingLink;
      this.pendingLink = null;
      dialog.close();
      if (!link) return;
      if (this.checkbox.checked) {
        try {
          localStorage.setItem(ProductRiskDialog.preferenceKey, '1');
        } catch {
          // 浏览器禁用本地存储时，仍允许本次确认后的访问。
        }
      }
      this.approvedLink = link;
      link.dataset.productRiskShown = '1';
      try {
        link.click();
      } finally {
        this.approvedLink = null;
        delete link.dataset.productRiskShown;
      }
    });
  }

  private intercept(event: MouseEvent) {
    if (event.defaultPrevented || (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0)) return;
    const link = event.target instanceof Element ? event.target.closest('a[data-product-risk]') : null;
    if (!(link instanceof HTMLAnchorElement) || link === this.approvedLink) return;
    try {
      if (localStorage.getItem(ProductRiskDialog.preferenceKey) === '1') return;
    } catch {
      // 无法读取偏好时继续显示风险提醒。
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pendingLink = link;
    this.checkbox.checked = false;
    if (!this.dialog.open) this.dialog.showModal();
  }
}

const dialog = document.querySelector<HTMLDialogElement>('#productRiskDialog');
if (dialog) new ProductRiskDialog(dialog);
