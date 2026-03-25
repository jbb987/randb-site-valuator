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
