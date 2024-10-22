const common = rootRequire("core/common");
const browser = rootRequire("core/browser");
const crawler = rootRequire("core/crawler");
const importer = rootRequire("core/importer");
const db = rootRequire("core/db");
const fs = require("fs");

const event = common.event;
const options = {
    browser: {args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions-except=consent-o-matic',
        '--load-extension=consent-o-matic',]},
    context: {},
    crawler: {maxDepth: 3, maxLinks: 10, randomizeLinks: true, maxRetries: 2, sameSite: false, depthFirst: true,},
    seed: {list: "top200Canada.csv", pageLimit: 100000},
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
    let foundCheckout = false;
    page = browser.page();
    await common.sleep(200);
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    await selectSize(page, params);
    // await common.sleep(2000);
    let numAddedToCart = await addToCart(page, params, 0);
    if(numAddedToCart > 0) {
        // await common.sleep(2000);
        foundCheckout = await viewCart(page, params, 0);
    }
    // await goToCheckout(page, params, 0);
    return {pageFound: foundCheckout};

}

//After the page was closed, useful for postprocessing and DB operations
async function after(params) {
}


  async function selectSize(page, params){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    const addToCartKeywords = ['l', 'large', '10'];
    const xpathExpressions = addToCartKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
        [
            translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'abcdefghijklmnopqrstuvwxyz0123456789') = '${keyword.toLowerCase()}'
            or translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'abcdefghijklmnopqrstuvwxyz0123456789') = '${keyword.toLowerCase()}'
        ]
        `);
    const originalUrl = page.url();
    console.log(originalUrl)

    var shouldLookAtMore=true;
    let j=0;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-size-${j}='${index}']`;
            node.setAttribute(`data-unique-id-size-${j}`, index);
            return uniqueSelector;
            });
        }, {xpath,j});
        console.log('Found nodes:', nodes);
        j++;


        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            // Otherwise too many screenshots
            if(i >= 10 || !shouldLookAtMore){
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
            console.log(page.url());
            if(page.url())
            if (originalUrl !== page.url().split("&")[0] && originalUrl !== page.url().split("?")[0]) {
                await page.goBack();
                break;
            }
        }
        if(nodes.length > 0){
            shouldLookAtMore=false;
        }
    }
}

async function findClickableElements(page){
    const cartKeywords = ['cart', 'bag', 'shopping-cart', 'my-bag', 'basket'];
    const clickableElements = await page.evaluate((cartKeywords) => {
      const elements = Array.from(document.querySelectorAll(`a,span,button,div`));
      return elements
        .filter(element => {
          const text = element.textContent || '';
          const href = element.href || '';
          const onclick = element.getAttribute('onclick') || '';
          return cartKeywords.some(keyword =>
            text.includes(keyword) ||
            href.includes(keyword) ||
            onclick.includes(keyword)
          );
        })
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          href: element.href || null,
          text: element.textContent.trim().length>= 100? '': element.textContent.trim(),
          onclick: element.getAttribute('onclick') || null,
          id: element.id
        }));
    }, cartKeywords);
    return clickableElements;
  }

async function viewCart(page, params){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));
    let foundCheckout = false;
    const originalUrl = page.url();
    const clickableElements = await findClickableElements(page)
    clickableElements.sort((a, b) => {
        const lengthA = a.href ? a.href.length : 0;
        const lengthB = b.href ? b.href.length: 0;
        return lengthA - lengthB;
      });

    seenUrls = [];
    let i=0;
    for (const elem of clickableElements) {
        if(elem.href != null && !seenUrls.includes(elem.href)){
            if (i>=4){
                break;
            }
            seenUrls.push(elem.href);
            await page.goto(elem.href);
            if (originalUrl !== page.url().split("&")[0] && originalUrl !== page.url().split("?")[0]) {
                i++;
                foundCheckout ||= await goToCheckout(page, params, 0);
                await page.goBack();
            }
        }
      }
      return foundCheckout;
}


