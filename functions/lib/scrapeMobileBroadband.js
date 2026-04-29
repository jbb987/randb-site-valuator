"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeMobileBroadband = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const geohash_1 = require("./geohash");
const COLLECTION = 'mobile-broadband-cache';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
exports.scrapeMobileBroadband = (0, https_1.onCall)({
    timeoutSeconds: 120,
    memory: '2GiB',
    region: 'us-central1',
    cors: [/randbpowerinc\.us$/, 'https://platform.randbpowerinc.us', /localhost/],
}, async (request) => {
    // Auth check — only authenticated users
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const { lat, lng } = request.data;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new https_1.HttpsError('invalid-argument', 'lat and lng must be numbers');
    }
    const db = admin.firestore();
    const cacheKey = (0, geohash_1.encode)(lat, lng, 7);
    // 1. Check Firestore cache (with TTL)
    const cached = await db.collection(COLLECTION).doc(cacheKey).get();
    if (cached.exists) {
        const data = cached.data();
        const age = Date.now() - data.scrapedAt;
        if (age < CACHE_TTL_MS && data.providers.length > 0) {
            console.log(`[Mobile BB] Cache hit for ${cacheKey}`);
            return data;
        }
        console.log(`[Mobile BB] Cache expired or empty for ${cacheKey}, re-scraping...`);
    }
    console.log(`[Mobile BB] Scraping FCC for ${lat}, ${lng}...`);
    // 2. Launch Puppeteer with @sparticuz/chromium
    const browser = await puppeteer_core_1.default.launch({
        args: chromium_1.default.args,
        defaultViewport: chromium_1.default.defaultViewport,
        executablePath: await chromium_1.default.executablePath(),
        headless: chromium_1.default.headless,
    });
    try {
        const page = await browser.newPage();
        // Realistic fingerprint
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        // 3. Load FCC broadband map
        await page.goto('https://broadbandmap.fcc.gov/location-summary/mobile', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await delay(4000 + Math.random() * 2000);
        // 4. Switch to Coordinates mode
        try {
            const dropdownBtn = await page.waitForSelector('button::-p-text(Address), button::-p-text(Coordinates)', { timeout: 10000 });
            await dropdownBtn.click();
            await delay(800);
            const coordOption = await page.waitForSelector('::-p-text(Coordinates)', { timeout: 5000 });
            await coordOption.click();
            await delay(800);
        }
        catch {
            console.warn('[Mobile BB] Could not switch to Coordinates mode, trying direct input...');
        }
        // 5. Enter coordinates
        let searchInput;
        try {
            searchInput = await page.waitForSelector('input[placeholder="Enter Coordinates"], input[placeholder="Enter Address"]', { timeout: 10000 });
        }
        catch {
            throw new https_1.HttpsError('internal', 'Could not find search input on FCC page');
        }
        await searchInput.click();
        await searchInput.type(`${lat}, ${lng}`, { delay: 30 });
        await delay(500);
        await searchInput.press('Enter');
        // 6. Wait for provider data to load
        console.log('[Mobile BB] Waiting for provider data...');
        try {
            await page.waitForFunction(() => {
                const text = document.body.innerText;
                return text.includes('AT&T') || text.includes('T-Mobile') || text.includes('Verizon') || text.includes('No mobile broadband');
            }, { timeout: 20000 });
        }
        catch {
            // Extra wait if provider detection didn't trigger
            await delay(5000);
        }
        await delay(2000 + Math.random() * 1000);
        // 7. Extract provider table
        const result = await page.evaluate(() => {
            const text = document.body.innerText;
            // Find data-as-of date
            let dataAsOf = '';
            const dateMatch = text.match(/[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/);
            if (dateMatch)
                dataAsOf = dateMatch[0];
            const providers = [];
            // Get all table rows
            const rows = document.querySelectorAll('table tr');
            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td, th'));
                if (cells.length < 2)
                    continue;
                const firstCellText = cells[0]?.textContent?.trim() || '';
                if (firstCellText === 'Provider' || firstCellText === '')
                    continue;
                if (firstCellText &&
                    !firstCellText.startsWith('Holding') &&
                    !firstCellText.startsWith('FRN') &&
                    !firstCellText.startsWith('Provider ID')) {
                    const fullText = cells[0]?.innerText || '';
                    const holdingMatch = fullText.match(/Holding Company:\s*(.+)/);
                    const idMatch = fullText.match(/Provider ID:\s*(\d+)/);
                    const hasCheckOrSpeed = (cell) => {
                        if (!cell)
                            return false;
                        return !!cell.querySelector('svg') || /\d+\/\d+/.test(cell.textContent || '');
                    };
                    const getSpeed = (cell) => {
                        if (!cell)
                            return null;
                        const match = (cell.textContent || '').match(/(\d+\/\d+)/g);
                        return match ? match.join(', ') : null;
                    };
                    providers.push({
                        providerName: firstCellText.split('\n')[0].trim(),
                        holdingCompany: holdingMatch ? holdingMatch[1].trim() : '',
                        providerId: idMatch ? idMatch[1] : '',
                        has3G: hasCheckOrSpeed(cells[1]),
                        has4G: hasCheckOrSpeed(cells[2]),
                        speed4G: getSpeed(cells[2]),
                        has5G: hasCheckOrSpeed(cells[3]),
                        speed5G: getSpeed(cells[3]),
                    });
                }
            }
            return { providers, dataAsOf };
        });
        console.log(`[Mobile BB] Extracted ${result.providers.length} providers`);
        const entry = {
            lat,
            lng,
            providers: result.providers,
            dataAsOf: result.dataAsOf,
            scrapedAt: Date.now(),
        };
        // 8. Only cache if we got actual providers
        if (result.providers.length > 0) {
            await db.collection(COLLECTION).doc(cacheKey).set(entry);
            console.log(`[Mobile BB] Cached as ${cacheKey}`);
        }
        else {
            console.warn(`[Mobile BB] No providers found for ${lat}, ${lng} — not caching`);
        }
        return entry;
    }
    finally {
        await browser.close();
    }
});
function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=scrapeMobileBroadband.js.map