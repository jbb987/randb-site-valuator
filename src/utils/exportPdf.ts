import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

const PDF_PADDING = 24; // points
const A4_WIDTH = 595.28; // points
const A4_HEIGHT = 841.89; // points
const CAPTURE_WIDTH = 900; // px — fixed width for consistent PDF layout

/**
 * Capture a DOM element and save it as a multi-page PDF.
 *
 * Clones the element into an off-screen container at a fixed width
 * so the PDF layout is consistent regardless of the current viewport.
 * Hides `.no-print` elements and replaces iframes with placeholders.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Clone into an off-screen wrapper at a fixed width
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${CAPTURE_WIDTH}px;
    background: #FAFAF9;
    z-index: -1;
  `;
  const clone = element.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Hide non-printable elements
    clone.querySelectorAll<HTMLElement>('.no-print').forEach((el) => {
      el.style.display = 'none';
    });

    // Replace iframes with compact placeholders
    clone.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe) => {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = `
        width: 100%;
        height: 60px;
        background: #F5F4F2;
        border: 1px solid #D8D5D0;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #7A756E;
        font-size: 12px;
        font-family: 'IBM Plex Sans', sans-serif;
      `;
      placeholder.textContent = 'See site on Google Maps';
      iframe.parentNode!.replaceChild(placeholder, iframe);
    });

    // Hide "Open in Google Maps" links
    clone.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      if (a.textContent?.includes('Open in Google Maps')) {
        a.style.display = 'none';
      }
    });

    // Restyle inputs as plain text for a clean report look
    clone.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      const span = document.createElement('span');
      span.textContent = input.value || '—';
      span.style.cssText = `
        display: block;
        font-size: 14px;
        color: #201F1E;
        font-family: 'IBM Plex Sans', sans-serif;
        padding: 6px 0;
        border-bottom: 1px solid #E8E5E0;
      `;
      input.parentNode!.replaceChild(span, input);
    });

    // Force 2-column grid on grid containers (md: breakpoints don't apply to clones)
    clone.querySelectorAll<HTMLElement>('[class*="md:grid-cols-2"]').forEach((el) => {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat(2, 1fr)';
      el.style.gap = '20px';
    });
    clone.querySelectorAll<HTMLElement>('[class*="md:grid-cols-3"]').forEach((el) => {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat(3, 1fr)';
      el.style.gap = '20px';
    });

    // Force desktop layout for the value cards (hide mobile, show desktop)
    clone.querySelectorAll<HTMLElement>('[class*="hidden md:grid"]').forEach((el) => {
      el.style.display = 'grid';
    });
    clone.querySelectorAll<HTMLElement>('[class*="flex md:hidden"]').forEach((el) => {
      el.style.display = 'none';
    });

    // Wait a tick for styles to compute on the clone
    await new Promise((r) => setTimeout(r, 50));

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FAFAF9',
      logging: false,
      width: CAPTURE_WIDTH,
    });

    const imgWidth = A4_WIDTH - PDF_PADDING * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = A4_HEIGHT - PDF_PADDING * 2;

    const pdf = new jsPDF('p', 'pt', 'a4');
    let yOffset = 0;

    while (yOffset < imgHeight) {
      if (yOffset > 0) pdf.addPage();

      const sliceHeight = Math.min(pageHeight, imgHeight - yOffset);
      const sourceY = (yOffset / imgHeight) * canvas.height;
      const sourceH = (sliceHeight / imgHeight) * canvas.height;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceH;

      const ctx = pageCanvas.getContext('2d')!;
      ctx.drawImage(
        canvas,
        0, sourceY, canvas.width, sourceH,
        0, 0, canvas.width, sourceH,
      );

      const pageData = pageCanvas.toDataURL('image/png');
      pdf.addImage(pageData, 'PNG', PDF_PADDING, PDF_PADDING, imgWidth, sliceHeight);

      yOffset += pageHeight;
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}