async function addToCart(page, params, depth){
    // let screenshot = await browser.page().screenshot();
    // fs.writeFileSync(`screenshots/page/${params.pid}-${params.host}.png`, Buffer.from(screenshot, "base64"));

    const addToCartKeywords = ['add to cart', 'add to bag', 'add to basket', 'add to tote', 'add -'];
    const xpathExpressions = addToCartKeywords.map(keyword => `//*[self::a or self::button or self::input or self::span or self::div or self::label]
        [
            contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
            or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${keyword.toLowerCase()}')
        ]
        `);
    const originalUrl = page.url();
    console.log(originalUrl)

    var shouldLookAtAdd=true;
    let j=0;
    let totalNodesFound=0;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-${j}='${index}']`;
            node.setAttribute(`data-unique-id-${j}`, index);
            return uniqueSelector;
            });
        }, {xpath,j});
        console.log('Found nodes:', nodes);
        totalNodesFound+=nodes.length;
        j++;

        // Click on each node and take a screenshot
        for (let i = 0; i < nodes.length; i++) {
            if (!shouldLookAtAdd){
                break;
            }
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
            if (originalUrl !== page.url().split("&")[0] && originalUrl.split("?")[0]!== page.url().split("?")[0]) {
                if (depth == 0){
                    addToCart(page, params, 1);
                }
                // await goToCheckout(page, params);
                await page.goBack();
                if(page.url() == "about:blank"){
                    await page.goForward();
                }
                break;
            }
        }
        if (nodes.length > 0) {
            shouldLookAtAdd=false;
        }
    }
    return totalNodesFound;
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
    let j=0;
    let nodesWithLengths=[];
    let foundCheckout = false;
    for (const xpath of xpathExpressions) {
        // Get all nodes matching the XPath
        const nodes = await page.evaluate(({xpath, j}) => {
            const iterator = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            let node = iterator.iterateNext();
            const nodeArray = [];
            while (node) {
            nodeArray.push(node);
            node = iterator.iterateNext();
            }
             // Function to get cumulative length of the relevant attributes
            const getLength = (node) => {
                const textLength = (node.textContent || '').trim().length;
                const ariaLabelLength = (node.getAttribute('aria-label') || '').trim().length;
                const titleLength = (node.getAttribute('title') || '').trim().length;
                const altLength = (node.getAttribute('alt') || '').trim().length;
                const idLength = (node.getAttribute('id') || '').trim().length;
                const classLength = (node.getAttribute('class') || '').trim().length;
                const valueLength = (node.getAttribute('value') || '').trim().length;

                return textLength + ariaLabelLength + titleLength + altLength + idLength + classLength + valueLength;
            };

            return nodeArray.map((node, index) => {
            // Create a unique selector for each node
            const uniqueSelector = `//*[@data-unique-id-ck-${j}='${index}']`;
            node.setAttribute(`data-unique-id-ck-${j}`, index);
            return [uniqueSelector, getLength(node)];
            });
        }, {xpath,j});
        j++;
        console.log('Found nodes:', nodes);
        nodesWithLengths=nodesWithLengths.concat(nodes);
    }
    nodesWithLengths.sort((a, b) => a[1] - b[1]);
    // Click on each node and take a screenshot
    for (let i = 0; i < nodesWithLengths.length; i++) {
        if(i >= 10){
            break;
        }
        const uniqueSelector = nodesWithLengths[i][0];
        await page.evaluate(selector => {
        const node = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        console.log(node)
        if (node && node.click) {
            node.click();
        }
        }, uniqueSelector);

        await common.sleep(3000);
        if (originalUrl !== page.url() && page.url() !== "https://" + params.host + "/" && page.url() !== "http://" + params.host + "/" && page.url() !== "about:blank") {
            foundCheckout=true;
            console.log(page.url());
            await common.sleep(3000);
            let screenshot = await browser.page().screenshot();
            fs.writeFileSync(`screenshots/checkout/size_and_cart/${params.pid}-${params.host}-${i}.png`, Buffer.from(screenshot, "base64"));
            await markAsDone(params);
            if (depth == 0){
                await goToCheckout(page, params,1);
            }
            // await page.goBack();
            break;
        }
        // console.log(page.url());
        if(page.url() == "https://" + params.host + "/" || page.url() == "http://" + params.host + "/"){
            await page.goBack();
        }
        if(page.url() == "about:blank"){
            await page.goForward();
        }
    }
    return foundCheckout;
}

async function markAsDone(params){
    console.log("***")
    console.log(params.host)
    await db.query("UPDATE pages SET status = 1 WHERE status = 0 AND host = ?", [params.host]);
}