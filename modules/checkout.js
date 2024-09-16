const common = rootRequire("core/common");
const browser = rootRequire("core/browser");
const crawler = rootRequire("core/crawler");
const importer = rootRequire("core/importer");
const db = rootRequire("core/db");
const fs = require("fs");

const event = common.event;
const options = {
    browser: {},
    context: {},
    crawler: {maxDepth: 2, maxLinks: 10, randomizeLinks: true, maxRetries: 2, sameSite: false, depthFirst: true,},
    seed: {list: "shop.csv", pageLimit: 10000},
};

module.exports = {
    options,
    initialize,
    seed,
    before,
    during,
    after,
};

async function seed() {
    await crawler.seed();
    await importer.csv({file: options.seed.list, limit: options.seed.pageLimit});
    await db.create(
        "checkout_links(" +
        "pid INT UNSIGNED NOT NULL, stage VARCHAR(10), fid INT UNSIGNED NOT NULL, links LONGTEXT, " +
        "INDEX(pid), INDEX(stage)" +
        ")"
    );
}

//Called every time the browser context is restarted
async function initialize() {
    console.log("default.initialize");
}

//Before visiting a new page from the crawling queue
async function before(params) {
    console.log("default.before");
}

//During the visit, after the page has loaded
async function during(params) {
    await common.sleep(500);

    page = browser.page();
    // List of potential "Add to Cart" button selectors
    const addToCartSelectors = [
        'button.add-to-cart',      // Generic button class
        'button#add-to-cart',      // ID based
        'button[name="add-to-cart"]', // Name attribute based
        'button[aria-label="Add to cart"]', // Accessibility-based labels
        '.btn-add-to-cart',        // Another common class
        '.add-to-cart-button',     // Class structure
        'a[href*="add-to-cart"]',  // Anchor link containing "add-to-cart"
        'input[value="Add to Cart"]', // Input buttons with value
        'button[data-action="add-to-cart"]', // Data attributes
        '[type="submit"][name="add-to-cart"]', // Submit buttons
        '.product-form button[type="submit"]', // Inside forms
    ];

    // Function to click the first available "Add to Cart" button
    let clicked = false;

    for (const selector of addToCartSelectors) {
        try {
        const element = await page.waitForSelector(selector, { timeout: 500 }); // Wait for each selector
        if (element) {
            console.log(`Found and clicking: ${selector}`);
            await page.click(selector); // Click the first matching button
            clicked = true;
            break;
        }
        } catch (error) {
        console.log(`Selector not found or not clickable: ${selector}`);
        }
    }

    if (clicked) {
        console.log('Item added to cart successfully.');
        // Optionally wait for a confirmation element (e.g., cart pop-up or message)
    } else {
        console.log('Failed to find "Add to Cart" button.');
    }

    let screenshot = await browser.page().screenshot();
    fs.writeFileSync(`out/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));
}

//After the page was closed, useful for postprocessing and DB operations
async function after(params) {
    console.log("default.after");
}
