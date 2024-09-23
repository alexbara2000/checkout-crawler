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
}

//Before visiting a new page from the crawling queue
async function before(params) {
}

//During the visit, after the page has loaded
async function during(params) {
    page = browser.page();
    await handleConsentBanner(page, 500)
    await addToCart(page, params, 0);
    await goToCheckout(page, params, 0);

}

//After the page was closed, useful for postprocessing and DB operations
async function after(params) {
}


async function handleConsentBanner(page){
    await common.sleep(1500);
    await page.evaluate(_ => {
      function xcc_contains(selector, text) {
          var elements = document.querySelectorAll(selector);
          return Array.prototype.filter.call(elements, function(element){
              return RegExp(text, "i").test(element.textContent.trim());
          });
      }
      var _xcc;
      _xcc = xcc_contains('[id*=cookie] a, [class*=cookie] a, [id*=cookie] button, [class*=cookie] button', '^(Accept all|Accept|I understand|Agree|Okay|OK|Continue)$');
      if (_xcc != null && _xcc.length != 0) { _xcc[0].click(); }
    });
    await common.sleep(500);
  }

async function addToCart(page, params, depth){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    const addToCartKeywords = ['add to cart', 'add to bag', 'add to basket'];
    const xpathExpressions = addToCartKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
        [
            contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
            or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        ]
        `);
    const originalUrl = page.url();
    console.log(originalUrl)
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(xpath => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id='${index}']`;
            node.setAttribute('data-unique-id', index);
            return uniqueSelector;
            });
        }, xpath);

        console.log('Found nodes:', nodes);

        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            // Otherwise too many screenshots
            if(i >= 10-(depth*5)){
                break;
            }
            const uniqueSelector = nodes[i];
            await page.evaluate(selector => {
            const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (node && node.click) {
                node.click();
            }
            }, uniqueSelector);

            await common.sleep(1000);

            // let screenshot = await browser.page().screenshot();
            // fs.writeFileSync(`screenshots/cart/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
            if (originalUrl !== page.url()) {
                if (depth == 0){
                    addToCart(page, params, 1);
                }
                // await goToCheckout(page, params);
                await page.goBack();
                break;
            }
        }
    }
}

async function goToCheckout(page, params, depth){
    // await common.sleep(4000);
    await common.sleep(2000);
    //removed buy now
    const checkoutKeywords = ["Checkout", "Check out", "Proceed", "Place Order", "Complete Purchase"];
    const xpathExpressions = checkoutKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
    [
        contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@title, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@alt, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@class, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
    ]`);
    const originalUrl = page.url();
    console.log(originalUrl)
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(xpath => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-ck='${index}']`;
            node.setAttribute('data-unique-id-ck', index);
            return uniqueSelector;
            });
        }, xpath);

        console.log('Found nodes:', nodes);

        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            if(i >= 10){
                break;
            }
            const uniqueSelector = nodes[i];
            await page.evaluate(selector => {
            const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            console.log(node)
            if (node && node.click) {
                node.click();
            }
            }, uniqueSelector);

            // await common.sleep(8000);
            await common.sleep(2000);
            if (originalUrl !== page.url() && page.url() !== "https://" + params.host + "/" && page.url() !== "http://" + params.host + "/") {
                console.log(page.url());
                await common.sleep(3000);
                let screenshot = await browser.page().screenshot();
                fs.writeFileSync(`screenshots/checkout/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
                await markAsDone(params);
                if (depth == 0){
                    await goToCheckout(page, params,1);
                }
                // await page.goBack();
                break;
            }
            if(page.url() == "https://" + params.host + "/" || page.url() == "http://" + params.host + "/"){
                await page.goBack();
            }
        }
    }

}

async function markAsDone(params){
    console.log("***")
    console.log(params.host)
    await db.query("UPDATE pages SET status = 1 WHERE status = 0 AND host = ?", [params.host]);
}










  // // List of potential "Add to Cart" button selectors
    // const addToCartSelectors = [
    //     'button.add-to-cart',      // Generic button class
    //     'button#add-to-cart',      // ID based
    //     'button[name="add-to-cart"]', // Name attribute based
    //     'button[aria-label="Add to cart"]', // Accessibility-based labels
    //     '.btn-add-to-cart',        // Another common class
    //     '.add-to-cart-button',     // Class structure
    //     'a[href*="add-to-cart"]',  // Anchor link containing "add-to-cart"
    //     'input[value="Add to Cart"]', // Input buttons with value
    //     'button[data-action="add-to-cart"]', // Data attributes
    //     '[type="submit"][name="add-to-cart"]', // Submit buttons
    //     '.product-form button[type="submit"]', // Inside forms
    // ];

    // // Function to click the first available "Add to Cart" button
    // let clicked = false;

    // for (const selector of addToCartSelectors) {
    //     try {
    //     const element = await page.waitForSelector(selector, { timeout: 300 }); // Wait for each selector
    //     if (element) {
    //         console.log(`Found and clicking: ${selector}`);
    //         await page.click(selector); // Click the first matching button
    //         clicked = true;
    //         break;
    //     }
    //     } catch (error) {
    //     console.log(`Selector not found or not clickable: ${selector}`);
    //     }
    // }

    // if (clicked) {
    //     console.log('Item added to cart successfully.');
    //     // Optionally wait for a confirmation element (e.g., cart pop-up or message)
    //     await common.sleep(500);
    //     let screenshot = await browser.page().screenshot();
    //     fs.writeFileSync(`screenshots/cart/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));
    // } else {
    //     console.log('Failed to find "Add to Cart" button.');
    // }


    // const keywords = ['add to cart', 'buy now', 'add item', 'add', 'buy', 'purchase'];

    // // Function to check if the element contains any of the keywords
    // async function containsKeyword(element, keywords) {
    //     const text = await element.evaluate(el => el.textContent?.toLowerCase() || '');
    //     return keywords.some(keyword => text.includes(keyword));
    // }

    // // Function to search for potential "Add to Cart" buttons or links
    // async function findAddToCartButton() {
    //     const potentialSelectors = [
    //     'button',             // Look for all buttons
    //     'a',                  // Look for all anchor links
    //     'input[type="submit"]' // Look for input buttons with type submit
    //     ];

    //     for (const selector of potentialSelectors) {
    //     const elements = await page.$$(selector); // Get all matching elements
    //     for (const element of elements) {
    //         // Check if element's text or certain attributes contain relevant keywords
    //         const matchesText = await containsKeyword(element, keywords);
    //         const matchesAttribute = await element.evaluate((el, kw) => {
    //         return kw.some(keyword => (el.getAttribute('aria-label')?.toLowerCase().includes(keyword) ||
    //             el.getAttribute('value')?.toLowerCase().includes(keyword) ||
    //             el.getAttribute('data-action')?.toLowerCase().includes(keyword)));
    //         }, keywords);

    //         if (matchesText || matchesAttribute) {
    //         console.log(`Found and clicking: ${selector}`);
    //         // await db.query("INSERT INTO cookies_links VALUES ?", [linkData]);
    //         await element.click();
    //         return true; // Return once we've found and clicked a valid element
    //         }
    //     }
    //     }
    //     return false;
    // }

    // // Try to find and click the "Add to Cart" button
    // const clicked = await findAddToCartButton();

    // if (clicked) {
    //     console.log('Item added to cart successfully.');
    //     await common.sleep(500);
    //     let screenshot = await browser.page().screenshot();
    //     fs.writeFileSync(`out/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));
    // } else {
    //     console.log('Failed to find "Add to Cart" button.');
    // }